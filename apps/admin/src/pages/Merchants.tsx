import { type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchMerchants, type MerchantRow } from "../lib/merchants-api.js";
import { usePageTitle } from "../lib/use-page-title.js";

const GRID = "minmax(0,1fr) 190px 96px 74px 62px 96px 14px";

const BADGE: Record<string, { label: string; bg: string; border: string; fg: string }> = {
  verified: { label: "VERIFIED", bg: "#DDF3E9", border: "#A8DEC7", fg: "#076945" },
  new_merchant: { label: "NEW MERCHANT", bg: "#FFF3DB", border: "#F5D9A3", fg: "#8A5200" },
};

export function Merchants(): JSX.Element {
  usePageTitle("Merchants");
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "merchants", "list"],
    queryFn: () => fetchMerchants(),
  });

  return (
    <div>
      <div style={S.headRow}>
        <div>
          <h1 style={S.h1}>Merchants</h1>
          <p style={S.lede}>
            Everyone who has put a vehicle in front of us. Open a merchant to see their whole fleet
            in one place before you judge any single car.
          </p>
        </div>
        <button type="button" onClick={() => navigate("/vehicles")} style={S.backBtn}>
          Back to vehicle review
        </button>
      </div>

      <div style={S.tableWrap}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 780 }}>
            <div style={{ ...S.rowGrid, ...S.tableHead }}>
              {["MERCHANT", "CONTACT", "JOINED", "FLEET", "LIVE", "WITH US", ""].map((h, i) => (
                <span key={i} style={S.th}>
                  {h}
                </span>
              ))}
            </div>

            {isLoading && <div style={S.empty}>Loading merchants…</div>}
            {error && <div style={S.empty}>Couldn't load merchants. Try again.</div>}
            {data && data.data.length === 0 && <div style={S.empty}>No merchants have submitted a vehicle yet.</div>}

            {data?.data.map((m) => (
              <Row key={m.id} m={m} onOpen={() => navigate(`/merchants/${m.id}`)} />
            ))}
          </div>
        </div>
        {data && (
          <div style={S.foot}>
            <span>
              {data.total} {data.total === 1 ? "MERCHANT" : "MERCHANTS"} · MOST WAITING FIRST
            </span>
            <span style={{ color: "#838C9B", font: "400 12px/1.4 'Instrument Sans',sans-serif" }}>
              A merchant with a rejection history is not a bad merchant. Read the file first.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ m, onOpen }: { m: MerchantRow; onOpen: () => void }): JSX.Element {
  const b = BADGE[m.badge]!;
  return (
    <div onClick={onOpen} style={{ ...S.rowGrid, ...S.row }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
        <span style={S.avatar}>{m.initials}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ font: "600 15px/1.25 Archivo,sans-serif", color: "#1A1F2B" }}>{m.name}</span>
            <span style={{ ...S.badge, background: b.bg, borderColor: b.border, color: b.fg }}>{b.label}</span>
          </div>
          <div style={S.towns}>{m.towns.length ? m.towns.join(", ") : "No county on file"}</div>
        </div>
      </div>
      <span style={S.ellipsis}>{m.contact}</span>
      <span style={{ font: "400 13px/1.4 'Instrument Sans',sans-serif", color: "#838C9B" }}>
        {new Date(m.joined).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
      </span>
      <span style={{ font: "500 13px/1.3 'IBM Plex Mono',monospace", color: "#333B4A", fontVariantNumeric: "tabular-nums" }}>
        {m.fleet}
      </span>
      <span style={{ font: "500 13px/1.3 'IBM Plex Mono',monospace", color: "#076945", fontVariantNumeric: "tabular-nums" }}>
        {m.live}
      </span>
      <span>
        <span
          style={{
            display: "inline-block",
            padding: "4px 9px",
            background: m.waiting ? "#FFF3DB" : "#F1F3F6",
            borderRadius: "var(--r-sm)",
            font: "600 11px/1.3 'IBM Plex Mono',monospace",
            letterSpacing: ".03em",
            color: m.waiting ? "#C77400" : "#9AA2B0",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {m.waiting ? `${m.waiting} waiting` : "—"}
        </span>
      </span>
      <span style={{ font: "400 16px/1 'Instrument Sans',sans-serif", color: "#CDD2DA" }}>›</span>
    </div>
  );
}

const S = {
  headRow: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 },
  h1: {
    margin: "0 0 7px",
    font: "600 clamp(25px,3.4vw,32px)/1.1 Archivo,sans-serif",
    fontVariationSettings: "'wdth' 106",
    letterSpacing: "-.022em",
    color: "#1A1F2B",
  },
  lede: { margin: 0, font: "400 14px/1.55 'Instrument Sans',sans-serif", color: "#5A6373", maxWidth: 600 },
  backBtn: {
    height: 44,
    padding: "0 16px",
    background: "#FFFFFF",
    color: "#1A1F2B",
    border: "1px solid #E4E7EC",
    borderRadius: "var(--r)",
    font: "600 14px/1 'Instrument Sans',sans-serif",
    cursor: "pointer",
  },
  tableWrap: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", overflow: "hidden" },
  rowGrid: {
    display: "grid",
    gridTemplateColumns: GRID,
    alignItems: "center",
    gap: "clamp(12px,1.6vw,20px)",
    padding: "15px 18px",
  },
  tableHead: { padding: "10px 18px", background: "#FFFFFF", borderBottom: "1px solid #E4E7EC" },
  th: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#9AA2B0" },
  row: { borderBottom: "1px solid #F1F3F6", cursor: "pointer" },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 999,
    background: "#F1F3F6",
    color: "#0F23A8",
    font: "600 11px/32px 'IBM Plex Mono',monospace",
    textAlign: "center",
    flex: "none",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 9px",
    border: "1px solid",
    borderRadius: 999,
    font: "600 10px/1.5 'IBM Plex Mono',monospace",
    letterSpacing: ".05em",
  },
  towns: {
    font: "400 12px/1.4 'Instrument Sans',sans-serif",
    color: "#838C9B",
    marginTop: 2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ellipsis: {
    font: "400 13px/1.4 'Instrument Sans',sans-serif",
    color: "#5A6373",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  empty: { padding: "28px 18px", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
  foot: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "13px 18px",
    background: "#FFFFFF",
    font: "400 12px/1.4 'IBM Plex Mono',monospace",
    letterSpacing: ".04em",
    color: "#838C9B",
    flexWrap: "wrap",
  },
} satisfies Record<string, CSSProperties>;
