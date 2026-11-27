import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowsDownUp } from "@phosphor-icons/react/dist/ssr/ArrowsDownUp";
import { Tag } from "@phosphor-icons/react/dist/ssr/Tag";
import { color, font } from "@cral/ui";
import { useSeo } from "../lib/use-seo.js";
import { earliestPickupDay } from "../lib/hire-dates.js";
import {
  getDriverCounties,
  listDrivers,
  type DriverSearchParams,
  type DriverUnit,
  type PublicDriver,
} from "../lib/drivers-api.js";
import { Dropdown, PIN_ICON, type DropdownOption } from "../components/site/Dropdown.js";
import { DatePill } from "../components/site/DatePill.js";
import { Skeleton } from "../components/site/Skeleton.js";
import { EmptyFiltered, ListError } from "../components/hire/ListStates.js";
import { Section, bodyText } from "../components/subsite/Section.js";
import { FaqList, type Faq } from "../components/subsite/FaqList.js";
import { EarnBand } from "../components/subsite/EarnBand.js";
import { DriverList } from "../components/drivers/DriverList.js";
import { TimePill } from "../components/drivers/TimePill.js";

/**
 * `/drivers` - the driver search (DR1, docs/plans/drivers-that-work.md),
 * built from the `/hire` frame (`components/hire/HireListingLayout.tsx`):
 * a heading, one filter bar, the results straight away, "Show 24 more".
 * The reading parts the old landing page had (hero, four steps, prices,
 * five questions) are cut to a paragraph and three questions below the
 * results, as on `/hire`; "Drive for a living?" is the last thing on the
 * page.
 *
 * Every filter is in the querystring (`county`, `unit`, `from`, `to`,
 * `start`, `end`, `sort`) and every one is the server's: the catalog
 * filters by county and rate, leaves out a driver already booked over the
 * window (the same overlap `POST /bookings` refuses with
 * `driver_unavailable`), sorts by the chosen rate and pages by cursor.
 *
 * The window is built the way the booking form (`DriverBook.tsx`) builds
 * it, so the list and the request agree on who is free: by the day, 09:00
 * on the first day to 17:00 on the last; by the hour or for a trip, one
 * day between the times picked. With no rate picked, the dates are read
 * as days.
 *
 * Not from a canvas; built from tokens.ts and the `/hire` page.
 */

const NAIROBI = "+03:00";
const at = (day: string, time: string) => new Date(`${day}T${time}:00${NAIROBI}`).toISOString();
const TIME = /^\d{2}:\d{2}$/;
const DEFAULT_START = "09:00";
const DEFAULT_END = "13:00";

const UNIT_OPTIONS: DropdownOption[] = [
  { value: "", label: "Any rate" },
  { value: "day", label: "Per day" },
  { value: "hour", label: "Per hour" },
  { value: "trip", label: "Per trip" },
];
const SORT_OPTIONS: DropdownOption[] = [
  { value: "recommended", label: "Recommended" },
  { value: "price_asc", label: "Price, low to high" },
  { value: "price_desc", label: "Price, high to low" },
];
const FILTER_KEYS = ["county", "unit", "from", "to", "start", "end", "sort"] as const;

const FAQS: Faq[] = [
  {
    q: "Whose car does the driver drive?",
    a: "Yours. Tell them the make, colour and number plate when you send the request. Your own insurance needs to cover another driver.",
  },
  {
    q: "Do I pay anything to send a request?",
    a: "No. The owner the driver works for has twelve hours to say yes. You pay by M-Pesa only once they do, and the total does not change.",
  },
  {
    q: "What does CRAL check before a driver appears here?",
    a: "A person at CRAL reads the driver's licence and ID, and the driver works for an owner CRAL has approved. You see their name, county and rates; their documents stay private.",
  },
];

export function Drivers(): JSX.Element {
  useSeo({
    title: "Hire a driver in Kenya",
    description:
      "A checked driver for your own car, by the day, the hour or the trip. Pick a county and your dates to see who is free, and pay by M-Pesa once the owner accepts.",
    path: "/drivers",
  });
  const [params, setParams] = useSearchParams();
  const get = (k: string): string => params.get(k) ?? "";
  const set = (patch: Record<string, string | undefined>): void => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  const county = get("county");
  const rawUnit = get("unit");
  const unit = (["day", "hour", "trip"].includes(rawUnit) ? rawUnit : "") as DriverUnit | "";
  const timed = unit === "hour" || unit === "trip";
  const from = get("from");
  const to = get("to");
  const start = TIME.test(get("start")) ? get("start") : DEFAULT_START;
  const end = TIME.test(get("end")) ? get("end") : DEFAULT_END;
  const rawSort = get("sort");
  // A price sort orders on one rate, so it only counts once a rate is picked.
  const sort = unit && (rawSort === "price_asc" || rawSort === "price_desc") ? rawSort : "recommended";
  const minDay = earliestPickupDay();

  const hireWindow = useMemo(() => {
    if (timed) return from && end > start ? { pickup_at: at(from, start), dropoff_at: at(from, end) } : null;
    return from && to && to >= from ? { pickup_at: at(from, "09:00"), dropoff_at: at(to, "17:00") } : null;
  }, [timed, from, to, start, end]);

  const query = useMemo<DriverSearchParams>(() => {
    const q: DriverSearchParams = { limit: 24 };
    if (county) q.county = county;
    if (unit) q.unit = unit;
    if (hireWindow) Object.assign(q, hireWindow);
    if (sort !== "recommended") q.sort = sort;
    return q;
  }, [county, unit, hireWindow, sort]);

  const counties = useQuery({ queryKey: ["catalog", "driver-counties"], queryFn: getDriverCounties, staleTime: 60_000 });
  const countyOptions: DropdownOption[] = [
    { value: "", label: "Any county" },
    ...(counties.data?.counties ?? []).map((c) => ({ value: c.county, label: c.county })),
  ];

  const list = useInfiniteQuery({
    queryKey: ["catalog", "drivers", query],
    queryFn: ({ pageParam }) => listDrivers(pageParam ? { ...query, cursor: pageParam } : query),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.has_more ? (last.next_cursor ?? undefined) : undefined),
  });
  const results = list.data?.pages.flatMap((p) => p.data) ?? [];
  const total = list.data?.pages[0]?.total_count;
  const { isLoading, isError, hasNextPage, isFetchingNextPage } = list;
  const anyFilter = !!(county || unit || hireWindow);

  const note = timed
    ? !from
      ? "Pick a date to see who's free."
      : end <= start
        ? "The end time has to be after the start time."
        : undefined
    : !!from !== !!to
      ? "Pick both dates to see who's free."
      : undefined;

  // The driver's page opens on the same rate and dates.
  const hrefFor = (d: PublicDriver): string => {
    const carry = new URLSearchParams();
    if (unit && d.rates[unit]) carry.set("unit", unit);
    if (from) carry.set("from", from);
    if (!timed && to) carry.set("to", to);
    if (timed) {
      carry.set("start", start);
      carry.set("end", end);
    }
    const s = carry.toString();
    return `/drivers/${d.id}${s ? `?${s}` : ""}`;
  };

  const countLine =
    // Nothing matched: the empty card below says so.
    !total
      ? null
      : `${total} driver${total === 1 ? "" : "s"}${county ? ` in ${county}` : ""}${hireWindow ? (timed ? " free at that time" : " free on those dates") : ""}`;

  const clearAll = () => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, undefined])));

  return (
    <div>
      <div className="cral-hire" style={{ padding: "clamp(16px,2.6vw,28px) 16px clamp(40px,6vw,72px)" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", minWidth: 0 }}>
          <div style={{ margin: "4px 0 16px" }}>
            <h1
              style={{
                margin: "0 0 6px",
                font: `700 clamp(24px,2.8vw,32px)/1.1 ${font.display}`,
                fontVariationSettings: "'wdth' 108",
                letterSpacing: "-.025em",
                color: color.ink,
              }}
            >
              Drivers for hire
            </h1>
            <p style={{ margin: 0, font: `400 14px/1.5 ${font.sans}`, color: color.neutral[600] }}>
              A driver for your own car, by the day, the hour or the trip. Each one drives for an owner CRAL has checked.
            </p>
          </div>

          <div
            className="cral-filterbar cral-hire-bar"
            style={{
              background: "#FFFFFF",
              border: `1px solid ${color.neutral[200]}`,
              borderRadius: 16,
              padding: 8,
              marginBottom: 16,
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
            <Dropdown
              variant="pill"
              label="Rate"
              icon={<Tag size={16} aria-hidden="true" />}
              value={unit}
              placeholder="Any rate"
              options={UNIT_OPTIONS}
              onChange={(v) =>
                // Day to hour or trip keeps the first day and drops the last; a
                // price sort without a rate has nothing to order on.
                set({
                  unit: v || undefined,
                  ...(v === "hour" || v === "trip" ? { to: undefined } : { start: undefined, end: undefined }),
                  ...(!v ? { sort: undefined } : {}),
                })
              }
            />
            <DatePill
              label={timed ? "Date" : "From"}
              value={from}
              min={minDay}
              onChange={(v) => set({ from: v || undefined, ...(v && to && to < v ? { to: undefined } : {}) })}
            />
            {timed ? (
              <>
                <TimePill label={unit === "trip" ? "Start" : "From"} value={start} onChange={(v) => set({ start: v })} />
                <TimePill label={unit === "trip" ? "Back by" : "Until"} value={end} onChange={(v) => set({ end: v })} />
              </>
            ) : (
              <DatePill label="Until" value={to} min={from || minDay} onChange={(v) => set({ to: v || undefined })} />
            )}
            <div className="cral-hire-sort">
              <Dropdown
                variant="pill"
                label="Sort"
                icon={<ArrowsDownUp size={16} aria-hidden="true" />}
                value={sort}
                neutralValue="recommended"
                placeholder="Recommended"
                options={SORT_OPTIONS}
                onChange={(v) =>
                  // Price needs a rate to order on: with none picked, by the day.
                  set({ sort: v === "recommended" ? undefined : v, ...(v !== "recommended" && !unit ? { unit: "day" } : {}) })
                }
              />
            </div>
          </div>

          <div style={{ minHeight: 20, marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
            {isLoading ? (
              <Skeleton height={16} width={140} />
            ) : (
              countLine && <span style={{ font: `600 14px/1.4 ${font.sans}`, color: color.ink }}>{countLine}</span>
            )}
            {note && <span style={{ font: `400 13px/1.4 ${font.sans}`, color: color.neutral[600] }}>{note}</span>}
            {FILTER_KEYS.some((k) => params.get(k)) && (
              <button type="button" onClick={clearAll} className="cral-text-btn" style={{ color: color.cruzBlue, height: 20, padding: 0 }}>
                Clear all
              </button>
            )}
          </div>

          {isError && results.length === 0 && <ListError onRetry={() => void list.refetch()} />}

          {!isLoading &&
            !isError &&
            results.length === 0 &&
            (anyFilter ? (
              <EmptyFiltered
                title="No drivers match."
                hint={hireWindow ? "Try other dates, another county or any rate." : "Try another county or any rate."}
                onClear={clearAll}
              />
            ) : (
              <div style={{ background: "#FFFFFF", border: `1px dashed ${color.neutral[300]}`, borderRadius: 12, padding: "40px 20px", textAlign: "center" }}>
                <p style={{ ...bodyText, margin: 0 }}>
                  No drivers are taking bookings yet. Check back soon, or{" "}
                  <Link to="/hire?type=cars" style={{ color: color.cruzBlue, fontWeight: 600 }}>
                    hire a car that comes with a driver
                  </Link>
                  .
                </p>
              </div>
            ))}

          {isLoading && (
            <div className="cral-hire-grid">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} height={262} />
              ))}
            </div>
          )}
          {results.length > 0 && <DriverList drivers={results} hrefFor={hrefFor} unit={unit} />}

          {list.isFetchNextPageError && !isFetchingNextPage && (
            <div style={{ paddingTop: 24 }}>
              <ListError onRetry={() => void list.fetchNextPage()} />
            </div>
          )}

          {hasNextPage && !list.isFetchNextPageError && (
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 24 }}>
              <button
                type="button"
                disabled={isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
                style={{
                  height: 44,
                  padding: "0 22px",
                  background: "#FFFFFF",
                  color: color.ink,
                  border: `1px solid ${color.neutral[200]}`,
                  borderRadius: 8,
                  font: `600 14px/1 ${font.sans}`,
                  cursor: "pointer",
                  opacity: isFetchingNextPage ? 0.6 : 1,
                }}
              >
                {isFetchingNextPage ? "Loading…" : "Show 24 more"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${color.neutral[200]}`, background: "#F8F9FB" }}>
        <Section overline="ABOUT HIRING A DRIVER" heading="Hire a driver in Kenya" style={{ paddingBottom: 0 }}>
          <p style={{ ...bodyText, maxWidth: 720 }}>
            Pick a county and your dates to see the drivers who are free, by the day, the hour or for one trip. You see the
            total before you send the request. Sending it is free; you pay by M-Pesa once the owner the driver works for says
            yes. To hire a car and a driver together, pick the car first and add a driver on its page.
          </p>
        </Section>
        <FaqList heading="Questions" items={FAQS} />
      </div>

      <EarnBand
        heading="Drive for a living?"
        body="Join CRAL with your licence and ID, or add the drivers you already employ. You set the rates, and you are paid after each booking."
        cta="Drive with CRAL"
        joinPath="/join/drivers"
      />
    </div>
  );
}
