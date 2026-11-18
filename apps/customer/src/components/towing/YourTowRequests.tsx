import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClientError } from "../../lib/api.js";
import { acceptServiceQuote, listMyServiceRequests, REASON_LABEL, type ServiceRequest } from "../../lib/towing-api.js";
import { Section, bodyText } from "../subsite/Section.js";

/**
 * A signed-in renter's towing requests under the towing landing (UI3),
 * moved out of the old `Towing.tsx` with its accept-a-quote button. Status
 * is told in words, never by colour alone. Renders nothing until there is
 * at least one request.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md section 4.3 (Towing column).
 */

const STATUS_LABEL: Record<ServiceRequest["status"], string> = {
  requested: "Waiting on a quote",
  quoted: "Quoted - awaiting your OK",
  accepted: "Accepted - we'll call you",
  declined: "Declined",
  completed: "Completed",
  cancelled: "Cancelled",
};

function kes(m: { amount: number }): string {
  return `KES ${(m.amount / 100).toLocaleString("en-KE")}`;
}

export function YourTowRequests(): JSX.Element | null {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["service-requests", "mine"], queryFn: listMyServiceRequests });
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const requests = data?.data ?? [];
  if (requests.length === 0) return null;

  async function onAccept(id: string) {
    setAcceptError(null);
    try {
      await acceptServiceQuote(id);
    } catch (err) {
      setAcceptError(err instanceof ApiClientError ? err.message : "Couldn't accept that quote. Try again.");
    }
    // Reload either way: a failure is usually the request having moved on.
    await queryClient.invalidateQueries({ queryKey: ["service-requests", "mine"] });
  }

  return (
    <Section id="your-requests" overline="YOUR REQUESTS" heading="Your towing requests">
      {acceptError && (
        <p role="alert" style={{ margin: "0 0 14px", font: "500 13px/1.5 'Instrument Sans',sans-serif", color: "#A50E22" }}>
          {acceptError}
        </p>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {requests.map((r) => (
          <div
            key={r.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              padding: "14px 18px",
              background: "#FFFFFF",
              border: "1px solid #E4E7EC",
              borderRadius: 12,
            }}
          >
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              <div style={{ font: "600 14px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A", overflowWrap: "anywhere" }}>
                {REASON_LABEL[r.reason]} · {r.pickup_location}
              </div>
              <p style={{ ...bodyText, fontSize: 13 }}>
                {STATUS_LABEL[r.status]}
                {r.status === "quoted" && (r.quoted_amount ? ` - ${kes(r.quoted_amount)}` : " - price agreed on the call")}
                {r.quote_note ? ` · ${r.quote_note}` : ""}
                {r.decline_reason ? ` · ${r.decline_reason}` : ""}
              </p>
            </div>
            {r.status === "quoted" && (
              <button
                type="button"
                onClick={() => void onAccept(r.id)}
                style={{
                  height: 44,
                  padding: "0 16px",
                  background: "#0F23A8",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: 8,
                  font: "600 14px/1 'Instrument Sans',sans-serif",
                  cursor: "pointer",
                }}
              >
                Accept quote
              </button>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}
