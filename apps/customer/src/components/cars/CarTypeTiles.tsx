import { useNavigate } from "react-router-dom";
import { formatMoney, type Money } from "../../lib/catalog-api.js";
import { Section } from "../subsite/Section.js";
import sedanPhoto from "../../assets/category-tiles/sedan.jpg";
import suvPhoto from "../../assets/category-tiles/suv.jpg";
import vanPhoto from "../../assets/category-tiles/van.jpg";

/**
 * The car-type tiles, moved from the old home page to `/cars` in UI1b
 * (proposal 1.1 H5-H7). Only the three car categories: trucks and
 * machinery are front-door doors of their own now (H8, H9). Until UI1c
 * each tile still goes to `/browse?category=`.
 *
 * Photos are freely licensed Wikimedia Commons shots of what this market
 * really hires (sedan: Corolla Fielder, CC0; SUV: Prado 150, CC0; van:
 * HiAce high-roof, public domain), cropped to the tile's 720x460 ratio.
 * Decorative category illustrations, tied to no listing.
 *
 * The "FROM <price> / DAY" tag is real: the lowest daily rate among the
 * cars already loaded for the rails, shown only when there is one.
 */
const TILES: Array<{ slug: string; label: string; note: string; photo: string }> = [
  { slug: "sedan", label: "Sedans & small cars", note: "City runs and airport hops", photo: sedanPhoto },
  { slug: "suv", label: "SUV, 4x4 & pickup", note: "Potholes, game parks, weekends away", photo: suvPhoto },
  { slug: "van", label: "Vans & minibuses", note: "Eight to fourteen people", photo: vanPhoto },
];

export function CarTypeTiles({ minPriceByCategory }: { minPriceByCategory: Map<string, Money> }): JSX.Element {
  const navigate = useNavigate();
  return (
    <Section overline="BY CAR TYPE" heading="What kind of car do you need?">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        {TILES.map((b) => {
          const minPrice = minPriceByCategory.get(b.slug);
          return (
            <button
              key={b.slug}
              type="button"
              onClick={() => navigate(`/browse?category=${b.slug}`)}
              style={{
                // A column so the photo pins to the top when the grid
                // stretches every tile to the tallest one.
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                width: "100%",
                textAlign: "left",
                padding: 0,
                background: "#FFFFFF",
                border: "1px solid #E4E7EC",
                borderRadius: 12,
                overflow: "hidden",
                cursor: "pointer",
              }}
            >
              <div style={{ flex: "none", height: 150, position: "relative", borderBottom: "1px solid #E4E7EC", background: "#E7EAEF" }}>
                <img
                  src={b.photo}
                  alt=""
                  loading="lazy"
                  style={{ display: "block", position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
              <div style={{ padding: "14px 15px 15px" }}>
                <div style={{ font: "600 15px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 5 }}>{b.label}</div>
                <div
                  style={{
                    font: "400 12.5px/1.45 'Instrument Sans',sans-serif",
                    color: "#5A6373",
                    marginBottom: minPrice ? 11 : 0,
                  }}
                >
                  {b.note}
                </div>
                {minPrice && (
                  <div style={{ font: "500 11px/1 'IBM Plex Mono',monospace", letterSpacing: ".06em", color: "#0F23A8" }}>
                    FROM {formatMoney(minPrice)} / DAY
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </Section>
  );
}
