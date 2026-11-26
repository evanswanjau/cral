import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { IdentificationCard } from "@phosphor-icons/react/dist/ssr/IdentificationCard";
import { SteeringWheel } from "@phosphor-icons/react/dist/ssr/SteeringWheel";
import { getRenterDocuments, type DocumentState, type RenterDocKind } from "../../lib/documents-api.js";

/**
 * The renter's papers for one hire (H5, owner's decision 3, 2026-11-26):
 * the national ID always, the driving licence only when the renter drives
 * themselves. A renter can send a request while CRAL reads them, but can't
 * pay until they're cleared - so the keys never wait at the car.
 *
 * Every state here is the server's (`documents` on the booking, or
 * `/me/documents` before one exists). Nothing says "cleared" that Ops
 * didn't clear.
 */

export interface PaperItem {
  kind: RenterDocKind;
  state: DocumentState;
  review_note: string | null;
}

const NAME: Record<RenterDocKind, string> = { national_id: "National ID", driving_licence: "Driving licence" };

const STATE: Record<DocumentState, { label: string; fg: string; bg: string }> = {
  ok: { label: "Cleared", fg: "#076945", bg: "#DDF3E9" },
  pending: { label: "Being checked", fg: "#075D93", bg: "#E1F1FA" },
  rejected: { label: "Upload again", fg: "#A50E22", bg: "#FDE7EA" },
  expiring: { label: "Renew it", fg: "#8A5200", bg: "#FFF3DB" },
  missing: { label: "Not added", fg: "#5A6373", bg: "#F1F3F6" },
};

/** The papers a hire needs - the same rule the API applies (`lib/renter-papers.ts`). */
export function papersNeeded(hire: { chauffeured: boolean; withDriver: boolean }): RenterDocKind[] {
  return hire.chauffeured || hire.withDriver ? ["national_id"] : ["national_id", "driving_licence"];
}

/** `/documents` with a way back here, and which papers this hire needs. */
export function documentsLink(here: string, needs: RenterDocKind[]): string {
  return `/documents?next=${encodeURIComponent(here)}&needs=${needs.join(",")}`;
}

function PaperRows({ items }: { items: PaperItem[] }): JSX.Element {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((item) => {
        const tone = STATE[item.state];
        const Icon = item.kind === "national_id" ? IdentificationCard : SteeringWheel;
        return (
          <div key={item.kind}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                minHeight: 44,
                padding: "8px 12px",
                background: "#F8F9FB",
                borderRadius: 8,
              }}
            >
              <Icon size={20} color="#5A6373" aria-hidden="true" />
              <span style={{ flex: 1, minWidth: 0, font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>
                {NAME[item.kind]}
              </span>
              <span
                style={{
                  flex: "none",
                  padding: "4px 9px",
                  borderRadius: 999,
                  background: tone.bg,
                  color: tone.fg,
                  font: "600 12px/1.2 'Instrument Sans',sans-serif",
                }}
              >
                {tone.label}
              </span>
            </div>
            {item.review_note && (item.state === "rejected" || item.state === "expiring") && (
              <p style={{ margin: "6px 2px 0", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#A50E22" }}>
                {item.review_note}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function needsUpload(items: PaperItem[]): boolean {
  return items.some((i) => i.state === "missing" || i.state === "rejected" || i.state === "expiring");
}

const linkStyle = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 44,
  font: "600 14px/1.3 'Instrument Sans',sans-serif",
  color: "#0F23A8",
} as const;

/**
 * Before the request goes out: which papers this hire needs and where
 * CRAL is with them, so "pay once cleared" is known up front.
 */
export function PapersBeforeRequest({ needs, here }: { needs: RenterDocKind[]; here: string }): JSX.Element | null {
  const { data } = useQuery({ queryKey: ["me", "documents"], queryFn: getRenterDocuments });
  if (!data) return null;
  const items: PaperItem[] = needs.map((kind) => {
    const doc = data.verification.documents.find((d) => d.kind === kind);
    return { kind, state: doc?.state ?? "missing", review_note: doc?.review_note ?? null };
  });
  const cleared = items.every((i) => i.state === "ok");

  return (
    <div style={{ marginBottom: 18, padding: "14px 15px", border: "1px solid #E4E7EC", borderRadius: 10 }}>
      <div style={{ font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 4 }}>
        Your papers for this hire
      </div>
      <p style={{ margin: "0 0 12px", font: "400 13.5px/1.55 'Instrument Sans',sans-serif", color: "#5A6373" }}>
        {cleared
          ? "Cleared by CRAL. You can pay as soon as the owner accepts."
          : needs.length === 1
            ? "A driver or operator comes with this hire, so CRAL only needs your ID. You can send the request now and pay once it's cleared."
            : "You drive this one yourself, so CRAL needs your ID and licence. You can send the request now and pay once they're cleared."}
      </p>
      <PaperRows items={items} />
      {needsUpload(items) && (
        <Link to={documentsLink(here, needs)} style={linkStyle}>
          Add or replace your papers
        </Link>
      )}
    </div>
  );
}

/**
 * In place of Pay on a booking whose papers CRAL hasn't cleared yet. The
 * pay endpoint refuses (`papers_not_cleared`) until they are, so offering
 * the button would only end in an error.
 */
export function PapersBeingChecked({
  items,
  accepted,
  ownerName,
  here,
}: {
  items: PaperItem[];
  accepted: boolean;
  ownerName: string;
  here: string;
}): JSX.Element {
  const upload = needsUpload(items);
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E4E7EC",
        borderRadius: 12,
        padding: "clamp(18px,2.4vw,24px)",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          font: "700 19px/1.25 Archivo,sans-serif",
          fontVariationSettings: "'wdth' 108",
          color: "#0B0F1A",
          marginBottom: 6,
        }}
      >
        {upload ? "Your papers need another look" : "Papers being checked - pay once cleared"}
      </div>
      <p style={{ margin: "0 0 14px", font: "400 14px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
        {upload
          ? "CRAL can't clear what's below yet. Add or replace it, and the M-Pesa prompt opens here once it's cleared."
          : accepted
            ? `${ownerName} has accepted. CRAL is reading your papers - the M-Pesa prompt opens here the moment they're cleared, so pickup never waits on them.`
            : "CRAL is reading your papers while the owner decides. You pay once they're cleared, so pickup never waits on them."}
      </p>
      <PaperRows items={items} />
      {upload && (
        <Link to={documentsLink(here, items.map((i) => i.kind))} style={linkStyle}>
          Add or replace your papers
        </Link>
      )}
    </div>
  );
}
