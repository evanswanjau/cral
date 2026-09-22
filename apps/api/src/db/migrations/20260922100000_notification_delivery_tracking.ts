import type { Knex } from "knex";

/**
 * Per-channel delivery tracking for `deliverNotification`
 * (jobs/notification-delivery.ts), so a re-run of the job is safe.
 *
 * Found 2026-09-22 debugging a real duplicate SMS: BullMQ's stalled-job
 * recovery (default `stalledInterval`/`maxStalledCount`) redelivers a job
 * whose worker died mid-run without acking - which happens on any
 * ungraceful process restart, not just `tsx watch` picking up a file save
 * during dev. `deliverNotification` had no record of which channel had
 * already gone out, so a redelivered job re-sent SMS and email from
 * scratch even when the first attempt's send had already succeeded
 * provider-side. A real, billable SMS going out twice is worse than the
 * job occasionally taking a second pass to notice nothing is left to do.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("notifications", (table) => {
    table.timestamp("sms_sent_at", { useTz: true }).nullable();
    table.timestamp("email_sent_at", { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("notifications", (table) => {
    table.dropColumn("sms_sent_at");
    table.dropColumn("email_sent_at");
  });
}
