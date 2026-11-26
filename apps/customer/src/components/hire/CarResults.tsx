import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getGroupCounties, type CatalogSearchParams } from "../../lib/catalog-api.js";
import { earliestPickupDay } from "../../lib/hire-dates.js";
import {
  HIRE_GROUPS,
  VEHICLE_CATEGORY_LABEL,
  type VehicleCategory,
} from "../../lib/vehicle-categories.js";
import { Dropdown, PIN_ICON, type DropdownOption } from "../site/Dropdown.js";
import { DatePill } from "../site/DatePill.js";
import { ChoiceRow } from "../site/Popover.js";
import { HireListingLayout } from "./HireListingLayout.js";
import { FilterSheet, SheetGroup } from "./FilterSheet.js";
import { pick, tagsFor, useHireParams } from "./hire-params.js";

/**
 * `/hire?type=cars` - "Cars on hire" (PR H4; was H3's `/cars/search`,
 * before that `pages/Browse.tsx`). Always
 * asks the catalog for `group=cars` (sedan + SUV + van), so a truck or an
 * excavator never shows here; the type chips narrow inside the group.
 *
 * In the bar: county, from, until (what a renter arrives with). Behind
 * Filters: type, gearbox, seats, who drives, price ceiling - each set one
 * restated as a removable tag. Every filter is in the querystring and
 * survives a reload; the dates travel with the click onto the car page.
 *
 * Not from a canvas; built from tokens.ts and the H3 section of
 * docs/plans/hire-that-works.md.
 */

const TYPE_OPTIONS: DropdownOption[] = [
  { value: "", label: "Any" },
  ...HIRE_GROUPS.cars.map((c) => ({
    value: c,
    label: VEHICLE_CATEGORY_LABEL[c as VehicleCategory],
  })),
];

const SEAT_OPTIONS: DropdownOption[] = [
  { value: "", label: "Any" },
  { value: "2", label: "2+" },
  { value: "5", label: "5+" },
  { value: "7", label: "7+" },
  { value: "14", label: "14+" },
];

const GEARBOX_OPTIONS: DropdownOption[] = [
  { value: "", label: "Any" },
  { value: "automatic", label: "Automatic" },
  { value: "manual", label: "Manual" },
];

const DRIVER_OPTIONS: DropdownOption[] = [
  { value: "", label: "Either" },
  { value: "false", label: "Self-drive" },
  { value: "true", label: "With driver" },
];

const PRICE_OPTIONS: DropdownOption[] = [
  { value: "", label: "Any price" },
  { value: "500000", label: "Up to KES 5,000" },
  { value: "1000000", label: "Up to KES 10,000" },
  { value: "1500000", label: "Up to KES 15,000" },
  { value: "2500000", label: "Up to KES 25,000" },
  { value: "5000000", label: "Up to KES 50,000" },
];

const SHEET_KEYS = ["category", "transmission", "seats_min", "chauffeured", "max_price"] as const;
const ALL_KEYS = ["county", "from", "to", ...SHEET_KEYS] as const;

export function CarResults(): JSX.Element {
  const navigate = useNavigate();
  const { params, get, set, clear, sort, type, changeType } = useHireParams();

  const county = get("county");
  const from = get("from");
  const to = get("to");
  // A value no control offers (an edited link) is ignored, not sent.
  const category = pick(get("category"), TYPE_OPTIONS);
  const transmission = pick(get("transmission"), GEARBOX_OPTIONS);
  const seatsMin = pick(get("seats_min"), SEAT_OPTIONS);
  const chauffeured = pick(get("chauffeured"), DRIVER_OPTIONS);
  const maxPrice = pick(get("max_price"), PRICE_OPTIONS);
  const minDay = earliestPickupDay();

  // Counties with a live car in them, so the menu never offers a
  // county that only has trucks.
  const { data: countyData } = useQuery({
    queryKey: ["catalog", "counties", "cars"],
    queryFn: () => getGroupCounties("cars"),
  });
  const countyOptions: DropdownOption[] = [
    { value: "", label: "Any county" },
    ...(countyData?.counties ?? []).map((c) => ({ value: c.county, label: c.county })),
  ];

  const query = useMemo<CatalogSearchParams>(() => {
    const q: CatalogSearchParams = { group: "cars", sort, limit: 24 };
    if (category) q.category = category as VehicleCategory;
    if (county) q.county = county;
    // The catalog takes a window or nothing: `from` alone is a 422.
    if (from && to) {
      q.from = from;
      q.to = to;
    }
    if (transmission === "automatic" || transmission === "manual") q.transmission = transmission;
    if (seatsMin) q.seats_min = Number(seatsMin);
    if (chauffeured) q.chauffeured = chauffeured === "true";
    if (maxPrice) q.max_price = Number(maxPrice);
    return q;
  }, [category, county, from, to, transmission, seatsMin, chauffeured, maxPrice, sort]);

  const tags = tagsFor(
    [
      ["category", category, TYPE_OPTIONS],
      ["transmission", transmission, GEARBOX_OPTIONS],
      ["seats_min", seatsMin, SEAT_OPTIONS, "Seats "],
      ["chauffeured", chauffeured, DRIVER_OPTIONS],
      ["max_price", maxPrice, PRICE_OPTIONS],
    ],
    set,
  );

  const carry = from && to ? `?${new URLSearchParams({ from, to })}` : "";

  return (
    <HireListingLayout
      type={type}
      onType={changeType}
      lede="Every car is checked by a person before it is listed."
      emptyHint="Try another county, other dates, or clear a filter or two."
      query={query}
      sort={sort}
      onSort={(v) => set({ sort: v || undefined })}
      tags={tags}
      onClearAll={() => clear(ALL_KEYS)}
      note={!!from !== !!to ? "Pick both dates to see what's free." : undefined}
      onOpen={(car) =>
        navigate(`/cars/${car.id}${carry}`, { state: { hireSearch: params.toString() } })
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
            // A pick-up after the return date is not a window anyone
            // meant - the return goes back to unset.
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
          <FilterSheet count={tags.length} onClear={() => clear(SHEET_KEYS)}>
            <SheetGroup heading="TYPE">
              <ChoiceRow
                name="Type"
                value={category}
                options={TYPE_OPTIONS}
                onChange={(v) => set({ category: v || undefined })}
              />
            </SheetGroup>
            <SheetGroup heading="GEARBOX">
              <ChoiceRow
                name="Gearbox"
                value={transmission}
                options={GEARBOX_OPTIONS}
                onChange={(v) => set({ transmission: v || undefined })}
              />
            </SheetGroup>
            <SheetGroup heading="SEATS">
              <ChoiceRow
                name="Seats"
                value={seatsMin}
                options={SEAT_OPTIONS}
                onChange={(v) => set({ seats_min: v || undefined })}
              />
            </SheetGroup>
            <SheetGroup heading="WHO DRIVES">
              <ChoiceRow
                name="Who drives"
                value={chauffeured}
                options={DRIVER_OPTIONS}
                onChange={(v) => set({ chauffeured: v || undefined })}
              />
            </SheetGroup>
            <SheetGroup heading="PRICE PER DAY">
              <ChoiceRow
                name="Price ceiling"
                value={maxPrice}
                options={PRICE_OPTIONS}
                onChange={(v) => set({ max_price: v || undefined })}
              />
            </SheetGroup>
          </FilterSheet>
        </>
      }
    />
  );
}
