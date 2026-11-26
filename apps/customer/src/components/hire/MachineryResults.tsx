import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getGroupCounties, type CatalogSearchParams } from "../../lib/catalog-api.js";
import { earliestPickupDay } from "../../lib/hire-dates.js";
import { MACHINE_TYPES } from "../../lib/vehicle-categories.js";
import { Dropdown, PIN_ICON, type DropdownOption } from "../site/Dropdown.js";
import { DatePill } from "../site/DatePill.js";
import { HireListingLayout } from "./HireListingLayout.js";
import { useHireParams } from "./hire-params.js";

/**
 * `/hire?type=machinery` - "Machinery on hire" (PR H4; was H3's
 * `/machinery/search`). Asks the catalog for `group=machinery`. The filters are where,
 * when and what kind of machine (`machine_type`, owner's decision 4) -
 * never seats, gearbox or self-drive. Every filter is a pill in the bar,
 * so this page has no Filters sheet.
 *
 * No "with operator" filter yet: the plan lists one, but every machine
 * listed today comes with an operator, so it would change nothing. Add it
 * (`chauffeured`) once a machine lists without one. The card says
 * "With operator" where the listing has one.
 *
 * Not from a canvas; built from tokens.ts and the H3 section of
 * docs/plans/hire-that-works.md.
 */

const TYPE_OPTIONS: DropdownOption[] = [
  { value: "", label: "Any machine" },
  ...MACHINE_TYPES.map((t) => ({ value: t.value, label: t.label })),
];

const ALL_KEYS = ["county", "from", "to", "machine_type"] as const;

export function MachineryResults(): JSX.Element {
  const navigate = useNavigate();
  const { params, get, set, clear, sort, type, changeType } = useHireParams();
  const county = get("county");
  const from = get("from");
  const to = get("to");
  const machineType = TYPE_OPTIONS.some((o) => o.value === get("machine_type"))
    ? get("machine_type")
    : "";
  const minDay = earliestPickupDay();

  // Counties with a live machine in them.
  const { data: countyData } = useQuery({
    queryKey: ["catalog", "counties", "machinery"],
    queryFn: () => getGroupCounties("machinery"),
  });
  const countyOptions: DropdownOption[] = [
    { value: "", label: "Any county" },
    ...(countyData?.counties ?? []).map((c) => ({ value: c.county, label: c.county })),
  ];

  const query = useMemo<CatalogSearchParams>(() => {
    const q: CatalogSearchParams = { group: "machinery", sort, limit: 24 };
    if (county) q.county = county;
    // The catalog takes a window or nothing: `from` alone is a 422.
    if (from && to) {
      q.from = from;
      q.to = to;
    }
    if (machineType) q.machine_type = machineType;
    return q;
  }, [county, from, to, machineType, sort]);

  const carry = from && to ? `?${new URLSearchParams({ from, to })}` : "";

  return (
    <HireListingLayout
      type={type}
      onType={changeType}
      lede={
        from && to
          ? "Showing machinery that is free on your dates. Open one to send the owner a request."
          : "Every machine is checked by a person before it is listed. Pick your dates to see what is free."
      }
      emptyHint="Try any machine, another county or other dates."
      query={query}
      sort={sort}
      onSort={(v) => set({ sort: v || undefined })}
      tags={[]}
      onClearAll={() => clear(ALL_KEYS)}
      note={!!from !== !!to ? "Pick both dates to see what's free." : undefined}
      onOpen={(m) =>
        navigate(`/machinery/${m.id}${carry}`, { state: { hireSearch: params.toString() } })
      }
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
          <Dropdown
            variant="pill"
            label="Machine"
            value={machineType}
            placeholder="Any machine"
            options={TYPE_OPTIONS}
            onChange={(v) => set({ machine_type: v || undefined })}
          />
        </>
      }
    />
  );
}
