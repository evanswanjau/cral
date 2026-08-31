import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { P } from "../components/portal/styles.js";
import { BOOKING_FILTER_ORDER, BOOKING_STATUS, bookingFilterLabel, money } from "../components/portal/status.js";
import { useToast } from "../components/portal/Toast.js";
import { useBookingList, useSeedDevBookings, type BookingFilter, type BookingSummary } from "../lib/bookings-api.js";

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase();
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function FilterPill({
  filter,
  count,
  active,
  onClick,
}: {
  filter: BookingFilter;
  count: number;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  const alert = filter === "requests" && count > 0 && !active;
  const bg = active ? "#0B0F1A" : alert ? "#FFF3DB" : "#FFFFFF";
  const border = active ? "#0B0F1A" : alert ? "#F5D9A3" : "#E4E7EC";
  const fg = active ? "#FFFFFF" : alert ? "#8A5200" : "#333B4A";
  const countFg = active ? "#8C97A8" : alert ? "#C77400" : "#A7AEBB";
  return (
    <button type="button" onClick={onClick} style={{ ...P.filterPill, background: bg, border: `1px solid ${border}`, color: fg }}>
      <span>{bookingFilterLabel(filter)}</span>
      <span style={{ font: "500 11px/1 'IBM Plex Mono',monospace", color: countFg }}>{count}</span>
    </button>
  );
}

function TableHead(): JSX.Element {
  return (
    <div style={{ ...P.tableHead, gridTemplateColumns: "minmax(96px,1fr) minmax(200px,2.6fr) minmax(96px,1.1fr) minmax(84px,1fr) 16px" }}>
      <span style={P.tableHeadPlate}>VEHICLE</span>
      <span style={P.tableHeadTitle}>HIRER · MODEL · DATES</span>
      <span style={{ ...P.tableHeadRate, textAlign: "right" }}>YOU KEEP</span>
      <span style={P.tableHeadStatus}>STATUS</span>
      <span style={P.tableHeadSpacer} />
    </div>
  );
}

function SkeletonRow(): JSX.Element {
  const bar = (width: number, height = 12): CSSProperties => ({ ...P.skeletonBar, width, height });
  return (
    <div style={{ ...P.skeletonRow, gridTemplateColumns: "minmax(96px,1fr) minmax(200px,2.6fr) minmax(96px,1.1fr) minmax(84px,1fr) 16px" }}>
      <div className="cral-shimmer" style={{ ...bar(74, 26), borderRadius: 4 }} />
      <div style={{ minWidth: 0, display: "grid", gap: 6 }}>
        <div className="cral-shimmer" style={bar(160, 14)} />
        <div className="cral-shimmer" style={bar(120, 11)} />
      </div>
      <div className="cral-shimmer" style={{ ...bar(70, 12), justifySelf: "end" }} />
      <div className="cral-shimmer" style={{ ...bar(96, 24), borderRadius: 999 }} />
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
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

function EmptyState({ filter, onSeed, seeding }: { filter: BookingFilter; onSeed: () => void; seeding: boolean }): JSX.Element {
  const isAll = filter === "all";
  return (
    <div style={P.emptyWrap}>
      <span style={P.emptyIcon}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 4h16v16H4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M4 9h16M9 4v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      <div style={P.emptyTitle}>{isAll ? "No bookings yet" : `Nothing in ${bookingFilterLabel(filter).toLowerCase()}`}</div>
      <p style={P.emptyBody}>
        {isAll
          ? "Requests show up here once a hirer books one of your vehicles."
          : "Bookings show up here once they match this filter."}
      </p>
      {isAll && import.meta.env.DEV && (
        <button type="button" style={P.addButton} onClick={onSeed} disabled={seeding}>
          {seeding ? "Seeding…" : "Seed sample bookings (dev only)"}
        </button>
      )}
    </div>
  );
}

function Row({ b, onOpen }: { b: BookingSummary; onOpen: () => void }): JSX.Element {
  const meta = BOOKING_STATUS[b.status];
  const pickup = new Date(b.pickup_at);
  const dropoff = new Date(b.dropoff_at);
  const sameMonth = pickup.getMonth() === dropoff.getMonth() && pickup.getFullYear() === dropoff.getFullYear();
  const dateRange = sameMonth
    ? `${pickup.getDate()} → ${formatDate(b.dropoff_at)}`
    : `${formatDate(b.pickup_at)} → ${formatDate(b.dropoff_at)}`;

  return (
    <div style={{ ...P.row, gridTemplateColumns: "minmax(96px,1fr) minmax(200px,2.6fr) minmax(96px,1.1fr) minmax(84px,1fr) 16px" }} onClick={onOpen} onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFBFC")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      <span style={P.plateBadge}>{b.vehicle_registration}</span>
      <div style={P.rowTitleWrap}>
        <div style={P.rowTitleLine}>
          <span style={P.rowTitle}>{b.hirer_name}</span>
          {b.hirer_is_corporate && (
            <span style={{ ...P.verifiedTag, background: "#EDEFFC", border: "1px solid #DCE1FA", color: "#0F23A8" }}>CORP</span>
          )}
        </div>
        <div style={P.rowMeta}>{b.vehicle_make} {b.vehicle_model} · {dateRange}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={P.rateLabel}>KES {money(b.merchant_net.amount)}</div>
        <div style={{ font: "400 11px/1.3 'Instrument Sans',sans-serif", color: "#A7AEBB" }}>after commission</div>
      </div>
      <span style={{ ...P.statusTag, background: meta.tint, border: `1px solid ${meta.border}`, color: meta.text }}>
        <span style={{ ...P.statusDot, background: meta.core }} />
        {meta.label}
      </span>
      <span style={P.chevron}>›</span>
    </div>
  );
}

export function BookingList(): JSX.Element {
  const navigate = useNavigate();
  const flash = useToast();
  const [filter, setFilterState] = useState<BookingFilter>("all");
  const { data, isPending } = useBookingList(filter);
  const { data: requestsData } = useBookingList("requests");
  const { data: onHireData } = useBookingList("on_hire");
  const seed = useSeedDevBookings();

  const pendingRequests = requestsData?.data ?? [];
  const firstRequest = pendingRequests[0];
  const returningToday = (onHireData?.data ?? []).filter((b) => isSameDay(new Date(b.dropoff_at), new Date()));

  return (
    <div>
      <div style={P.listHead}>
        <div>
          <h1 style={P.h1}>Bookings</h1>
          <p style={P.lede}>
            Requests waiting on you, hires running now, and everything already finished. Hirers pay
            CRAL upfront — your payout clears 24 hours after you receive the vehicle.
          </p>
        </div>
        <button
          type="button"
          style={{ ...P.actionBtn, height: 44 }}
          onClick={() => flash("Booking sheets are coming soon.", "#8C97A8")}
        >
          Export CSV
        </button>
      </div>

      {returningToday.length > 0 &&
        returningToday.map((b) => (
          <div key={b.id} style={{ ...P.card, borderColor: "#A8DEC7", marginBottom: 14, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#076945", marginBottom: 8 }}>
                  RETURN TODAY
                </div>
                <div style={{ font: "600 17px/1.3 Archivo,sans-serif", color: "#0B0F1A" }}>{b.hirer_name}</div>
                <div style={{ ...P.rowMeta, marginTop: 2 }}>
                  {b.vehicle_registration} · {b.vehicle_make} {b.vehicle_model}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{ font: "700 20px/1 Archivo,sans-serif", fontVariationSettings: "'wdth' 108", color: "#0B0F1A" }}>
                  {formatTime(b.dropoff_at)}
                </span>
                <button type="button" style={P.addButton} onClick={() => navigate(`/bookings/${b.id}`)}>
                  Mark returned
                </button>
              </div>
            </div>
          </div>
        ))}

      {pendingRequests.length > 0 && firstRequest && (
        <div style={{ ...P.banner, background: "#FFF3DB", border: "1px solid #F5D9A3" }}>
          <span style={{ ...P.bannerDot, background: "#C77400" }} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ ...P.bannerTitle, color: "#8A5200" }}>
              {pendingRequests.length} {pendingRequests.length === 1 ? "request is" : "requests are"} waiting for your answer
            </div>
            <div style={{ ...P.bannerBody, color: "#8A5200" }}>
              {firstRequest.hirer_name} · {firstRequest.vehicle_registration} · {formatDate(firstRequest.pickup_at)} → {formatDate(firstRequest.dropoff_at)} — money is already with CRAL.
            </div>
          </div>
          <button type="button" style={{ ...P.bannerBtn, background: "#0F23A8" }} onClick={() => navigate(`/bookings/${firstRequest.id}`)}>
            Open request
          </button>
        </div>
      )}

      <div style={P.filterRow}>
        {BOOKING_FILTER_ORDER.map((f) => (
          <FilterPill key={f} filter={f} count={data?.counts[f] ?? 0} active={filter === f} onClick={() => setFilterState(f)} />
        ))}
      </div>

      {isPending || !data ? (
        <TableSkeleton />
      ) : data.data.length === 0 ? (
        <div style={P.table}>
          <TableHead />
          <EmptyState filter={filter} onSeed={() => seed.mutate()} seeding={seed.isPending} />
        </div>
      ) : (
        <div style={P.table}>
          <TableHead />
          {data.data.map((b) => (
            <Row key={b.id} b={b} onOpen={() => navigate(`/bookings/${b.id}`)} />
          ))}
          <div style={P.tableFooter}>
            <span style={P.tableFooterLeft}>
              {data.data.length} {data.data.length === 1 ? "BOOKING" : "BOOKINGS"}
              {filter !== "all" ? ` · ${bookingFilterLabel(filter).toUpperCase()}` : ""}
            </span>
            <span style={P.tableFooterRight}>Requests expire after 12 hours if you do not answer.</span>
          </div>
        </div>
      )}
    </div>
  );
}
