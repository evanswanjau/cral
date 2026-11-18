import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSeo } from "../../lib/use-seo.js";
import { searchCatalog, type CatalogSearchParams } from "../../lib/catalog-api.js";
import { COUNTIES } from "../../lib/kenya.js";
import { TRUCK_TYPES } from "../../lib/vehicle-categories.js";
import { routeQuery } from "../../lib/truck-route.js";
import { tonnesToKg } from "../../components/site/TruckRouteFields.js";
import { VehicleCard, CARD_TINTS } from "../../components/site/VehicleCard.js";
import { Dropdown, PIN_ICON, type DropdownOption } from "../../components/site/Dropdown.js";
import { VehicleCardSkeletonGrid } from "../../components/site/Skeleton.js";

/**
 * `/trucks/search` (UI2a): the catalog search locked to trucks. The
 * filters are the truck job's own - from county, to county, load, truck
 * type - not seats, gearbox or "with driver". All of them live in the
 * querystring, so the page is shareable and the back button returns here.
 *
 * FROM filters the catalog on the truck's county and LOAD on what it
 * carries (`payload_min_kg`). TO filters nothing - CRAL doesn't route
 * trucks - but it travels with the click onto `/trucks/:id`, together
 * with FROM and LOAD, so the request form starts filled in.
 *
 * Each card shows its rate per unit (trip, day, km, tonne) as VehicleCard
 * always has; a km or tonne rate is the owner's guide, and the truck page
 * says so.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md sections 4.3 and 5.3.
 */

const COUNTY_OPTIONS: DropdownOption[] = [
  { value: "", label: "Any county" },
  ...COUNTIES.map((c) => ({ value: c, label: c })),
];

const TYPE_OPTIONS: DropdownOption[] = [
  { value: "", label: "Any truck" },
  ...TRUCK_TYPES.map((t) => ({ value: t.value, label: t.label })),
];

const LOADS = ["1", "3", "5", "8", "10", "15", "20", "30"];

const SORT_OPTIONS: DropdownOption[] = [
  { value: "recommended", label: "Recommended" },
  { value: "price_asc", label: "Price, low to high" },
  { value: "price_desc", label: "Price, high to low" },
  { value: "rating_desc", label: "Best-rated owners" },
];

export function TrucksSearch(): JSX.Element {
  useSeo({
    title: "Find a truck",
    description:
      "Tippers, flatbeds, box bodies and more from owners CRAL has checked. Filter by county and load, then ask the owner for a price.",
    path: "/trucks/search",
  });
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const fromCounty = params.get("from_county") ?? "";
  const toCounty = params.get("to_county") ?? "";
  const tonnes = params.get("tonnes") ?? "";
  const truckType = params.get("truck_type") ?? "";
  const sort = (params.get("sort") as CatalogSearchParams["sort"]) ?? "recommended";
  const loadKg = tonnesToKg(tonnes);

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  // A load typed on `/trucks` ("8.5") joins the list so the pill can show it.
  const loads: string[] = loadKg && !LOADS.includes(tonnes) ? [tonnes, ...LOADS] : LOADS;
  const loadOptions: DropdownOption[] = [
    { value: "", label: "Any load" },
    ...loads.map((t) => ({ value: t, label: `${t} t or more` })),
  ];

  const query = useMemo<CatalogSearchParams>(() => {
    const q: CatalogSearchParams = { category: "truck", sort, limit: 24 };
    if (fromCounty) q.county = fromCounty;
    if (truckType) q.truck_type = truckType;
    if (loadKg) q.payload_min_kg = loadKg;
    return q;
  }, [fromCounty, truckType, loadKg, sort]);

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["catalog", "search", query],
    queryFn: ({ pageParam }) => searchCatalog(pageParam ? { ...query, cursor: pageParam } : query),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.has_more ? (last.next_cursor ?? undefined) : undefined),
  });
  const results = data?.pages.flatMap((p) => p.data) ?? [];
  const carry = routeQuery(params);

  return (
    <div style={{ padding: "clamp(18px,2.6vw,30px) clamp(16px,3vw,32px) clamp(40px,6vw,72px)" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <h1
          style={{
            margin: "0 0 6px",
            font: "700 clamp(22px,2.8vw,30px)/1.1 Archivo,sans-serif",
            fontVariationSettings: "'wdth' 108",
            letterSpacing: "-.025em",
            color: "#0B0F1A",
          }}
        >
          {fromCounty ? `Trucks in ${fromCounty}` : "Trucks across Kenya"}
        </h1>
        <p style={{ margin: "0 0 16px", font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
          {toCounty && fromCounty
            ? `For a load from ${fromCounty} to ${toCounty}. Open a truck to send the route and ask for a price.`
            : "Every truck here is reviewed by CRAL before it's listed. Open one to send the route and ask for a price."}
        </p>

        <div
          className="cral-filterbar"
          style={{
            background: "#FFFFFF",
            border: "1px solid #E4E7EC",
            borderRadius: 16,
            padding: "9px 12px",
            marginBottom: 18,
            boxShadow: "0 8px 22px rgba(11,15,26,.05)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <Dropdown
            variant="pill"
            label="From"
            icon={PIN_ICON}
            value={fromCounty}
            placeholder="Any county"
            options={COUNTY_OPTIONS}
            onChange={(v) => set({ from_county: v || undefined })}
          />
          <Dropdown
            variant="pill"
            label="To"
            icon={PIN_ICON}
            value={toCounty}
            placeholder="Any county"
            options={COUNTY_OPTIONS}
            onChange={(v) => set({ to_county: v || undefined })}
          />
          <Dropdown
            variant="pill"
            label="Load"
            value={loadKg ? tonnes : ""}
            placeholder="Any load"
            options={loadOptions}
            onChange={(v) => set({ tonnes: v || undefined })}
          />
          <Dropdown
            variant="pill"
            label="Truck type"
            value={truckType}
            placeholder="Any truck"
            options={TYPE_OPTIONS}
            onChange={(v) => set({ truck_type: v || undefined })}
          />
          <div style={{ marginLeft: "auto" }}>
            <Dropdown
              variant="pill"
              label="Sort"
              value={sort}
              neutralValue="recommended"
              placeholder="Recommended"
              options={SORT_OPTIONS}
              onChange={(v) => set({ sort: v === "recommended" ? undefined : v })}
            />
          </div>
        </div>

        {isError && (
          <p style={{ margin: "0 0 18px", font: "400 14px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
            We couldn't load the trucks just now. Refresh in a moment.
          </p>
        )}

        {!isLoading && !isError && results.length === 0 && (
          <div
            style={{
              background: "#FFFFFF",
              border: "1px dashed #CDD2DA",
              borderRadius: 12,
              padding: "44px 24px",
              textAlign: "center",
            }}
          >
            <div style={{ font: "600 17px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 8 }}>
              No truck matches all of that yet.
            </div>
            <p style={{ margin: "0 0 18px", font: "400 14px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
              Try another county, a smaller load or any truck type.
            </p>
            <button
              type="button"
              onClick={() => setParams(new URLSearchParams(toCounty ? `to_county=${encodeURIComponent(toCounty)}` : ""))}
              style={{
                height: 44,
                padding: "0 18px",
                background: "#0F23A8",
                color: "#FFFFFF",
                border: "none",
                borderRadius: 8,
                font: "600 14px/1 'Instrument Sans',sans-serif",
                cursor: "pointer",
              }}
            >
              Show every truck
            </button>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(244px,1fr))", gap: 14 }}>
          {results.map((car, i) => (
            <VehicleCard
              key={car.id}
              car={car}
              tint={CARD_TINTS[i % CARD_TINTS.length] as string}
              onOpen={() => navigate(`/trucks/${car.id}${carry}`, { state: { truckSearch: params.toString() } })}
            />
          ))}
          {isLoading && <VehicleCardSkeletonGrid count={8} />}
          {isFetchingNextPage && <VehicleCardSkeletonGrid count={4} />}
        </div>

        {hasNextPage && !isFetchingNextPage && (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 24 }}>
            <button
              type="button"
              onClick={() => void fetchNextPage()}
              style={{
                height: 44,
                padding: "0 22px",
                background: "#FFFFFF",
                color: "#0B0F1A",
                border: "1px solid #E4E7EC",
                borderRadius: 8,
                font: "600 14px/1 'Instrument Sans',sans-serif",
                cursor: "pointer",
              }}
            >
              Show more trucks
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
