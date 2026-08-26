import "../lib/load-env.js";
import { db } from "../db/client.js";

/**
 * `npm run approve:merchant -w apps/api -- <email>` — sets a merchant's
 * `approved_at`, standing in for the admin "approve this account" action
 * until the admin portal exists (Phase 1 is merchant-portal only — see
 * CLAUDE.md). This is the only way to reach the merchant portal's
 * "approved merchant" banner state locally right now.
 */
async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npm run approve:merchant -w apps/api -- <email>");
    process.exit(1);
  }

  const user = await db("users").where({ email }).first();
  if (!user) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
  }

  const merchant = await db("merchants").where({ user_id: user.id }).first();
  if (!merchant) {
    console.error(`No merchant draft found for ${email}`);
    process.exit(1);
  }

  await db("merchants").where({ id: merchant.id }).update({ approved_at: new Date() });
  // eslint-disable-next-line no-console
  console.log(`Approved merchant for ${email}.`);
  await db.destroy();
}

main().catch((error: unknown) => {
  console.error("Approve merchant failed:", error);
  process.exit(1);
});
