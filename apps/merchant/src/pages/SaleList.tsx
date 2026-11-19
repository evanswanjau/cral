import { useNavigate } from "react-router-dom";
import { P } from "../components/portal/styles.js";
import { SALE_STATUS } from "../components/portal/status.js";
import { fmtKes, MIN_SALE_PHOTOS, useSaleListingList, type SaleListing } from "../lib/sales-api.js";
import { usePageTitle } from "../lib/use-page-title.js";

/**
 * "Cars for sale" (Phase 6 CS1, docs/decisions/car-sales.md). Not from a
 * canvas; built from tokens.ts and the portal's list idiom (PremisesList).
 */

function Row({ l, onOpen }: { l: SaleListing; onOpen: () => void }): JSX.Element {
  const meta = SALE_STATUS[l.status];
  return (
    <div
      className="m-trow"
      style={{ ...P.row, gridTemplateColumns: "minmax(0,2fr) 150px 90px 150px 130px 20px" }}
      onClick={onOpen}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFBFC")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div style={P.rowTitleWrap}>
        <div style={P.rowTitleLine}>
          <span style={P.rowTitle}>{l.year} {l.make} {l.model}</span>
        </div>
        <div style={P.rowMeta}>{l.county} · {l.mileage_km.toLocaleString("en-KE")} km</div>
      </div>
      <span style={{ ...P.statusTag, background: meta.tint, border: `1px solid ${meta.border}`, color: meta.text }}>
        <span style={{ ...P.statusDot, background: meta.core }} />
        {meta.label}
      </span>
      <span style={{ ...P.docsLabel, color: l.photos.length >= MIN_SALE_PHOTOS ? "#5A6373" : "#8A5200" }}>
        {l.photos.length} {l.photos.length === 1 ? "photo" : "photos"}
      </span>
      <span style={{ ...P.rateLabel, textAlign: "left", color: "#0B0F1A" }}>{fmtKes(l.asking_price)}</span>
      <span style={P.dateLabel}>{l.ref}</span>
      <span style={P.chevron}>›</span>
    </div>
  );
}

export function SaleList(): JSX.Element {
  usePageTitle("Cars for sale");
  const navigate = useNavigate();
  const { data, isPending } = useSaleListingList();

  return (
    <div>
      <div style={P.listHead}>
        <div>
          <h1 style={P.h1}>Cars for sale</h1>
          <p style={P.lede}>
            Cars you're selling. CRAL checks each listing and its logbook before it goes up. Buyers and you agree the
            price and pay each other directly. Listing is free.
          </p>
        </div>
        <button type="button" style={P.addButton} onClick={() => navigate("/sales/new")}>
          List a car
        </button>
      </div>

      <div style={P.table}>
        {isPending || !data ? (
          <div style={{ ...P.emptyWrap, color: "#838C9B" }}>Loading…</div>
        ) : data.data.length === 0 ? (
          <div style={P.emptyWrap}>
            <div style={P.emptyTitle}>No cars listed yet</div>
            <p style={P.emptyBody}>
              Add the car's details, at least {MIN_SALE_PHOTOS} photos and the logbook, then send it to CRAL.
            </p>
            <button type="button" style={P.addButton} onClick={() => navigate("/sales/new")}>
              List a car
            </button>
          </div>
        ) : (
          <>
            {data.data.map((l) => (
              <Row key={l.id} l={l} onOpen={() => navigate(`/sales/${l.id}`)} />
            ))}
            <div style={P.tableFooter}>
              <span style={P.tableFooterLeft}>
                {data.counts.all} LISTED · {data.counts.live} FOR SALE
              </span>
              <span style={P.tableFooterRight}>Never pay or take a deposit to hold a car before a viewing.</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
