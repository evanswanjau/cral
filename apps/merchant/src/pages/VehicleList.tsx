import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { P } from "../components/portal/styles.js";
import { FILTER_ORDER, STATUS, filterLabel, money } from "../components/portal/status.js";
import { useVehicleList, type VehicleFilter, type VehicleSummary } from "../lib/vehicles-api.js";
import { vehicleTypeLabel } from "../lib/vehicle-categories.js";

function FilterPill({
  filter,
  count,
  active,
  onClick,
}: {
  filter: VehicleFilter;
  count: number;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  const alert = filter === "needs_action" && count > 0 && !active;
  const bg = active ? "#0B0F1A" : alert ? "#FDE7EA" : "#FFFFFF";
  const border = active ? "#0B0F1A" : alert ? "#F7BDC5" : "#E4E7EC";
  const fg = active ? "#FFFFFF" : alert ? "#A50E22" : "#333B4A";
  const countFg = active ? "#8C97A8" : alert ? "#D81E32" : "#A7AEBB";
  return (
    <button type="button" onClick={onClick} style={{ ...P.filterPill, background: bg, border: `1px solid ${border}`, color: fg }}>
      <span>{filterLabel(filter)}</span>
      <span style={{ font: "500 11px/1 'IBM Plex Mono',monospace", color: countFg }}>{count}</span>
    </button>
  );
}

function TableHead(): JSX.Element {
  return (
    <div style={P.tableHead}>
      <span style={P.tableHeadPlate}>REGISTRATION</span>
      <span style={P.tableHeadTitle}>VEHICLE</span>
      <span style={P.tableHeadStatus}>STATUS</span>
      <span style={P.tableHeadDocs}>DOCS</span>
      <span style={P.tableHeadRate}>DAILY RATE</span>
      <span style={P.tableHeadDate}>SUBMITTED</span>
      <span style={P.tableHeadSpacer} />
    </div>
  );
}

/** Shimmer bars in the exact shape of a real row, so the layout doesn't jump when data lands. */
function SkeletonRow(): JSX.Element {
  const bar = (width: number, height = 12): CSSProperties => ({ ...P.skeletonBar, width, height });
  return (
    <div style={P.skeletonRow}>
      <div className="cral-shimmer" style={{ ...bar(74, 26), borderRadius: 4 }} />
      <div style={{ minWidth: 0, display: "grid", gap: 6 }}>
        <div className="cral-shimmer" style={bar(160, 14)} />
        <div className="cral-shimmer" style={bar(120, 11)} />
      </div>
      <div className="cral-shimmer" style={{ ...bar(96, 24), borderRadius: 999 }} />
      <div className="cral-shimmer" style={bar(50, 12)} />
      <div className="cral-shimmer" style={{ ...bar(70, 12), justifySelf: "end" }} />
      <div className="cral-shimmer" style={bar(60, 10)} />
      <div />
    </div>
  );
}

function TableSkeleton(): JSX.Element {
  return (
    <div style={P.table}>
      <style>{`
        @keyframes cral-shimmer { 0% { opacity: .55; } 50% { opacity: 1; } 100% { opacity: .55; } }
        .cral-shimmer { animation: cral-shimmer 1.3s ease-in-out infinite; }
      `}</style>
      <TableHead />
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

function EmptyState({ filter, onAdd }: { filter: VehicleFilter; onAdd: () => void }): JSX.Element {
  const isAll = filter === "all";
  return (
    <div style={P.emptyWrap}>
      <span style={P.emptyIcon}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 12l2-6h14l2 6M3 12v6a1 1 0 001 1h1a1 1 0 001-1v-1h12v1a1 1 0 001 1h1a1 1 0 001-1v-6M3 12h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div style={P.emptyTitle}>{isAll ? "No vehicles yet" : `Nothing in ${filterLabel(filter).toLowerCase()}`}</div>
      <p style={P.emptyBody}>
        {isAll
          ? "Add your first vehicle to start taking bookings on CRAL."
          : "Vehicles show up here once they match this filter."}
      </p>
      {isAll && (
        <button type="button" style={P.addButton} onClick={onAdd}>
          Add a vehicle
        </button>
      )}
    </div>
  );
}

function Row({ v, onOpen }: { v: VehicleSummary; onOpen: () => void }): JSX.Element {
  const meta = STATUS[v.status];
  return (
    <div style={P.row} onClick={onOpen} onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFBFC")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      <span style={P.plateBadge}>{v.registration}</span>
      <div style={P.rowTitleWrap}>
        <div style={P.rowTitleLine}>
          <span style={P.rowTitle}>{v.make} {v.model}</span>
          {v.verification_badge === "active" && <span style={P.verifiedTag}>✓ VERIFIED</span>}
        </div>
        <div style={P.rowMeta}>{vehicleTypeLabel(v.type)} · {v.year} · {v.seats} seats · {v.county ?? v.pickup_address ?? "—"}</div>
      </div>
      <span style={{ ...P.statusTag, background: meta.tint, border: `1px solid ${meta.border}`, color: meta.text }}>
        <span style={{ ...P.statusDot, background: meta.core }} />
        {meta.label}
      </span>
      <span style={{ ...P.docsLabel, color: v.doc_has_issue ? "#A50E22" : v.doc_count === 3 ? "#5A6373" : "#8A5200" }}>
        {v.doc_count}/3 docs
      </span>
      <span style={{ ...P.rateLabel, color: v.daily_rate ? "#0B0F1A" : "#A7AEBB" }}>
        {v.daily_rate ? `KES ${money(v.daily_rate.amount)}` : "No rate yet"}
      </span>
      <span style={P.dateLabel}>
        {v.status === "draft" ? "NOT SENT" : v.submitted_at ? new Date(v.submitted_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase() : "—"}
      </span>
      <span style={P.chevron}>›</span>
    </div>
  );
}

export function VehicleList(): JSX.Element {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<VehicleFilter>("all");
  const { data, isPending } = useVehicleList(filter);

  const needsAction = data?.data.filter((v) => v.status === "action" || v.status === "rejected") ?? [];
  const showBanner = needsAction.length > 0 && filter !== "live" && filter !== "draft";
  const first = needsAction[0];

  return (
    <div>
      <div style={P.listHead}>
        <div>
          <h1 style={P.h1}>Your vehicles</h1>
          <p style={P.lede}>
            Everything you have submitted, and where each one stands with our reviewers. Open a
            vehicle to see its documents and history.
          </p>
        </div>
        <button type="button" style={P.addButton} onClick={() => navigate("/vehicles/new")}>
          Add a vehicle
        </button>
      </div>

      {showBanner && first && (
        <div style={P.banner}>
          <span style={P.bannerDot} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={P.bannerTitle}>
              {needsAction.length} {needsAction.length === 1 ? "vehicle needs" : "vehicles need"} something from you
            </div>
            <div style={P.bannerBody}>
              {first.registration} · {first.make} {first.model} — the reviewer left you a note.
            </div>
          </div>
          <button type="button" style={P.bannerBtn} onClick={() => navigate(`/vehicles/${first.id}`)}>
            Open vehicle
          </button>
        </div>
      )}

      <div style={P.filterRow}>
        {FILTER_ORDER.map((f) => (
          <FilterPill key={f} filter={f} count={data?.counts[f] ?? 0} active={filter === f} onClick={() => setFilter(f)} />
        ))}
      </div>

      {isPending || !data ? (
        <TableSkeleton />
      ) : data.data.length === 0 ? (
        <div style={P.table}>
          <TableHead />
          <EmptyState filter={filter} onAdd={() => navigate("/vehicles/new")} />
        </div>
      ) : (
        <div style={P.table}>
          <TableHead />
          {data.data.map((v) => (
            <Row key={v.id} v={v} onOpen={() => navigate(`/vehicles/${v.id}`)} />
          ))}
          <div style={P.tableFooter}>
            <span style={P.tableFooterLeft}>
              {data.data.length} {data.data.length === 1 ? "VEHICLE" : "VEHICLES"}
              {filter !== "all" ? ` · ${filterLabel(filter).toUpperCase()}` : ""}
            </span>
            <span style={P.tableFooterRight}>Reviews take up to two working days.</span>
          </div>
        </div>
      )}
    </div>
  );
}
