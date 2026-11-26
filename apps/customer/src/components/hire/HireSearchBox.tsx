import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Car } from "@phosphor-icons/react/dist/ssr/Car";
import { earliestPickupDay } from "../../lib/hire-dates.js";
import { getCounties, getGroupCounties } from "../../lib/catalog-api.js";
import { Dropdown, PIN_ICON } from "../site/Dropdown.js";
import { TYPE_OPTIONS, type HireType } from "./hire-params.js";

/**
 * The home page's hire search (PR H4): Type, County, From, Until, Search.
 * Submitting goes to `/hire` with the choices filled in, the same keys
 * the results page reads (`type`, `county`, `from`, `to`). It began as the
 * old home hero's car search, moved to `/cars` in UI1b (`CarSearch`), and
 * came back to the front door with a Type field when H4 removed `/cars`.
 *
 * Counties come from `GET /catalog/counties` for the picked type - only
 * the ones with a live listing, busiest first - so it never offers a
 * county that only has trucks when Cars is picked. A county the new type
 * doesn't have is dropped. The quick-pick chips are the first seven.
 *
 * A truck is not booked by dates: its search asks for the route and load
 * on the results page instead, so the date fields step aside when Trucks
 * is picked.
 *
 * No count badge on a chip: a number next to a place name reads as "cars
 * available on your dates", which it is not.
 */
const COUNTY_CHIPS = 7;

export function HireSearchBox(): JSX.Element {
  const navigate = useNavigate();
  const [type, setType] = useState<HireType>("all");
  const { data: countyData } = useQuery({
    queryKey: type === "all" ? ["catalog", "counties"] : ["catalog", "counties", type],
    queryFn: () => (type === "all" ? getCounties() : getGroupCounties(type)),
  });
  const counties = (countyData?.counties ?? []).map((c) => c.county);
  const [picked, setCounty] = useState("");
  // Until the new type's counties arrive, keep the pick; after, drop one it lacks.
  const county = countyData && !counties.includes(picked) ? "" : picked;
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  // Nairobi's clock, not the browser's, and never today once six in the
  // evening has passed - cars are back with their owner by then.
  const min = earliestPickupDay();
  const dated = type !== "trucks";

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (type !== "all") params.set("type", type);
    if (county) params.set("county", county);
    if (dated && fromDate) params.set("from", fromDate);
    if (dated && toDate) params.set("to", toDate);
    navigate(`/hire${params.toString() ? `?${params}` : ""}`);
  };

  return (
    <div>
      <form onSubmit={submit} className="cral-search" aria-label="Search vehicles on hire">
        <Dropdown
          variant="field"
          label="WHAT"
          icon={<Car size={16} aria-hidden="true" />}
          value={type}
          placeholder="All vehicles"
          neutralValue="all"
          options={TYPE_OPTIONS.map((o) =>
            o.value === "all" ? { ...o, label: "All vehicles" } : o,
          )}
          onChange={(v) => setType(v as HireType)}
        />
        <Dropdown
          variant="field"
          label="COUNTY"
          icon={PIN_ICON}
          value={county}
          placeholder="Any county"
          disabled={counties.length === 0}
          options={[
            { value: "", label: "Any county" },
            ...counties.map((c) => ({ value: c, label: c })),
          ]}
          onChange={setCounty}
        />
        {dated && (
          <>
            <label className="cral-search-field">
              <CalendarIcon />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="cral-search-label">FROM</span>
                <input
                  name="from"
                  type="date"
                  min={min}
                  value={fromDate}
                  className="cral-search-input"
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    if (toDate && e.target.value && toDate < e.target.value) setToDate("");
                  }}
                />
              </span>
            </label>
            <label className="cral-search-field" style={{ borderRight: "none" }}>
              <CalendarIcon />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="cral-search-label">UNTIL</span>
                <input
                  name="to"
                  type="date"
                  min={fromDate || min}
                  value={toDate}
                  className="cral-search-input"
                  onChange={(e) => setToDate(e.target.value)}
                />
              </span>
            </label>
          </>
        )}
        <button type="submit" className="cral-search-submit">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          Search
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
              onClick={() => setCounty(on ? "" : c)}
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
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
