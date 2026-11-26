import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getGroupCounties, type CatalogSearchParams } from "../../lib/catalog-api.js";
import { COUNTIES } from "../../lib/kenya.js";
import { TRUCK_TYPES } from "../../lib/vehicle-categories.js";
import { routeQuery } from "../../lib/truck-route.js";
import { tonnesToKg } from "../site/TruckRouteFields.js";
import { Dropdown, PIN_ICON, type DropdownOption } from "../site/Dropdown.js";
import { ChoiceRow } from "../site/Popover.js";
import { HireListingLayout } from "./HireListingLayout.js";
import { FilterSheet, SheetGroup } from "./FilterSheet.js";
import { tagsFor, useHireParams } from "./hire-params.js";

/**
 * `/hire?type=trucks` - "Trucks on hire" (PR H4; was H3's
 * `/trucks/search`). FROM is the page-wide `county`, so it survives a
 * change of type; it goes onto `/trucks/:id` as `from_county`.
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
const ALL_KEYS = ["county", "tonnes", ...SHEET_KEYS] as const;

export function TruckResults(): JSX.Element {
  const navigate = useNavigate();
  const { params, get, set, clear, sort, type, changeType } = useHireParams();

  const fromCounty = get("county");
  const toCounty = (COUNTIES as readonly string[]).includes(get("to_county"))
    ? get("to_county")
    : "";
  const tonnes = get("tonnes");
  const truckType = TYPE_OPTIONS.some((o) => o.value === get("truck_type"))
    ? get("truck_type")
    : "";
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

  // The request form reads the route as `from_county`, not `county`.
  const route = new URLSearchParams(params);
  if (fromCounty) route.set("from_county", fromCounty);
  const carry = routeQuery(route);

  return (
    <HireListingLayout
      type={type}
      onType={changeType}
      lede={
        fromCounty && toCounty
          ? `For a load from ${fromCounty} to ${toCounty}. Open a truck to send the route and ask for a price.`
          : "Every truck is checked by a person before it is listed. Open one to send the route and ask for a price."
      }
      emptyHint="Clear the truck type, try a smaller load, or a nearby county."
      query={query}
      sort={sort}
      onSort={(v) => set({ sort: v || undefined })}
      tags={tags}
      onClearAll={() => clear(ALL_KEYS)}
      onOpen={(truck) =>
        navigate(`/trucks/${truck.id}${carry}`, { state: { hireSearch: params.toString() } })
      }
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
            onChange={(v) => set({ county: v || undefined })}
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
            <SheetGroup
              heading="PRICE"
              hint="By quote: the owner names a price after reading your route and load."
            >
              <ChoiceRow
                name="Price"
                value={priced}
                options={PRICED_OPTIONS}
                onChange={(v) => set({ priced: v || undefined })}
              />
            </SheetGroup>
          </FilterSheet>
        </>
      }
    />
  );
}
