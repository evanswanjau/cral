import "../lib/load-env.js";
import { db } from "../db/client.js";
import { reviewProfileChange } from "../modules/merchant/service.js";

/**
 * `npm run review:profile-change -w apps/api -- <requestId> approve|reject [note]`
 *
 * Stands in for the admin "review a profile change request" action until
 * the admin portal exists (Phase 1 is merchant-portal only - see
 * CLAUDE.md). Approving applies the requested field changes and sends the
 * account back to review (`merchants.approved_at` -> null).
 *
 * With no args it lists the pending requests.
 */
async function main(): Promise<void> {
  const [requestId, decision, ...noteParts] = process.argv.slice(2);

  if (!requestId) {
    const pending = await db("profile_change_requests")
      .where({ status: "pending" })
      .orderBy("created_at", "asc");
    if (pending.length === 0) {
      // eslint-disable-next-line no-console
      console.log("No pending profile change requests.");
    } else {
      for (const r of pending) {
        // eslint-disable-next-line no-console
        console.log(`${r.id}  merchant=${r.merchant_id}  fields=${Object.keys(r.changes).join(",")}`);
      }
    }
    await db.destroy();
    return;
  }

  if (decision !== "approve" && decision !== "reject") {
    console.error(
      "Usage: npm run review:profile-change -w apps/api -- <requestId> approve|reject [note]",
    );
    process.exit(1);
  }

  await reviewProfileChange(requestId, decision, "script:review-profile-change", noteParts.join(" ") || null);
  // eslint-disable-next-line no-console
  console.log(`Request ${requestId} ${decision === "approve" ? "approved" : "rejected"}.`);
  await db.destroy();
}

main().catch((error: unknown) => {
  console.error("review-profile-change failed:", error);
  process.exit(1);
});
