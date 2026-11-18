import { useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { CatalogCollection } from "../../lib/catalog-api.js";
import { VehicleCard, CARD_TINTS } from "../site/VehicleCard.js";

/**
 * One collection rail (real data from GET /catalog/collections), moved
 * from the old home page to `/cars` in UI1b (proposal 1.1 H3, H4). "See
 * all" still goes to `/browse?collection=` until UI1c builds
 * `/cars/search`.
 *
 * The rail's own kicker carries no skewed bar: the `/cars` hero already
 * holds the page's one skewed rule.
 */
export function CarRail({ collection }: { collection: CatalogCollection }): JSX.Element {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => {
    ref.current?.scrollBy({ left: dir * 560, behavior: "smooth" });
  };
  return (
    <div style={{ padding: "clamp(14px,2.2vw,22px) 0" }}>
      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          padding: "0 clamp(16px,4vw,40px)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 15,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <div
            style={{
              font: "500 10px/1 'IBM Plex Mono',monospace",
              letterSpacing: ".12em",
              color: "#838C9B",
              marginBottom: 7,
            }}
          >
            {collection.kicker}
          </div>
          <h2
            style={{
              margin: "0 0 5px",
              font: "700 clamp(21px,2.8vw,30px)/1.1 Archivo,sans-serif",
              fontVariationSettings: "'wdth' 108",
              letterSpacing: "-.026em",
              color: "#0B0F1A",
            }}
          >
            {collection.title}
          </h2>
          <p style={{ margin: 0, font: "400 14.5px/1.5 'Instrument Sans',sans-serif", color: "#5A6373", maxWidth: 520 }}>
            {collection.sub}
          </p>
        </div>
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8 }}>
          {([-1, 1] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              aria-label={dir === -1 ? "Scroll left" : "Scroll right"}
              onClick={() => scroll(dir)}
              style={{
                width: 44,
                height: 44,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#FFFFFF",
                color: "#333B4A",
                border: "1px solid #E4E7EC",
                borderRadius: 8,
                font: "500 16px/1 'Instrument Sans',sans-serif",
                cursor: "pointer",
              }}
            >
              {dir === -1 ? "←" : "→"}
            </button>
          ))}
        </div>
      </div>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 clamp(16px,4vw,40px)" }}>
        <div ref={ref} className="cral-rail" style={{ display: "flex", gap: 14, overflowX: "auto", padding: "2px 0 8px" }}>
          {collection.vehicles.map((car, i) => (
            <VehicleCard
              key={car.id}
              car={car}
              tint={CARD_TINTS[i % CARD_TINTS.length] as string}
              onOpen={() => navigate(`/cars/${car.id}`)}
              width={262}
            />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4 }}>
          <button
            type="button"
            onClick={() => navigate(`/browse?collection=${collection.key}`)}
            style={{
              minHeight: 44,
              background: "none",
              border: "none",
              padding: 0,
              font: "600 13.5px/1.4 'Instrument Sans',sans-serif",
              color: "#0F23A8",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 4,
            }}
          >
            See all
          </button>
        </div>
      </div>
    </div>
  );
}

export function RailsMessage({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "32px clamp(16px,4vw,40px)" }}>
      <p style={{ margin: 0, font: "400 15px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>{children}</p>
    </div>
  );
}
