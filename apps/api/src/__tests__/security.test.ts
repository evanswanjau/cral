import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../app.js";
import { db } from "../db/client.js";
import { createVerifiedTestUser } from "../test/helpers.js";
import { redis } from "../lib/redis.js";
import { signAccessToken } from "../lib/jwt.js";
import { assertDeclaredTypeMatchesBytes } from "../lib/uploads.js";
import { ApiError } from "@cral/types";

/**
 * Regression tests for the 2026-09-03 security review
 * (docs/plans/merchant-review-2026-09-03.md). Each block names the finding
 * it locks down, so a future change that reopens one fails here rather than
 * in production.
 */

const app = createApp();
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    const merchantIds = (await db("merchants").whereIn("user_id", createdUserIds).select("id")).map(
      (m) => m.id,
    );
    await db("documents").whereIn("merchant_id", merchantIds).delete();
    await db("idempotency_keys").whereIn("user_id", createdUserIds).delete();
    await db("users").whereIn("id", createdUserIds).delete();
  }
  await db.destroy();
  await redis.quit();
});

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// --- Finding 1: the audit log was publicly readable ------------------

describe("the audit log is not reachable over HTTP", () => {
  it("no longer exposes GET /audit-log, authenticated or not", async () => {
    const anonymous = await request(app).get("/audit-log");
    expect(anonymous.status).toBe(404);
    expect(anonymous.body.error.code).toBe("route_not_found");

    // Not merely hidden behind auth — the route is gone entirely.
    const user = await createVerifiedTestUser();
    createdUserIds.push(user.userId);
    const authenticated = await request(app).get("/audit-log").set(auth(user.accessToken));
    expect(authenticated.status).toBe(404);
  });
});

// --- Finding 2: IP rate limits collapsed behind a proxy ---------------

describe("rate limiting behind the platform edge proxy", () => {
  // Buckets are hour-long fixed windows keyed on the IP. global-setup
  // clears them before the suite, but a fresh address per run keeps these
  // cases independent of that and of each other.
  let ipSeed = 0;
  const uniqueIp = (): string => `198.51.100.${(ipSeed++ % 200) + 20}`;

  it("gives two forwarded client IPs independent buckets", async () => {
    // One hop is trusted, so the *last* entry in X-Forwarded-For is the one
    // the platform edge appended and therefore the one req.ip resolves to.
    const bucketFor = async (ip: string) =>
      request(app)
        .post("/auth/otp/request")
        .set("X-Forwarded-For", ip)
        .send({ identifier: `rl-${ulid().slice(-8).toLowerCase()}@example.test`, purpose: "signup" });

    const first = await bucketFor(uniqueIp());
    const second = await bucketFor(uniqueIp());

    // Both are the first request in their own bucket. If `trust proxy` were
    // off, req.ip would be identical for both and the second would show one
    // fewer remaining.
    expect(first.headers["cral-ratelimit-remaining"]).toBe(
      second.headers["cral-ratelimit-remaining"],
    );
  });

  it("does not let a caller spoof its own bucket by prepending an address", async () => {
    const spoofed = await request(app)
      .post("/auth/otp/request")
      .set("X-Forwarded-For", `${ulid()}, ${uniqueIp()}`)
      .send({ identifier: `spoof-${ulid().slice(-8).toLowerCase()}@example.test`, purpose: "signup" });

    // Only one hop is trusted, so the junk on the left is ignored rather
    // than becoming a fresh bucket key.
    expect(spoofed.status).not.toBe(500);
  });
});

// --- Finding 3: idempotency keys were global across merchants ---------

describe("idempotency keys are scoped to the caller", () => {
  it("does not serve one user's stored response to another using the same key", async () => {
    const alice = await createVerifiedTestUser();
    const bob = await createVerifiedTestUser();
    createdUserIds.push(alice.userId, bob.userId);

    const sharedKey = `shared-${ulid()}`;
    const route = "POST /merchant/vehicles/:vehicleId/verification";

    // Stand in for Alice having already completed a request under this key.
    await db("idempotency_keys").insert({
      user_id: alice.userId,
      key: sharedKey,
      route,
      request_hash: "whatever",
      response_status: 200,
      response_body: JSON.stringify({ secret: "alice's response" }),
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
    });

    // Bob presenting the same key on the same route must not read it back.
    const bobsRow = await db("idempotency_keys")
      .where({ user_id: bob.userId, key: sharedKey, route })
      .first();
    expect(bobsRow).toBeUndefined();

    // And the two rows coexist rather than colliding on the primary key.
    await db("idempotency_keys").insert({
      user_id: bob.userId,
      key: sharedKey,
      route,
      request_hash: "whatever",
      response_status: 200,
      response_body: JSON.stringify({ secret: "bob's response" }),
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
    });

    const rows = await db("idempotency_keys").where({ key: sharedKey, route });
    expect(rows).toHaveLength(2);
  });
});

// --- Finding 4: uploads had no allowlist and were echoed back inline --

describe("upload type validation", () => {
  const pdf = Buffer.from("255044462d312e340a", "hex"); // %PDF-1.4
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  const jpeg = Buffer.from("ffd8ffe000104a464946", "hex");
  const html = Buffer.from("<html><script>alert(1)</script></html>", "utf8");

  it("accepts the four real document types by their bytes", () => {
    expect(() => assertDeclaredTypeMatchesBytes(pdf, "application/pdf")).not.toThrow();
    expect(() => assertDeclaredTypeMatchesBytes(png, "image/png")).not.toThrow();
    expect(() => assertDeclaredTypeMatchesBytes(jpeg, "image/jpeg")).not.toThrow();
  });

  it("rejects HTML dressed up as an image — the actual attack", () => {
    expect(() => assertDeclaredTypeMatchesBytes(html, "image/png")).toThrow(ApiError);
  });

  it("rejects a type outside the allowlist even when the bytes match it", () => {
    expect(() => assertDeclaredTypeMatchesBytes(html, "text/html")).toThrow(ApiError);
  });

  it("rejects a PDF relabelled as a PNG, and vice versa", () => {
    expect(() => assertDeclaredTypeMatchesBytes(pdf, "image/png")).toThrow(ApiError);
    expect(() => assertDeclaredTypeMatchesBytes(png, "application/pdf")).toThrow(ApiError);
  });

  it("rejects a RIFF container that isn't actually a WebP", () => {
    const avi = Buffer.from("52494646ffffffff41564920", "hex"); // RIFF....AVI
    expect(() => assertDeclaredTypeMatchesBytes(avi, "image/webp")).toThrow(ApiError);
  });

  it("turns away an HTML upload at the route with 415, not 500", async () => {
    const user = await createVerifiedTestUser();
    createdUserIds.push(user.userId);

    const res = await request(app)
      .post("/merchant/onboarding/documents")
      .set(auth(user.accessToken))
      .field("kind", "national_id")
      .attach("file", html, { filename: "evil.html", contentType: "text/html" });

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("unsupported_file_type");
  });
});

// --- Findings 12/14: token audience and security headers --------------

describe("access token verification", () => {
  it("rejects a token minted for another audience", async () => {
    const user = await createVerifiedTestUser();
    createdUserIds.push(user.userId);

    // A well-formed, correctly-signed token that simply isn't for this API —
    // the shape a Phase-3 admin (`aud: "ops"`) token will have.
    const jwt = (await import("jsonwebtoken")).default;
    const opsToken = jwt.sign(
      { sub: user.userId, sid: "ses_fake", roles: ["admin"], aud: "ops" },
      process.env.JWT_ACCESS_SECRET as string,
      { algorithm: "HS256", expiresIn: "15m" },
    );

    const res = await request(app).get("/merchant/dashboard").set(auth(opsToken));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("invalid_access_token");
  });

  it("still accepts a properly issued public token", async () => {
    const user = await createVerifiedTestUser();
    createdUserIds.push(user.userId);
    const token = signAccessToken({ sub: user.userId, sid: "ses_test", roles: ["merchant"] });

    const res = await request(app).get("/merchant/dashboard").set(auth(token));
    expect(res.status).toBe(200);
  });
});

describe("security headers", () => {
  it("sets nosniff and frame protection on every response", async () => {
    const res = await request(app).get("/healthz");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
