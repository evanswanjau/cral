import { useNavigate } from "react-router-dom";
import { P } from "../components/portal/styles.js";
import { SALE_STATUS } from "../components/portal/status.js";
import { kesLine, useSaleList, type SaleListing } from "../lib/sales-api.js";
import { usePageTitle } from "../lib/use-page-title.js";

function Row({ l, onOpen }: { l: SaleListing; onOpen: () => void }): JSX.Element {
  const meta = SALE_STATUS[l.status];
  const photos = Object.values(l.documents.photos).filter(Boolean).length;
  return (
    <div
      className="m-trow"
      style={{ ...P.row, gridTemplateColumns: "minmax(0,2fr) 140px 110px minmax(0,1fr) 120px 20px" }}
      onClick={onOpen}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFBFC")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div style={P.rowTitleWrap}>
        <div style={P.rowTitleLine}>
          <span style={P.rowTitle}>{l.title}</span>
        </div>
        <div style={P.rowMeta}>
          {l.car.registration} · {l.car.mileage_km.toLocaleString("en-KE")} km · {l.county}
        </div>
      </div>
      <span style={{ ...P.statusTag, background: meta.tint, border: `1px solid ${meta.border}`, color: meta.text }}>
        <span style={{ ...P.statusDot, background: meta.core }} />
        {meta.label}
      </span>
      <span style={{ ...P.docsLabel, color: photos === 8 && l.documents.logbook ? "#5A6373" : "#8A5200" }}>
        {photos}/8 photos
      </span>
      <span style={{ ...P.rateLabel, textAlign: "left", color: "#0B0F1A" }}>{kesLine(l.asking_price)}</span>
      <span style={{ ...P.dateLabel, color: l.enquiries.new ? "#0F23A8" : undefined }}>
        {l.enquiries.new ? `${l.enquiries.new} NEW ${l.enquiries.new === 1 ? "ENQUIRY" : "ENQUIRIES"}` : l.ref ?? "NO REF YET"}
      </span>
      <span style={P.chevron}>›</span>
    </div>
  );
}

/**
 * Cars a merchant is selling (owner's call, 2026-10-19 - docs/plans/car-sales.md).
 * Built from portal tokens - the website canvas has the selling vertical's
 * promise, not a seller's screen.
 */
export function SaleList(): JSX.Element {
  usePageTitle("For sale");
  const navigate = useNavigate();
  const { data, isPending } = useSaleList();

  return (
    <div>
      <div style={P.listHead}>
        <div>
          <h1 style={P.h1}>For sale</h1>
          <p style={P.lede}>
            Cars you are selling. A reviewer reads the logbook against the photos before an advert goes live. Listing is free and CRAL takes no cut of the sale.
          </p>
        </div>
        <button type="button" style={P.addButton} onClick={() => navigate("/sales/new")}>
          Sell a car
        </button>
      </div>

      {data && !data.seller.cleared && data.seller.reason && (
        <div style={{ ...P.card, padding: "12px 16px", marginBottom: 16, borderColor: "#F5D9A3", background: "#FFF3DB", color: "#8A5200", font: "600 13px/1.4 'Instrument Sans',sans-serif" }}>
          {data.seller.reason} You can prepare listings now; they go live once that is done.
        </div>
      )}

      <div style={P.table}>
        {isPending || !data ? (
          <div style={{ ...P.emptyWrap, color: "#838C9B" }}>Loading…</div>
        ) : data.data.length === 0 ? (
          <div style={P.emptyWrap}>
            <div style={P.emptyTitle}>Nothing for sale yet</div>
            <p style={P.emptyBody}>
              List one of your fleet cars from its own page, or a car you have never hired out. You need the logbook and eight photos.
            </p>
            <button type="button" style={P.addButton} onClick={() => navigate("/sales/new")}>
              Sell a car
            </button>
          </div>
        ) : (
          <>
            {data.data.map((l) => (
              <Row key={l.id} l={l} onOpen={() => navigate(`/sales/${l.id}`)} />
            ))}
            <div style={P.tableFooter}>
              <span style={P.tableFooterLeft}>
                {data.counts.all} {data.counts.all === 1 ? "LISTING" : "LISTINGS"} · {data.counts.live} ON SALE
              </span>
              <span style={P.tableFooterRight}>Adverts run for 60 days, then renew in one tap.</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
