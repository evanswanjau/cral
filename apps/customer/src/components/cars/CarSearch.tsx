import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { earliestPickupDay } from "../../lib/hire-dates.js";
import { getCounties } from "../../lib/catalog-api.js";
import { Dropdown, PIN_ICON } from "../site/Dropdown.js";

/**
 * The car search (county, from, until) and its county quick-picks, moved
 * unchanged from the old home page's hero (proposal 1.1 H1) to the
 * `/cars` hero in UI1b. It submits to
 * `/cars/search?county&from&to`.
 *
 * Counties come from `GET /catalog/counties` - only the ones that have a
 * live listing, busiest first. `COUNTY_CHIPS` caps the quick-pick row; the
 * dropdown lists them all. Until the list arrives (or if nothing is listed
 * anywhere) the field reads "Any county" and the search goes to /cars/search
 * unfiltered, rather than pre-filling a county that may have nothing in it.
 *
 * No count badge on a chip: a number next to a place name reads as "cars
 * available on your dates", which it is not.
 *
 * `/machinery` reuses it (UI2b) with `searchPath="/machinery/search"` and
 * its own button word; the counties are the catalog's, not per category.
 */
const COUNTY_CHIPS = 7;

export function CarSearch({
  searchPath = "/cars/search",
  noun = "cars",
}: {
  searchPath?: string;
  /** Button and form label word: "Search cars", "Search machinery". */
  noun?: string;
} = {}): JSX.Element {
  const navigate = useNavigate();
  const { data: countyData } = useQuery({ queryKey: ["catalog", "counties"], queryFn: getCounties });
  const counties = (countyData?.counties ?? []).map((c) => c.county);
  const [county, setCounty] = useState("");
  const [fromDate, setFromDate] = useState("");
  // Nairobi's clock, not the browser's, and never today once six in the
  // evening has passed - cars are back with their owner by then.
  const min = earliestPickupDay();

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["county", "from", "to"] as const) {
      const v = form.get(key);
      if (typeof v === "string" && v) params.set(key, v);
    }
    navigate(`${searchPath}${params.toString() ? `?${params}` : ""}`);
  };

  return (
    <div>
      <form onSubmit={submit} className="cral-search" aria-label={`Search ${noun}`}>
        <input type="hidden" name="county" value={county} />
        <Dropdown
          variant="field"
          label="COUNTY"
          icon={PIN_ICON}
          value={county}
          placeholder="Any county"
          disabled={counties.length === 0}
          options={counties.map((c) => ({ value: c, label: c }))}
          onChange={setCounty}
        />
        <label className="cral-search-field">
          <CalendarIcon />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="cral-search-label">FROM</span>
            <input
              name="from"
              type="date"
              min={min}
              className="cral-search-input"
              onChange={(e) => setFromDate(e.target.value)}
            />
          </span>
        </label>
        <label className="cral-search-field" style={{ borderRight: "none" }}>
          <CalendarIcon />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="cral-search-label">UNTIL</span>
            <input name="to" type="date" min={fromDate || min} className="cral-search-input" />
          </span>
        </label>
        <button type="submit" className="cral-search-submit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          Search {noun}
        </button>
      </form>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 13 }}>
        {counties.slice(0, COUNTY_CHIPS).map((c) => {
          const on = county === c;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => setCounty(c)}
              style={{
                minHeight: 44,
                padding: "0 14px",
                background: on ? "rgba(255,255,255,.09)" : "transparent",
                border: `1px solid ${on ? "#5F6B7D" : "#252B3A"}`,
                borderRadius: 999,
                cursor: "pointer",
                font: `${on ? 600 : 500} 13px/1 'Instrument Sans',sans-serif`,
                color: on ? "#FFFFFF" : "#C7CED8",
              }}
            >
              {c}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CalendarIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
