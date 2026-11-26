import { useSearchParams } from "react-router-dom";
import type { DropdownOption } from "../site/Dropdown.js";
import type { CatalogSearchParams } from "../../lib/catalog-api.js";
import type { HireGroup } from "../../lib/vehicle-categories.js";

/**
 * What the three hire listing pages (PR H3) share outside the layout:
 * the querystring helper, the sort list and the URL each page lives at.
 * Every filter lives in the querystring, so a reload, a shared link or
 * the back button keeps it; the cursor never does (a URL carrying page
 * four's cursor describes a list nobody can see).
 */

export const HIRE_PATH: Record<HireGroup, string> = {
  cars: "/cars/search",
  trucks: "/trucks/search",
  machinery: "/machinery/search",
};

export const SORT_OPTIONS: DropdownOption[] = [
  { value: "recommended", label: "Recommended" },
  { value: "price_asc", label: "Price, low to high" },
  { value: "price_desc", label: "Price, high to low" },
  { value: "newest", label: "Newest" },
  { value: "rating_desc", label: "Best-rated owners" },
];

const SORTS = new Set(SORT_OPTIONS.map((o) => o.value));

/** A filter that is set, said once, removable in one click. */
export interface ActiveTag {
  key: string;
  label: string;
  remove: () => void;
}

export function useHireParams() {
  const [params, setParams] = useSearchParams();
  const get = (k: string): string => params.get(k) ?? "";
  const rawSort = get("sort");
  const sort = (SORTS.has(rawSort) ? rawSort : "recommended") as NonNullable<CatalogSearchParams["sort"]>;

  /** Patch the querystring; a blank value removes the key. Replaces the history entry. */
  const set = (patch: Record<string, string | undefined>): void => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  /** Drop the given keys, keep everything else (the sort, a truck's destination). */
  const clear = (keys: readonly string[]): void => set(Object.fromEntries(keys.map((k) => [k, undefined])));

  return { params, get, set, clear, sort };
}

/** Removable tags for the set filters, labelled off the same option lists the controls use. */
export function tagsFor(
  entries: Array<[key: string, value: string, options: DropdownOption[], prefix?: string]>,
  set: (patch: Record<string, string | undefined>) => void,
): ActiveTag[] {
  return entries.flatMap(([key, value, options, prefix]) =>
    value
      ? [
          {
            key,
            label: `${prefix ?? ""}${options.find((o) => o.value === value)?.label ?? value}`,
            remove: () => set({ [key]: undefined }),
          },
        ]
      : [],
  );
}

/**
 * Where the Cars / Trucks / Machinery switch sends a renter, carrying what
 * means the same on the other page: county and dates between Cars and
 * Machinery; county <-> from county to and from Trucks. Filters that only
 * mean something on one page (seats, truck type, machine type) are left
 * behind.
 */
export function switchHref(to: HireGroup, from: HireGroup, params: URLSearchParams): string {
  const q = new URLSearchParams();
  const county = from === "trucks" ? params.get("from_county") : params.get("county");
  if (county) q.set(to === "trucks" ? "from_county" : "county", county);
  if (to !== "trucks" && from !== "trucks") {
    const a = params.get("from");
    const b = params.get("to");
    if (a && b) {
      q.set("from", a);
      q.set("to", b);
    }
  }
  const s = q.toString();
  return `${HIRE_PATH[to]}${s ? `?${s}` : ""}`;
}
