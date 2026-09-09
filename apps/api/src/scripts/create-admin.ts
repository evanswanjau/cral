import "../lib/load-env.js";
import { randomBytes } from "node:crypto";
import { db } from "../db/client.js";
import { generateId } from "../lib/ids.js";
import { hashPassword } from "../lib/password.js";
import { normalizePhone } from "../lib/identifier.js";
import type { AdminRole } from "../lib/jwt.js";

/**
 * `npm run admin:create -w apps/api -- <email> <phone> <role> "<Full Name>" [queue,queue]`
 *
 * Creates an Ops (admin) account — the only way to get the first one in,
 * since there is no admin to invite it (team management is a later slice).
 * Same footing as `approve:merchant`.
 *
 * By default a strong password is generated and printed once (not
 * recoverable). To set a known password instead — e.g. the same account
 * across local and prod — pass it in the `ADMIN_PASSWORD` env var rather
 * than on the command line, so it stays out of shell history and the
 * process list:
 *
 *   ADMIN_PASSWORD='…' npm run admin:create -w apps/api -- <email> <phone> <role> "<Name>"
 *
 * `role` is one of admin_reviewer | admin_finance | admin_support |
 * admin_super. `admin_super` ignores queue assignment and sees everything,
 * so it needs no queue list — bootstrap the first account as admin_super.
 */
const ROLES: AdminRole[] = ["admin_reviewer", "admin_finance", "admin_support", "admin_super"];

async function main(): Promise<void> {
  const [email, rawPhone, role, fullName, rawQueues] = process.argv.slice(2);

  if (!email || !rawPhone || !role || !fullName) {
    console.error(
      'Usage: npm run admin:create -w apps/api -- <email> <phone> <role> "<Full Name>" [queue,queue]',
    );
    console.error(`  role: ${ROLES.join(" | ")}`);
    process.exit(1);
  }
  if (!ROLES.includes(role as AdminRole)) {
    console.error(`Unknown role "${role}". Use one of: ${ROLES.join(", ")}`);
    process.exit(1);
  }

  const phone = normalizePhone(rawPhone);
  if (!phone) {
    console.error(`"${rawPhone}" is not a valid phone number (expected E.164 / 07… Kenyan mobile).`);
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db("admin_users").where({ email: normalizedEmail }).first();
  if (existing) {
    console.error(`An admin with email ${normalizedEmail} already exists.`);
    process.exit(1);
  }

  const queues =
    role === "admin_super"
      ? []
      : (rawQueues ?? "")
          .split(",")
          .map((q) => q.trim())
          .filter(Boolean);

  // A caller-set ADMIN_PASSWORD wins (for a known account across
  // environments); otherwise 24 base64url chars, printed once.
  const chosen = process.env.ADMIN_PASSWORD?.trim();
  if (chosen !== undefined && chosen.length < 10) {
    console.error("ADMIN_PASSWORD must be at least 10 characters.");
    process.exit(1);
  }
  const password = chosen || randomBytes(18).toString("base64url");
  const generated = !chosen;

  const id = generateId("adminUser");
  await db("admin_users").insert({
    id,
    email: normalizedEmail,
    password_hash: await hashPassword(password),
    phone,
    full_name: fullName,
    role,
    assigned_queues: queues,
  });

  // eslint-disable-next-line no-console
  console.log(
    [
      "",
      `Admin created: ${id}`,
      `  email:  ${normalizedEmail}`,
      `  phone:  ${phone}   (the sign-in code is texted here)`,
      `  role:   ${role}`,
      `  queues: ${queues.length ? queues.join(", ") : "(all — admin_super)"}`,
      "",
      generated ? `  password: ${password}` : "  password: (from ADMIN_PASSWORD)",
      "",
      generated ? "  Store the password now — it is not recoverable." : "  Sign in with the ADMIN_PASSWORD you set.",
      "",
    ].join("\n"),
  );

  await db.destroy();
}

main().catch((error: unknown) => {
  console.error("create-admin failed:", error);
  process.exit(1);
});
