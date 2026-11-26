import type { ReactNode } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { X } from "@phosphor-icons/react/dist/ssr/X";
import { ArrowsDownUp } from "@phosphor-icons/react/dist/ssr/ArrowsDownUp";
import { Car } from "@phosphor-icons/react/dist/ssr/Car";
import { color, font } from "@cral/ui";
import {
  getHireSummary,
  searchCatalog,
  type CatalogSearchParams,
  type CatalogVehicleSummary,
} from "../../lib/catalog-api.js";
import { VehicleCard, CARD_TINTS } from "../site/VehicleCard.js";
import { Dropdown } from "../site/Dropdown.js";
import { Skeleton, VehicleCardSkeletonGrid } from "../site/Skeleton.js";
import { EmptyFiltered, EmptyNone, ListError } from "./ListStates.js";
import {
  ALL_SORT_OPTIONS,
  SORT_OPTIONS,
  TYPE_OPTIONS,
  hireTypeInfo,
  type ActiveTag,
  type HireType,
} from "./hire-params.js";

/**
 * The frame of the one hire search page (`/hire`, PR H4; built in H3 for
 * three pages): "Vehicles on hire", "Cars on hire", "Trucks on hire",
 * "Machinery on hire". Top to bottom: the heading with the live count for
 * the type, the filter bar (the Type dropdown, the type's own pills, then
 * Sort), the set filters as removable tags, the grid, and "Show 24 more".
 * H3's Cars / Trucks / Machinery tabs gave way to the Type dropdown
 * (owner's call, 2026-11-26: a dropdown, not tabs).
 *
 * - Paging is a cursor, 24 a page, behind a "Show 24 more" button - no
 *   infinite scroll, no page numbers (H3 replaces the 2026-09-20
 *   infinite-scroll sentinel: a footer nobody can reach is a worse trade
 *   than one tap).
 * - The count beside the heading is the type's whole live count from
 *   `/catalog/hire-summary`; with filters set, the line under the bar
 *   says how many match so far ("24+ match").
 * - Loading is the card skeleton in the grid's shape, never a spinner.
 *
 * Not from a canvas; built from tokens.ts, the H3 wireframes in
 * docs/plans/hire-that-works.md and docs/plans/hire-search-first.md.
 */
export function HireListingLayout({
  type,
  onType,
  lede,
  bar,
  tags,
  onClearAll,
  query,
  sort,
  onSort,
  onOpen,
  emptyHint,
  note,
}: {
  type: HireType;
  /** A new type is a new list: county and dates stay, the rest goes. */
  onType: (type: HireType) => void;
  lede: string;
  /** The page's own filter pills, in the order they should read. */
  bar: ReactNode;
  /** Every set filter the bar's pills don't already show. */
  tags: ActiveTag[];
  /** Clears every filter the page owns. */
  onClearAll: () => void;
  query: CatalogSearchParams;
  sort: NonNullable<CatalogSearchParams["sort"]>;
  onSort: (sort: string) => void;
  onOpen: (vehicle: CatalogVehicleSummary) => void;
  /** The empty-with-filters advice, per type. */
  emptyHint: string;
  /** A line under the count (a half-picked date window, a hint). */
  note?: ReactNode;
}): JSX.Element {
  const { title, noun } = hireTypeInfo(type);
  // Any filter the renter set - everything but the type's own group, the sort and the page size.
  const anyFilter = Object.entries(query).some(
    ([k, v]) => !["group", "sort", "limit"].includes(k) && v !== undefined && v !== "",
  );

  const summary = useQuery({
    queryKey: ["catalog", "hire-summary"],
    queryFn: getHireSummary,
    staleTime: 60_000,
  });
  const listed =
    summary.data &&
    (type === "all"
      ? summary.data.cars.count + summary.data.trucks.count + summary.data.machinery.count
      : summary.data[type]?.count);

  const list = useInfiniteQuery({
    queryKey: ["catalog", "search", query],
    queryFn: ({ pageParam }) => searchCatalog(pageParam ? { ...query, cursor: pageParam } : query),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.has_more ? (last.next_cursor ?? undefined) : undefined),
  });
  const results = list.data?.pages.flatMap((p) => p.data) ?? [];
  const { isLoading, isError, hasNextPage, isFetchingNextPage } = list;

  return (
    <div
      className="cral-hire"
      style={{ padding: "clamp(16px,2.6vw,28px) 16px clamp(40px,6vw,72px)" }}
    >
      <div style={{ maxWidth: 1240, margin: "0 auto", minWidth: 0 }}>
        <div style={{ margin: "4px 0 16px" }}>
          <h1
            style={{
              margin: "0 0 6px",
              display: "flex",
              alignItems: "baseline",
              flexWrap: "wrap",
              gap: "4px 12px",
              font: `700 clamp(24px,2.8vw,32px)/1.1 ${font.display}`,
              fontVariationSettings: "'wdth' 108",
              letterSpacing: "-.025em",
              color: color.ink,
            }}
          >
            {title}
            {listed !== undefined && (
              <span
                style={{
                  font: `500 13px/1 ${font.mono}`,
                  letterSpacing: ".04em",
                  color: color.neutral[600],
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {listed} listed
              </span>
            )}
          </h1>
          <p style={{ margin: 0, font: `400 14px/1.5 ${font.sans}`, color: color.neutral[600] }}>
            {lede}
          </p>
        </div>

        <div
          className="cral-filterbar cral-hire-bar"
          style={{
            background: "#FFFFFF",
            border: `1px solid ${color.neutral[200]}`,
            borderRadius: 16,
            padding: 8,
            marginBottom: tags.length > 0 ? 10 : 16,
            boxShadow: "0 8px 22px rgba(11,15,26,.05)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <Dropdown
            variant="pill"
            label="Type"
            icon={<Car size={16} aria-hidden="true" />}
            value={type}
            neutralValue="all"
            placeholder="All"
            options={TYPE_OPTIONS.map((o) =>
              o.value === "all" ? { ...o, label: "All types" } : o,
            )}
            onChange={(v) => v !== type && onType(v as HireType)}
          />
          {bar}
          <div className="cral-hire-sort">
            <Dropdown
              variant="pill"
              label="Sort"
              icon={<ArrowsDownUp size={16} aria-hidden="true" />}
              value={sort}
              neutralValue="recommended"
              placeholder="Recommended"
              options={type === "all" ? ALL_SORT_OPTIONS : SORT_OPTIONS}
              onChange={(v) => onSort(v === "recommended" ? "" : v)}
            />
          </div>
        </div>

        {tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
            {tags.map((t) => (
              <button
                key={t.key}
                type="button"
                className="cral-tag"
                onClick={t.remove}
                aria-label={`Remove ${t.label}`}
              >
                {t.label}
                <X size={13} weight="bold" aria-hidden="true" />
              </button>
            ))}
            <button
              type="button"
              onClick={onClearAll}
              className="cral-text-btn"
              style={{ color: color.cruzBlue }}
            >
              Clear all
            </button>
          </div>
        )}

        <div
          style={{
            minHeight: 20,
            marginBottom: 12,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "baseline",
          }}
        >
          {isLoading ? (
            <Skeleton height={16} width={140} />
          ) : (
            anyFilter &&
            results.length > 0 && (
              <span style={{ font: `600 14px/1.4 ${font.sans}`, color: color.ink }}>
                {results.length}
                {hasNextPage ? "+" : ""}{" "}
                {results.length === 1 && !hasNextPage ? "match" : "matches"}
              </span>
            )
          )}
          {note && (
            <span style={{ font: `400 13px/1.4 ${font.sans}`, color: color.neutral[600] }}>
              {note}
            </span>
          )}
        </div>

        {/* The first page failed: nothing to show, so the error takes the grid's place. */}
        {isError && results.length === 0 && <ListError onRetry={() => void list.refetch()} />}

        {!isLoading &&
          !isError &&
          results.length === 0 &&
          (anyFilter ? (
            <EmptyFiltered title={`No ${noun} match.`} hint={emptyHint} onClear={onClearAll} />
          ) : (
            <EmptyNone noun={noun} />
          ))}

        {(results.length > 0 || isLoading) && (
          <div className="cral-hire-grid">
            {results.map((v, i) => (
              <VehicleCard
                key={v.id}
                car={v}
                tint={CARD_TINTS[i % CARD_TINTS.length] as string}
                onOpen={() => onOpen(v)}
              />
            ))}
            {isLoading && <VehicleCardSkeletonGrid count={8} />}
            {isFetchingNextPage && <VehicleCardSkeletonGrid count={4} />}
          </div>
        )}

        {/* A later page failed: the cards already shown stay, and Try
            again asks for that page only. */}
        {list.isFetchNextPageError && !isFetchingNextPage && (
          <div style={{ paddingTop: 24 }}>
            <ListError onRetry={() => void list.fetchNextPage()} />
          </div>
        )}

        {hasNextPage && !isFetchingNextPage && !list.isFetchNextPageError && (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 24 }}>
            <button
              type="button"
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
              }}
            >
              Show 24 more
            </button>
          </div>
        )}

        {!isLoading && !hasNextPage && results.length > 0 && (
          <p
            style={{
              margin: "26px 0 0",
              textAlign: "center",
              font: `500 12px/1.4 ${font.mono}`,
              letterSpacing: ".08em",
              color: color.neutral[400],
            }}
          >
            {anyFilter ? `THAT'S EVERY ONE MATCHING THESE FILTERS` : `THAT'S EVERY ONE LISTED`}
          </p>
        )}
      </div>
    </div>
  );
}
