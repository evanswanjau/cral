import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { searchCatalog } from "../../lib/catalog-api.js";
import { VehicleCard, CARD_TINTS } from "../site/VehicleCard.js";
import { Section } from "../subsite/Section.js";

/**
 * The `/machinery` landing's rail (UI2b): live machinery listings from the
 * catalog search (`category=machinery`), in the catalog's own
 * "recommended" order. Each card opens `/machinery/:id`; "See all
 * machinery" opens `/machinery/search`. Hidden when nothing is listed.
 * Same shape as `TruckRail`.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md section 4.3 (Machinery column).
 */
export function MachineryRail(): JSX.Element | null {
  const navigate = useNavigate();
  const { data, isError } = useQuery({
    queryKey: ["catalog", "search", { category: "machinery", limit: 8, sort: "recommended" }],
    queryFn: () => searchCatalog({ category: "machinery", limit: 8, sort: "recommended" }),
  });
  const items = data?.data ?? [];
  if (isError || items.length === 0) return null;

  return (
    <Section overline="MACHINERY ON CRAL" heading="Machinery you can hire today.">
      <div className="cral-rail" style={{ display: "flex", gap: 14, overflowX: "auto", padding: "2px 0 8px" }}>
        {items.map((car, i) => (
          <VehicleCard
            key={car.id}
            car={car}
            tint={CARD_TINTS[i % CARD_TINTS.length] as string}
            onOpen={() => navigate(`/machinery/${car.id}`)}
            width={262}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4 }}>
        <button
          type="button"
          onClick={() => navigate("/machinery/search")}
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
          See all machinery
        </button>
      </div>
    </Section>
  );
}
