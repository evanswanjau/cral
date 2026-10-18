import { useNavigate } from "react-router-dom";
import { P } from "../components/portal/styles.js";
import { STATUS } from "../components/portal/status.js";
import { driverRateLine, useDriverList, type Driver } from "../lib/drivers-api.js";
import { usePageTitle } from "../lib/use-page-title.js";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
}

function Row({ d, onOpen }: { d: Driver; onOpen: () => void }): JSX.Element {
  const meta = STATUS[d.status];
  return (
    <div
      className="m-trow"
      style={{ ...P.row, gridTemplateColumns: "minmax(0,2fr) 150px 90px minmax(0,1.4fr) 120px 20px" }}
      onClick={onOpen}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFBFC")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div style={P.rowTitleWrap}>
        <div style={P.rowTitleLine}>
          <span style={P.rowTitle}>{d.full_name}</span>
          {d.is_account_holder && <span style={{ ...P.verifiedTag, color: "#0F23A8", background: "#EDEFFC", borderColor: "#C3CBF5" }}>YOU</span>}
        </div>
        <div style={P.rowMeta}>{d.county} · Licence {d.licence_number}</div>
      </div>
      <span style={{ ...P.statusTag, background: meta.tint, border: `1px solid ${meta.border}`, color: meta.text }}>
        <span style={{ ...P.statusDot, background: meta.core }} />
        {meta.label}
      </span>
      <span style={{ ...P.docsLabel, color: d.doc_count === 3 ? "#5A6373" : "#8A5200" }}>{d.doc_count}/3 docs</span>
      <span style={{ ...P.rateLabel, textAlign: "left", color: "#0B0F1A" }}>{driverRateLine(d) || "No rate yet"}</span>
      <span style={{ ...P.dateLabel, color: d.licence_expired ? "#A50E22" : undefined }}>
        {d.licence_expired ? "LICENCE EXPIRED" : `TO ${fmtDate(d.licence_expiry)}`}
      </span>
      <span style={P.chevron}>›</span>
    </div>
  );
}

/** Drivers a merchant lists for hire (owner's call, 2026-10-18). Built from portal tokens - no canvas. */
export function DriverList(): JSX.Element {
  usePageTitle("Your drivers");
  const navigate = useNavigate();
  const { data, isPending } = useDriverList();

  return (
    <div>
      <div style={P.listHead}>
        <div>
          <h1 style={P.h1}>Your drivers</h1>
          <p style={P.lede}>
            Drivers hirers can book with one of your cars, or to drive their own. Each one is checked by our reviewers before they can be booked.
          </p>
        </div>
        <button type="button" style={P.addButton} onClick={() => navigate("/drivers/new")}>
          Add a driver
        </button>
      </div>

      <div style={P.table}>
        {isPending || !data ? (
          <div style={{ ...P.emptyWrap, color: "#838C9B" }}>Loading…</div>
        ) : data.data.length === 0 ? (
          <div style={P.emptyWrap}>
            <div style={P.emptyTitle}>No drivers yet</div>
            <p style={P.emptyBody}>Add yourself or someone who drives for you. You need their licence, national ID and KRA PIN.</p>
            <button type="button" style={P.addButton} onClick={() => navigate("/drivers/new")}>
              Add a driver
            </button>
          </div>
        ) : (
          <>
            {data.data.map((d) => (
              <Row key={d.id} d={d} onOpen={() => navigate(`/drivers/${d.id}`)} />
            ))}
            <div style={P.tableFooter}>
              <span style={P.tableFooterLeft}>
                {data.counts.all} {data.counts.all === 1 ? "DRIVER" : "DRIVERS"} · {data.counts.live} LIVE
              </span>
              <span style={P.tableFooterRight}>Reviews take up to two working days.</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
