import { useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { P } from "../components/portal/styles.js";
import { BOOKING_STATUS, DOC_STATE, NOTIFICATION_KIND, STATUS, money } from "../components/portal/status.js";
import { usePageTitle } from "../lib/use-page-title.js";
import {
  useDashboard,
  type Dashboard as DashboardData,
  type DashboardActivityItem,
  type DashboardFleetVehicle,
  type DashboardPayoutLine,
  type DashboardWeekBooking,
} from "../lib/dashboard-api.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Below this many months carrying a run, the chart is replaced with copy.
 * Two bars scaled against each other read as a trend, and a merchant with one
 * payout behind them does not have a trend yet.
 */
const MIN_CHART_MONTHS = 3;

// ---------------------------------------------------------------------
// Copy composed here, not on the server
//
// The API returns numbers and typed fields; the sentences are ours. Each
// clause below is built from one fact and has its own absent case, rather
// than being a template with holes punched in it.
// ---------------------------------------------------------------------

function formatLongDay(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatShortDay(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatStamp(iso: string): string {
  return new Date(iso)
    .toLocaleString("en-GB", {
      timeZone: "Africa/Nairobi",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(",", " ·")
    .toUpperCase();
}

/** Whole Nairobi days between today and a bare calendar day, floored at zero. */
function daysUntil(day: string, today: string): number {
  return Math.max(0, Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS));
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "vs August" - the month the paid-out delta is measured against. */
function previousMonthLabel(data: DashboardData): string {
  const previous = data.earnings.series.at(-2);
  if (!previous) return "";
  return `vs ${new Date(`${previous.month}-01T00:00:00.000Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    month: "long",
  })}`;
}

/** The greeting's second line: today, then a clause per fact that has one. */
function subheading(data: DashboardData): string {
  const clauses: string[] = [];
  const { on_hire_count: onHire, next_payout_date: payoutDate } = data.greeting;

  if (onHire > 0) clauses.push(`${plural(onHire, "vehicle")} ${onHire === 1 ? "is" : "are"} on hire today`);
  if (payoutDate) clauses.push(`your next payout lands on ${formatShortDay(payoutDate)}`);

  if (clauses.length === 0) {
    return data.fleet.vehicle_count === 0
      ? `${formatLongDay(data.greeting.today)}. Add your first vehicle to start taking bookings.`
      : `${formatLongDay(data.greeting.today)}. Nothing is on hire today and nothing is waiting to be paid out.`;
  }
  const joined = clauses.length === 2 ? `${clauses[0]} and ${clauses[1]}` : clauses[0];
  return `${formatLongDay(data.greeting.today)}. ${joined!.charAt(0).toUpperCase()}${joined!.slice(1)}.`;
}

/** The action banner's body: at most two plates, each with its note. */
function needsActionBody(data: DashboardData): string {
  const parts = data.needs_action.vehicles.map((v) =>
    v.reviewer_note ? `${v.registration} - ${v.reviewer_note}` : `${v.registration} needs a document`,
  );
  const rest = data.needs_action.vehicle_count - data.needs_action.vehicles.length;
  if (rest > 0) parts.push(`and ${plural(rest, "other")}`);
  return parts.join(" ");
}

const DOC_KIND_LABEL: Record<DashboardFleetVehicle["documents"][number]["kind"], string> = {
  logbook: "Logbook",
  comprehensive_insurance: "Comprehensive insurance",
  tracker_certificate: "Tracker certificate",
};

// ---------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------

function Tile({
  kicker,
  unit,
  value,
  delta,
  deltaColor,
  note,
}: {
  kicker: string;
  unit?: string;
  value: string;
  delta: string;
  deltaColor: string;
  note: string;
}): JSX.Element {
  return (
    <div style={P.dashTile}>
      <div style={P.dashTileKicker}>{kicker}</div>
      <div style={P.dashTileValue}>
        {unit && <span style={P.dashTileUnit}>{unit}</span>}
        {value}
      </div>
      <div style={P.dashTileFoot}>
        <span style={{ ...P.dashTileDelta, color: deltaColor }}>{delta}</span>
        <span style={P.dashTileNote}>{note}</span>
      </div>
    </div>
  );
}

function Card({ children }: { children: ReactNode }): JSX.Element {
  return <div style={P.dashCard}>{children}</div>;
}

function CardEmpty({ title, body }: { title: string; body: string }): JSX.Element {
  return (
    <div style={P.dashCardEmpty}>
      <div style={P.dashCardEmptyTitle}>{title}</div>
      <p style={P.dashCardEmptyBody}>{body}</p>
    </div>
  );
}

function HoverRow({
  onClick,
  children,
  style,
}: {
  onClick?: () => void;
  children: ReactNode;
  style?: CSSProperties;
}): JSX.Element {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...P.dashRow, ...style, background: hover ? "#FAFBFC" : "transparent" }}
    >
      {children}
    </div>
  );
}

function EarningsChart({ earnings }: { earnings: DashboardData["earnings"] }): JSX.Element {
  if (earnings.months_with_data < MIN_CHART_MONTHS) {
    return (
      <div style={P.dashChartEmpty}>
        <div style={P.dashCardEmptyTitle}>Not enough history to chart yet</div>
        <p style={P.dashCardEmptyBody}>
          Your first payouts will chart here. It takes three months of runs before the shape means anything.
        </p>
      </div>
    );
  }

  const peak = Math.max(...earnings.series.map((m) => m.net.amount), 1);
  return (
    <div style={P.dashChart}>
      {earnings.series.map((m) => (
        <div key={m.month} style={P.dashChartCol}>
          <span style={{ ...P.dashChartValue, color: m.current ? "#0F23A8" : "#838C9B" }}>
            {Math.round(m.net.amount / 100 / 1000)}k
          </span>
          <div
            style={{
              ...P.dashChartBar,
              // The design's own scale: a 24px floor so an empty month is
              // still a visible bar, plus up to 92px of the peak's share.
              height: Math.round(24 + (m.net.amount / peak) * 92),
              background: m.current ? "#0F23A8" : "#C3CBF5",
            }}
          />
          <span style={{ ...P.dashChartLabel, color: m.current ? "#333B4A" : "#A7AEBB" }}>{m.label}</span>
        </div>
      ))}
    </div>
  );
}

function BookingRow({
  booking,
  onOpen,
  onOpenVehicle,
}: {
  booking: DashboardWeekBooking;
  onOpen: () => void;
  onOpenVehicle: () => void;
}): JSX.Element {
  const skin = BOOKING_STATUS[booking.status];
  return (
    <HoverRow onClick={onOpen}>
      <span
        style={P.dashPlate}
        title="Open this vehicle"
        onClick={(e) => {
          e.stopPropagation();
          onOpenVehicle();
        }}
      >
        {booking.vehicle_registration}
      </span>
      <div style={P.dashRowMain}>
        <div style={P.dashRowTitle}>{booking.hirer_name}</div>
        <div style={P.dashRowMeta}>
          {booking.vehicle_label} · {plural(booking.hire_days, "day")}
        </div>
      </div>
      <span style={{ ...P.dashPill, background: skin.tint, border: `1px solid ${skin.border}`, color: skin.text }}>
        <span style={{ ...P.dashPillDot, background: skin.core }} />
        {skin.label}
      </span>
      <span style={P.dashRowMoney}>
        <span style={P.dashRowKeep}>KES {money(booking.merchant_net.amount)}</span>
        <span style={P.dashRowGross}>of {money(booking.gross.amount)}</span>
      </span>
      <span style={P.dashChevron}>›</span>
    </HoverRow>
  );
}

function FleetRow({ vehicle, onOpen }: { vehicle: DashboardFleetVehicle; onOpen: () => void }): JSX.Element {
  const skin = STATUS[vehicle.status];
  return (
    <HoverRow onClick={onOpen}>
      <span style={P.dashPlate}>{vehicle.registration}</span>
      <div style={P.dashFleetMain}>
        <div style={P.dashFleetTitleLine}>
          <span style={P.dashFleetTitle}>{vehicle.title}</span>
          {vehicle.verification_badge === "active" && <span style={P.dashFleetBadge}>✓ VERIFIED</span>}
        </div>
        <div style={P.dashDocBands}>
          {vehicle.documents.map((doc) => (
            <span
              key={doc.kind}
              title={`${DOC_KIND_LABEL[doc.kind]} · ${DOC_STATE[doc.state].label}`}
              style={{ ...P.dashDocBand, background: DOC_STATE[doc.state].core }}
            />
          ))}
        </div>
      </div>
      <span style={{ ...P.dashPill, background: skin.tint, border: `1px solid ${skin.border}`, color: skin.text }}>
        <span style={{ ...P.dashPillDot, background: skin.core }} />
        {skin.label}
      </span>
      <span style={{ ...P.dashFleetRate, color: vehicle.daily_rate ? "#0B0F1A" : "#A7AEBB" }}>
        {vehicle.daily_rate ? `KES ${money(vehicle.daily_rate.amount)}` : "No rate yet"}
      </span>
      <span style={P.dashChevron}>›</span>
    </HoverRow>
  );
}

function PayoutLineRow({ line, pending }: { line: DashboardPayoutLine; pending: boolean }): JSX.Element {
  return (
    <div style={P.dashPayoutLine}>
      <span style={{ minWidth: 0 }}>
        <span style={{ ...P.dashPayoutPlate, color: pending ? "#5A6373" : "#0B0F1A" }}>
          {line.vehicle_registration}
        </span>
        <span style={P.dashPayoutMeta}>
          {line.hirer_name} · {plural(line.hire_days, "day")}
        </span>
      </span>
      <span style={{ ...P.dashPayoutAmount, color: pending ? "#A7AEBB" : "#0B0F1A" }}>
        {pending ? "Next run" : `KES ${money(line.net.amount)}`}
      </span>
    </div>
  );
}

function ActivityRow({ item, last }: { item: DashboardActivityItem; last: boolean }): JSX.Element {
  return (
    <div style={P.dashActivityRow}>
      <div style={P.dashActivityRail}>
        <span style={{ ...P.dashActivityDot, background: NOTIFICATION_KIND[item.kind].text }} />
        {!last && <span style={P.dashActivityLine} />}
      </div>
      <div style={P.dashActivityMain}>
        <div style={P.dashActivityLabel}>{item.title}</div>
        {item.body && <div style={P.dashActivityText}>{item.body}</div>}
        <div style={P.dashActivityWhen}>{formatStamp(item.occurred_at)}</div>
      </div>
    </div>
  );
}

function Skeleton(): JSX.Element {
  const bar = (width: number | string, height = 12): CSSProperties => ({
    ...P.skeletonBar,
    width,
    height,
    borderRadius: 4,
  });
  return (
    <div>
      <div style={P.dashHead}>
        <div>
          <div className="cral-shimmer" style={bar(260, 32)} />
          <div className="cral-shimmer" style={{ ...bar(420), marginTop: 10 }} />
        </div>
      </div>
      <div style={P.dashTileGrid}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={P.dashTile}>
            <div className="cral-shimmer" style={bar(110, 10)} />
            <div className="cral-shimmer" style={{ ...bar(130, 24), marginTop: 11 }} />
            <div className="cral-shimmer" style={{ ...bar(90, 10), marginTop: 12 }} />
          </div>
        ))}
      </div>
      <div style={P.dashCols}>
        <div style={P.dashColMain}>
          <div style={{ ...P.dashCard, height: 250 }} className="cral-shimmer" />
          <div style={{ ...P.dashCard, height: 220 }} className="cral-shimmer" />
        </div>
        <div style={P.dashColSide}>
          <div style={{ ...P.dashCard, height: 280 }} className="cral-shimmer" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------

export function Dashboard(): JSX.Element {
  usePageTitle("Dashboard");
  const navigate = useNavigate();
  const { data, isLoading } = useDashboard();

  if (isLoading || !data) return <Skeleton />;

  const { greeting, needs_action: needsAction, tiles, next_payout: payout } = data;
  const paid = tiles.paid_this_month;
  const previous = paid.previous_month_amount.amount;
  // A percentage needs both a base to divide by and something to compare.
  // Early in a month nothing has been paid yet, and "-100% vs August" would
  // be reporting the calendar, not a fall in earnings.
  const comparable = previous > 0 && paid.amount.amount > 0;
  const delta = comparable
    ? `${paid.amount.amount >= previous ? "+" : ""}${Math.round(((paid.amount.amount - previous) / previous) * 100)}%`
    : paid.run_count > 0
      ? plural(paid.run_count, "run")
      : "Nothing yet";

  return (
    <div>
      <div style={P.dashHead}>
        <div>
          <h1 style={P.dashH1}>{greeting.first_name ? `Karibu, ${greeting.first_name}` : "Karibu"}</h1>
          <p style={P.dashLede}>{subheading(data)}</p>
        </div>
        <div style={P.dashHeadBtns}>
          <button type="button" onClick={() => navigate("/vehicles")} style={P.dashGhostBtn}>
            Your vehicles
          </button>
          <button type="button" onClick={() => navigate("/vehicles/new")} style={P.dashPrimaryBtn}>
            Add a vehicle
          </button>
        </div>
      </div>

      {needsAction.vehicle_count > 0 && (
        <div style={{ ...P.banner, marginBottom: 16 }}>
          <span style={P.bannerDot} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={P.bannerTitle}>
              {plural(needsAction.vehicle_count, "vehicle")} need
              {needsAction.vehicle_count === 1 ? "s" : ""} something from you
            </div>
            <div style={P.bannerBody}>{needsActionBody(data)}</div>
          </div>
          <button
            type="button"
            style={P.bannerBtn}
            onClick={() =>
              // One vehicle goes straight to it; several go to the filter,
              // because there is no single vehicle to open.
              needsAction.vehicle_count === 1 && needsAction.vehicles[0]
                ? navigate(`/vehicles/${needsAction.vehicles[0].id}`)
                : navigate("/vehicles?filter=needs_action")
            }
          >
            {needsAction.vehicle_count === 1 ? "Open vehicle" : "Open vehicles"}
          </button>
        </div>
      )}

      <div style={P.dashTileGrid}>
        <Tile
          kicker="PAID OUT THIS MONTH"
          unit="KES"
          value={money(paid.amount.amount) === " - " ? "0" : money(paid.amount.amount)}
          delta={delta}
          deltaColor={comparable && paid.amount.amount >= previous ? "#076945" : "#333B4A"}
          note={previousMonthLabel(data)}
        />
        <Tile
          kicker="ON HIRE NOW"
          value={String(tiles.on_hire.count)}
          delta={`of ${tiles.on_hire.live_vehicle_count} live`}
          deltaColor="#333B4A"
          note={tiles.on_hire.live_vehicle_count === 1 ? "vehicle" : "vehicles"}
        />
        <Tile
          kicker="BOOKINGS THIS WEEK"
          value={String(tiles.week.booking_count)}
          delta={plural(tiles.week.hire_days, "hire day")}
          deltaColor="#333B4A"
          note={tiles.week.request_count > 0 ? `· ${plural(tiles.week.request_count, "request")} waiting` : ""}
        />
        <Tile
          kicker="AWAITING PAYOUT"
          unit="KES"
          value={
            money(tiles.awaiting_payout.amount.amount) === " - " ? "0" : money(tiles.awaiting_payout.amount.amount)
          }
          delta={tiles.awaiting_payout.date ? formatShortDay(tiles.awaiting_payout.date) : "Nothing waiting"}
          deltaColor="#0F23A8"
          note={tiles.awaiting_payout.hire_count > 0 ? plural(tiles.awaiting_payout.hire_count, "hire") : ""}
        />
      </div>

      <div style={P.dashCols}>
        <div style={P.dashColMain}>
          <Card>
            <div style={P.dashChartHead}>
              <div style={P.dashCardTitle}>What you kept</div>
              <span style={P.dashCardTag}>LAST {data.earnings.months} MONTHS · NET OF COMMISSION</span>
            </div>
            <EarningsChart earnings={data.earnings} />
          </Card>

          <Card>
            <div style={P.dashCardHead}>
              <span style={P.dashCardTitle}>Bookings this week</span>
              <span style={P.dashCardTag}>
                {plural(data.week_bookings.booking_count, "BOOKING").toUpperCase()} ·{" "}
                {plural(data.week_bookings.hire_days, "DAY").toUpperCase()}
              </span>
            </div>
            {data.week_bookings.bookings.length === 0 ? (
              <CardEmpty
                title="Nothing booked this week"
                body="Confirmed and running hires for the current week show up here."
              />
            ) : (
              data.week_bookings.bookings.map((booking) => (
                <BookingRow
                  key={booking.id}
                  booking={booking}
                  onOpen={() => navigate(`/bookings/${booking.id}`)}
                  onOpenVehicle={() => navigate(`/vehicles/${booking.vehicle_id}`)}
                />
              ))
            )}
          </Card>

          <Card>
            <div style={P.dashCardHead}>
              <span style={P.dashCardTitle}>Your fleet</span>
              <span style={P.dashCardTag}>
                {plural(data.fleet.vehicle_count, "VEHICLE").toUpperCase()}
                {data.fleet.outstanding_document_count > 0 &&
                  ` · ${plural(data.fleet.outstanding_document_count, "DOCUMENT").toUpperCase()} OUTSTANDING`}
              </span>
            </div>
            {data.fleet.vehicles.length === 0 ? (
              <CardEmpty
                title="No vehicles yet"
                body="Add your first vehicle and it will appear here with its documents and status."
              />
            ) : (
              <>
                {data.fleet.vehicles.map((vehicle) => (
                  <FleetRow key={vehicle.id} vehicle={vehicle} onOpen={() => navigate(`/vehicles/${vehicle.id}`)} />
                ))}
                {data.fleet.vehicle_count > data.fleet.vehicles.length && (
                  <div style={P.dashCardFoot}>
                    <button type="button" onClick={() => navigate("/vehicles")} style={P.dashFootBtn}>
                      See all {plural(data.fleet.vehicle_count, "vehicle")}
                    </button>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>

        <div style={P.dashColSide}>
          <Card>
            <div style={P.dashPayoutHead}>
              <div style={P.dashPayoutTitle}>Next payout</div>
              <div style={P.dashPayoutSub}>
                {payout.date ? formatShortDay(payout.date) : "Nothing waiting to go out"}
                {payout.destination.detail !== "-" &&
                  ` · ${payout.destination.method === "bank" ? "Bank" : "M-Pesa"} ${payout.destination.detail}`}
              </div>
            </div>
            {payout.lines.length === 0 && payout.clearing.length === 0 ? (
              <CardEmpty
                title="Nothing waiting"
                body="A hire is added here once it finishes and clears. Nothing has reached that point yet."
              />
            ) : (
              <>
                <div style={P.dashPayoutBody}>
                  {payout.lines.map((line) => (
                    <PayoutLineRow key={line.booking_id} line={line} pending={false} />
                  ))}
                  {payout.clearing.map((line) => (
                    <PayoutLineRow key={line.booking_id} line={line} pending />
                  ))}
                  {payout.lines.length > 0 && (
                    <div style={P.dashPayoutComm}>
                      <span>CRAL commission</span>
                      <span style={P.dashPayoutCommVal}>− KES {money(payout.commission.amount)}</span>
                    </div>
                  )}
                </div>
                <div style={P.dashPayoutTotal}>
                  <span style={P.dashPayoutTotalKey}>You keep</span>
                  <span style={P.dashPayoutTotalVal}>
                    <span style={P.dashPayoutTotalUnit}>KES </span>
                    {money(payout.net.amount) === " - " ? "0" : money(payout.net.amount)}
                  </span>
                </div>
              </>
            )}
            <div style={P.dashPayoutFoot}>
              <span style={P.dashPayoutFootDot} />
              <span style={P.dashPayoutFootText}>Each hire clears 24 hours after you receive the vehicle</span>
            </div>
          </Card>

          {data.expiring && (
            <div style={P.dashExpiryCard}>
              <div style={P.dashExpiryBar} />
              <div style={P.dashExpiryBody}>
                <div style={P.dashExpiryKickerRow}>
                  <span style={P.dashExpiryRule} />
                  <span style={P.dashExpiryKicker}>
                    EXPIRES IN {plural(daysUntil(data.expiring.expires_on, greeting.today), "DAY").toUpperCase()}
                  </span>
                </div>
                <div style={P.dashExpiryTitle}>{data.expiring.registration} insurance</div>
                <p style={P.dashExpiryText}>
                  Cover lapses {formatLongDay(data.expiring.expires_on).replace(/^\w+ /, "")}. Upload the renewal
                  before then and the listing keeps taking bookings without a break.
                </p>
                <button
                  type="button"
                  onClick={() => navigate(`/vehicles/${data.expiring!.vehicle_id}`)}
                  style={P.dashExpiryBtn}
                >
                  Upload renewal
                </button>
              </div>
            </div>
          )}

          <Card>
            <div style={P.dashActivityHead}>Recent activity</div>
            {data.activity.length === 0 ? (
              <CardEmpty
                title="Nothing yet"
                body="Pickups, payouts, ratings and reviewer notes all land here as they happen."
              />
            ) : (
              <div style={P.dashActivityBody}>
                {data.activity.map((item, i) => (
                  <ActivityRow key={item.id} item={item} last={i === data.activity.length - 1} />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
