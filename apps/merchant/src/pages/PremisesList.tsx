import { useNavigate } from "react-router-dom";
import { P } from "../components/portal/styles.js";
import { STATUS } from "../components/portal/status.js";
import { MIN_PHOTOS, SERVICE_LABELS, useOutletList, type Outlet } from "../lib/outlets-api.js";
import { usePageTitle } from "../lib/use-page-title.js";

/**
 * "Your premises" (Phase 4 GS1, docs/decisions/garage.md). Not from a
 * canvas; built from tokens.ts and the portal's list idiom (DriverList).
 */

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
}

function Row({ o, onOpen }: { o: Outlet; onOpen: () => void }): JSX.Element {
  const meta = STATUS[o.status];
  const services = o.kind === "parts" ? "Spare parts" : o.service_types.map((t) => SERVICE_LABELS[t]).join(", ");
  return (
    <div
      className="m-trow"
      style={{ ...P.row, gridTemplateColumns: "minmax(0,2fr) 150px 90px minmax(0,1.4fr) 130px 20px" }}
      onClick={onOpen}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFBFC")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div style={P.rowTitleWrap}>
        <div style={P.rowTitleLine}>
          <span style={P.rowTitle}>{o.name}</span>
        </div>
        <div style={P.rowMeta}>{o.county} · {o.address}</div>
      </div>
      <span style={{ ...P.statusTag, background: meta.tint, border: `1px solid ${meta.border}`, color: meta.text }}>
        <span style={{ ...P.statusDot, background: meta.core }} />
        {meta.label}
      </span>
      <span style={{ ...P.docsLabel, color: o.photos.length >= MIN_PHOTOS ? "#5A6373" : "#8A5200" }}>
        {o.photos.length} {o.photos.length === 1 ? "photo" : "photos"}
      </span>
      <span style={{ ...P.rateLabel, textAlign: "left", color: "#0B0F1A" }}>{services || "No services ticked"}</span>
      {/* Only a visit CRAL recorded shows here. */}
      <span style={P.dateLabel}>{o.visited && o.visited_on ? `VISITED ${fmtDate(o.visited_on)}` : "NOT VISITED YET"}</span>
      <span style={P.chevron}>›</span>
    </div>
  );
}

export function PremisesList(): JSX.Element {
  usePageTitle("Your premises");
  const navigate = useNavigate();
  const { data, isPending } = useOutletList();

  return (
    <div>
      <div style={P.listHead}>
        <div>
          <h1 style={P.h1}>Your premises</h1>
          <p style={P.lede}>
            Where you fix cars. Someone from CRAL visits each address before it can take requests, so customers know the
            garage is real.
          </p>
        </div>
        <button type="button" style={P.addButton} onClick={() => navigate("/premises/new")}>
          Add premises
        </button>
      </div>

      <div style={P.table}>
        {isPending || !data ? (
          <div style={{ ...P.emptyWrap, color: "#838C9B" }}>Loading…</div>
        ) : data.data.length === 0 ? (
          <div style={P.emptyWrap}>
            <div style={P.emptyTitle}>No premises yet</div>
            <p style={P.emptyBody}>
              Add your garage: its name, address, opening hours, the services you do and at least {MIN_PHOTOS} photos.
              Have more than one branch? Add each one.
            </p>
            <button type="button" style={P.addButton} onClick={() => navigate("/premises/new")}>
              Add premises
            </button>
          </div>
        ) : (
          <>
            {data.data.map((o) => (
              <Row key={o.id} o={o} onOpen={() => navigate(`/premises/${o.id}`)} />
            ))}
            <div style={P.tableFooter}>
              <span style={P.tableFooterLeft}>
                {data.counts.all} PREMISES · {data.counts.live} APPROVED
              </span>
              <span style={P.tableFooterRight}>We arrange the visit with you after you send the premises.</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
