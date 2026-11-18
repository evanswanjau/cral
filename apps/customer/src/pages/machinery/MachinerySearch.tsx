import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useSeo } from "../../lib/use-seo.js";
import { getCounties, searchCatalog, type CatalogSearchParams } from "../../lib/catalog-api.js";
import { earliestPickupDay } from "../../lib/hire-dates.js";
import { VehicleCard, CARD_TINTS } from "../../components/site/VehicleCard.js";
import { Dropdown, PIN_ICON, type DropdownOption } from "../../components/site/Dropdown.js";
import { DatePill } from "../../components/site/DatePill.js";
import { VehicleCardSkeletonGrid } from "../../components/site/Skeleton.js";

/**
 * `/machinery/search` (UI2b): the catalog search locked to
 * `category=machinery`. The filters are where and when - county, from,
 * until - and the sort; not seats, gearbox or "with driver", which are how
 * a car is picked. All of them live in the querystring, so the page is
 * shareable and the back button returns here. The dates travel with the
 * click onto `/machinery/:id`, so they are already picked there.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md section 4.3 (Machinery column),
 * after `pages/trucks/TrucksSearch.tsx`.
 */

const SORT_OPTIONS: DropdownOption[] = [
  { value: "recommended", label: "Recommended" },
  { value: "price_asc", label: "Price, low to high" },
  { value: "price_desc", label: "Price, high to low" },
  { value: "rating_desc", label: "Best-rated owners" },
];

export function MachinerySearch(): JSX.Element {
  useSeo({
    title: "Find machinery",
    description:
      "Machinery for site work from owners CRAL has checked. Filter by county and dates, then send the owner a request for free.",
    path: "/machinery/search",
  });
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const county = params.get("county") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const sort = (params.get("sort") as CatalogSearchParams["sort"]) ?? "recommended";
  const minDay = earliestPickupDay();

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  // Counties with a live listing, the same source the hero search reads.
  const { data: countyData } = useQuery({ queryKey: ["catalog", "counties"], queryFn: getCounties });
  const countyOptions: DropdownOption[] = [
    { value: "", label: "Any county" },
    ...(countyData?.counties ?? []).map((c) => ({ value: c.county, label: c.county })),
  ];

  const query = useMemo<CatalogSearchParams>(() => {
    const q: CatalogSearchParams = { category: "machinery", sort, limit: 24 };
    if (county) q.county = county;
    // The catalog takes a window or nothing: `from` alone is a 422.
    if (from && to) {
      q.from = from;
      q.to = to;
    }
    return q;
  }, [county, from, to, sort]);

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["catalog", "search", query],
    queryFn: ({ pageParam }) => searchCatalog(pageParam ? { ...query, cursor: pageParam } : query),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.has_more ? (last.next_cursor ?? undefined) : undefined),
  });
  const results = data?.pages.flatMap((p) => p.data) ?? [];
  const carry = from && to ? `?${new URLSearchParams({ from, to })}` : "";

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
          {county ? `Machinery in ${county}` : "Machinery across Kenya"}
        </h1>
        <p style={{ margin: "0 0 16px", font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
          {from && to
            ? "Showing machinery that is free on your dates. Open one to send the owner a request."
            : "Every machine here is reviewed by CRAL before it's listed. Pick your dates to see what is free."}
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
            onChange={(v) => set({ from: v || undefined, ...(v && to && to < v ? { to: undefined } : {}) })}
          />
          <DatePill label="Until" value={to} min={from || minDay} onChange={(v) => set({ to: v || undefined })} />
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
            We couldn't load the machinery just now. Refresh in a moment.
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
              No machinery matches all of that yet.
            </div>
            <p style={{ margin: "0 0 18px", font: "400 14px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
              Try another county or other dates.
            </p>
            <button
              type="button"
              onClick={() => setParams(new URLSearchParams())}
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
              Show all machinery
            </button>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(244px,1fr))", gap: 14 }}>
          {results.map((car, i) => (
            <VehicleCard
              key={car.id}
              car={car}
              tint={CARD_TINTS[i % CARD_TINTS.length] as string}
              onOpen={() => navigate(`/machinery/${car.id}${carry}`, { state: { machinerySearch: params.toString() } })}
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
              Show more machinery
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
