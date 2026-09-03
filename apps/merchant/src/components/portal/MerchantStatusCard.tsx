import { P } from "./styles.js";
import { useDashboard } from "../../lib/dashboard-api.js";

function formatLongDay(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * The "MERCHANT STATUS" card the design hangs under the nav on the dashboard.
 * It lives in the nav rather than the page body because that is where the
 * design puts it, and it is rendered only on the dashboard route - every
 * other screen's nav ends at Settings.
 *
 * It reads the same `["dashboard"]` query the page does, so mounting it costs
 * no extra request; it renders nothing until that query resolves rather than
 * flashing a placeholder state next to the nav.
 *
 * The green, ticked variant appears only when `merchants.approved_at` is
 * genuinely set. Nothing sets it in Phase 1 (no admin portal), so in practice
 * this reads "in review" - which is the point. A decorative tick here would be
 * the fabricated trust badge all over again.
 */
export function MerchantStatusCard(): JSX.Element | null {
  const { data } = useDashboard();
  if (!data) return null;

  const status = data.merchant_status;
  const approved = status.approved;
  const who = status.display_name ?? "Your account";

  const title = approved
    ? "Account documents accepted"
    : status.documents_complete
      ? "Account documents in review"
      : "Account documents outstanding";

  const body =
    approved && status.approved_at
      ? `${who} - checked ${formatLongDay(status.approved_at.slice(0, 10))}. Each vehicle now only needs its own three documents.`
      : status.documents_complete
        ? `${who} - everything we asked for is on file. Reviews take up to two working days.`
        : `${status.outstanding_document_count} ${
            status.outstanding_document_count === 1 ? "document" : "documents"
          } still needed before your account can be reviewed.`;

  return (
    <div style={{ ...P.dashNavCard, border: `1px solid ${approved ? "#A8DEC7" : "#E4E7EC"}` }}>
      <div style={P.dashNavCardLabel}>MERCHANT STATUS</div>
      <div style={P.dashNavCardRow}>
        <span
          style={{
            ...P.dashNavCardGlyph,
            background: approved ? "#DDF3E9" : "#F1F3F6",
            color: approved ? "#076945" : "#5A6373",
          }}
        >
          {approved ? "✓" : "·"}
        </span>
        <span style={{ ...P.dashNavCardTitle, color: approved ? "#076945" : "#333B4A" }}>{title}</span>
      </div>
      <div style={P.dashNavCardBody}>{body}</div>
    </div>
  );
}
