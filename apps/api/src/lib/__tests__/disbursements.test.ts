import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { db } from "../../db/client.js";
import { generateId } from "../ids.js";
import { createTestBooking, createVerifiedTestUser } from "../../test/helpers.js";
import {
  createPayoutDisbursement,
  reconcileDisbursements,
  sendDisbursement,
  settleDisbursement,
  type DisbursementRow,
} from "../disbursements.js";
import type { DisbursementAdapter } from "../../adapters/disbursement/index.js";

/**
 * Money going out. Runs on the console disbursement adapter (the test
 * default), which reports success in its ack; the "processing until the
 * callback" path is exercised by writing the attempt and settling it the
 * way Co-op's callback would.
 */

const app = createApp();
const userIds: string[] = [];
const merchantIds: string[] = [];
const bookingIds: string[] = [];
const runIds: string[] = [];

afterAll(async () => {
  await db("disbursements").whereIn("payout_run_id", runIds).delete();
  await db("notifications").whereIn("merchant_id", merchantIds).delete();
  await db("payout_runs").whereIn("id", runIds).delete();
  await db("bookings").whereIn("id", bookingIds).delete();
  await db("vehicles").whereIn("merchant_id", merchantIds).delete();
  await db("merchants").whereIn("id", merchantIds).delete();
  await db("sessions").whereIn("user_id", userIds).delete();
  await db("users").whereIn("id", userIds).delete();
  await db.destroy();
});

/** A scheduled run of KES 4,500.50 to the given destination. */
async function scheduledRun(
  destination: { method: string; detail: string },
  bankName: string | null = null,
): Promise<{ runId: string; merchantId: string }> {
  const hirer = await createVerifiedTestUser();
  const booking = await createTestBooking(hirer.userId, {}, { bank_name: bankName });
  userIds.push(hirer.userId, booking.ownerUserId);
  merchantIds.push(booking.merchantId);
  bookingIds.push(booking.bookingId);
  const runId = generateId("payoutRun");
  await db("payout_runs").insert({
    id: runId,
    ref: `PO-T${runId.slice(-8)}`,
    merchant_id: booking.merchantId,
    status: "scheduled",
    run_date: "2026-10-12",
    gross_amount: 500_050,
    gross_currency: "KES",
    commission_amount: 50_000,
    commission_currency: "KES",
    net_amount: 450_050,
    net_currency: "KES",
    destination_method: destination.method,
    destination_detail: destination.detail,
    destination_account_name: "Test Merchant",
  });
  runIds.push(runId);
  return { runId, merchantId: booking.merchantId };
}

const system = { actorId: null, actorType: "system" as const };

async function pay(runId: string): Promise<DisbursementRow> {
  const id = await db.transaction((trx) => createPayoutDisbursement(trx, runId, system));
  return (await db("disbursements").where({ id }).first()) as DisbursementRow;
}

describe("payout disbursements", () => {
  it("pays an M-Pesa run in whole shillings and marks the run paid", async () => {
    const { runId, merchantId } = await scheduledRun({ method: "mpesa", detail: "0712345678" });
    const row = await pay(runId);
    expect(row).toMatchObject({ channel: "mpesa", destination: "+254712345678", sent_shillings: 4500, status: "pending" });
    expect((await db("payout_runs").where({ id: runId }).first()).status).toBe("processing");

    await sendDisbursement(row.id, "CRAL payout");
    const after = await db("disbursements").where({ id: row.id }).first();
    expect(after.status).toBe("success");
    const run = await db("payout_runs").where({ id: runId }).first();
    expect(run.status).toBe("paid");
    expect(run.provider_code).toMatch(/^console_/);
    const note = await db("notifications").where({ merchant_id: merchantId, subject_id: runId, category: "payout" }).first();
    expect(note.title).toContain("payout sent");
  });

  it("routes a bank run by Pesalink with its code, and a Co-op account internally", async () => {
    const equity = await scheduledRun({ method: "bank", detail: "1234567890" }, "Equity Bank Kenya");
    expect(await pay(equity.runId)).toMatchObject({ channel: "pesalink", bank_code: "68", destination: "1234567890" });

    const coop = await scheduledRun({ method: "bank", detail: "01100000000001" }, "Co-operative Bank of Kenya");
    expect(await pay(coop.runId)).toMatchObject({ channel: "internal", bank_code: null });
  });

  it("refuses a bank with no known code rather than guess", async () => {
    const { runId } = await scheduledRun({ method: "bank", detail: "1234567890" }, "Faulu Microfinance Bank");
    await expect(pay(runId)).rejects.toMatchObject({ code: "bank_code_unknown" });
    expect((await db("payout_runs").where({ id: runId }).first()).status).toBe("scheduled");
  });

  it("never lets a run be paid twice, but lets a failed one be retried", async () => {
    const { runId } = await scheduledRun({ method: "mpesa", detail: "0712345678" });
    const first = await pay(runId);
    await expect(pay(runId)).rejects.toMatchObject({ code: "payout_run_not_payable" });

    await settleDisbursement(
      { reference: first.message_reference, succeeded: false, transactionId: null, failureReason: "Insufficient funds" },
      {},
      "callback",
    );
    expect((await db("payout_runs").where({ id: runId }).first()).status).toBe("failed");
    const retry = await pay(runId);
    expect(retry.id).not.toBe(first.id);
  });

  it("settles once, whoever reports it", async () => {
    const { runId } = await scheduledRun({ method: "mpesa", detail: "0712345678" });
    const row = await pay(runId);
    const result = { reference: row.message_reference, succeeded: true, transactionId: "T1", failureReason: null };
    expect(await settleDisbursement(result, {}, "callback")).toBe(true);
    expect(await settleDisbursement(result, {}, "status-query")).toBe(false);
    const audits = await db("audit_log").where({ entity_id: runId, action: "disbursement.succeeded" });
    expect(audits).toHaveLength(1);
  });

  it("refuses the console rail in production - nothing sent, run failed", async () => {
    const { runId } = await scheduledRun({ method: "mpesa", detail: "0712345678" });
    const row = await pay(runId);
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await sendDisbursement(row.id, "CRAL payout");
    } finally {
      process.env.NODE_ENV = previous;
    }
    const after = await db("disbursements").where({ id: row.id }).first();
    expect(after.status).toBe("failed");
    expect(after.failure_reason).toMatch(/No payout rail/);
    expect((await db("payout_runs").where({ id: runId }).first()).status).toBe("failed");
  });

  it("settles a transfer result posted to the Co-op callback URL", async () => {
    const { runId } = await scheduledRun({ method: "mpesa", detail: "0712345678" });
    const row = await pay(runId);
    const res = await request(app)
      .post("/payments/coopbank/callback")
      .send({
        MessageReference: row.message_reference,
        MessageCode: "0",
        MessageDescription: "FULL SUCCESS",
        Source: { AccountNumber: "01100000000000", Amount: 4500, ResponseCode: "0" },
        Destinations: [{ ReferenceNumber: `${row.message_reference}_1`, Amount: 4500, TransactionID: "CBT1", ResponseCode: "0" }],
      });
    expect(res.status).toBe(200);
    const run = await db("payout_runs").where({ id: runId }).first();
    expect(run).toMatchObject({ status: "paid", provider_code: "CBT1" });
  });

  it("asks the provider about attempts sent but never settled", async () => {
    const { runId } = await scheduledRun({ method: "mpesa", detail: "0712345678" });
    const row = await pay(runId);
    await db("disbursements")
      .where({ id: row.id })
      .update({ status: "processing", provider: "fake", sent_at: new Date(Date.now() - 10 * 60_000) });
    const fake: DisbursementAdapter = {
      provider: "fake",
      send: async () => {
        throw new Error("unused");
      },
      queryStatus: async (reference) => ({ reference, succeeded: true, transactionId: "T9", failureReason: null }),
    };
    const result = await reconcileDisbursements(new Date(), fake);
    expect(result.settled).toBeGreaterThanOrEqual(1);
    expect((await db("payout_runs").where({ id: runId }).first()).status).toBe("paid");
  });
});
