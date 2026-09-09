import { useMemo, useState, type CSSProperties } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchQueue, type QueueRow, type ReviewBucket } from "../../lib/vehicles-api.js";
import { usePageTitle } from "../../lib/use-page-title.js";
import { ageBadge, BUCKET_LABEL, BUCKET_ORDER, statusTone } from "../../components/console/status.js";

const GRID = "92px minmax(0,1fr) 132px 62px 96px 84px 14px";

export function Queue(): JSX.Element {
  usePageTitle("Vehicle review");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const bucket = (params.get("bucket") as ReviewBucket | "all" | null) ?? "needs_review";
  const mine = params.get("mine") === "1";

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "vehicles", "queue", bucket, mine],
    queryFn: () => fetchQueue({ bucket, mine }),
  });

  const [busyNext, setBusyNext] = useState(false);

  const setFilter = (b: ReviewBucket | "all") => {
    const next = new URLSearchParams(params);
    next.set("bucket", b);
    setParams(next, { replace: true });
  };
  const toggleMine = () => {
    const next = new URLSearchParams(params);
    if (mine) next.delete("mine");
    else next.set("mine", "1");
    setParams(next, { replace: true });
  };

  const overdue = useMemo(() => (data?.data ?? []).filter((r) => r.overdue), [data]);

  return (
    <div>
      <div style={S.headRow}>
        <div>
          <h1 style={S.h1}>Vehicles</h1>
          <p style={S.lede}>
            Every submission from every merchant, oldest promise first. Open one to check its
            documents and decide.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flex: "none", flexWrap: "wrap" }}>
          <button type="button" onClick={toggleMine} style={{ ...S.topBtn, ...(mine ? S.topBtnOn : S.topBtnOff) }}>
            {mine ? "Showing mine" : "Only mine"}
          </button>
          <button
            type="button"
            disabled={busyNext || !(data?.data.length)}
            onClick={() => {
              const next = data?.data[0];
              if (next) {
                setBusyNext(true);
                navigate(`/vehicles/${next.id}`);
              }
            }}
            style={{ ...S.topBtn, ...S.reviewNext, ...(data?.data.length ? {} : { opacity: 0.5, cursor: "not-allowed" }) }}
          >
            Review next
          </button>
        </div>
      </div>

      {overdue.length > 0 && (
        <div style={S.breach}>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: "#D81E32", flex: "none" }} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ font: "600 14px/1.35 'Instrument Sans',sans-serif", color: "#A50E22" }}>
              {overdue.length === 1
                ? "1 case is past the two-day promise"
                : `${overdue.length} cases are past the two-day promise`}
            </div>
            <div style={{ font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#A50E22" }}>
              {overdue[0]!.registration} · {overdue[0]!.merchant_name} — waiting{" "}
              {ageBadge(overdue[0]!.waiting_hours, data?.sla_days ?? 2).label}. Merchants get an SMS when we run late.
            </div>
          </div>
          <button type="button" onClick={() => navigate(`/vehicles/${overdue[0]!.id}`)} style={S.breachBtn}>
            Open the oldest
          </button>
        </div>
      )}

      <div style={S.filters}>
        {BUCKET_ORDER.map((b) => {
          const on = bucket === b;
          const count = data?.counts[b] ?? 0;
          const alert = b === "needs_review" && count > 0 && !on;
          return (
            <button
              key={b}
              type="button"
              onClick={() => setFilter(b)}
              style={{
                ...S.chip,
                background: on ? "#0F23A8" : alert ? "#FFF3DB" : "#FFFFFF",
                borderColor: on ? "#0F23A8" : alert ? "#F5D9A3" : "#E4E7EC",
                color: on ? "#FFFFFF" : alert ? "#C77400" : "#333B4A",
              }}
            >
              <span>{BUCKET_LABEL[b]}</span>
              <span style={{ font: "500 11px/1 'IBM Plex Mono',monospace", color: on ? "#FFFFFF" : "#838C9B" }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div style={S.tableWrap}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 780 }}>
            <div style={{ ...S.rowGrid, ...S.tableHead }}>
              {["PLATE", "VEHICLE · MERCHANT", "STATE", "DOCS", "WAITING", "REVIEWER", ""].map((h, i) => (
                <span key={i} style={S.th}>
                  {h}
                </span>
              ))}
            </div>

            {isLoading && <div style={S.empty}>Loading the queue…</div>}
            {error && <div style={S.empty}>Couldn't load the queue. Try again.</div>}
            {data && data.data.length === 0 && (
              <div style={S.empty}>Nothing in {BUCKET_LABEL[bucket].toLowerCase()} right now.</div>
            )}

            {data?.data.map((r) => (
              <QueueRowView
                key={r.id}
                row={r}
                slaDays={data.sla_days}
                onOpen={() => navigate(`/vehicles/${r.id}`)}
                onOpenMerchant={() => navigate(`/merchants/${r.merchant_id}`)}
              />
            ))}
          </div>
        </div>
        {data && (
          <div style={S.tableFoot}>
            {data.data.length} {data.data.length === 1 ? "CASE" : "CASES"} · OLDEST FIRST
            {mine ? " · ASSIGNED TO YOU" : ""}
          </div>
        )}
      </div>
    </div>
  );
}

function QueueRowView({
  row,
  slaDays,
  onOpen,
  onOpenMerchant,
}: {
  row: QueueRow;
  slaDays: number;
  onOpen: () => void;
  onOpenMerchant: () => void;
}): JSX.Element {
  const tone = statusTone(row.status);
  const age = ageBadge(row.waiting_hours, slaDays);
  const docsFg = row.docs_has_issue ? "#D81E32" : row.docs_accepted === row.docs_total ? "#5A6373" : "#C77400";
  return (
    <div onClick={onOpen} style={{ ...S.rowGrid, ...S.row }}>
      <span style={S.plate}>{row.registration}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ font: "600 15px/1.25 Archivo,sans-serif", color: "#1A1F2B" }}>{row.title}</div>
        <div style={{ font: "400 12px/1.4 'Instrument Sans',sans-serif", color: "#838C9B", marginTop: 2 }}>
          · {row.type} · {row.year} · {row.county ?? "—"} ·{" "}
          <span
            onClick={(e) => {
              e.stopPropagation();
              onOpenMerchant();
            }}
            style={{ color: "#5A6373", borderBottom: "1px solid #E4E7EC", cursor: "pointer" }}
          >
            {row.merchant_name}
          </span>
        </div>
      </div>
      <span style={{ ...S.statePill, background: tone.tint, borderColor: tone.border, color: tone.text }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: tone.core, flex: "none" }} />
        {tone.label}
      </span>
      <span style={{ font: "500 12px/1.3 'IBM Plex Mono',monospace", color: docsFg, fontVariantNumeric: "tabular-nums" }}>
        {row.docs_accepted}/{row.docs_total}
      </span>
      <span style={{ ...S.ageChip, background: age.bg, color: age.fg }}>{age.label}</span>
      <span
        style={{
          font: "500 12px/1.3 'IBM Plex Mono',monospace",
          color: row.assigned_to_me ? "#0F23A8" : row.assignee_initials ? "#5A6373" : "#9AA2B0",
        }}
      >
        {row.assignee_initials ?? "—"}
      </span>
      <span style={{ font: "400 16px/1 'Instrument Sans',sans-serif", color: "#CDD2DA" }}>›</span>
    </div>
  );
}

const S = {
  headRow: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 20,
  },
  h1: {
    margin: "0 0 7px",
    font: "600 clamp(25px,3.4vw,32px)/1.1 Archivo,sans-serif",
    fontVariationSettings: "'wdth' 106",
    letterSpacing: "-.022em",
    color: "#1A1F2B",
  },
  lede: { margin: 0, font: "400 14px/1.55 'Instrument Sans',sans-serif", color: "#5A6373", maxWidth: 600 },
  topBtn: { height: 44, padding: "0 16px", borderRadius: "var(--r)", font: "600 14px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  topBtnOn: { background: "#F1F3F6", color: "#0F23A8", border: "1px solid #0F23A8" },
  topBtnOff: { background: "#FFFFFF", color: "#1A1F2B", border: "1px solid #E4E7EC" },
  reviewNext: { padding: "0 20px", background: "#0F23A8", color: "#fff", border: "none" },
  breach: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "15px 18px",
    background: "#FDE7EA",
    border: "1px solid #F7BDC5",
    borderRadius: "var(--r-lg)",
    marginBottom: 18,
    flexWrap: "wrap",
  },
  breachBtn: {
    height: 38,
    padding: "0 16px",
    background: "#D81E32",
    color: "#fff",
    border: "none",
    borderRadius: "var(--r)",
    font: "600 13px/1 'Instrument Sans',sans-serif",
    cursor: "pointer",
    flex: "none",
  },
  filters: { display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 },
  chip: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    height: 36,
    padding: "0 14px",
    border: "1px solid",
    borderRadius: 999,
    cursor: "pointer",
    font: "600 13px/1 'Instrument Sans',sans-serif",
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
  plate: {
    display: "inline-block",
    padding: "5px 9px",
    border: "1.5px solid #0B0F1A",
    borderRadius: "var(--r-sm)",
    font: "600 13px/1.2 'IBM Plex Mono',monospace",
    letterSpacing: ".04em",
    color: "#1A1F2B",
    fontVariantNumeric: "tabular-nums",
  },
  statePill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "5px 11px",
    border: "1px solid",
    borderRadius: 999,
    font: "600 12px/1.3 'Instrument Sans',sans-serif",
    justifySelf: "start",
  },
  ageChip: {
    display: "inline-block",
    padding: "4px 9px",
    borderRadius: "var(--r-sm)",
    font: "600 11px/1.3 'IBM Plex Mono',monospace",
    letterSpacing: ".03em",
    fontVariantNumeric: "tabular-nums",
    justifySelf: "start",
  },
  empty: { padding: "28px 18px", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
  tableFoot: {
    padding: "13px 18px",
    background: "#FFFFFF",
    font: "400 12px/1.4 'IBM Plex Mono',monospace",
    letterSpacing: ".04em",
    color: "#838C9B",
  },
} satisfies Record<string, CSSProperties>;
