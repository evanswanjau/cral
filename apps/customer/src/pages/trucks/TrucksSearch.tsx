import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "../../lib/use-seo.js";
import { getGroupCounties, type CatalogSearchParams } from "../../lib/catalog-api.js";
import { COUNTIES } from "../../lib/kenya.js";
import { TRUCK_TYPES } from "../../lib/vehicle-categories.js";
import { routeQuery } from "../../lib/truck-route.js";
import { tonnesToKg } from "../../components/site/TruckRouteFields.js";
import { Dropdown, PIN_ICON, type DropdownOption } from "../../components/site/Dropdown.js";
import { ChoiceRow } from "../../components/site/Popover.js";
import { HireListingLayout } from "../../components/hire/HireListingLayout.js";
import { FilterSheet, SheetGroup } from "../../components/hire/FilterSheet.js";
import { tagsFor, useHireParams } from "../../components/hire/hire-params.js";

/**
 * `/trucks/search` - "Trucks on hire" (PR H3; was UI2a's truck search).
 * Asks the catalog for `group=trucks`. The filters are the truck job's
 * own - from county, to county, load, truck type, fixed price or by
 * quote - never seats, gearbox or self-drive.
 *
 * FROM filters on the truck's county and LOAD on what it carries
 * (`payload_min_kg`). TO filters nothing - CRAL doesn't route trucks -
 * and the sheet says so; it travels with the click onto `/trucks/:id`,
 * with FROM and LOAD, so the request form starts filled in.
 *
 * Not from a canvas; built from tokens.ts and the H3 section of
 * docs/plans/hire-that-works.md.
 */

const TO_OPTIONS: DropdownOption[] = [
  { value: "", label: "Any county" },
  ...COUNTIES.map((c) => ({ value: c, label: c })),
];

const TYPE_OPTIONS: DropdownOption[] = [
  { value: "", label: "Any" },
  ...TRUCK_TYPES.map((t) => ({ value: t.value, label: t.label })),
];

const LOADS = ["1", "3", "5", "8", "10", "15", "20", "30"];

const PRICED_OPTIONS: DropdownOption[] = [
  { value: "", label: "Any" },
  { value: "fixed", label: "Fixed price" },
  { value: "quote", label: "By quote" },
];

const SHEET_KEYS = ["to_county", "truck_type", "priced"] as const;
const ALL_KEYS = ["from_county", "tonnes", ...SHEET_KEYS] as const;

export function TrucksSearch(): JSX.Element {
  useSeo({
    title: "Trucks on hire",
    description:
      "Tippers, flatbeds, box bodies and more from owners CRAL has checked. Filter by county and load, then ask the owner for a price.",
    path: "/trucks/search",
  });
  const navigate = useNavigate();
  const { params, get, set, clear, sort } = useHireParams();

  const fromCounty = get("from_county");
  const toCounty = (COUNTIES as readonly string[]).includes(get("to_county")) ? get("to_county") : "";
  const tonnes = get("tonnes");
  const truckType = TYPE_OPTIONS.some((o) => o.value === get("truck_type")) ? get("truck_type") : "";
  const priced = PRICED_OPTIONS.some((o) => o.value === get("priced")) ? get("priced") : "";
  const loadKg = tonnesToKg(tonnes);
  const validLoad = loadKg !== null && Number.isFinite(loadKg) ? loadKg : null;

  // Counties with a live truck in them.
  const { data: countyData } = useQuery({
    queryKey: ["catalog", "counties", "trucks"],
    queryFn: () => getGroupCounties("trucks"),
  });
  const fromOptions: DropdownOption[] = [
    { value: "", label: "Any county" },
    ...(countyData?.counties ?? []).map((c) => ({ value: c.county, label: c.county })),
  ];

  // A load typed on `/trucks` ("8.5") joins the list so the pill can show it.
  const loads = validLoad && !LOADS.includes(tonnes) ? [tonnes, ...LOADS] : LOADS;
  const loadOptions: DropdownOption[] = [
    { value: "", label: "Any load" },
    ...loads.map((t) => ({ value: t, label: `${t} t or more` })),
  ];

  const query = useMemo<CatalogSearchParams>(() => {
    const q: CatalogSearchParams = { group: "trucks", sort, limit: 24 };
    if (fromCounty) q.county = fromCounty;
    if (truckType) q.truck_type = truckType;
    if (validLoad) q.payload_min_kg = validLoad;
    if (priced === "fixed" || priced === "quote") q.priced = priced;
    return q;
  }, [fromCounty, truckType, validLoad, priced, sort]);

  const tags = tagsFor(
    [
      ["to_county", toCounty, TO_OPTIONS, "To "],
      ["truck_type", truckType, TYPE_OPTIONS],
      ["priced", priced, PRICED_OPTIONS],
    ],
    set,
  );

  const carry = routeQuery(params);

  return (
    <HireListingLayout
      group="trucks"
      title="Trucks on hire"
      lede={
        fromCounty && toCounty
          ? `For a load from ${fromCounty} to ${toCounty}. Open a truck to send the route and ask for a price.`
          : "Every truck is checked by a person before it is listed. Open one to send the route and ask for a price."
      }
      noun="trucks"
      emptyHint="Clear the truck type, try a smaller load, or a nearby county."
      query={query}
      sort={sort}
      onSort={(v) => set({ sort: v || undefined })}
      tags={tags}
      onClearAll={() => clear(ALL_KEYS)}
      onOpen={(truck) => navigate(`/trucks/${truck.id}${carry}`, { state: { truckSearch: params.toString() } })}
      bar={
        <>
          <Dropdown
            variant="pill"
            label="From"
            icon={PIN_ICON}
            value={fromCounty}
            placeholder="Any county"
            disabled={fromOptions.length <= 1}
            options={fromOptions}
            onChange={(v) => set({ from_county: v || undefined })}
          />
          <Dropdown
            variant="pill"
            label="Load"
            value={validLoad ? tonnes : ""}
            placeholder="Any load"
            options={loadOptions}
            onChange={(v) => set({ tonnes: v || undefined })}
          />
          <FilterSheet count={tags.length} onClear={() => clear(SHEET_KEYS)}>
            <SheetGroup
              heading="GOING TO"
              hint="Doesn't narrow the list: it goes with your request, so the owner can price the trip."
            >
              <Dropdown
                variant="pill"
                label="To"
                icon={PIN_ICON}
                value={toCounty}
                placeholder="Any county"
                options={TO_OPTIONS}
                onChange={(v) => set({ to_county: v || undefined })}
              />
            </SheetGroup>
            <SheetGroup heading="TRUCK TYPE">
              <ChoiceRow
                name="Truck type"
                value={truckType}
                options={TYPE_OPTIONS}
                onChange={(v) => set({ truck_type: v || undefined })}
              />
            </SheetGroup>
            <SheetGroup heading="PRICE" hint="By quote: the owner names a price after reading your route and load.">
              <ChoiceRow name="Price" value={priced} options={PRICED_OPTIONS} onChange={(v) => set({ priced: v || undefined })} />
            </SheetGroup>
          </FilterSheet>
        </>
      }
    />
  );
}
