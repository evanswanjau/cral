import { useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useSeo } from "../lib/use-seo.js";
import { searchCatalog, getCounties, type CatalogSearchParams } from "../lib/catalog-api.js";
import { VehicleCard, CARD_TINTS } from "../components/site/VehicleCard.js";
import { Dropdown, PIN_ICON, type DropdownOption } from "../components/site/Dropdown.js";
import { Popover, PopoverGroup, ChoiceRow } from "../components/site/Popover.js";
import { Skeleton, VehicleCardSkeletonGrid } from "../components/site/Skeleton.js";
import { VEHICLE_CATEGORIES, type VehicleCategory } from "../lib/vehicle-categories.js";
import { earliestPickupDay } from "../lib/hire-dates.js";

/**
 * `/browse`. Filters live in the querystring - shareable, back-button-safe,
 * and exactly what the catalog's cursor pagination expects. Three things
 * this screen deliberately does (owner's call, 2026-09-20):
 *
 * - **The filter rail sits on top, not down the left**, and it is one
 *   line of small pills: County, Dates, More filters, Sort. Eight
 *   equal-weight controls spread over two rows was the first attempt and
 *   read as a form, not a search. Everything past the two a renter
 *   actually arrives with (where, when) is behind the "More filters"
 *   disclosure, grouped by the question it answers - budget, the car,
 *   how you'll drive. The cost of hiding a filter is that a set one is
 *   invisible, so every active filter is restated as a removable tag
 *   under the bar.
 * - **Every control is the hero search's own dropdown**
 *   (`components/site/Dropdown.tsx`, shared with `Home.tsx`) rather than a
 *   native `<select>`, so the two search surfaces match.
 * - **Paging is infinite**, off an IntersectionObserver sentinel. The
 *   cursor is no longer a querystring param: a URL carrying page four's
 *   cursor but not pages one to three describes a result set nobody can
 *   see. The "Show more cars" button stays as the keyboard/no-observer
 *   path.
 *
 * Loading is always a skeleton, never a spinner or a "Searching..." line -
 * the grid keeps its shape so nothing under the cursor jumps.
 */

const PRICE_CEILINGS: DropdownOption[] = [
  { value: "", label: "Any price" },
  { value: "500000", label: "Up to KES 5,000" },
  { value: "1000000", label: "Up to KES 10,000" },
  { value: "1500000", label: "Up to KES 15,000" },
  { value: "2500000", label: "Up to KES 25,000" },
  { value: "5000000", label: "Up to KES 50,000" },
];

const CATEGORY_OPTIONS: DropdownOption[] = [
  { value: "", label: "Any type" },
  ...VEHICLE_CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
];

const SEAT_OPTIONS: DropdownOption[] = [
  { value: "", label: "Any size" },
  { value: "5", label: "5 and up" },
  { value: "7", label: "7 and up" },
];

const GEARBOX_OPTIONS: DropdownOption[] = [
  { value: "", label: "Any gearbox" },
  { value: "automatic", label: "Automatic" },
  { value: "manual", label: "Manual" },
];

const DRIVER_OPTIONS: DropdownOption[] = [
  { value: "", label: "Either" },
  { value: "false", label: "Self-drive" },
  { value: "true", label: "With driver" },
];

const SORT_OPTIONS: DropdownOption[] = [
  { value: "recommended", label: "Recommended" },
  { value: "price_asc", label: "Price, low to high" },
  { value: "price_desc", label: "Price, high to low" },
  { value: "rating_desc", label: "Best-rated owners" },
];

const CALENDAR_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

const SLIDERS_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h10M18 18h2" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="16" cy="18" r="2" />
  </svg>
);

const SORT_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h13M3 12h9M3 18h5M17 10l4 4 4-4" />
    <path d="M18 8v12l3.5-3.5" />
  </svg>
);

/** "23 Sep" - a tag and a pill have no room for a full date. */
function shortDay(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * A date field wearing the pill shape - so "where", "when" and "what
 * kind" are three controls of the same weight on one line. The native
 * `<input type="date">` is the real control (keyboard, and a phone's own
 * picker), laid over the pill at zero opacity; the pill's click opens it
 * through `showPicker()` rather than making the renter hit the tiny
 * calendar glyph. Browsers without `showPicker` still focus the input.
 */
function DatePill({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: string;
  min?: string | undefined;
  onChange: (value: string) => void;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const open = () => {
    const el = inputRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
    }
  };
  return (
    <label className="cral-pill cral-pill-date" data-active={value ? "true" : undefined} onClick={open}>
      {CALENDAR_ICON}
      <span className="cral-pill-date-label">{label}</span>
      <span>{value ? shortDay(value) : "Any day"}</span>
      <input
        ref={inputRef}
        type="date"
        aria-label={label}
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Clear ${label.toLowerCase()} date`}
          className="cral-pill-clear"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onChange("");
            }
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </span>
      )}
    </label>
  );
}

/** Every panel closes the same way: reset this group, or done. */
function PanelFoot({
  onClear,
  clearLabel,
  onDone,
}: {
  onClear?: (() => void) | undefined;
  clearLabel: string;
  onDone: () => void;
}): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        marginTop: 16,
        paddingTop: 13,
        borderTop: "1px solid #F1F3F6",
      }}
    >
      <button
        type="button"
        onClick={onClear}
        disabled={!onClear}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          font: "600 12.5px/1 'Instrument Sans',sans-serif",
          color: onClear ? "#0F23A8" : "#B4BAC5",
          cursor: onClear ? "pointer" : "default",
        }}
      >
        {clearLabel}
      </button>
      <button
        type="button"
        onClick={onDone}
        style={{
          height: 36,
          padding: "0 16px",
          background: "#0F23A8",
          color: "#FFFFFF",
          border: "none",
          borderRadius: 8,
          font: "600 13px/1 'Instrument Sans',sans-serif",
          cursor: "pointer",
        }}
      >
        Done
      </button>
    </div>
  );
}

export function Browse(): JSX.Element {
  useSeo({
    title: "Find a car",
    // The tab reads "Find a car", with no site suffix after it.
    bareTitle: true,
    description:
      // Well inside the ~160 characters Google shows, and general about
      // the review the same way the page's own line is - the two say one
      // thing, not two different ones.
      "Hire a car anywhere in Kenya, self-drive or with a driver. Every car is reviewed by CRAL before it's listed.",
    path: "/browse",
  });
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const county = params.get("county") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const category = params.get("category") ?? "";
  const seatsMin = params.get("seats_min") ?? "";
  const transmission = params.get("transmission") ?? "";
  const chauffeured = params.get("chauffeured") ?? "";
  const maxPrice = params.get("max_price") ?? "";
  const sort = (params.get("sort") as CatalogSearchParams["sort"]) ?? "recommended";

  // The dates the renter already chose travel with them onto the car page,
  // so they never pick the same dates twice.
  const carQuery = (() => {
    const q = new URLSearchParams();
    if (from && to) {
      q.set("from", from);
      q.set("to", to);
    }
    return q.toString() ? `?${q}` : "";
  })();

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next);
  };

  const minDay = earliestPickupDay();

  // What sits behind the "More filters" pill - the count on its badge.
  const PANEL_KEYS = ["max_price", "category", "seats_min", "transmission", "chauffeured"] as const;
  const panelCount = PANEL_KEYS.filter((k) => params.get(k)).length;
  const clearPanelFilters = () =>
    set(Object.fromEntries(PANEL_KEYS.map((k) => [k, undefined])) as Record<string, undefined>);
  const clearFilters = () => setParams(new URLSearchParams(sort === "recommended" ? "" : `sort=${sort}`));

  // The filters the bar does not already show, as removable tags - what
  // is behind the panel, restated. County and the two dates are their own
  // pills, so tagging them too would say the same thing twice. Labels are
  // read back off the same option lists the panel uses, so a tag can
  // never name a filter differently from the control that set it.
  const activeTags = (
    [
      ["max_price", maxPrice, PRICE_CEILINGS],
      ["category", category, CATEGORY_OPTIONS],
      ["seats_min", seatsMin, SEAT_OPTIONS],
      ["transmission", transmission, GEARBOX_OPTIONS],
      ["chauffeured", chauffeured, DRIVER_OPTIONS],
    ] as const
  ).flatMap(([key, value, options]) =>
    value
      ? [
          {
            key: key as string,
            label: options.find((o) => o.value === value)?.label ?? value,
            remove: () => set({ [key]: undefined }),
          },
        ]
      : [],
  );

  // Counties that actually have a live listing - the same source the hero
  // search reads, so neither offers a county with nothing in it.
  const { data: countyData } = useQuery({ queryKey: ["catalog", "counties"], queryFn: getCounties });
  const countyOptions: DropdownOption[] = [
    { value: "", label: "Any county" },
    ...(countyData?.counties ?? []).map((c) => ({ value: c.county, label: c.county })),
  ];

  const query = useMemo<CatalogSearchParams>(() => {
    const q: CatalogSearchParams = { sort, limit: 24 };
    if (maxPrice) q.max_price = Number(maxPrice);
    if (county) q.county = county;
    // The catalog takes a window or nothing - `from` alone is a 422
    // ("from and to must be given together"). A half-picked window simply
    // doesn't filter yet, and the count line says so, rather than the
    // whole grid collapsing into an error while the renter is mid-choice.
    if (from && to) {
      q.from = from;
      q.to = to;
    }
    if (category) q.category = category as VehicleCategory;
    if (seatsMin) q.seats_min = Number(seatsMin);
    if (transmission === "automatic" || transmission === "manual") q.transmission = transmission;
    if (chauffeured) q.chauffeured = chauffeured === "true";
    return q;
  }, [county, from, to, category, seatsMin, transmission, chauffeured, maxPrice, sort]);

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["catalog", "search", query],
    queryFn: ({ pageParam }) => searchCatalog(pageParam ? { ...query, cursor: pageParam } : query),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.has_more ? (last.next_cursor ?? undefined) : undefined),
  });

  const results = data?.pages.flatMap((p) => p.data) ?? [];

  // The sentinel sits a screen and a half below the last card, so the next
  // page is usually already in hand by the time the renter reaches it.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const heading = county ? `cars in ${county}` : "cars across Kenya";

  return (
    <div style={{ padding: "clamp(18px,2.6vw,30px) clamp(14px,3vw,32px) clamp(40px,6vw,72px)" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        {/* ---- heading ---- */}
        <div style={{ marginBottom: 16 }}>
          <h1
            style={{
              margin: "0 0 6px",
              font: "700 clamp(22px,2.8vw,30px)/1.1 Archivo,sans-serif",
              fontVariationSettings: "'wdth' 108",
              letterSpacing: "-.025em",
              color: "#0B0F1A",
            }}
          >
            Find a car
          </h1>
          <p style={{ margin: 0, font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
            Every car here is reviewed by CRAL before it's listed.
          </p>
        </div>

        {/* ---- filters, on top ---- */}
        <div
          className="cral-filterbar"
          style={{
            background: "#FFFFFF",
            border: "1px solid #E4E7EC",
            borderRadius: 999,
            padding: "9px 12px",
            marginBottom: activeTags.length > 0 ? 10 : 18,
            boxShadow: "0 8px 22px rgba(11,15,26,.05)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
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

          {/* The two dates a renter arrives with, in the bar itself - not
              behind a disclosure. Where / from / until is the whole of
              what most searches are. */}
          <DatePill
            label="From"
            value={from}
            min={minDay}
            // A pick-up after the return date is not a window anyone
            // meant - the return goes back to unset rather than the
            // search failing on an impossible pair.
            onChange={(v) => set({ from: v || undefined, ...(v && to && to < v ? { to: undefined } : {}) })}
          />
          <DatePill label="Until" value={to} min={from || minDay} onChange={(v) => set({ to: v || undefined })} />

          {/* `margin-left: auto` on the right-hand pair rather than a
              spacer element: in a wrapping row a spacer claims a line of
              its own on a phone. */}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* Everything else is behind one disclosure, grouped by the
                question it answers. Eight controls in a row was the whole
                problem - a renter scans for a car, not for a form. */}
            <Popover
              label="More filters"
              icon={SLIDERS_ICON}
              summary={panelCount > 0 ? "Filters" : undefined}
              active={panelCount > 0}
              count={panelCount}
              width={352}
            >
              {(close) => (
                <>
                  <PopoverGroup heading="YOUR BUDGET">
                    <ChoiceRow
                      name="Price ceiling"
                      value={maxPrice}
                      options={PRICE_CEILINGS}
                      onChange={(v) => set({ max_price: v || undefined })}
                    />
                  </PopoverGroup>
                  <PopoverGroup heading="THE CAR">
                    <ChoiceRow
                      name="Body type"
                      value={category}
                      options={CATEGORY_OPTIONS}
                      onChange={(v) => set({ category: v || undefined })}
                    />
                    <div className="cral-pop-sub">Seats</div>
                    <ChoiceRow
                      name="Seats"
                      value={seatsMin}
                      options={SEAT_OPTIONS}
                      onChange={(v) => set({ seats_min: v || undefined })}
                    />
                  </PopoverGroup>
                  <PopoverGroup heading="HOW YOU'LL DRIVE">
                    <ChoiceRow
                      name="Gearbox"
                      value={transmission}
                      options={GEARBOX_OPTIONS}
                      onChange={(v) => set({ transmission: v || undefined })}
                    />
                    <div className="cral-pop-sub">Who drives</div>
                    <ChoiceRow
                      name="Driver"
                      value={chauffeured}
                      options={DRIVER_OPTIONS}
                      onChange={(v) => set({ chauffeured: v || undefined })}
                    />
                  </PopoverGroup>
                  <PanelFoot
                    onClear={panelCount > 0 ? clearPanelFilters : undefined}
                    clearLabel="Reset these"
                    onDone={close}
                  />
                </>
              )}
            </Popover>

            <Dropdown
              variant="pill"
              label="Sort"
              icon={SORT_ICON}
              value={sort ?? "recommended"}
              neutralValue="recommended"
              placeholder="Recommended"
              options={SORT_OPTIONS}
              onChange={(v) => set({ sort: v })}
              minWidth={210}
            />
          </div>
        </div>

        {/* What is actually narrowing the results, restated and removable
            in one click - the price of putting filters behind a panel. */}
        {activeTags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 18 }}>
            {activeTags.map((t) => (
              <button key={t.key} type="button" className="cral-tag" onClick={t.remove}>
                {t.label}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            ))}
            <button
              type="button"
              onClick={clearFilters}
              style={{
                height: 30,
                padding: "0 10px",
                background: "none",
                border: "none",
                font: "600 12.5px/1 'Instrument Sans',sans-serif",
                color: "#0F23A8",
                cursor: "pointer",
              }}
            >
              Clear all
            </button>
          </div>
        )}

        {/* ---- count ---- */}
        <div style={{ marginBottom: 14 }}>
          {isLoading ? (
            <Skeleton height={16} width={168} />
          ) : (
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ font: "600 14px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>
                {results.length}
                {hasNextPage ? "+" : ""} {heading}
              </span>
              {!!from !== !!to && (
                <span style={{ font: "400 13px/1.4 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                  Pick both dates to see what's free.
                </span>
              )}
            </span>
          )}
        </div>

        {isError && (
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E4E7EC",
              borderRadius: 12,
              padding: "36px 24px",
              textAlign: "center",
            }}
          >
            <div style={{ font: "600 17px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 8 }}>
              We couldn't load the listings just now.
            </div>
            <p style={{ margin: 0, font: "400 14px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
              Refresh in a moment.
            </p>
          </div>
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
              Nothing matches all of that.
            </div>
            <p style={{ margin: "0 0 18px", font: "400 14px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
              Try raising the price ceiling or dropping a filter.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              style={{
                height: 42,
                padding: "0 18px",
                background: "#0F23A8",
                color: "#FFFFFF",
                border: "none",
                borderRadius: 8,
                font: "600 14px/1 'Instrument Sans',sans-serif",
                cursor: "pointer",
              }}
            >
              Clear filters
            </button>
          </div>
        )}

        {/* ---- results ---- */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(244px,1fr))",
            gap: 14,
          }}
        >
          {results.map((car, i) => (
            <VehicleCard
              key={car.id}
              car={car}
              tint={CARD_TINTS[i % CARD_TINTS.length] as string}
              // The whole search travels with the click, so the car
              // page's "back" returns to these results rather than a
              // bare /browse (the filters are in the URL either way, but
              // an in-page link had been dropping them).
              onOpen={() =>
                navigate(`/cars/${car.id}${carQuery}`, { state: { browseSearch: params.toString() } })
              }
            />
          ))}
          {isLoading && <VehicleCardSkeletonGrid count={8} />}
          {isFetchingNextPage && <VehicleCardSkeletonGrid count={4} />}
        </div>

        <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />

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
              Show more cars
            </button>
          </div>
        )}

        {!isLoading && !hasNextPage && results.length > 0 && (
          <p
            style={{
              margin: "26px 0 0",
              textAlign: "center",
              font: "500 12px/1 'IBM Plex Mono',monospace",
              letterSpacing: ".08em",
              color: "#9AA2B0",
            }}
          >
            THAT'S EVERY CAR MATCHING THESE FILTERS
          </p>
        )}
      </div>
    </div>
  );
}
