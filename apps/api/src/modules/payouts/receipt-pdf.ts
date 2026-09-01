import PDFDocument from "pdfkit";
import type { PayoutRunLineRow, PayoutRunRow } from "./db-types.js";
import { formatAmount, formatDay } from "./service.js";

/**
 * The per-run receipt a merchant downloads — a document they forward to a
 * bank, a landlord or an accountant, which is why it is a PDF rather than
 * another CSV.
 *
 * The palette is duplicated here rather than imported from
 * `packages/ui/src/tokens.ts`, which is the real source of truth for brand
 * values. That package's entry point pulls in React, and adding it as an API
 * dependency would bundle React into the Node build for the sake of five hex
 * strings. If the brand doc gets a v3, these five need updating alongside
 * tokens.ts — they are deliberately the only copy in the backend.
 *
 * `color.paper` is documented in tokens.ts as "documents and receipts only",
 * so this is exactly its intended use.
 */
const PALETTE = {
  ink: "#0B0F1A", // color.ink
  paper: "#FBF8F2", // color.paper — documents and receipts only
  red: "#D81E32", // color.cruzRed — the masthead rule
  muted: "#5A6373", // color.neutral[600]
  faint: "#A7AEBB", // color.neutral[400]
  rule: "#E4E7EC", // color.neutral[200]
} as const;

const PAGE_MARGIN = 48;

/**
 * Renders to a Buffer rather than streaming straight to the response. A
 * receipt is a couple of kilobytes, and buffering means a failure mid-render
 * surfaces as a clean 500 through the normal error handler instead of a
 * half-written body on an already-committed 200.
 */
export async function renderReceiptPdf(
  run: PayoutRunRow,
  lines: PayoutRunLineRow[],
  footnote: string,
): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, info: { Title: `${run.ref} receipt` } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const { width } = doc.page;
  const contentWidth = width - PAGE_MARGIN * 2;
  const right = PAGE_MARGIN + contentWidth;

  // Masthead. The brand's 14-degree skewed rule is a vector flourish in the
  // product; PDF has no cheap skew primitive here, so this is the same rule
  // as a plain block — the one place the receipt simplifies the identity
  // rather than faking it badly.
  doc.rect(0, 0, width, 6).fill(PALETTE.red);

  doc.fillColor(PALETTE.ink).font("Helvetica-Bold").fontSize(20).text("Cruz Ride Auto", PAGE_MARGIN, 64);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(PALETTE.faint)
    .text("PAYOUT RECEIPT", PAGE_MARGIN, 88, { characterSpacing: 1.2 });

  doc.font("Helvetica-Bold").fontSize(16).fillColor(PALETTE.ink).text(run.ref, PAGE_MARGIN, 64, {
    width: contentWidth,
    align: "right",
  });
  doc.font("Helvetica").fontSize(9).fillColor(PALETTE.muted).text(run.status.toUpperCase(), PAGE_MARGIN, 86, {
    width: contentWidth,
    align: "right",
  });

  // Headline amount.
  doc.roundedRect(PAGE_MARGIN, 116, contentWidth, 84, 8).fill(PALETTE.paper);
  doc.fillColor(PALETTE.muted).font("Helvetica").fontSize(9).text("NET PAID", PAGE_MARGIN + 18, 134, { characterSpacing: 1 });
  doc
    .fillColor(PALETTE.ink)
    .font("Helvetica-Bold")
    .fontSize(28)
    .text(`KES ${formatAmount(run.net_amount)}`, PAGE_MARGIN + 18, 150);

  const metaX = PAGE_MARGIN + contentWidth / 2;
  const meta: [string, string][] = [
    ["Run date", formatDay(run.run_date)],
    ["Destination", `${run.destination_method === "mpesa" ? "M-Pesa" : run.destination_method} ${run.destination_detail}`],
    ["Account name", run.destination_account_name],
    ["M-Pesa code", run.provider_code ?? "—"],
  ];
  let metaY = 132;
  for (const [label, value] of meta) {
    doc.font("Helvetica").fontSize(8).fillColor(PALETTE.faint).text(label.toUpperCase(), metaX, metaY);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(PALETTE.ink).text(value, metaX + 92, metaY - 1, { width: contentWidth / 2 - 92 });
    metaY += 16;
  }

  // Lines table.
  let y = 232;
  doc.font("Helvetica").fontSize(8).fillColor(PALETTE.faint);
  doc.text("BOOKING", PAGE_MARGIN, y);
  doc.text("HIRER · VEHICLE", PAGE_MARGIN + 78, y);
  doc.text("GROSS", right - 210, y, { width: 60, align: "right" });
  doc.text("COMMISSION", right - 140, y, { width: 70, align: "right" });
  doc.text("NET", right - 60, y, { width: 60, align: "right" });
  y += 14;
  doc.moveTo(PAGE_MARGIN, y).lineTo(right, y).strokeColor(PALETTE.rule).lineWidth(1).stroke();
  y += 10;

  for (const line of lines) {
    // A run with a long tail of hires still has to paginate cleanly.
    if (y > doc.page.height - 160) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
    doc.font("Helvetica-Bold").fontSize(9).fillColor(PALETTE.ink).text(line.booking_ref, PAGE_MARGIN, y);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(PALETTE.ink)
      .text(line.hirer_name, PAGE_MARGIN + 78, y, { width: right - 220 - PAGE_MARGIN - 78 });
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(PALETTE.faint)
      .text(
        `${line.vehicle_registration} · ${line.pickup_at.toISOString().slice(0, 10)} → ${line.dropoff_at.toISOString().slice(0, 10)}`,
        PAGE_MARGIN + 78,
        y + 11,
        { width: right - 220 - PAGE_MARGIN - 78 },
      );

    doc.font("Helvetica").fontSize(9).fillColor(PALETTE.muted).text(formatAmount(line.gross_amount), right - 210, y, { width: 60, align: "right" });
    doc.fillColor(PALETTE.red).text(`- ${formatAmount(line.commission_amount)}`, right - 140, y, { width: 70, align: "right" });
    doc.font("Helvetica-Bold").fillColor(PALETTE.ink).text(formatAmount(line.net_amount), right - 60, y, { width: 60, align: "right" });
    y += 30;
  }

  doc.moveTo(PAGE_MARGIN, y).lineTo(right, y).strokeColor(PALETTE.rule).stroke();
  y += 12;

  const totals: [string, string, string][] = [
    ["Gross bookings", `KES ${formatAmount(run.gross_amount)}`, PALETTE.ink],
    ["CRAL commission", `- KES ${formatAmount(run.commission_amount)}`, PALETTE.red],
  ];
  for (const [label, value, colour] of totals) {
    doc.font("Helvetica").fontSize(10).fillColor(PALETTE.muted).text(label, PAGE_MARGIN, y);
    doc.fillColor(colour).text(value, PAGE_MARGIN, y, { width: contentWidth, align: "right" });
    y += 18;
  }
  doc.font("Helvetica-Bold").fontSize(12).fillColor(PALETTE.ink).text("Net to M-Pesa", PAGE_MARGIN, y + 4);
  doc.fontSize(14).text(`KES ${formatAmount(run.net_amount)}`, PAGE_MARGIN, y + 2, { width: contentWidth, align: "right" });
  y += 40;

  doc.font("Helvetica").fontSize(9).fillColor(PALETTE.muted).text(footnote, PAGE_MARGIN, y, { width: contentWidth });

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(PALETTE.faint)
    .text(
      "Cruz Ride Auto Limited · Nairobi, Kenya · support@cral.co.ke",
      PAGE_MARGIN,
      doc.page.height - 60,
      { width: contentWidth, align: "center" },
    );

  doc.end();
  return done;
}
