import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { searchCatalog } from "../../lib/catalog-api.js";
import { VehicleCard, CARD_TINTS } from "../site/VehicleCard.js";
import { Section } from "../subsite/Section.js";

/**
 * The `/trucks` landing's rail: live truck listings from the catalog
 * search (`category=truck`), in the catalog's
 * own "recommended" order. Each card opens `/trucks/:id`; "See all
 * trucks" opens `/trucks/search`.
 *
 * Titled "Trucks on CRAL", not "near you": the site doesn't know where the
 * visitor is, and a rail that claims to would be a guess dressed as a
 * fact. Hidden entirely when nothing is listed.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md sections 4.3 and 5.3.
 */
export function TruckRail(): JSX.Element | null {
  const navigate = useNavigate();
  const { data, isError } = useQuery({
    queryKey: ["catalog", "search", { category: "truck", limit: 8, sort: "recommended" }],
    queryFn: () => searchCatalog({ category: "truck", limit: 8, sort: "recommended" }),
  });
  const trucks = data?.data ?? [];
  if (isError || trucks.length === 0) return null;

  return (
    <Section overline="TRUCKS ON CRAL" heading="Trucks you can ask for today.">
      <div className="cral-rail" style={{ display: "flex", gap: 14, overflowX: "auto", padding: "2px 0 8px" }}>
        {trucks.map((car, i) => (
          <VehicleCard
            key={car.id}
            car={car}
            tint={CARD_TINTS[i % CARD_TINTS.length] as string}
            onOpen={() => navigate(`/trucks/${car.id}`)}
            width={262}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4 }}>
        <button
          type="button"
          onClick={() => navigate("/trucks/search")}
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
          See all trucks
        </button>
      </div>
    </Section>
  );
}
