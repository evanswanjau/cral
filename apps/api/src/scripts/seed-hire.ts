import "../lib/load-env.js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Knex } from "knex";
import { db } from "../db/client.js";
import { generateId } from "../lib/ids.js";
import { hashPassword } from "../lib/password.js";
import { nextListingRef } from "../lib/vehicle-events.js";
import { writeAuditEntry } from "../lib/audit.js";
import { createStorageAdapter, type StorageAdapter } from "../adapters/storage/index.js";
import { HIRE_GROUPS } from "../modules/vehicles/categories.js";
import {
  FLEET,
  MERCHANTS,
  MODELS,
  RENTERS,
  SEED_EMAIL_DOMAIN,
  SEED_PLATE_SQL_PATTERN,
  seedPlate,
  type SeedVehicle,
} from "./seed-hire-fleet.js";
import { fixturePdf } from "./seed-fixture-pdf.js";

/**
 * `npm run seed:hire -w apps/api [-- --dry-run | --clear [--with-bookings] | --server]`
 *
 * 100 live hire listings (60 cars, 25 trucks, 15 machines) from 12
 * approved merchants across 11 counties, each with three real photos,
 * plus two renters whose ID and licence are already accepted. PR H2 of
 * `docs/plans/hire-that-works.md`; the rules are its Part 3.
 *
 * Safety, enforced below before anything is read or written:
 * - refuses `NODE_ENV=production`, any database but `cral_dev`/`cral_test`,
 *   a checkout under `/srv/cral/` (production), and a non-local database
 *   host unless `--server` is passed (the dev VPS run);
 * - every account is `@cral-seed.test` with no phone at all, so nothing can
 *   ever text a stranger; plates are `KZZ 001S`-`KZZ 100S`;
 * - re-runnable: users upsert by email, vehicles by plate, and missing
 *   photos/documents are put back; `--clear` removes exactly what this
 *   made, and refuses while a seeded vehicle has a booking.
 *
 * Photos are free-licence (see `seed-assets/vehicles/CREDITS.md`) and
 * shipped in the repo, so the server never fetches from a random host.
 * Seeded listings carry no "sample" label (owner's decision 5); the
 * production refusal is what keeps them off cral.co.ke.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, "seed-assets", "vehicles");
const KEY_PREFIX = "seed-hire/";
const ALLOWED_DATABASES = ["cral_dev", "cral_test"];
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1"];
const PHOTOS_PER_VEHICLE = 3;
const VEHICLE_DOCS = ["logbook", "comprehensive_insurance", "tracker_certificate"] as const;
const OWNER_DOCS = ["national_id", "kra_pin"] as const;
const COMPANY_DOCS = ["certificate_of_incorporation", "company_kra_pin", "cr12"] as const;
const RENTER_DOCS = ["national_id", "driving_licence"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const CLEAR = args.has("--clear");
const WITH_BOOKINGS = args.has("--with-bookings");
const SERVER = args.has("--server");

// eslint-disable-next-line no-console
const say = (line = ""): void => console.log(line);

// ---------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------

function refuse(reason: string): never {
  console.error(`seed:hire refused: ${reason}`);
  process.exit(1);
}

function assertSafeTarget(): void {
  const known = new Set(["--dry-run", "--clear", "--with-bookings", "--server"]);
  for (const a of args) if (!known.has(a)) refuse(`unknown option ${a}.`);
  if (WITH_BOOKINGS && !CLEAR) refuse("--with-bookings only goes with --clear.");
  if (process.env.NODE_ENV === "production") refuse("NODE_ENV is production.");

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

  if (SERVER && !DRY_RUN && !CLEAR && !process.env.SEED_HIRE_PASSWORD) {
    refuse("set SEED_HIRE_PASSWORD for a --server run, so the dev accounts don't share a password from the repo.");
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
const kesCents = (kes: number): number => kes * 100;
const emailFor = (key: string): string => `${key}${SEED_EMAIL_DOMAIN}`;
const plateSlug = (plate: string): string => plate.toLowerCase().replace(/\s+/g, "-");

function groupOf(vehicle: SeedVehicle): string {
  const type = MODELS[vehicle.model].type;
  for (const [group, types] of Object.entries(HIRE_GROUPS)) {
    if ((types as readonly string[]).includes(type)) return group;
  }
  return type;
}

/** Insurance 6-14 months ahead, spread by the vehicle's place in the fleet. */
function insuranceExpiry(index: number): string {
  return dateOnly(new Date(Date.now() + (182 + ((index * 37) % 244)) * DAY_MS));
}

let storage: StorageAdapter | null = null;
const getStorage = (): StorageAdapter => (storage ??= createStorageAdapter());

/** Every photo the fleet needs, checked before any write. */
function loadPhotos(): Map<string, Buffer[]> {
  const out = new Map<string, Buffer[]>();
  for (const m of Object.values(MODELS)) {
    if (out.has(m.photos)) continue;
    const files: Buffer[] = [];
    for (let n = 1; n <= PHOTOS_PER_VEHICLE; n++) {
      const path = join(ASSETS_DIR, m.photos, `${n}.jpg`);
      if (!existsSync(path)) refuse(`missing photo ${path}.`);
      files.push(readFileSync(path));
    }
    out.set(m.photos, files);
  }
  return out;
}

interface DocOwner {
  merchantId?: string;
  userId?: string;
  vehicleId?: string;
}

/**
 * Puts one document in place unless a row for its storage key is already
 * there. Keys are fixed (`seed-hire/...`), so a re-run finds them and a
 * crashed run's leftovers are simply overwritten.
 */
async function ensureDocument(
  trx: Knex.Transaction,
  owner: DocOwner,
  input: { kind: string; key: string; body: Buffer; contentType: string; name: string; expiresAt?: string },
): Promise<boolean> {
  const existing = await trx("documents").where({ storage_key: input.key }).first("id");
  if (existing) return false;
  await getStorage().putObject({ key: input.key, body: input.body, contentType: input.contentType });
  await trx("documents").insert({
    id: generateId("document"),
    merchant_id: owner.merchantId ?? null,
    user_id: owner.userId ?? null,
    vehicle_id: owner.vehicleId ?? null,
    kind: input.kind,
    storage_key: input.key,
    original_name: input.name,
    size_bytes: input.body.length,
    content_type: input.contentType,
    review_state: "ok",
    reviewed_at: new Date(),
    expires_at: input.expiresAt ?? null,
  });
  return true;
}

async function ensureFixtureDoc(trx: Knex.Transaction, owner: DocOwner, keyBase: string, kind: string, expiresAt?: string) {
  return ensureDocument(trx, owner, {
    kind,
    key: `${KEY_PREFIX}${keyBase}/${kind}.pdf`,
    body: fixturePdf(kind),
    contentType: "application/pdf",
    name: `${kind}.pdf`,
    ...(expiresAt ? { expiresAt } : {}),
  });
}

/** Upsert a seed user by email. Never a phone number, never a verified phone. */
async function ensureUser(
  trx: Knex.Transaction,
  input: { email: string; fullName: string; role: "merchant" | "customer"; passwordHash: string },
): Promise<{ id: string; created: boolean }> {
  const existing = await trx("users").where({ email: input.email }).first("id");
  const fields = {
    full_name: input.fullName,
    phone: null,
    phone_verified: false,
    two_factor_enabled: false,
    two_factor_phone: null,
    email_verified: true,
    roles: [input.role],
    status: "active",
    terms_accepted_version: "2026-06-01",
    terms_accepted_at: daysAgo(60),
  };
  if (existing) {
    await trx("users").where({ id: existing.id }).update(fields);
    return { id: existing.id as string, created: false };
  }
  const id = generateId("user");
  await trx("users").insert({ id, email: input.email, password_hash: input.passwordHash, ...fields });
  return { id, created: true };
}

// ---------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------

interface RunCounts {
  usersCreated: number;
  vehiclesCreated: number;
  vehiclesUpdated: number;
  photosUploaded: number;
  docsUploaded: number;
}

async function seed(): Promise<void> {
  const photos = loadPhotos();
  const password = process.env.SEED_HIRE_PASSWORD ?? "CralSeed2026!";
  const passwordHash = await hashPassword(password);
  const counts: RunCounts = { usersCreated: 0, vehiclesCreated: 0, vehiclesUpdated: 0, photosUploaded: 0, docsUploaded: 0 };

  await db.transaction(async (trx) => {
    // A KZZ...S plate on someone else's merchant means the series isn't
    // ours alone on this database: stop rather than touch their vehicle.
    const foreign = await trx("vehicles as v")
      .join("merchants as m", "m.id", "v.merchant_id")
      .join("users as u", "u.id", "m.user_id")
      .whereRaw("v.registration ~ ?", [SEED_PLATE_SQL_PATTERN])
      .whereNot("u.email", "like", `%${SEED_EMAIL_DOMAIN}`)
      .select("v.registration");
    if (foreign.length) {
      throw new Error(`plates ${foreign.map((r) => r.registration).join(", ")} belong to a non-seed merchant; nothing written.`);
    }

    const merchantIds = new Map<string, string>();
    for (const m of MERCHANTS) {
      const fullName = `${m.firstName} ${m.surname}`;
      const user = await ensureUser(trx, { email: emailFor(m.key), fullName, role: "merchant", passwordHash });
      if (user.created) counts.usersCreated++;

      const fields = {
        owner_type: m.ownerType,
        company_name: m.companyName ?? null,
        trading_name: m.companyName ?? null,
        company_cert_no: m.ownerType === "company" ? `PVT-SEED${String(MERCHANTS.indexOf(m) + 1).padStart(3, "0")}` : null,
        company_kra: m.ownerType === "company" ? `P05100${String(MERCHANTS.indexOf(m) + 1).padStart(4, "0")}S` : null,
        first_name: m.firstName,
        surname: m.surname,
        national_id: `9900${String(MERCHANTS.indexOf(m) + 1).padStart(4, "0")}`,
        kra_pin: `A99000${String(MERCHANTS.indexOf(m) + 1).padStart(4, "0")}S`,
        payout_same: true,
        payout_method: "mpesa",
        payout_detail: null,
        onboarding_step: 5,
        onboarding_max_step: 5,
        onboarding_screen: "done",
        onboarding_submitted: true,
        merchant_terms_accepted_version: "2026-06-01",
        merchant_terms_accepted_at: daysAgo(60),
        sms_opt_out: true,
      };
      const existing = await trx("merchants").where({ user_id: user.id }).first("id", "approved_at");
      let merchantId: string;
      if (existing) {
        merchantId = existing.id as string;
        await trx("merchants")
          .where({ id: merchantId })
          .update({ ...fields, approved_at: existing.approved_at ?? daysAgo(45) });
      } else {
        merchantId = generateId("merchant");
        await trx("merchants").insert({ id: merchantId, user_id: user.id, ...fields, approved_at: daysAgo(45) });
      }
      merchantIds.set(m.key, merchantId);

      const kinds = m.ownerType === "company" ? [...OWNER_DOCS, ...COMPANY_DOCS] : [...OWNER_DOCS];
      for (const kind of kinds) {
        if (await ensureFixtureDoc(trx, { merchantId }, `merchants/${m.key}`, kind)) counts.docsUploaded++;
      }
    }

    for (const r of RENTERS) {
      const user = await ensureUser(trx, { email: emailFor(r.key), fullName: r.fullName, role: "customer", passwordHash });
      if (user.created) counts.usersCreated++;
      for (const kind of RENTER_DOCS) {
        const expiresAt = kind === "driving_licence" ? dateOnly(new Date(Date.now() + 700 * DAY_MS)) : undefined;
        if (await ensureFixtureDoc(trx, { userId: user.id }, `renters/${r.key}`, kind, expiresAt)) counts.docsUploaded++;
      }
    }

    for (const [index, spec] of FLEET.entries()) {
      const model = MODELS[spec.model];
      const merchantId = merchantIds.get(spec.merchant);
      if (!merchantId) throw new Error(`FLEET row ${index + 1} names unknown merchant ${spec.merchant}`);
      const plate = seedPlate(index);
      const expiry = insuranceExpiry(index);
      const p = spec.price;
      const fields = {
        merchant_id: merchantId,
        type: model.type,
        make: model.make,
        model: model.model,
        year: String(spec.year),
        transmission: model.transmission,
        fuel: model.fuel,
        colour: spec.colour,
        seats: model.seats,
        county: spec.county,
        pickup_address: `${spec.area}, ${spec.county}`,
        chauffeured: model.type === "truck" ? true : (spec.driver ?? false),
        minimum_hire_days: spec.minDays ?? 1,
        hiring_unit: p.unit,
        daily_rate_amount: p.unit === "day" ? kesCents(p.rate) : 0,
        trip_rate_amount: p.unit === "trip" ? kesCents(p.rate) : null,
        km_rate_amount: p.unit === "km" ? kesCents(p.rate) : null,
        tonne_rate_amount: p.unit === "tonne" ? kesCents(p.rate) : null,
        minimum_charge_amount: p.unit === "km" || p.unit === "tonne" ? kesCents(p.minimum) : null,
        quote_required: p.unit === "day" && p.quote === true,
        hourly_rate_amount: null,
        truck_type: "truckType" in model ? model.truckType : null,
        payload_kg: "payloadKg" in model ? model.payloadKg : null,
        machine_type: "machineType" in model ? model.machineType : null,
        registration_kind: "plate",
        insurance_expiry: expiry,
        status: "live",
        verification_badge: "none",
        reviewer_note: null,
        reviewer_note_meta: null,
        reviewer_note_resolved: false,
      };

      const existing = await trx("vehicles").where({ registration: plate }).first("id", "listing_ref");
      let vehicleId: string;
      if (existing) {
        vehicleId = existing.id as string;
        await trx("vehicles")
          .where({ id: vehicleId })
          .update({ ...fields, listing_ref: existing.listing_ref ?? (await nextListingRef(trx)) });
        counts.vehiclesUpdated++;
      } else {
        vehicleId = generateId("vehicle");
        const submittedAt = daysAgo(30 - (index % 20));
        await trx("vehicles").insert({
          id: vehicleId,
          // Its own millisecond-exact timestamp: left to the default, all
          // 100 rows would share the transaction's microsecond `now()`, and
          // the catalog's newest-first cursor (ms precision) skips rows
          // that tie below the millisecond.
          created_at: new Date(submittedAt.getTime() - index * 60_000),
          registration: plate,
          listing_ref: await nextListingRef(trx),
          submitted_at: submittedAt,
          ...fields,
        });
        await trx("vehicle_events").insert([
          {
            id: generateId("vehicleEvent"),
            vehicle_id: vehicleId,
            merchant_id: merchantId,
            kind: "submitted",
            tone: "grey",
            label: "Submitted for review",
            actor_type: "merchant",
            occurred_at: submittedAt,
          },
          {
            id: generateId("vehicleEvent"),
            vehicle_id: vehicleId,
            merchant_id: merchantId,
            kind: "approved",
            tone: "green",
            label: "Approved and live",
            actor_type: "system",
            occurred_at: new Date(submittedAt.getTime() + DAY_MS),
          },
        ]);
        counts.vehiclesCreated++;
      }

      const keyBase = `vehicles/${plateSlug(plate)}`;
      for (const kind of VEHICLE_DOCS) {
        const expiresAt = kind === "comprehensive_insurance" ? expiry : undefined;
        if (await ensureFixtureDoc(trx, { merchantId, vehicleId }, keyBase, kind, expiresAt)) counts.docsUploaded++;
      }
      const files = photos.get(model.photos)!;
      for (const [n, body] of files.entries()) {
        const added = await ensureDocument(trx, { merchantId, vehicleId }, {
          kind: "vehicle_photo",
          key: `${KEY_PREFIX}${keyBase}/photo-${n + 1}.jpg`,
          body,
          contentType: "image/jpeg",
          name: `${model.photos}-${n + 1}.jpg`,
        });
        if (added) counts.photosUploaded++;
      }
    }

    await writeAuditEntry(trx, {
      actorId: null,
      actorType: "system",
      action: "seed.hire.run",
      entityType: "seed",
      entityId: "seed-hire",
      after: { ...counts, vehicles: FLEET.length, merchants: MERCHANTS.length, renters: RENTERS.length },
    });
  });

  say(`seed:hire done. Storage: ${storageLine()}.`);
  say(
    `Added ${counts.vehiclesCreated} vehicles, updated ${counts.vehiclesUpdated}; ` +
      `${counts.usersCreated} new users; ${counts.photosUploaded} photos and ${counts.docsUploaded} documents uploaded.`,
  );
  await printDatabaseCounts();
  say();
  say(`Merchants (password ${process.env.SEED_HIRE_PASSWORD ? "from SEED_HIRE_PASSWORD" : "CralSeed2026!"}):`);
  for (const m of MERCHANTS) say(`  ${emailFor(m.key)}`);
  say("Renters (ID and licence accepted):");
  for (const r of RENTERS) say(`  ${emailFor(r.key)}`);
}

/** Counts of what is in the database now, read back rather than assumed. */
async function printDatabaseCounts(): Promise<void> {
  const base = () =>
    db("vehicles as v")
      .join("merchants as m", "m.id", "v.merchant_id")
      .join("users as u", "u.id", "m.user_id")
      .where("u.email", "like", `%${SEED_EMAIL_DOMAIN}`)
      .whereRaw("v.registration ~ ?", [SEED_PLATE_SQL_PATTERN]);
  const byType = await base().groupBy("v.type").select("v.type").count<{ type: string; count: string }[]>("* as count");
  const byCounty = await base().groupBy("v.county").select("v.county").count<{ county: string; count: string }[]>("* as count");
  const byUnit = await base()
    .groupBy("v.hiring_unit", "v.quote_required")
    .select("v.hiring_unit", "v.quote_required")
    .count<{ hiring_unit: string; quote_required: boolean; count: string }[]>("* as count");
  const live = await base().where("v.status", "live").count<{ count: string }[]>("* as count");
  const photos = await base()
    .join("documents as d", "d.vehicle_id", "v.id")
    .where("d.kind", "vehicle_photo")
    .count<{ count: string }[]>("* as count");
  const merchants = await db("merchants as m")
    .join("users as u", "u.id", "m.user_id")
    .where("u.email", "like", `%${SEED_EMAIL_DOMAIN}`)
    .whereNotNull("m.approved_at")
    .count<{ count: string }[]>("* as count");

  const groups: Record<string, number> = {};
  for (const r of byType) {
    const group = Object.entries(HIRE_GROUPS).find(([, t]) => (t as readonly string[]).includes(r.type))?.[0] ?? r.type;
    groups[group] = (groups[group] ?? 0) + Number(r.count);
  }
  say();
  say(`In the database: ${live[0]?.count ?? 0} live seeded vehicles, ${photos[0]?.count ?? 0} photos, ${merchants[0]?.count ?? 0} approved merchants.`);
  say(`By group:  ${Object.entries(groups).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  say(`By type:   ${byType.map((r) => `${r.type} ${r.count}`).join(", ")}`);
  say(`By unit:   ${byUnit.map((r) => `${r.hiring_unit}${r.quote_required ? " (quote first)" : ""} ${r.count}`).join(", ")}`);
  say(`By county (${byCounty.length}):`);
  for (const r of byCounty.sort((a, b) => Number(b.count) - Number(a.count))) say(`  ${r.county.padEnd(12)} ${r.count}`);
}

function printPlan(): void {
  const tally = (f: (v: SeedVehicle) => string): string => {
    const t: Record<string, number> = {};
    for (const v of FLEET) t[f(v)] = (t[f(v)] ?? 0) + 1;
    return Object.entries(t)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${n}`)
      .join(", ");
  };
  say("seed:hire --dry-run: nothing written.");
  say(`Database: ${new URL(process.env.DATABASE_URL!).pathname.slice(1)} on ${new URL(process.env.DATABASE_URL!).hostname}`);
  say(`Storage:  ${storageLine()} (photos would go under ${KEY_PREFIX})`);
  say(`Would seed ${FLEET.length} vehicles, ${MERCHANTS.length} merchants, ${RENTERS.length} renters, ${FLEET.length * PHOTOS_PER_VEHICLE} photos.`);
  say(`By group:  ${tally(groupOf)}`);
  say(`By type:   ${tally((v) => MODELS[v.model].type)}`);
  say(`By unit:   ${tally((v) => (v.price.unit === "day" && v.price.quote ? "day (quote first)" : v.price.unit))}`);
  say(`By county: ${tally((v) => v.county)}`);
  say(`Plates:    ${seedPlate(0)} to ${seedPlate(FLEET.length - 1)}`);
}

// ---------------------------------------------------------------------
// Clear
// ---------------------------------------------------------------------

async function clear(): Promise<void> {
  const users = await db("users").where("email", "like", `%${SEED_EMAIL_DOMAIN}`).select("id");
  const userIds = users.map((u) => u.id as string);
  const merchantIds = userIds.length
    ? (await db("merchants").whereIn("user_id", userIds).select("id")).map((m) => m.id as string)
    : [];
  const vehicleIds = merchantIds.length
    ? (
        await db("vehicles")
          .whereIn("merchant_id", merchantIds)
          .whereRaw("registration ~ ?", [SEED_PLATE_SQL_PATTERN])
          .select("id")
      ).map((v) => v.id as string)
    : [];

  // Anything a seeded merchant added by hand (a non-KZZ plate) would go
  // with its merchant row; stop instead of deleting someone's real work.
  const otherVehicles = merchantIds.length
    ? await db("vehicles")
        .whereIn("merchant_id", merchantIds)
        .whereRaw("registration !~ ?", [SEED_PLATE_SQL_PATTERN])
        .select("registration")
    : [];
  if (otherVehicles.length) {
    refuse(`seeded merchants also hold ${otherVehicles.map((v) => v.registration).join(", ")}; remove those first.`);
  }
  // Drivers would go with their merchant too, leaving their photos and
  // documents in storage: `seed:drivers --clear` removes them properly.
  const drivers = merchantIds.length ? await db("drivers").whereIn("merchant_id", merchantIds).first("id") : null;
  if (drivers) refuse("seeded merchants have drivers; run seed:drivers --clear first (and remove any added by hand).");

  const bookings = userIds.length
    ? await db("bookings")
        .where((q) => {
          q.whereIn("hirer_id", userIds).orWhereIn("merchant_id", merchantIds);
          if (vehicleIds.length) q.orWhereIn("vehicle_id", vehicleIds);
        })
        .select("id", "ref", "status")
    : [];
  if (bookings.length && !WITH_BOOKINGS) {
    say(`Seeded vehicles or renters have ${bookings.length} booking(s):`);
    for (const b of bookings) say(`  ${b.ref ?? b.id} (${b.status})`);
    refuse("bookings exist. Re-run with --clear --with-bookings to delete them too.");
  }
  if (bookings.length) {
    const paidOut = await db("payout_run_lines").whereIn("booking_id", bookings.map((b) => b.id)).first("booking_id");
    if (paidOut) refuse("a seeded booking is on a payout run; clear it by hand.");
  }
  const orders = userIds.length
    ? await db("orders").whereIn("user_id", userIds).orWhereIn("merchant_id", merchantIds).first("id")
    : null;
  if (orders) refuse("seeded accounts have orders; clear them by hand.");

  const keys = (
    await db("documents")
      .where("storage_key", "like", `${KEY_PREFIX}%`)
      .where((q) => {
        if (userIds.length) q.whereIn("user_id", userIds);
        if (merchantIds.length) q.orWhereIn("merchant_id", merchantIds);
      })
      .select("storage_key")
  ).map((d) => d.storage_key as string);

  if (!userIds.length) {
    say("seed:hire --clear: nothing to clear.");
    return;
  }

  await db.transaction(async (trx) => {
    if (bookings.length) {
      await trx("ratings").whereIn("booking_id", bookings.map((b) => b.id)).delete();
      await trx("bookings").whereIn("id", bookings.map((b) => b.id)).delete();
    }
    // merchants, vehicles, documents and vehicle events go by cascade.
    await trx("users").whereIn("id", userIds).delete();
    await writeAuditEntry(trx, {
      actorId: null,
      actorType: "system",
      action: "seed.hire.clear",
      entityType: "seed",
      entityId: "seed-hire",
      before: {
        users: userIds.length,
        merchants: merchantIds.length,
        vehicles: vehicleIds.length,
        bookings: bookings.map((b) => b.ref ?? b.id),
        storage_objects: keys.length,
      },
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
  say(
    `seed:hire --clear: removed ${userIds.length} users, ${merchantIds.length} merchants, ${vehicleIds.length} vehicles, ` +
      `${bookings.length} bookings, ${removed}/${keys.length} stored files.`,
  );
}

// ---------------------------------------------------------------------

async function main(): Promise<void> {
  assertSafeTarget();
  if (DRY_RUN) {
    loadPhotos();
    printPlan();
    const existing = await db("vehicles")
      .whereRaw("registration ~ ?", [SEED_PLATE_SQL_PATTERN])
      .count<{ count: string }[]>("* as count");
    say(`Already in the database: ${existing[0]?.count ?? 0} seeded plates.`);
  } else if (CLEAR) {
    await clear();
  } else {
    await seed();
  }
  await db.destroy();
}

main().catch(async (error: unknown) => {
  console.error("seed:hire failed:", error);
  await db.destroy().catch(() => undefined);
  process.exit(1);
});
