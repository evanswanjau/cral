import "../lib/load-env.js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Knex } from "knex";
import { db } from "../db/client.js";
import { generateId } from "../lib/ids.js";
import { writeAuditEntry } from "../lib/audit.js";
import { createStorageAdapter, type StorageAdapter } from "../adapters/storage/index.js";
import { MERCHANTS, SEED_EMAIL_DOMAIN } from "./seed-hire-fleet.js";
import { fixturePdf } from "./seed-fixture-pdf.js";
import {
  DRIVERS,
  SEED_LICENCE_PREFIX,
  SEED_PHONE_PREFIX,
  seedDriverPhone,
  seedLicence,
  type SeedGender,
} from "./seed-drivers-data.js";

/**
 * `npm run seed:drivers -w apps/api [-- --dry-run | --clear | --server]`
 *
 * 40 live, bookable drivers for the 12 `seed:hire` merchants, across their
 * counties: day, hour and trip rates, licences in date, the licence, ID and
 * KRA PIN accepted, and one photo each. PR DR3 of
 * `docs/plans/drivers-that-work.md`. Run `seed:hire` first; this adds no
 * accounts of its own.
 *
 * Safety, enforced below before anything is read or written (the same as
 * `seed:hire`, plus the SMS rule):
 * - refuses `NODE_ENV=production`, any database but `cral_dev`/`cral_test`,
 *   a checkout under `/srv/cral/` (production), and a non-local database
 *   host unless `--server` is passed (the dev VPS run);
 * - refuses unless `SMS_ADAPTER` is `console` (or unset): a driver must
 *   have a phone, so nothing here may run where an SMS could go out;
 * - phones are from Ofcom's drama range (`+447700900001`...), which no
 *   real phone uses (`seed-drivers-data.ts`);
 * - only `@cral-seed.test` merchants get drivers; re-runnable (drivers are
 *   found by their `SEED-DL-nnn` licence number, missing documents and
 *   photos are put back); `--clear` removes exactly the drivers this made,
 *   and refuses while any of them has a booking.
 *
 * Photos are free-licence (see `seed-assets/drivers/CREDITS.md`) and kept
 * in the repo, so the server never fetches from a random host. Like a
 * merchant's own upload, a photo is a picture, not a check (DR2).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const PHOTOS_DIR = join(__dirname, "seed-assets", "drivers");
const KEY_PREFIX = "seed-drivers/";
const ALLOWED_DATABASES = ["cral_dev", "cral_test"];
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1"];
const DRIVER_DOCS = ["driving_licence", "national_id", "kra_pin"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const CLEAR = args.has("--clear");
const SERVER = args.has("--server");

// eslint-disable-next-line no-console
const say = (line = ""): void => console.log(line);

// ---------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------

function refuse(reason: string): never {
  console.error(`seed:drivers refused: ${reason}`);
  process.exit(1);
}

function assertSafeTarget(): void {
  const known = new Set(["--dry-run", "--clear", "--server"]);
  for (const a of args) if (!known.has(a)) refuse(`unknown option ${a}.`);
  if (DRY_RUN && CLEAR) refuse("pick one of --dry-run and --clear.");
  if (process.env.NODE_ENV === "production") refuse("NODE_ENV is production.");

  const sms = process.env.SMS_ADAPTER ?? "console";
  if (sms !== "console") {
    refuse(`SMS_ADAPTER is "${sms}". Seeded drivers have phones, so run with SMS_ADAPTER=console.`);
  }

  const raw = process.env.DATABASE_URL;
  if (!raw) refuse("DATABASE_URL is not set.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    refuse("DATABASE_URL is not a URL.");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!ALLOWED_DATABASES.includes(database)) {
    refuse(`database "${database}" is not one of ${ALLOWED_DATABASES.join(", ")}.`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!LOCAL_HOSTS.includes(host) && !SERVER) {
    refuse(`database host "${host}" is not local. Pass --server for the dev VPS run.`);
  }

  for (const path of [process.cwd(), __dirname]) {
    const p = resolve(path).replace(/\\/g, "/");
    if (p === "/srv/cral" || p.startsWith("/srv/cral/")) refuse(`running from the production checkout (${p}).`);
  }
}

function storageLine(): string {
  const kind = process.env.STORAGE_ADAPTER ?? "local";
  if (kind === "b2") return `b2, bucket "${process.env.B2_BUCKET ?? "(unset)"}"`;
  return `local, ${resolve(process.env.STORAGE_LOCAL_DIR ?? "./.local-storage")}`;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

const daysAgo = (n: number): Date => new Date(Date.now() - n * DAY_MS);
const dateOnly = (d: Date): string => d.toISOString().slice(0, 10);
const kesCents = (kes: number | undefined): number | null => (kes === undefined ? null : kes * 100);
const pad = (n: number, width: number): string => String(n).padStart(width, "0");

/** Licence 1-4 years ahead, spread by the driver's seed number. */
const licenceExpiry = (n: number): string => dateOnly(new Date(Date.now() + (400 + ((n * 53) % 1000)) * DAY_MS));

let storage: StorageAdapter | null = null;
const getStorage = (): StorageAdapter => (storage ??= createStorageAdapter());

/** Every photo, by gender, checked before any write. */
function loadPhotos(): Record<SeedGender, { name: string; body: Buffer }[]> {
  const out = {} as Record<SeedGender, { name: string; body: Buffer }[]>;
  for (const gender of ["female", "male"] as const) {
    const dir = join(PHOTOS_DIR, gender);
    if (!existsSync(dir)) refuse(`missing photo folder ${dir}.`);
    const names = readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort();
    if (!names.length) refuse(`no .jpg photos in ${dir}.`);
    out[gender] = names.map((name) => ({ name, body: readFileSync(join(dir, name)) }));
  }
  return out;
}

/** Driver `n`'s photo: the genders take turns through their own folder. */
function photoFor(photos: ReturnType<typeof loadPhotos>, index: number) {
  const gender = DRIVERS[index]!.gender;
  const k = DRIVERS.slice(0, index).filter((d) => d.gender === gender).length;
  const list = photos[gender];
  return list[k % list.length]!;
}

/** The seed's own drivers: a `SEED-DL-` licence on a `@cral-seed.test` merchant. */
function seededDriverQuery(): Knex.QueryBuilder {
  return db("drivers as d")
    .join("merchants as m", "m.id", "d.merchant_id")
    .join("users as u", "u.id", "m.user_id")
    .where("u.email", "like", `%${SEED_EMAIL_DOMAIN}`)
    .where("d.licence_number", "like", `${SEED_LICENCE_PREFIX}%`);
}

// ---------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------

async function seed(): Promise<void> {
  const photos = loadPhotos();
  const counts = { driversCreated: 0, driversUpdated: 0, photosUploaded: 0, docsUploaded: 0 };
  const uploaded: string[] = [];

  try {
    await db.transaction(async (trx) => {
      const merchantRows = await trx("merchants as m")
        .join("users as u", "u.id", "m.user_id")
        .whereIn("u.email", MERCHANTS.map((m) => `${m.key}${SEED_EMAIL_DOMAIN}`))
        .whereNotNull("m.approved_at")
        .select("m.id", "u.email");
      const merchantIds = new Map(merchantRows.map((r) => [String(r.email).replace(SEED_EMAIL_DOMAIN, ""), r.id as string]));
      const missing = MERCHANTS.filter((m) => !merchantIds.has(m.key)).map((m) => m.key);
      if (missing.length) {
        throw new Error(`run seed:hire first - no approved seed merchant for ${missing.join(", ")}; nothing written.`);
      }

      // A seed licence, ID or phone on someone else's driver means the
      // series isn't ours alone on this database: stop rather than touch it.
      const foreign = await trx("drivers as d")
        .join("merchants as m", "m.id", "d.merchant_id")
        .join("users as u", "u.id", "m.user_id")
        .whereNot("u.email", "like", `%${SEED_EMAIL_DOMAIN}`)
        .where((q) => {
          q.where("d.licence_number", "like", `${SEED_LICENCE_PREFIX}%`)
            .orWhere("d.phone", "like", `${SEED_PHONE_PREFIX}%`)
            .orWhereRaw("d.national_id ~ '^9800[0-9]{4}$'");
        })
        .select("d.full_name");
      if (foreign.length) {
        throw new Error(`${foreign.map((r) => r.full_name).join(", ")} use seed numbers on a non-seed merchant; nothing written.`);
      }

      for (const [index, spec] of DRIVERS.entries()) {
        const n = index + 1;
        const merchantId = merchantIds.get(spec.merchant);
        if (!merchantId) throw new Error(`DRIVERS row ${n} names unknown merchant ${spec.merchant}`);
        const licence = seedLicence(n);
        const expiry = licenceExpiry(n);
        const submittedAt = daysAgo(40 - (index % 25));
        const fields = {
          merchant_id: merchantId,
          full_name: spec.fullName,
          phone: seedDriverPhone(n),
          national_id: `9800${pad(n, 4)}`,
          kra_pin: `A98000${pad(n, 4)}D`,
          licence_expiry: expiry,
          county: spec.county,
          is_account_holder: false,
          daily_rate_amount: kesCents(spec.day),
          hourly_rate_amount: kesCents(spec.hour),
          trip_rate_amount: kesCents(spec.trip),
          status: "live",
          reviewer_note: null,
        };

        const existing = await trx("drivers").where({ licence_number: licence }).first("id", "photo_id");
        let driverId: string;
        let hasPhoto = false;
        if (existing) {
          driverId = existing.id as string;
          hasPhoto = existing.photo_id !== null;
          await trx("drivers").where({ id: driverId }).update(fields);
          counts.driversUpdated++;
        } else {
          driverId = generateId("driver");
          await trx("drivers").insert({
            id: driverId,
            // Its own millisecond-exact timestamp: left to the default, all
            // 40 rows would share the transaction's `now()`, and the
            // catalog's newest-first cursor (ms precision) skips rows that
            // tie below the millisecond.
            created_at: new Date(submittedAt.getTime() - index * 60_000),
            licence_number: licence,
            submitted_at: submittedAt,
            decided_at: new Date(submittedAt.getTime() + DAY_MS),
            ...fields,
          });
          counts.driversCreated++;
        }

        const keyBase = `${KEY_PREFIX}${licence.toLowerCase()}`;
        for (const kind of DRIVER_DOCS) {
          const key = `${keyBase}/${kind}.pdf`;
          if (await trx("documents").where({ storage_key: key }).first("id")) continue;
          const body = fixturePdf(kind);
          await getStorage().putObject({ key, body, contentType: "application/pdf" });
          uploaded.push(key);
          await trx("documents").insert({
            id: generateId("document"),
            merchant_id: merchantId,
            user_id: null,
            vehicle_id: null,
            driver_id: driverId,
            kind,
            storage_key: key,
            original_name: `${kind}.pdf`,
            size_bytes: body.length,
            content_type: "application/pdf",
            review_state: "ok",
            reviewed_at: new Date(),
            expires_at: kind === "driving_licence" ? expiry : null,
          });
          counts.docsUploaded++;
        }

        // Set the way DR2's `setDriverPhoto` sets one: a fresh `fil_` id
        // in the key and on the row. A photo already there is kept.
        if (!hasPhoto) {
          const photo = photoFor(photos, index);
          const photoId = generateId("file");
          const key = `${keyBase}/photo/${photoId}`;
          await getStorage().putObject({ key, body: photo.body, contentType: "image/jpeg" });
          uploaded.push(key);
          await trx("drivers")
            .where({ id: driverId })
            .update({ photo_id: photoId, photo_storage_key: key, photo_content_type: "image/jpeg" });
          counts.photosUploaded++;
        }
      }

      await writeAuditEntry(trx, {
        actorId: null,
        actorType: "system",
        action: "seed.drivers.run",
        entityType: "seed",
        entityId: "seed-drivers",
        after: { ...counts, drivers: DRIVERS.length },
      });
    });
  } catch (error) {
    // The rows rolled back; take the files this run stored with them.
    for (const key of uploaded) await getStorage().deleteObject(key).catch(() => undefined);
    throw error;
  }

  say(`seed:drivers done. Storage: ${storageLine()}.`);
  say(
    `Added ${counts.driversCreated} drivers, updated ${counts.driversUpdated}; ` +
      `${counts.photosUploaded} photos and ${counts.docsUploaded} documents uploaded.`,
  );
  await printDatabaseCounts();
}

/** Counts of what is in the database now, read back rather than assumed. */
async function printDatabaseCounts(): Promise<void> {
  const live = await seededDriverQuery().where("d.status", "live").count<{ count: string }[]>("* as count");
  const photos = await seededDriverQuery().whereNotNull("d.photo_id").count<{ count: string }[]>("* as count");
  const byCounty = await seededDriverQuery()
    .groupBy("d.county")
    .select("d.county")
    .count<{ county: string; count: string }[]>("* as count");
  const unit = async (col: string) =>
    (await seededDriverQuery().whereNotNull(col).count<{ count: string }[]>("* as count"))[0]?.count ?? 0;
  say();
  say(`In the database: ${live[0]?.count ?? 0} live seeded drivers, ${photos[0]?.count ?? 0} with a photo.`);
  say(`Offering:  day ${await unit("d.daily_rate_amount")}, hour ${await unit("d.hourly_rate_amount")}, trip ${await unit("d.trip_rate_amount")}`);
  say(`By county (${byCounty.length}):`);
  for (const r of byCounty.sort((a, b) => Number(b.count) - Number(a.count))) say(`  ${r.county.padEnd(12)} ${r.count}`);
  say(`Phones:    ${seedDriverPhone(1)} to ${seedDriverPhone(DRIVERS.length)} (Ofcom drama range, no real phone)`);
}

function printPlan(): void {
  const tally = (f: (i: number) => string): string => {
    const t: Record<string, number> = {};
    DRIVERS.forEach((_, i) => (t[f(i)] = (t[f(i)] ?? 0) + 1));
    return Object.entries(t)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${n}`)
      .join(", ");
  };
  const db_ = new URL(process.env.DATABASE_URL!);
  say("seed:drivers --dry-run: nothing written.");
  say(`Database: ${db_.pathname.slice(1)} on ${db_.hostname}`);
  say(`Storage:  ${storageLine()} (files would go under ${KEY_PREFIX})`);
  say(`Would seed ${DRIVERS.length} drivers for ${new Set(DRIVERS.map((d) => d.merchant)).size} merchants.`);
  say(`Offering:  day ${DRIVERS.filter((d) => d.day).length}, hour ${DRIVERS.filter((d) => d.hour).length}, trip ${DRIVERS.filter((d) => d.trip).length}`);
  say(`By county: ${tally((i) => DRIVERS[i]!.county)}`);
  say(`Licences:  ${seedLicence(1)} to ${seedLicence(DRIVERS.length)}`);
  say(`Phones:    ${seedDriverPhone(1)} to ${seedDriverPhone(DRIVERS.length)}`);
}

// ---------------------------------------------------------------------
// Clear
// ---------------------------------------------------------------------

async function clear(): Promise<void> {
  const drivers: { id: string; photo_storage_key: string | null }[] = await seededDriverQuery().select(
    "d.id",
    "d.photo_storage_key",
  );
  if (!drivers.length) {
    say("seed:drivers --clear: nothing to clear.");
    return;
  }
  const driverIds = drivers.map((d) => d.id);

  const bookings = await db("bookings").whereIn("driver_id", driverIds).select("id", "ref", "status");
  if (bookings.length) {
    say(`Seeded drivers have ${bookings.length} booking(s):`);
    for (const b of bookings) say(`  ${b.ref ?? b.id} (${b.status})`);
    refuse("bookings exist. Cancel or clear them by hand first; seed:drivers never deletes a booking.");
  }

  const keys = [
    ...(await db("documents").whereIn("driver_id", driverIds).select("storage_key")).map((d) => d.storage_key as string),
    ...drivers.map((d) => d.photo_storage_key).filter((k): k is string => k !== null),
  ];

  await db.transaction(async (trx) => {
    // Their documents go by cascade.
    await trx("drivers").whereIn("id", driverIds).delete();
    await writeAuditEntry(trx, {
      actorId: null,
      actorType: "system",
      action: "seed.drivers.clear",
      entityType: "seed",
      entityId: "seed-drivers",
      before: { drivers: driverIds.length, storage_objects: keys.length },
    });
  });

  // Storage after the commit, so the database never points at a missing file.
  let removed = 0;
  for (const key of keys) {
    try {
      await getStorage().deleteObject(key);
      removed++;
    } catch (error) {
      console.error(`  could not delete ${key}: ${(error as Error).message}`);
    }
  }
  say(`seed:drivers --clear: removed ${driverIds.length} drivers, ${removed}/${keys.length} stored files.`);
}

// ---------------------------------------------------------------------

async function main(): Promise<void> {
  assertSafeTarget();
  if (DRY_RUN) {
    loadPhotos();
    printPlan();
    const existing = await seededDriverQuery().count<{ count: string }[]>("* as count");
    say(`Already in the database: ${existing[0]?.count ?? 0} seeded drivers.`);
  } else if (CLEAR) {
    await clear();
  } else {
    await seed();
  }
  await db.destroy();
}

main().catch(async (error: unknown) => {
  console.error("seed:drivers failed:", error);
  await db.destroy().catch(() => undefined);
  process.exit(1);
});
