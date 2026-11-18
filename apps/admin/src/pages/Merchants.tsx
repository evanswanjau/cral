import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchMerchants, type MerchantRow } from "../lib/merchants-api.js";
import { fetchAgents } from "../lib/agents-api.js";
import { getAdminClaims } from "../lib/auth.js";
import { usePageTitle } from "../lib/use-page-title.js";
import { MERCHANT_BADGE } from "../components/console/status.js";

const GRID = "minmax(0,1fr) 190px 96px 74px 62px 96px 14px";
/** The owner's view adds the Agent column (PR AG2). */
const OWNER_GRID = "minmax(0,1fr) 190px 150px 96px 74px 62px 96px 14px";

export function Merchants(): JSX.Element {
  usePageTitle("Merchants");
  const navigate = useNavigate();
  // Who brought a merchant in is the owner's report (B2); a reviewer's
  // directory is unchanged.
  const isOwner = getAdminClaims()?.role === "admin_super";
  const [agent, setAgent] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "merchants", "list", agent],
    queryFn: () => fetchMerchants(undefined, agent || undefined),
  });
  const agents = useQuery({
    queryKey: ["admin", "agents", "roster"],
    queryFn: fetchAgents,
    enabled: isOwner,
  });
  const grid = isOwner ? OWNER_GRID : GRID;
  const heads = isOwner
    ? ["MERCHANT", "CONTACT", "AGENT", "JOINED", "FLEET", "LIVE", "WITH US", ""]
    : ["MERCHANT", "CONTACT", "JOINED", "FLEET", "LIVE", "WITH US", ""];

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

      {isOwner && (
        <div style={{ marginBottom: 14, maxWidth: 320 }}>
          <label htmlFor="agent-filter" style={S.filterLabel}>
            AGENT
          </label>
          <select id="agent-filter" value={agent} onChange={(e) => setAgent(e.target.value)} style={S.select}>
            <option value="">Everyone</option>
            <option value="none">Signed up on their own</option>
            {agents.data?.data.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.status === "disabled" ? " (disabled)" : ""} · {a.merchants}
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={S.tableWrap}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: isOwner ? 940 : 780 }}>
            <div style={{ ...S.rowGrid, gridTemplateColumns: grid, ...S.tableHead }}>
              {heads.map((h, i) => (
                <span key={i} style={S.th}>
                  {h}
                </span>
              ))}
            </div>

            {isLoading && <div style={S.empty}>Loading merchants…</div>}
            {error && <div style={S.empty}>Couldn't load merchants. Try again.</div>}
            {data && data.data.length === 0 && (
              <div style={S.empty}>
                {agent ? "Nobody from this filter has submitted a vehicle yet." : "No merchants have submitted a vehicle yet."}
              </div>
            )}

            {data?.data.map((m) => (
              <Row key={m.id} m={m} grid={grid} showAgent={isOwner} onOpen={() => navigate(`/merchants/${m.id}`)} />
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

function Row({
  m,
  grid,
  showAgent,
  onOpen,
}: {
  m: MerchantRow;
  grid: string;
  showAgent: boolean;
  onOpen: () => void;
}): JSX.Element {
  const b = MERCHANT_BADGE[m.badge];
  return (
    <div onClick={onOpen} style={{ ...S.rowGrid, gridTemplateColumns: grid, ...S.row }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
        <span style={S.avatar}>{m.initials}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ font: "600 15px/1.25 Archivo,sans-serif", color: "#1A1F2B" }}>{m.name}</span>
            <span style={{ ...S.badge, background: b.bg, borderColor: b.border, color: b.fg }}>{b.glyph} {b.label}</span>
          </div>
          <div style={S.towns}>{m.towns.length ? m.towns.join(", ") : "No county on file"}</div>
        </div>
      </div>
      <span style={S.ellipsis}>{m.contact}</span>
      {showAgent && (
        <span style={{ minWidth: 0 }}>
          {m.agent ? (
            <>
              <span style={{ ...S.ellipsis, display: "block", color: "#1A1F2B" }}>{m.agent.name}</span>
              <span style={S.towns}>{m.agent.via === "agent_link" ? "Through their link" : "Added by them"}</span>
            </>
          ) : (
            <span style={{ ...S.ellipsis, color: "#9AA2B0" }}>On their own</span>
          )}
        </span>
      )}
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
  filterLabel: {
    display: "block",
    marginBottom: 7,
    font: "600 11px/1 'IBM Plex Mono',monospace",
    letterSpacing: ".04em",
    color: "#5A6373",
  },
  select: {
    height: 44,
    width: "100%",
    padding: "0 12px",
    border: "1px solid #E4E7EC",
    borderRadius: "var(--r)",
    font: "400 14px/1 'Instrument Sans',sans-serif",
    color: "#1A1F2B",
    background: "#FFFFFF",
  },
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
