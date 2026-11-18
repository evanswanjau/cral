import { useState, type CSSProperties, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { COUNTIES } from "../../lib/kenya.js";
import { TRUCK_TYPES } from "../../lib/vehicle-categories.js";
import { tonnesToKg } from "../site/TruckRouteFields.js";

/**
 * The `/trucks` hero's task card (UI2a): from county, to county, load,
 * truck type. A truck job starts with where the load goes, not with
 * car-hire dates. Submits to `/trucks/search?from_county&to_county&tonnes&truck_type`;
 * the search filters on the FROM county and the load, and carries the TO
 * county on into the request (lib/truck-route.ts).
 *
 * Validation is `truckRouteProblem`'s, in the same words, on the parts
 * asked here: both counties, and a weight that is a positive number of
 * tonnes or blank. The street addresses and what the load is come on the
 * truck's own page.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md section 5.3.
 */

export const fieldLabel: CSSProperties = {
  display: "block",
  font: "600 11px/1 'IBM Plex Mono',monospace",
  letterSpacing: ".08em",
  color: "#5A6373",
  marginBottom: 7,
};

export const fieldInput: CSSProperties = {
  width: "100%",
  height: 46,
  padding: "0 12px",
  border: "1px solid #CDD2DA",
  borderRadius: 8,
  font: "400 15px/1 'Instrument Sans',sans-serif",
  color: "#0B0F1A",
  background: "#FFFFFF",
};

export interface TruckSearchValues {
  fromCounty: string;
  toCounty: string;
  tonnes: string;
  truckType: string;
}

/** The first thing to fix, or null when the search can run. */
export function truckSearchProblem(v: TruckSearchValues): string | null {
  if (!v.fromCounty) return "Add where the truck collects the load.";
  if (!v.toCounty) return "Add where the load is going.";
  if (Number.isNaN(tonnesToKg(v.tonnes))) return "Give the weight in tonnes, like 3 or 1.5 - or leave it blank.";
  return null;
}

export function TruckSearch({ initial }: { initial?: Partial<TruckSearchValues> }): JSX.Element {
  const navigate = useNavigate();
  const [v, setV] = useState<TruckSearchValues>({
    fromCounty: initial?.fromCounty ?? "",
    toCounty: initial?.toCounty ?? "",
    tonnes: initial?.tonnes ?? "",
    truckType: initial?.truckType ?? "",
  });
  const [problem, setProblem] = useState<string | null>(null);
  const set = (patch: Partial<TruckSearchValues>) => {
    setV((cur) => ({ ...cur, ...patch }));
    setProblem(null);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = truckSearchProblem(v);
    if (p) {
      setProblem(p);
      return;
    }
    const q = new URLSearchParams();
    q.set("from_county", v.fromCounty);
    q.set("to_county", v.toCounty);
    if (v.tonnes.trim()) q.set("tonnes", v.tonnes.trim());
    if (v.truckType) q.set("truck_type", v.truckType);
    navigate(`/trucks/search?${q}`);
  };

  return (
    <form
      onSubmit={submit}
      aria-label="Find a truck"
      noValidate
      style={{
        background: "#FFFFFF",
        borderRadius: 12,
        padding: "clamp(16px,2.4vw,22px)",
        boxShadow: "0 18px 40px rgba(11,15,26,.28)",
        display: "grid",
        gap: 14,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <label style={{ minWidth: 0 }}>
          <span style={fieldLabel}>FROM (COUNTY)</span>
          <select value={v.fromCounty} onChange={(e) => set({ fromCounty: e.target.value })} style={fieldInput}>
            <option value="">Pick a county</option>
            {COUNTIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label style={{ minWidth: 0 }}>
          <span style={fieldLabel}>TO (COUNTY)</span>
          <select value={v.toCounty} onChange={(e) => set({ toCounty: e.target.value })} style={fieldInput}>
            <option value="">Pick a county</option>
            {COUNTIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label style={{ minWidth: 0 }}>
          <span style={fieldLabel}>LOAD (TONNES)</span>
          <input
            value={v.tonnes}
            onChange={(e) => set({ tonnes: e.target.value })}
            inputMode="decimal"
            placeholder="Optional, like 8"
            maxLength={10}
            style={fieldInput}
          />
        </label>
        <label style={{ minWidth: 0 }}>
          <span style={fieldLabel}>TRUCK TYPE</span>
          <select value={v.truckType} onChange={(e) => set({ truckType: e.target.value })} style={fieldInput}>
            <option value="">Any truck</option>
            {TRUCK_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {problem && (
        <p
          role="alert"
          style={{ margin: 0, font: "500 13px/1.5 'Instrument Sans',sans-serif", color: "#A50E22" }}
        >
          {problem}
        </p>
      )}
      <button
        type="submit"
        style={{
          height: 48,
          background: "#0F23A8",
          color: "#FFFFFF",
          border: "none",
          borderRadius: 8,
          font: "600 15px/1 'Instrument Sans',sans-serif",
          cursor: "pointer",
        }}
      >
        Find trucks
      </button>
    </form>
  );
}
