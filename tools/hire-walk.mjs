#!/usr/bin/env node
/**
 * `npm run walk:hire` - the nine hire walks, end to end, against a local API.
 *
 * Three jobs (merchant, Ops, customer) for three types (car, truck,
 * machine). Each walk goes through the same HTTP calls the portals make:
 *
 *   merchant  sign up, verify email, onboard (details, phone code, vehicle,
 *             3 photos, documents, terms), submit
 *   ops       sign in with the SMS code, owner checklist + documents,
 *             approve the owner, vehicle checklist + documents, go live
 *   customer  find it in the catalog, request it (truck: route + load,
 *             then the owner's quote), Ops clears the renter's papers, pay
 *             by console M-Pesa, pickup with the emailed code, return
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
 * Sign-up allows 10 an hour per IP and each run signs up four accounts, so
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
};

function registrationFor(kind) {
  if (kind === "machine") return `CAT0320D${RUN}`;
  return `K${RL.slice(0, 2)}${RUN.slice(-3)}${"AB"[TYPES[kind].n - 1]}`;
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

async function opsWalk(m) {
  const t = await opsSignIn();
  const vcase = await must("ops: open vehicle case", "GET", `/admin/vehicles/${m.vehicleId}`, { token: t });
  const mid = vcase.merchant?.id ?? vcase.merchant_id ?? vcase.vehicle?.merchant_id;
  if (!mid) throw new WalkError("ops: open vehicle case", 200, "no merchant id on the case");
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
const renterReady = () => (renterPromise ??= makeRenter());
async function makeRenter() {
  const email = `hire.walk.${RUN}.renter@example.test`;
  const phone = `+2547${RUN}90`.slice(0, 13);
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
  await upload("customer: upload licence", "/me/documents", token,
    { kind: "driving_licence", expires_at: day(700).slice(0, 10) }, photo("fit", 1), "licence.jpg");
  const me = await must("customer: read own account", "GET", "/me", { token });
  return { token, email, phone, id: me.id ?? me.user?.id, cleared: false };
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

  if (!r.cleared) {
    // H5: pay is refused until Ops clears the papers this hire needs.
    await mustRefuse("customer: pay before papers cleared", "papers_not_cleared", "POST",
      `/bookings/${bookingId}/pay`, { token: r.token, idem: true, body: { purpose: "full", phone: r.phone } });
    const ot = await opsSignIn();
    for (const d of ["national_id", "driving_licence"]) {
      await must(`ops: clear renter ${d}`, "POST", `/admin/renters/${r.id}/documents/${d}/decision`, {
        token: ot, idem: true, body: { decision: "accept" },
      });
    }
    r.cleared = true;
  }

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
    body: { reference: msgRef, succeeded: true, receipt: `WALK${RUN}${TYPES[kind].n}`, amountShillings: null },
  });
  // The trip page polls this (openapi/payments.yaml) until `success`.
  for (let i = 0; i < 20; i++) {
    const p = await must("customer: payment settles", "GET", `/bookings/${bookingId}/payment`, { token: r.token });
    if (p.status === "success") break;
    if (i === 19) throw new WalkError("customer: payment settles", 200, `payment is "${p.status}", not success`);
    await sleep(500);
  }

  for (const leg of ["pickup", "return"]) {
    const legFrom = log.length;
    const h = await must(`merchant: start ${leg}`, "POST", `/merchant/bookings/${bookingId}/handovers`, {
      token: mt, idem: true, body: { kind: leg },
    });
    if (leg === "pickup") {
      const code = await codeFromLog("customer: pickup code", "email", r.email, legFrom,
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
  const fin = await must("customer: trip after return", "GET", `/bookings/${bookingId}`, { token: r.token });
  if (fin.status !== "completed") {
    throw new WalkError("customer: trip after return", 200, `booking is "${fin.status}", not completed`);
  }
  return { ref, listing: cat.listing_ref ?? "" };
}

// ----------------------------------------------------------------- run

const JOBS = [
  ["merchant", "sign up, onboard, submit"],
  ["ops", "approve owner, review, go live"],
  ["customer", "find, book, pay, hand over, return"],
];

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
  console.log(`\n${passed} of 9 passed${failed ? `, ${failed} failed` : ""}.`);
  return failed === 0 && passed === 9;
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
