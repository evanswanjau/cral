import { useNavigate } from "react-router-dom";
import { P } from "../portal/styles.js";
import { DOC_STATE, STATUS, money } from "../portal/status.js";
import { Card, CardEmpty, HoverRow, plural } from "./DashboardParts.js";
import { useOffering } from "../../lib/use-offering.js";
import { listingRate, useVehicleList, type VehicleSummary } from "../../lib/vehicles-api.js";
import type { Dashboard as DashboardData, DashboardFleetVehicle } from "../../lib/dashboard-api.js";

/**
 * The dashboard's header buttons and "Your fleet" card, by what the
 * merchant offers (`components/portal/nav-sections.ts`): a driver-only
 * merchant gets "Your drivers / Add a driver"; an all-truck fleet reads
 * "Your trucks / Add a truck".
 *
 * Not from a canvas for the by-offering variants; built from tokens.ts and
 * docs/plans/ui-services-proposal.md sections 4.6 and 5.7.
 */

const DOC_KIND_LABEL: Record<DashboardFleetVehicle["documents"][number]["kind"], string> = {
  logbook: "Logbook",
  comprehensive_insurance: "Comprehensive insurance",
  tracker_certificate: "Tracker certificate",
};

export function HeadButtons(): JSX.Element {
  const navigate = useNavigate();
  const { driverOnly, fleet } = useOffering();
  const [base, one, many] = driverOnly ? ["/drivers", "driver", "drivers"] : ["/vehicles", fleet.one, fleet.many];
  return (
    <>
      <button type="button" onClick={() => navigate(base)} style={P.dashGhostBtn}>
        Your {many}
      </button>
      <button type="button" onClick={() => navigate(`${base}/new`)} style={P.dashPrimaryBtn}>
        Add a {one}
      </button>
    </>
  );
}

/**
 * The rate a fleet row shows, in the unit the listing is priced on. The
 * dashboard payload carries only day and trip rates, so the full listing
 * (already cached by the portal shell's vehicle list) is used when it has
 * this vehicle; a km, tonne or hour listing never shows its day rate.
 */
function rateLabel(vehicle: DashboardFleetVehicle, summary: VehicleSummary | undefined): string | null {
  if (summary) {
    const { rate, per } = listingRate(summary);
    return rate ? `KES ${money(rate.amount)} / ${per}` : null;
  }
  if (vehicle.hiring_unit === "trip") return vehicle.trip_rate ? `KES ${money(vehicle.trip_rate.amount)} / trip` : null;
  if (vehicle.hiring_unit === "day") return vehicle.daily_rate ? `KES ${money(vehicle.daily_rate.amount)} / day` : null;
  return null;
}

function FleetRow({
  vehicle,
  summary,
  onOpen,
}: {
  vehicle: DashboardFleetVehicle;
  summary: VehicleSummary | undefined;
  onOpen: () => void;
}): JSX.Element {
  const skin = STATUS[vehicle.status];
  const rate = rateLabel(vehicle, summary);
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
      <span style={{ ...P.dashFleetRate, color: rate ? "#0B0F1A" : "#A7AEBB" }}>{rate ?? "No rate yet"}</span>
      <span style={P.dashChevron}>›</span>
    </HoverRow>
  );
}

export function FleetCard({ fleet: data }: { fleet: DashboardData["fleet"] }): JSX.Element {
  const navigate = useNavigate();
  const { driverOnly, fleet } = useOffering();
  const { data: list } = useVehicleList("all");

  if (driverOnly) {
    return (
      <Card>
        <div style={P.dashCardHead}>
          <span style={P.dashCardTitle}>Your drivers</span>
        </div>
        <CardEmpty
          title="Your drivers are on the Drivers page"
          body="Add yourself or the drivers who work for you, with their licence, ID and KRA PIN. Each one can be booked once we've checked their papers."
        />
        <div style={P.dashCardFoot}>
          <button type="button" onClick={() => navigate("/drivers")} style={P.dashFootBtn}>
            Open drivers
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div style={P.dashCardHead}>
        <span style={P.dashCardTitle}>Your fleet</span>
        <span style={P.dashCardTag}>
          {plural(data.vehicle_count, fleet.one, fleet.many).toUpperCase()}
          {data.outstanding_document_count > 0 &&
            ` · ${plural(data.outstanding_document_count, "DOCUMENT").toUpperCase()} OUTSTANDING`}
        </span>
      </div>
      {data.vehicles.length === 0 ? (
        <CardEmpty
          title={`No ${fleet.many} yet`}
          body={`Add your first ${fleet.one} and it will appear here with its documents and status.`}
        />
      ) : (
        <>
          {data.vehicles.map((vehicle) => (
            <FleetRow
              key={vehicle.id}
              vehicle={vehicle}
              summary={list?.data.find((v) => v.id === vehicle.id)}
              onOpen={() => navigate(`/vehicles/${vehicle.id}`)}
            />
          ))}
          {data.vehicle_count > data.vehicles.length && (
            <div style={P.dashCardFoot}>
              <button type="button" onClick={() => navigate("/vehicles")} style={P.dashFootBtn}>
                See all {plural(data.vehicle_count, fleet.one, fleet.many)}
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
