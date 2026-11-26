import { useNavigate, useSearchParams } from "react-router-dom";
import type { DropdownOption } from "../site/Dropdown.js";
import type { CatalogSearchParams } from "../../lib/catalog-api.js";
import type { HireGroup } from "../../lib/vehicle-categories.js";

/**
 * What the one hire search page (`/hire`, PR H4) shares outside the
 * layout: the type list, the querystring helper and the sort lists.
 * Every filter lives in the querystring, so a reload, a shared link or
 * the back button keeps it; the cursor never does (a URL carrying page
 * four's cursor describes a list nobody can see).
 *
 * The type is `?type=cars|trucks|machinery`; no type (or one nobody
 * offers) is "All". The county is `county` for every type, a truck's
 * "from" county included, so it survives a change of type.
 */

export type HireType = "all" | HireGroup;

export const HIRE_TYPES: Array<{
  value: HireType;
  label: string;
  menu: string;
  title: string;
  noun: string;
}> = [
  { value: "all", label: "All", menu: "All vehicles", title: "Vehicles on hire", noun: "vehicles" },
  { value: "cars", label: "Cars", menu: "Cars", title: "Cars on hire", noun: "cars" },
  { value: "trucks", label: "Trucks", menu: "Trucks", title: "Trucks on hire", noun: "trucks" },
  {
    value: "machinery",
    label: "Machinery",
    menu: "Machinery",
    title: "Machinery on hire",
    noun: "machinery",
  },
];

export const TYPE_OPTIONS: DropdownOption[] = HIRE_TYPES.map((t) => ({
  value: t.value,
  label: t.label,
}));

export function parseHireType(raw: string | null): HireType {
  return HIRE_TYPES.some((t) => t.value === raw) ? (raw as HireType) : "all";
}

export function hireTypeInfo(type: HireType): (typeof HIRE_TYPES)[number] {
  return HIRE_TYPES.find((t) => t.value === type) ?? (HIRE_TYPES[0] as (typeof HIRE_TYPES)[number]);
}

/** `/hire` for All, `/hire?type=cars` for the rest - the menu's and the footer's links. */
export function hireHref(type: HireType): string {
  return type === "all" ? "/hire" : `/hire?type=${type}`;
}

export const SORT_OPTIONS: DropdownOption[] = [
  { value: "recommended", label: "Recommended" },
  { value: "price_asc", label: "Price, low to high" },
  { value: "price_desc", label: "Price, high to low" },
  { value: "newest", label: "Newest" },
  { value: "rating_desc", label: "Best-rated owners" },
];

/**
 * "All" mixes per-day cars and machines with per-trip and quote-first
 * trucks, so a price order would compare a day with a trip and put every
 * quote-first truck at one end. All sorts by recommended (newest first),
 * newest or best-rated owners only; a price sort in an "All" link is
 * ignored.
 */
export const ALL_SORT_OPTIONS: DropdownOption[] = SORT_OPTIONS.filter(
  (o) => !o.value.startsWith("price_"),
);

const SORTS = new Set(SORT_OPTIONS.map((o) => o.value));

/** What a change of type keeps: where and when, and a sort the new type offers. */
const KEPT_ON_TYPE_CHANGE = ["county", "from", "to", "sort"] as const;

/** A filter that is set, said once, removable in one click. */
export interface ActiveTag {
  key: string;
  label: string;
  remove: () => void;
}

export function useHireParams() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const get = (k: string): string => params.get(k) ?? "";
  const type = parseHireType(params.get("type"));
  const rawSort = get("sort");
  const allowed = type === "all" ? ALL_SORT_OPTIONS : SORT_OPTIONS;
  const sort = (allowed.some((o) => o.value === rawSort) ? rawSort : "recommended") as NonNullable<
    CatalogSearchParams["sort"]
  >;

  /** Patch the querystring; a blank value removes the key. Replaces the history entry. */
  const set = (patch: Record<string, string | undefined>): void => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  /** Drop the given keys, keep everything else (the type, the sort, a truck's destination). */
  const clear = (keys: readonly string[]): void =>
    set(Object.fromEntries(keys.map((k) => [k, undefined])));

  /**
   * A new type is a new list, so it gets its own history entry. County and
   * dates stay; every filter only one type has (seats, load, machine) goes.
   */
  const changeType = (to: HireType): void => {
    navigate(typeChangeHref(to, params));
  };

  return { params, get, set, clear, sort, type, changeType };
}

export function typeChangeHref(to: HireType, params: URLSearchParams): string {
  const q = new URLSearchParams();
  if (to !== "all") q.set("type", to);
  for (const k of KEPT_ON_TYPE_CHANGE) {
    const v = params.get(k);
    if (!v) continue;
    if (k === "sort" && (!SORTS.has(v) || (to === "all" && v.startsWith("price_")))) continue;
    q.set(k, v);
  }
  const s = q.toString();
  return `/hire${s ? `?${s}` : ""}`;
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

export const pick = (value: string, options: DropdownOption[]): string =>
  options.some((o) => o.value === value) ? value : "";
