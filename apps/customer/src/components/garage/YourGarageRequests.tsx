import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ORDER_STATUS_LABELS, carName, listGarageRequests, requestTitle, type GarageRequest } from "../../lib/garage-api.js";
import { Section, bodyText } from "../subsite/Section.js";

/**
 * A signed-in customer's garage requests under the garage hero (Phase 4
 * GS2). Status in words, never by colour alone. Renders nothing until
 * there is at least one.
 *
 * Not from a canvas; built from tokens.ts and YourTowRequests.
 */

export function requestStatusLine(r: GarageRequest): string {
  if (r.status === "cancelled") return "Closed by you";
  const part = r.kind === "part";
  if (r.order) return `${part ? "Order" : "Job"} ${r.order.ref} · ${ORDER_STATUS_LABELS[r.order.status]}`;
  if (r.status === "accepted") return "Quote accepted";
  if (r.quote_count > 0) return `${r.quote_count} ${r.quote_count === 1 ? "quote" : "quotes"} to compare`;
  const who = part ? (r.garages_asked === 1 ? "dealer" : "dealers") : r.garages_asked === 1 ? "garage" : "garages";
  return `Waiting on quotes from ${r.garages_asked} ${who}`;
}

export function YourGarageRequests(): JSX.Element | null {
  const { data } = useQuery({ queryKey: ["garage-requests", "list", "service"], queryFn: () => listGarageRequests("service") });
  const requests = data?.data ?? [];
  if (requests.length === 0) return null;
  return (
    <Section id="your-requests" overline="YOUR REQUESTS" heading="Your garage requests">
      <div style={{ display: "grid", gap: 10 }}>
        {requests.map((r) => (
          <Link
            key={r.id}
            to={`/garage/requests/${r.id}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              minHeight: 44,
              padding: "14px 18px",
              background: "#FFFFFF",
              border: "1px solid #E4E7EC",
              borderRadius: 12,
              textDecoration: "none",
            }}
          >
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              <div style={{ font: "600 14px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A", overflowWrap: "anywhere" }}>
                {requestTitle(r)} · {r.car ? carName(r.car) : "Your car"}
              </div>
              <p style={{ ...bodyText, fontSize: 13 }}>{requestStatusLine(r)}</p>
            </div>
            <span style={{ font: "600 13px/1 'Instrument Sans',sans-serif", color: "#0F23A8" }}>Open ›</span>
          </Link>
        ))}
      </div>
    </Section>
  );
}
