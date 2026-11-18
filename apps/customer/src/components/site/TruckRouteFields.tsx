import { COUNTIES } from "../../lib/kenya.js";
import type { TruckRequestFields } from "../../lib/bookings-api.js";

/**
 * Route and load on a truck request (PR T2 of
 * `docs/plans/trucks-and-sales-agents.md`). A truck is hired to move
 * something, so the owner needs from where, to where and what before they
 * can say yes. Four short questions, nothing else - the plan's rule is
 * "easy to use, not overwhelming", and labour/loaders are deliberately not
 * asked (client's call, 2026-11-10; a renter who needs hands says so in
 * the note).
 *
 * Not from a canvas file: the website canvas has no truck request screen.
 * Built in `Booking.tsx`'s own inline idiom (same label and field values)
 * so it sits in that card without looking added on.
 */

export interface TruckRouteDraft {
  fromAddress: string;
  fromCounty: string;
  toAddress: string;
  toCounty: string;
  cargo: string;
  /** As typed, in tonnes. Optional. */
  tonnes: string;
}

export const EMPTY_TRUCK_ROUTE: TruckRouteDraft = {
  fromAddress: "",
  fromCounty: "",
  toAddress: "",
  toCounty: "",
  cargo: "",
  tonnes: "",
};

/** Tonnes as typed -> kg, or null for blank. NaN for something that isn't a positive number. */
export function tonnesToKg(tonnes: string): number | null {
  const t = tonnes.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : Number.NaN;
}

/** What's still missing, as the first question to answer - or null when the request can go. */
export function truckRouteProblem(d: TruckRouteDraft, payloadKg: number | null): string | null {
  if (!d.fromAddress.trim() || !d.fromCounty) return "Add where the truck collects the load.";
  if (!d.toAddress.trim() || !d.toCounty) return "Add where the load is going.";
  if (!d.cargo.trim()) return "Say what the truck will be moving.";
  const kg = tonnesToKg(d.tonnes);
  if (Number.isNaN(kg)) return "Give the weight in tonnes, like 3 or 1.5 - or leave it blank.";
  if (kg !== null && payloadKg && kg > payloadKg) {
    return `This truck carries up to ${payloadKg / 1000} t. Pick a bigger truck, or split the load.`;
  }
  return null;
}

/** The request fields, once `truckRouteProblem` says there's nothing missing. */
export function truckRequestFields(d: TruckRouteDraft): TruckRequestFields {
  return {
    route_from: d.fromAddress.trim(),
    route_from_county: d.fromCounty,
    route_to: d.toAddress.trim(),
    route_to_county: d.toCounty,
    cargo_description: d.cargo.trim(),
    cargo_kg: tonnesToKg(d.tonnes),
  };
}

const label = {
  display: "block",
  font: "600 12px/1 'Instrument Sans',sans-serif",
  color: "#5A6373",
  marginBottom: 7,
} as const;

const field = {
  width: "100%",
  height: 46,
  padding: "0 13px",
  border: "1px solid #CDD2DA",
  borderRadius: 8,
  font: "400 15px/1 'Instrument Sans',sans-serif",
  color: "#0B0F1A",
  background: "#FFFFFF",
} as const;

function Place({
  title,
  address,
  county,
  placeholder,
  onAddress,
  onCounty,
}: {
  title: string;
  address: string;
  county: string;
  placeholder: string;
  onAddress: (v: string) => void;
  onCounty: (v: string) => void;
}): JSX.Element {
  return (
    <fieldset style={{ border: "none", padding: 0, margin: 0, minWidth: 0 }}>
      <legend style={{ ...label, padding: 0 }}>{title}</legend>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,150px)", gap: 8 }}>
        <input
          aria-label={`${title} - address`}
          value={address}
          onChange={(e) => onAddress(e.target.value)}
          maxLength={200}
          placeholder={placeholder}
          style={field}
        />
        <select aria-label={`${title} - county`} value={county} onChange={(e) => onCounty(e.target.value)} style={field}>
          <option value="">County</option>
          {COUNTIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}

export function TruckRouteFields({
  value,
  onChange,
  payloadKg,
}: {
  value: TruckRouteDraft;
  onChange: (next: TruckRouteDraft) => void;
  /** The truck's capacity, for the hint under the weight. */
  payloadKg: number | null;
}): JSX.Element {
  const set = (patch: Partial<TruckRouteDraft>) => onChange({ ...value, ...patch });
  return (
    <div style={{ display: "grid", gap: 16, marginBottom: 22 }}>
      <Place
        title="From"
        address={value.fromAddress}
        county={value.fromCounty}
        placeholder="Godown 14, Enterprise Road"
        onAddress={(v) => set({ fromAddress: v })}
        onCounty={(v) => set({ fromCounty: v })}
      />
      <Place
        title="To"
        address={value.toAddress}
        county={value.toCounty}
        placeholder="Site office, Kitengela"
        onAddress={(v) => set({ toAddress: v })}
        onCounty={(v) => set({ toCounty: v })}
      />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,150px)", gap: 8, alignItems: "end" }}>
        <label style={{ display: "block", minWidth: 0 }}>
          <span style={label}>What are you moving?</span>
          <input
            value={value.cargo}
            onChange={(e) => set({ cargo: e.target.value })}
            maxLength={300}
            placeholder="40 bags of cement"
            style={field}
          />
        </label>
        <label style={{ display: "block", minWidth: 0 }}>
          <span style={label}>Weight (t), optional</span>
          <input
            value={value.tonnes}
            onChange={(e) => set({ tonnes: e.target.value })}
            inputMode="decimal"
            placeholder={payloadKg ? `Up to ${payloadKg / 1000}` : "2"}
            style={field}
          />
        </label>
      </div>
    </div>
  );
}
