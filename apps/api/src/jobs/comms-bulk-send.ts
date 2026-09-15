import { Queue, Worker } from "bullmq";
import { redis } from "../lib/redis.js";
import { db } from "../db/client.js";
import { smsAdapter, emailAdapter } from "../lib/adapters.js";
import { emailHeading, emailLayout, emailParagraph } from "../lib/email-templates.js";
import type { CommsChannel, CommsRecipient, CommsRunRow } from "../modules/admin-comms/db-types.js";

/**
 * Sends one Communications run (`modules/admin-comms`) to its already-
 * resolved recipient list. Same plumbing shape as
 * jobs/notification-delivery.ts, but deliberately independent of it — a
 * bulk admin broadcast doesn't go through a merchant's own notification
 * preferences or quiet hours (see the migration's own comment and
 * openapi/admin-communications.yaml).
 *
 * One job per run, not one per recipient: the run's `sent_count` /
 * `failed_count` are written once, at the end, from this single job, so
 * there's no concurrent-increment race to guard against. A run's
 * recipient list (at most a few hundred merchants) comfortably fits in
 * one job's working set and default timeout.
 */

const QUEUE_NAME = "comms-bulk-send";
const JOB_NAME = "send-comms-run";

export const commsBulkSendQueue = new Queue(QUEUE_NAME, { connection: redis });

interface CommsSendJobData {
  runId: string;
  recipients: CommsRecipient[];
  channel: CommsChannel;
  subject: string | null;
  body: string;
}

/** Enqueue a freshly-created run for delivery. Call after its transaction commits. */
export async function enqueueCommsRun(
  runId: string,
  recipients: CommsRecipient[],
  message: { channel: CommsChannel; subject: string | null; body: string },
): Promise<void> {
  try {
    await commsBulkSendQueue.add(
      JOB_NAME,
      { runId, recipients, ...message } satisfies CommsSendJobData,
      { jobId: `comms-${runId}`, attempts: 1, removeOnComplete: 200, removeOnFail: 100 },
    );
  } catch (error) {
    // The run row already exists with its final recipient_count; a failed
    // enqueue leaves it stuck at status "sending" rather than losing data.
    console.error("comms bulk-send enqueue failed", { runId, error });
  }
}

/** Exported for the tests. */
export async function sendCommsRun({ runId, recipients, channel, subject, body }: CommsSendJobData): Promise<void> {
  let sent = 0;
  let failed = 0;

  for (const r of recipients) {
    let delivered = false;

    if ((channel === "sms" || channel === "both") && r.phone && r.phoneVerified) {
      try {
        await smsAdapter.send({ to: r.phone, body: `CRAL: ${body}`.slice(0, 320) });
        delivered = true;
      } catch (error) {
        console.error("comms sms failed", { runId, merchantId: r.merchantId, error });
      }
    }

    if ((channel === "email" || channel === "both") && r.email) {
      try {
        await emailAdapter.send({
          to: r.email,
          subject: subject || "An update from Cruz Ride Auto",
          html: emailLayout({
            preheader: body,
            bodyHtml: [emailHeading(subject || "An update from Cruz Ride Auto"), emailParagraph(escapeHtml(body))].join(""),
          }),
          text: body,
        });
        delivered = true;
      } catch (error) {
        console.error("comms email failed", { runId, merchantId: r.merchantId, error });
      }
    }

    if (delivered) sent++;
    else failed++;
  }

  await db<CommsRunRow>("comms_runs")
    .where({ id: runId })
    .update({ sent_count: sent, failed_count: failed, status: "done", completed_at: new Date(), updated_at: new Date() });
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function startCommsBulkSendWorker(): Worker {
  return new Worker<CommsSendJobData>(
    QUEUE_NAME,
    async (job) => {
      await sendCommsRun(job.data);
    },
    { connection: redis },
  );
}
