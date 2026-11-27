#!/usr/bin/env node
/**
 * `npm run walk:hire` - the eleven hire walks, end to end, against a local API.
 *
 * Three jobs (merchant, Ops, customer) for three types (car, truck,
 * machine), then two driver walks (DR5 of docs/plans/drivers-that-work.md):
 * a driver alone for the renter's own car, and a self-drive car with its
 * owner's own driver. Each walk goes through the same HTTP calls the
 * portals make:
 *
 *   merchant  sign up, verify email, onboard (details, phone code, vehicle,
 *             3 photos, documents, terms), submit
 *   ops       sign in with the SMS code, owner checklist + documents,
 *             approve the owner, vehicle checklist + documents, go live
 *   customer  find it in the catalog, request it (truck: route + load,
 *             then the owner's quote), Ops clears the renter's papers, pay
 *             by console M-Pesa, pickup with the emailed code, return
 *   drivers   the owner adds a driver (3 documents, photo) and submits; Ops
 *             approves owner and driver; the renter finds the driver by
 *             county and dates, requests, pays, and the job is texted to
 *             the driver. Driver only: the renter starts the job with the
 *             code from the driver's SMS. Car + driver: the owner's
 *             handover, as for a car.
 *
 * Safety. The walk never talks to an API it did not start. It starts its
 * own copy of `apps/api` on port 4100 (WALK_PORT) with the email, SMS,
 * payment and disbursement adapters forced to `console`, storage forced
 * to `local`, and its own Redis database (7), so no queue worker of
 * another API can pick up its jobs and send them for real. It reads the
 * codes those console adapters print from that child's output - there is
 * no HTTP way to read them, and none is added. It refuses to start when
 * the database is not on this machine, when NODE_ENV is production, or
 * when the port is taken, and stops at the first code that does not come
 * from a console adapter.
 *
 * Every run makes new accounts and plates (suffix = run id), so it can run
 * again and again on the same local database. Plan: H7 of
 * docs/plans/hire-that-works.md. Screen checklist: docs/review/hire-walk.md.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = join(ROOT, "apps", "api");
const TSX = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const ASSETS = join(API_DIR, "src", "scripts", "seed-assets", "vehicles");
const DRIVER_PHOTOS = join(API_DIR, "src", "scripts", "seed-assets", "drivers", "male");
const PORT = Number(process.env.WALK_PORT ?? 4100);
const API = `http://localhost:${PORT}`;
const VERBOSE = process.argv.includes("--verbose");

// A local-only Ops account the walk creates once with `admin:create`.
const OPS_EMAIL = process.env.WALK_OPS_EMAIL ?? "hire.walk.ops@example.test";
const OPS_PHONE = process.env.WALK_OPS_PHONE ?? "+254700000990";
const OPS_PASSWORD = process.env.WALK_OPS_PASSWORD ?? "HireWalk#Local2026";
const PASSWORD = "HireWalk#Local2026";
const TERMS = "2026-08-24";

const FORCED_ENV = {
  EMAIL_ADAPTER: "console",
  SMS_ADAPTER: "console",
  PAYMENT_ADAPTER: "console",
  DISBURSEMENT_ADAPTER: "console",
  STORAGE_ADAPTER: "local",
  // The driver's job SMS goes out from the notification-delivery worker,
  // which must run in the walk's own API (its own Redis db, below).
  WORKERS_ENABLED: "true",
  // Empty means the console callback is accepted without Basic auth; set
  // here so a value in the repo .env can't change that for the walk.
  DARAJA_CALLBACK_USER: "",
  DARAJA_CALLBACK_PASSWORD: "",
  PORT: String(PORT),
};

// ---------------------------------------------------------------- guards

/** Reads one key from the repo-root .env the API will load. */
function dotenvValue(key) {
  const path = join(ROOT, ".env");
  if (!existsSync(path)) return undefined;
  const line = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
}

function refuse(why) {
  console.error(`REFUSED: ${why}`);
  process.exit(2);
}

const dbUrl = process.env.DATABASE_URL ?? dotenvValue("DATABASE_URL");
if (!dbUrl) refuse("no DATABASE_URL in the environment or .env.");
const dbHost = new URL(dbUrl).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(dbHost)) {
  refuse(`the database is on "${dbHost}". The walk only runs on a database on this machine.`);
}
if ((process.env.NODE_ENV ?? dotenvValue("NODE_ENV")) === "production") {
  refuse("NODE_ENV is production.");
}
const redisBase = new URL(process.env.REDIS_URL ?? dotenvValue("REDIS_URL") ?? "redis://localhost:6380");
if (!["localhost", "127.0.0.1", "::1"].includes(redisBase.hostname)) {
  refuse(`Redis is on "${redisBase.hostname}". The walk only runs on Redis on this machine.`);
}
redisBase.pathname = "/7";
FORCED_ENV.REDIS_URL = redisBase.toString();

function portFree(port) {
  return new Promise((resolve) => {
    const s = createServer()
      .once("error", () => resolve(false))
      .once("listening", () => s.close(() => resolve(true)))
      .listen(port);
  });
}

// ------------------------------------------------------- the child API

let log = "";
let api;

/**
 * Sign-up allows 10 an hour per IP and each run signs up seven accounts, so
 * a second run in the hour would hit 429. The counters the walk's API
 * keeps are in Redis db 7, which only the walk uses: reset those, and
 * nothing else.
 */
async function resetWalkRateLimits() {
  const { default: Redis } = await import("ioredis");
  const r = new Redis(FORCED_ENV.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await r.connect();
    let cursor = "0";
    do {
      const [next, keys] = await r.scan(cursor, "MATCH", "ratelimit:*", "COUNT", 500);
      if (keys.length) await r.del(...keys);
      cursor = next;
    } while (cursor !== "0");
  } catch (e) {
    refuse(`cannot reach Redis at ${redisBase.host} (${e.message}). Start it: docker compose -f infra/docker-compose.yml up -d`);
  } finally {
    r.disconnect();
  }
}

async function startApi() {
  if (!(await portFree(PORT))) {
    refuse(`port ${PORT} is in use. The walk starts its own API there; stop what is on it or set WALK_PORT.`);
  }
  await resetWalkRateLimits();
  api = spawn(process.execPath, [TSX, "src/server.ts"], {
    cwd: API_DIR,
    env: { ...process.env, ...FORCED_ENV },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const take = (chunk) => {
    const text = chunk.toString();
    log += text;
    if (VERBOSE) process.stdout.write(`  | ${text}`);
  };
  api.stdout.on("data", take);
  api.stderr.on("data", take);
  api.on("exit", (code) => {
    if (code !== null && code !== 0 && !stopping) {
      console.error(`FAIL the walk's API stopped (exit ${code}). Last output:\n${log.slice(-2000)}`);
      process.exit(1);
    }
  });
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${API}/readyz`, { signal: AbortSignal.timeout(2000) });
      if (r.status === 200) break;
    } catch {
      // not up yet
    }
    if (i === 119) throw new WalkError("start the API", 0, `not ready after 60 s.\n${log.slice(-2000)}`);
    await sleep(500);
  }
  if (/sms ready — textsms|smtp ready/.test(log)) {
    throw new WalkError("start the API", 0, "the API started a real email or SMS provider");
  }
}

let stopping = false;
/** Stops the child and waits for it, so the walk never exits mid-close. */
function stopApi() {
  stopping = true;
  if (!api || api.exitCode !== null || api.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    api.once("exit", () => resolve());
    api.kill();
    setTimeout(resolve, 5000).unref();
  });
}

// -------------------------------------------------------------- helpers

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = () => randomUUID();

class WalkError extends Error {
  constructor(step, status, detail) {
    super(step);
    this.step = step;
    this.status = status;
    this.detail = detail;
  }
}

async function call(method, path, { token, body, form, idem } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (idem) headers["idempotency-key"] = key();
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(API + path, { method, headers, body: payload });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

/** One API call that must succeed; otherwise the walk stops at `step`. */
async function must(step, method, path, opts) {
  const r = await call(method, path, opts);
  if (r.status >= 400) throw new WalkError(step, r.status, r.body);
  if (VERBOSE) console.log(`    ok ${step} (${r.status})`);
  return r.body;
}

/** A call that must fail with `code` (a rule the walk checks on the way). */
async function mustRefuse(step, code, method, path, opts) {
  const r = await call(method, path, opts);
  if (r.body?.error?.code !== code) {
    throw new WalkError(step, r.status, `expected ${code}, got ${JSON.stringify(r.body).slice(0, 300)}`);
  }
}

/**
 * Waits for the console adapter line `[<channel>:console] to=<to>` printed
 * after `from`, and returns the first match of `re` in the message under
 * it. A code that reaches the log any other way is not trusted.
 */
async function codeFromLog(step, channel, to, from, re = /\b(\d{6})\b/) {
  const marker = `[${channel}:console] to=${to}`;
  for (let i = 0; i < 40; i++) {
    const tail = log.slice(from);
    const at = tail.lastIndexOf(marker);
    if (at >= 0) {
      const next = tail.indexOf("[", at + marker.length);
      const msg = tail.slice(at + marker.length, next > 0 ? next : undefined);
      const m = msg.match(re);
      if (m) return m[1];
    }
    await sleep(250);
  }
  throw new WalkError(step, 0, `no ${channel} to ${to} from a console adapter in the API output`);
}

function photo(dir, i) {
  const files = readdirSync(join(ASSETS, dir)).filter((f) => f.endsWith(".jpg"));
  const file = files[i % files.length];
  return new Blob([readFileSync(join(ASSETS, dir, file))], { type: "image/jpeg" });
}
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
const pdf = () => new Blob([PDF], { type: "application/pdf" });

function upload(step, path, token, fields, file, name) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", file, name);
  return must(step, "POST", path, { token, form });
}

/** A Nairobi 09:00 (06:00 UTC) `days` from now. */
function day(days) {
  const d = new Date(Date.now() + days * 864e5);
  d.setUTCHours(6, 0, 0, 0);
  return d.toISOString();
}

// ----------------------------------------------------------- the run id

// Six digits from the clock and three letters from it, so plates, phones,
// IDs and emails are new on every run.
const RUN = String(Date.now() % 1_000_000).padStart(6, "0");
const L = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const letters = (n) => {
  let v = Math.floor(Date.now() / 1000);
  let s = "";
  for (let i = 0; i < n; i++) {
    s += L[v % L.length];
    v = Math.floor(v / L.length);
  }
  return s;
};
const RL = letters(3);

const TYPES = {
  car: {
    n: 1,
    photos: "rav4",
    vehicle: {
      type: "suv", make: "Toyota", model: "RAV4", year: "2019", seats: 5,
      transmission: "Automatic", fuel: "Petrol", colour: "Silver",
      county: "Nairobi", pickup_address: "Westlands, Nairobi", daily_rate: "6500",
      chauffeured: false,
    },
  },
  truck: {
    n: 2,
    photos: "isuzu-frr",
    vehicle: {
      type: "truck", make: "Isuzu", model: "FRR", year: "2018",
      transmission: "Manual", fuel: "Diesel", colour: "White",
      county: "Mombasa", pickup_address: "Changamwe, Mombasa", daily_rate: "25000",
      chauffeured: true, truck_type: "flatbed", payload_kg: 10000,
    },
  },
  machine: {
    n: 3,
    photos: "cat-320",
    vehicle: {
      type: "machinery", make: "Caterpillar", model: "320 Excavator", year: "2017",
      registration_kind: "serial", machine_type: "excavator",
      transmission: "Manual", fuel: "Diesel", colour: "Yellow",
      county: "Kiambu", pickup_address: "Thika Road, Kiambu", daily_rate: "45000",
      chauffeured: true,
    },
  },
  // DR5: an owner who only drives (no car, `drivers_only`)...
  drivers: { n: 4, county: "Nakuru" },
  // ...and a self-drive car whose owner also lists a driver.
  withdriver: {
    n: 5,
    photos: "rav4",
    vehicle: {
      type: "suv", make: "Toyota", model: "RAV4", year: "2020", seats: 5,
      transmission: "Automatic", fuel: "Petrol", colour: "Grey",
      county: "Nairobi", pickup_address: "Kilimani, Nairobi", daily_rate: "6000",
      chauffeured: false,
    },
  },
};

function registrationFor(kind) {
  if (kind === "machine") return `CAT0320D${RUN}`;
  return `K${RL.slice(0, 2)}${RUN.slice(-3)}${"ABCDE"[TYPES[kind].n - 1]}`;
}

// --------------------------------------------------------------- walks

async function merchantWalk(kind) {
  const t = TYPES[kind];
  const email = `hire.walk.${RUN}.${kind}@example.test`;
  const phone = `+2547${RUN}${t.n}0`.slice(0, 13);
  let from = log.length;
  await must("merchant: sign up", "POST", "/auth/register", {
    body: { email, password: PASSWORD, role: "merchant", accepted_terms_version: TERMS },
  });
  const ecode = await codeFromLog("merchant: email code", "email", email, from);
  await must("merchant: verify email", "POST", "/auth/otp/verify", {
    body: { identifier: email, purpose: "signup", code: ecode, device_id: "hire-walk" },
  });
  const login = await must("merchant: sign in", "POST", "/auth/login", {
    body: { identifier: email, password: PASSWORD, device_id: "hire-walk" },
  });
  const token = login.access_token ?? login.tokens?.access_token;
  if (!token) throw new WalkError("merchant: sign in", 200, "no access_token in the reply");

  await must("merchant: open onboarding", "GET", "/merchant/onboarding", { token });
  await must("merchant: owner details", "PATCH", "/merchant/onboarding", {
    token,
    body: {
      owner_type: "individual", first_name: "Hire", surname: `Walk ${kind}`,
      national_id: `3${RUN}${t.n}`, kra_pin: `A${RUN}${t.n}00Z`, phone,
      payout_same: true, step: 2, max_step: 2,
    },
  });
  from = log.length;
  await must("merchant: send phone code", "POST", "/auth/phone/verification/start", { token, body: {} });
  const pcode = await codeFromLog("merchant: phone code", "sms", phone, from);
  await must("merchant: confirm phone", "POST", "/auth/phone/verification/confirm", {
    token, body: { code: pcode },
  });

  if (!t.vehicle) {
    // "I only drive": no car, the owner lists drivers instead.
    for (const k of ["national_id", "kra_pin"]) {
      await upload(`merchant: ${k}`, "/merchant/onboarding/documents", token, { kind: k }, pdf(), `${k}.pdf`);
    }
    await must("merchant: I only drive", "PATCH", "/merchant/onboarding", {
      token, body: { drivers_only: true, terms_accepted: true },
    });
    await must("merchant: submit with no car", "POST", "/merchant/onboarding/submit", { token });
    return { token, email, phone, vehicleId: null };
  }

  const vehicle = await must("merchant: add vehicle", "POST", "/merchant/onboarding/vehicles", {
    token, body: { ...t.vehicle, registration: registrationFor(kind) },
  });
  for (let i = 0; i < 3; i++) {
    await upload(`merchant: photo ${i + 1}`, "/merchant/onboarding/documents", token,
      { kind: "vehicle_photo", vehicle_id: vehicle.id }, photo(t.photos, i), `${t.photos}-${i + 1}.jpg`);
  }
  for (const k of ["national_id", "kra_pin"]) {
    await upload(`merchant: ${k}`, "/merchant/onboarding/documents", token, { kind: k }, pdf(), `${k}.pdf`);
  }
  for (const k of ["logbook", "comprehensive_insurance", "tracker_certificate"]) {
    await upload(`merchant: ${k}`, "/merchant/onboarding/documents", token,
      { kind: k, vehicle_id: vehicle.id }, pdf(), `${k}.pdf`);
  }
  await must("merchant: insurance expiry", "PATCH", `/merchant/onboarding/vehicles/${vehicle.id}`, {
    token, body: { insurance_expiry: day(320).slice(0, 10) },
  });
  await must("merchant: accept terms", "PATCH", "/merchant/onboarding", { token, body: { terms_accepted: true } });
  await must("merchant: submit", "POST", "/merchant/onboarding/submit", { token });
  return { token, email, phone, vehicleId: vehicle.id };
}

let opsToken;
async function opsSignIn() {
  if (opsToken) return opsToken;
  let from = log.length;
  let l = await call("POST", "/admin/auth/login", {
    body: { email: OPS_EMAIL, password: OPS_PASSWORD, device_id: "hire-walk" },
  });
  if (l.status === 401 || l.status === 404) {
    // First run on this database: make the walk's own Ops account.
    const r = spawnSync(
      process.execPath,
      [TSX, "src/scripts/create-admin.ts", OPS_EMAIL, OPS_PHONE, "admin_super", "Hire Walk Ops"],
      { cwd: API_DIR, env: { ...process.env, ...FORCED_ENV, ADMIN_PASSWORD: OPS_PASSWORD }, encoding: "utf8" },
    );
    if (r.status !== 0) {
      throw new WalkError("ops: create the walk's Ops account", r.status, `${r.stdout}${r.stderr}`.trim());
    }
    from = log.length;
    l = await call("POST", "/admin/auth/login", {
      body: { email: OPS_EMAIL, password: OPS_PASSWORD, device_id: "hire-walk" },
    });
  }
  if (l.status >= 400) throw new WalkError("ops: sign in", l.status, l.body);
  const code = await codeFromLog("ops: SMS code", "sms", OPS_PHONE, from);
  const v = await must("ops: 2FA", "POST", "/admin/auth/2fa", {
    body: { challenge_token: l.body.challenge_token, code, device_id: "hire-walk" },
  });
  opsToken = v.access_token;
  return opsToken;
}

/** Owner checklist, the owner's two documents, approve. */
async function opsApproveOwner(t, mid) {
  const file = await must("ops: open owner file", "GET", `/admin/merchants/${mid}`, { token: t });
  for (const it of file.checklist?.items ?? []) {
    await must(`ops: owner check ${it.id}`, "POST", `/admin/merchants/${mid}/checklist`, {
      token: t, body: { item_id: it.id, result: "pass" },
    });
  }
  for (const d of ["national_id", "kra_pin"]) {
    await must(`ops: accept owner ${d}`, "POST", `/admin/merchants/${mid}/documents/${d}/decision`, {
      token: t, idem: true, body: { decision: "accept" },
    });
  }
  await must("ops: approve owner", "POST", `/admin/merchants/${mid}/approve`, { token: t, idem: true, body: {} });
}

async function opsWalk(m) {
  const t = await opsSignIn();
  const vcase = await must("ops: open vehicle case", "GET", `/admin/vehicles/${m.vehicleId}`, { token: t });
  const mid = vcase.merchant?.id ?? vcase.merchant_id ?? vcase.vehicle?.merchant_id;
  if (!mid) throw new WalkError("ops: open vehicle case", 200, "no merchant id on the case");
  await opsApproveOwner(t, mid);

  const c2 = await must("ops: reopen vehicle case", "GET", `/admin/vehicles/${m.vehicleId}`, { token: t });
  const items = [
    ...(c2.documents ?? []).flatMap((d) => d.checklist?.items ?? []),
    ...(c2.photos_checklist?.items ?? []),
    ...(c2.checklist?.items ?? []),
  ];
  if (items.length === 0) throw new WalkError("ops: vehicle checklist", 200, "the case has no checklist items");
  for (const it of items) {
    await must(`ops: vehicle check ${it.id}`, "POST", `/admin/vehicles/${m.vehicleId}/checklist`, {
      token: t, body: { item_id: it.id, result: "pass" },
    });
  }
  for (const d of ["logbook", "comprehensive_insurance", "tracker_certificate"]) {
    await must(`ops: accept ${d}`, "POST", `/admin/vehicles/${m.vehicleId}/documents/${d}/decision`, {
      token: t, idem: true, body: { decision: "accept" },
    });
  }
  const dec = await must("ops: approve listing", "POST", `/admin/vehicles/${m.vehicleId}/decision`, {
    token: t, idem: true, body: { action: "approve" },
  });
  const status = dec.status ?? dec.vehicle?.status;
  if (status !== "live") throw new WalkError("ops: approve listing", 200, `vehicle is "${status}", not live`);
  return { items: items.length };
}

// One renter per run hires all three. Kept as a promise so a failed
// sign-up is reported once per walk instead of retried into a 409.
let renterPromise;
const renterReady = () => (renterPromise ??= makeRenter({ tag: "renter", tail: "90", licence: true }));
// The driver walks hire with a second renter who has only a national ID on
// file: a driver for the renter's own car, or a car that comes with its
// owner's driver, needs no licence (lib/renter-papers.ts).
let driverRenterPromise;
const driverRenterReady = () =>
  (driverRenterPromise ??= makeRenter({ tag: "driver.renter", tail: "80", licence: false }));
async function makeRenter({ tag, tail, licence }) {
  const email = `hire.walk.${RUN}.${tag}@example.test`;
  const phone = `+2547${RUN}${tail}`.slice(0, 13);
  // With a phone on the form, the sign-up code goes by SMS and confirming
  // it verifies the phone (auth/service.ts `register`, next: verify_phone).
  const from = log.length;
  await must("customer: sign up", "POST", "/auth/register", {
    body: { email, password: PASSWORD, role: "customer", accepted_terms_version: TERMS, full_name: "Hire Walk Renter", phone },
  });
  const pcode = await codeFromLog("customer: sign-up SMS code", "sms", phone, from);
  await must("customer: confirm phone", "POST", "/auth/otp/verify", {
    body: { identifier: phone, purpose: "signup", code: pcode, device_id: "hire-walk" },
  });
  const l = await must("customer: sign in", "POST", "/auth/login", {
    body: { identifier: email, password: PASSWORD, device_id: "hire-walk" },
  });
  const token = l.access_token ?? l.tokens?.access_token;
  if (!token) throw new WalkError("customer: sign in", 200, `no access_token (next: ${l.next})`);
  await upload("customer: upload ID", "/me/documents", token, { kind: "national_id" }, photo("fit", 0), "id.jpg");
  if (licence) {
    await upload("customer: upload licence", "/me/documents", token,
      { kind: "driving_licence", expires_at: day(700).slice(0, 10) }, photo("fit", 1), "licence.jpg");
  }
  const me = await must("customer: read own account", "GET", "/me", { token });
  return { token, email, phone, id: me.id ?? me.user?.id, licence, cleared: false };
}

/** H5: pay is refused until Ops clears the papers this hire needs; then Ops clears them. */
async function clearPapersOnce(r, bookingId) {
  if (r.cleared) return;
  await mustRefuse("customer: pay before papers cleared", "papers_not_cleared", "POST",
    `/bookings/${bookingId}/pay`, { token: r.token, idem: true, body: { purpose: "full", phone: r.phone } });
  const ot = await opsSignIn();
  for (const d of r.licence ? ["national_id", "driving_licence"] : ["national_id"]) {
    await must(`ops: clear renter ${d}`, "POST", `/admin/renters/${r.id}/documents/${d}/decision`, {
      token: ot, idem: true, body: { decision: "accept" },
    });
  }
  r.cleared = true;
}

/** STK push on the console rail, the console-shaped callback, wait for `success`. */
async function payAndSettle(r, bookingId, receipt) {
  const from = log.length;
  await must("customer: pay (STK push)", "POST", `/bookings/${bookingId}/pay`, {
    token: r.token, idem: true, body: { purpose: "full", phone: r.phone },
  });
  let msgRef;
  for (let i = 0; i < 40 && !msgRef; i++) {
    msgRef = log.slice(from).match(/\[payment:console\] STK push .*messageReference=(\S+)/)?.[1];
    if (!msgRef) await sleep(250);
  }
  if (!msgRef) throw new WalkError("customer: pay (STK push)", 0, "no console STK push in the API output");
  await must("customer: M-Pesa callback (console)", "POST", "/payments/daraja/callback", {
    body: { reference: msgRef, succeeded: true, receipt, amountShillings: null },
  });
  // The trip page polls this (openapi/payments.yaml) until `success`.
  for (let i = 0; i < 20; i++) {
    const p = await must("customer: payment settles", "GET", `/bookings/${bookingId}/payment`, { token: r.token });
    if (p.status === "success") break;
    if (i === 19) throw new WalkError("customer: payment settles", 200, `payment is "${p.status}", not success`);
    await sleep(500);
  }
  return from;
}

/**
 * The owner's handover in the merchant portal. Pickup: the code is emailed
 * to the renter, who reads it to the owner. Return: no code.
 */
async function merchantHandovers(mt, bookingId, ref, renterEmail, legs = ["pickup", "return"]) {
  for (const leg of legs) {
    const legFrom = log.length;
    const h = await must(`merchant: start ${leg}`, "POST", `/merchant/bookings/${bookingId}/handovers`, {
      token: mt, idem: true, body: { kind: leg },
    });
    if (leg === "pickup") {
      const code = await codeFromLog("customer: pickup code", "email", renterEmail, legFrom,
        new RegExp(`${ref} pickup code: (\\d+)`));
      await must("merchant: enter pickup code", "POST", `/merchant/handovers/${h.id}/otp/verify`, {
        token: mt, body: { code },
      });
    }
    await must(`merchant: ${leg} condition`, "POST", `/merchant/handovers/${h.id}/condition`, {
      token: mt, body: { notes: "hire walk" },
    });
    await must(`merchant: ${leg} confirm`, "POST", `/merchant/handovers/${h.id}/confirm`, { token: mt, idem: true });
    await must(`merchant: ${leg} complete`, "POST", `/merchant/handovers/${h.id}/complete`, { token: mt, idem: true });
  }
}

async function mustBeCompleted(r, bookingId) {
  const fin = await must("customer: trip after return", "GET", `/bookings/${bookingId}`, { token: r.token });
  if (fin.status !== "completed") {
    throw new WalkError("customer: trip after return", 200, `booking is "${fin.status}", not completed`);
  }
}

async function customerWalk(kind, m) {
  const r = await renterReady();
  const mt = m.token;

  const cat = await must("customer: open listing", "GET", `/catalog/vehicles/${m.vehicleId}`);
  const group = { car: "cars", truck: "trucks", machine: "machinery" }[kind];
  const list = await must("customer: find it on its page", "GET",
    `/catalog/vehicles?group=${group}&county=${encodeURIComponent(TYPES[kind].vehicle.county)}&sort=newest&limit=48`);
  const rows = list.data ?? list.items ?? [];
  if (!rows.some((v) => v.id === m.vehicleId)) {
    throw new WalkError("customer: find it on its page", 200, `not in /catalog/vehicles?group=${group}`);
  }

  if (kind === "truck") {
    await must("merchant: price per trip, quote first", "PATCH", `/merchant/vehicles/${m.vehicleId}`, {
      token: mt, body: { hiring_unit: "trip", trip_rate: "30000", quote_required: true },
    });
  }

  const body = { vehicle_id: m.vehicleId, pickup_at: day(3), dropoff_at: day(4), note_from_hirer: "hire walk" };
  if (kind === "truck") {
    Object.assign(body, {
      route_from: "Changamwe", route_from_county: "Mombasa", route_to: "Industrial Area",
      route_to_county: "Nairobi", cargo_description: "Cement bags", cargo_kg: 8000,
    });
  }
  const b = await must("customer: request", "POST", "/bookings", { token: r.token, idem: true, body });
  const bookingId = b.id ?? b.booking?.id;
  const ref = b.ref ?? b.reference ?? b.booking?.ref;

  if (kind === "truck") {
    await mustRefuse("merchant: confirm before quote", "quote_required", "POST",
      `/merchant/bookings/${bookingId}/confirm`, { token: mt, idem: true });
    await must("merchant: send quote", "POST", `/merchant/bookings/${bookingId}/quote`, {
      token: mt, idem: true, body: { amount: { amount: 3_500_000, currency: "KES" }, note: "Driver and fuel included" },
    });
    await must("customer: accept quote", "POST", `/bookings/${bookingId}/accept-quote`, { token: r.token, idem: true });
  } else {
    await must("merchant: accept request", "POST", `/merchant/bookings/${bookingId}/confirm`, { token: mt, idem: true });
  }

  await clearPapersOnce(r, bookingId);
  await payAndSettle(r, bookingId, `WALK${RUN}${TYPES[kind].n}`);
  await merchantHandovers(mt, bookingId, ref, r.email);
  await mustBeCompleted(r, bookingId);
  return { ref, listing: cat.listing_ref ?? "" };
}

// ------------------------------------------------------- driver walks

/** The owner adds a driver: details and rates, 3 documents, a photo, submit. */
async function addDriver(m, n, county, rates) {
  const phone = `+2547${RUN}${n}5`.slice(0, 13);
  const d = await must("merchant: add a driver", "POST", "/merchant/drivers", {
    token: m.token,
    body: {
      full_name: `Juma Walk${RUN} ${n}`, phone, national_id: `6${RUN}${n}`, kra_pin: `A${RUN}${n}11Y`,
      licence_number: `WALK-DL-${RUN}-${n}`, licence_expiry: day(500).slice(0, 10), county, ...rates,
    },
  });
  for (const k of ["driving_licence", "national_id", "kra_pin"]) {
    const fields = k === "driving_licence" ? { kind: k, expires_at: day(500).slice(0, 10) } : { kind: k };
    await upload(`merchant: driver ${k}`, `/merchant/drivers/${d.id}/documents`, m.token, fields, pdf(), `${k}.pdf`);
  }
  const face = readdirSync(DRIVER_PHOTOS).filter((f) => f.endsWith(".jpg"))[n % 3];
  await upload("merchant: driver photo", `/merchant/drivers/${d.id}/photo`, m.token, {},
    new Blob([readFileSync(join(DRIVER_PHOTOS, face))], { type: "image/jpeg" }), "driver.jpg");
  const sent = await must("merchant: submit driver", "POST", `/merchant/drivers/${d.id}/submit`, { token: m.token });
  if (sent.status !== "pending") throw new WalkError("merchant: submit driver", 200, `driver is "${sent.status}", not pending`);
  return { id: d.id, phone, name: d.full_name };
}

/** Ops: the driver is in the queue; accept its 3 documents; approve. Returns the owner's merchant id. */
async function opsApproveDriver(t, driverId) {
  let found = false;
  let cursor;
  for (let page = 0; page < 20 && !found; page++) {
    const q = await must("ops: driver queue", "GET",
      `/admin/drivers?filter=open&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { token: t });
    found = (q.data ?? []).some((d) => d.id === driverId);
    if (!q.has_more) break;
    cursor = q.next_cursor;
  }
  if (!found) throw new WalkError("ops: driver queue", 200, "the driver is not in the To review queue");
  for (const k of ["driving_licence", "national_id", "kra_pin"]) {
    await must(`ops: accept driver ${k}`, "POST", `/admin/drivers/${driverId}/documents/${k}/decision`, {
      token: t, idem: true, body: { decision: "accept" },
    });
  }
  const dec = await must("ops: approve driver", "POST", `/admin/drivers/${driverId}/decision`, {
    token: t, idem: true, body: { action: "approve" },
  });
  if (dec.status !== "live") throw new WalkError("ops: approve driver", 200, `driver is "${dec.status}", not live`);
}

/** Pages `GET /catalog/drivers` (the /drivers search) until the driver shows. */
async function findInDriverSearch(query, driverId) {
  let cursor;
  for (let page = 0; page < 50; page++) {
    const list = await must("customer: find the driver", "GET",
      `/catalog/drivers?${new URLSearchParams({ ...query, limit: "48", ...(cursor ? { cursor } : {}) })}`);
    const hit = (list.data ?? []).find((d) => d.id === driverId);
    if (hit) return hit;
    if (!list.has_more) break;
    cursor = list.next_cursor;
  }
  throw new WalkError("customer: find the driver", 200, `not in /catalog/drivers?${new URLSearchParams(query)}`);
}

/** The one-line job SMS the console adapter printed for the driver's phone, after `from`. */
const driverSms = (step, phone, from) => codeFromLog(step, "sms", phone, from, /(CRAL job [^\n]*)/);

async function driverOnlyWalk() {
  // Merchant: "I only drive", then a driver by the hour and the day.
  const m = await merchantWalk("drivers");
  const county = TYPES.drivers.county;
  const drv = await addDriver(m, TYPES.drivers.n, county, { hourly_rate: "500", daily_rate: "3000" });

  // Ops: the driver's case names its owner; approve the owner, then the driver.
  const t = await opsSignIn();
  const dcase = await must("ops: open driver case", "GET", `/admin/drivers/${drv.id}`, { token: t });
  if (!dcase.merchant?.id) throw new WalkError("ops: open driver case", 200, "no merchant on the case");
  await opsApproveOwner(t, dcase.merchant.id);
  await opsApproveDriver(t, drv.id);

  // Customer: the /drivers search, by county, hour rate and the 4 hours wanted.
  const r = await driverRenterReady();
  const pickup = day(3);
  const dropoff = new Date(Date.parse(pickup) + 4 * 3600e3).toISOString();
  const hit = await findInDriverSearch({ county, unit: "hour", pickup_at: pickup, dropoff_at: dropoff }, drv.id);
  if (!hit.photo_url) throw new WalkError("customer: find the driver", 200, "the card has no photo");
  const b = await must("customer: request the driver by the hour", "POST", "/bookings", {
    token: r.token, idem: true,
    body: {
      driver_id: drv.id, driver_unit: "hour", hire_car_details: "Mazda Demio, white (renter's own)",
      pickup_at: pickup, dropoff_at: dropoff, note_from_hirer: "hire walk, driver only",
    },
  });
  const bookingId = b.id ?? b.booking?.id;
  const ref = b.ref ?? b.reference ?? b.booking?.ref;
  await must("merchant: accept request", "POST", `/merchant/bookings/${bookingId}/confirm`, { token: m.token, idem: true });
  await clearPapersOnce(r, bookingId);
  const from = await payAndSettle(r, bookingId, `WALK${RUN}${TYPES.drivers.n}`);

  // DR4: the paid job is texted to the driver, with the code; the renter
  // enters it on the trip page and the job starts without the owner.
  const sms = await driverSms("driver: job SMS", drv.phone, from);
  const code = sms.match(/this code: (\d{4})\./)?.[1];
  if (!sms.includes(ref) || !code) throw new WalkError("driver: job SMS", 0, `no ref or code in: ${sms}`);
  const started = await must("customer: enter the driver's code", "POST", `/bookings/${bookingId}/driver-code`, {
    token: r.token, idem: true, body: { code },
  });
  if (started.status !== "active") {
    throw new WalkError("customer: enter the driver's code", 200, `booking is "${started.status}", not active`);
  }
  await merchantHandovers(m.token, bookingId, ref, r.email, ["return"]);
  await mustBeCompleted(r, bookingId);
  return `${ref} 4 h, code from the driver's SMS, completed`;
}

async function carWithDriverWalk() {
  // Merchant: a self-drive car, and a driver of the owner's own.
  const m = await merchantWalk("withdriver");
  const county = TYPES.withdriver.vehicle.county;
  const drv = await addDriver(m, TYPES.withdriver.n, county, { daily_rate: "2500" });

  // Ops: owner and car as in the car walk, then the driver.
  await opsWalk(m);
  await opsApproveDriver(await opsSignIn(), drv.id);

  // Customer: the car's page offers its owner's driver first.
  const r = await driverRenterReady();
  const offer = await must("customer: car offers a driver", "GET", `/catalog/vehicles/${m.vehicleId}/drivers`);
  if (offer.source !== "owner" || !(offer.data ?? []).some((d) => d.id === drv.id)) {
    throw new WalkError("customer: car offers a driver", 200, `expected the owner's driver, got ${JSON.stringify(offer).slice(0, 300)}`);
  }
  const b = await must("customer: request car + driver", "POST", "/bookings", {
    token: r.token, idem: true,
    body: {
      vehicle_id: m.vehicleId, driver_id: drv.id, driver_unit: "day",
      pickup_at: day(5), dropoff_at: day(6), note_from_hirer: "hire walk, car with driver",
    },
  });
  const bookingId = b.id ?? b.booking?.id;
  const ref = b.ref ?? b.reference ?? b.booking?.ref;
  if (b.linked_booking) throw new WalkError("customer: request car + driver", 201, "split into linked bookings; the owner's own driver should be one booking");
  await must("merchant: accept request", "POST", `/merchant/bookings/${bookingId}/confirm`, { token: m.token, idem: true });
  await clearPapersOnce(r, bookingId);
  const from = await payAndSettle(r, bookingId, `WALK${RUN}${TYPES.withdriver.n}`);

  // The driver is texted the job, with no code: the owner runs the handover.
  const sms = await driverSms("driver: job SMS", drv.phone, from);
  if (!sms.includes(ref) || /code/i.test(sms)) throw new WalkError("driver: job SMS", 0, `expected the ref and no code: ${sms}`);
  await merchantHandovers(m.token, bookingId, ref, r.email);
  await mustBeCompleted(r, bookingId);
  return `${ref} car + driver, job SMS, completed`;
}

// ----------------------------------------------------------------- run

const JOBS = [
  ["merchant", "sign up, onboard, submit"],
  ["ops", "approve owner, review, go live"],
  ["customer", "find, book, pay, hand over, return"],
];

const TOTAL = 9 + 2;

async function main() {
  console.log(`hire walk ${RUN}: starting a console-adapter API on :${PORT} (Redis db 7, database on ${dbHost})`);
  await startApi();
  let passed = 0;
  let failed = 0;
  for (const kind of ["car", "truck", "machine"]) {
    let m;
    for (const [job, what] of JOBS) {
      const label = `${kind.padEnd(7)} ${job.padEnd(8)} ${what}`;
      if ((job === "ops" && !m) || (job === "customer" && !m?.live)) {
        console.log(`SKIP ${label} (an earlier walk for this ${kind} failed)`);
        continue;
      }
      try {
        let note = "";
        if (job === "merchant") {
          m = await merchantWalk(kind);
          note = TYPES[kind].vehicle.type;
        } else if (job === "ops") {
          const o = await opsWalk(m);
          m.live = true;
          note = `${o.items} checks`;
        } else {
          const c = await customerWalk(kind, m);
          note = `${c.listing} ${c.ref} completed`.trim();
        }
        passed++;
        console.log(`PASS ${label}  (${note})`);
      } catch (e) {
        failed++;
        if (!(e instanceof WalkError)) throw e;
        const detail = typeof e.detail === "string" ? e.detail : JSON.stringify(e.detail);
        console.log(`FAIL ${label}\n     step: ${e.step}\n     api:  ${e.status} ${detail.slice(0, 600)}`);
        if (job === "merchant") m = undefined;
      }
    }
  }
  // DR5: the two driver walks, one line each (merchant, Ops and customer inside).
  for (const [name, what, walk] of [
    ["driver  only    ", "I only drive, Ops, search by dates, hour rate, pay, driver's code, return", driverOnlyWalk],
    ["car     + driver", "car and owner's driver, Ops, book, pay, job SMS, hand over, return", carWithDriverWalk],
  ]) {
    const label = `${name} ${what}`;
    try {
      const note = await walk();
      passed++;
      console.log(`PASS ${label}  (${note})`);
    } catch (e) {
      failed++;
      if (!(e instanceof WalkError)) throw e;
      const detail = typeof e.detail === "string" ? e.detail : JSON.stringify(e.detail);
      console.log(`FAIL ${label}\n     step: ${e.step}\n     api:  ${e.status} ${detail.slice(0, 600)}`);
    }
  }
  console.log(`\n${passed} of ${TOTAL} passed${failed ? `, ${failed} failed` : ""}.`);
  return failed === 0 && passed === TOTAL;
}

main()
  .then(async (ok) => {
    await stopApi();
    process.exit(ok ? 0 : 1);
  })
  .catch(async (e) => {
    const detail = e instanceof WalkError ? `${e.step}: ${e.status} ${JSON.stringify(e.detail)}` : e.stack;
    console.error(`FAIL ${detail}`);
    await stopApi();
    process.exit(1);
  });
