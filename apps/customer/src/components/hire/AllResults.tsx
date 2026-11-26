import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getCounties, type CatalogSearchParams } from "../../lib/catalog-api.js";
import { earliestPickupDay } from "../../lib/hire-dates.js";
import { listingBase } from "../../lib/vehicle-categories.js";
import { Dropdown, PIN_ICON, type DropdownOption } from "../site/Dropdown.js";
import { DatePill } from "../site/DatePill.js";
import { HireListingLayout } from "./HireListingLayout.js";
import { useHireParams } from "./hire-params.js";

/**
 * `/hire` with no type - "Vehicles on hire" (PR H4). Asks the catalog with
 * no `group`, which returns every live hire listing: cars, trucks and
 * machinery together, each card reading as its own type.
 *
 * Filters are the ones every type shares: county and dates. Dates narrow
 * to what is free on them, trucks included. No price ceiling and no price
 * sort here: a per-day car, a per-trip truck and a quote-first truck have
 * no one price to compare (`ALL_SORT_OPTIONS`); picking a type brings
 * them back.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/hire-search-first.md.
 */

const ALL_KEYS = ["county", "from", "to"] as const;

export function AllResults(): JSX.Element {
  const navigate = useNavigate();
  const { params, get, set, clear, sort, type, changeType } = useHireParams();
  const county = get("county");
  const from = get("from");
  const to = get("to");
  const minDay = earliestPickupDay();

  const { data: countyData } = useQuery({
    queryKey: ["catalog", "counties"],
    queryFn: getCounties,
  });
  const countyOptions: DropdownOption[] = [
    { value: "", label: "Any county" },
    ...(countyData?.counties ?? []).map((c) => ({ value: c.county, label: c.county })),
  ];

  const query = useMemo<CatalogSearchParams>(() => {
    const q: CatalogSearchParams = { sort, limit: 24 };
    if (county) q.county = county;
    // The catalog takes a window or nothing: `from` alone is a 422.
    if (from && to) {
      q.from = from;
      q.to = to;
    }
    return q;
  }, [county, from, to, sort]);

  return (
    <HireListingLayout
      type={type}
      onType={changeType}
      lede="Cars, trucks and machinery from owners CRAL has checked. Pick a type for its own filters."
      emptyHint="Try another county or other dates."
      query={query}
      sort={sort}
      onSort={(v) => set({ sort: v || undefined })}
      tags={[]}
      onClearAll={() => clear(ALL_KEYS)}
      note={!!from !== !!to ? "Pick both dates to see what's free." : undefined}
      onOpen={(v) => {
        const base = listingBase(v.category);
        // What each detail page reads: a truck's request form takes the
        // county as `from_county`; a car or a machine takes the dates.
        const carry = new URLSearchParams();
        if (base === "/trucks") {
          if (county) carry.set("from_county", county);
        } else if (from && to) {
          carry.set("from", from);
          carry.set("to", to);
        }
        const s = carry.toString();
        navigate(`${base}/${v.id}${s ? `?${s}` : ""}`, {
          state: { hireSearch: params.toString() },
        });
      }}
      bar={
        <>
          <Dropdown
            variant="pill"
            label="County"
            icon={PIN_ICON}
            value={county}
            placeholder="Anywhere"
            disabled={countyOptions.length <= 1}
            options={countyOptions}
            onChange={(v) => set({ county: v || undefined })}
          />
          <DatePill
            label="From"
            value={from}
            min={minDay}
            onChange={(v) =>
              set({ from: v || undefined, ...(v && to && to < v ? { to: undefined } : {}) })
            }
          />
          <DatePill
            label="Until"
            value={to}
            min={from || minDay}
            onChange={(v) => set({ to: v || undefined })}
          />
        </>
      }
    />
  );
}
