import { Combobox } from "../onboarding/Combobox.js";
import { FormField, Select, TextInput } from "../onboarding/primitives.js";
import { MAKE_NAMES, modelsForMake, POPULAR_KENYAN_MAKES } from "../../lib/vehicle-catalogue.js";
import { TRUCK_TYPES, VEHICLE_CATEGORIES, type TruckType, type VehicleType } from "../../lib/vehicle-categories.js";

export type Transmission = "Automatic" | "Manual";
export type Fuel = "Petrol" | "Diesel" | "Hybrid" | "Electric";

export const TRANSMISSIONS: Transmission[] = ["Automatic", "Manual"];
export const FUELS: Fuel[] = ["Petrol", "Diesel", "Hybrid", "Electric"];

export interface VehicleDetailsValue {
  type: VehicleType;
  make: string;
  model: string;
  year: string;
  registration: string;
  transmission: Transmission;
  fuel: Fuel;
  colour: string;
  /** Truck-only (PR T1). "" until picked. */
  truck_type: TruckType | "";
  /** Truck-only, in tonnes as typed ("4", "1.5"); sent to the API as kg. */
  payload_t: string;
}

/** Kilograms from what the merchant typed in tonnes, or null if it isn't a usable number. */
export function payloadKgFromTonnes(t: string): number | null {
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > 100) return null;
  return Math.round(n * 1000);
}

/** The inverse, for prefilling the form from a stored row. */
export function tonnesFromKg(kg: number | null | undefined): string {
  return kg ? String(kg / 1000) : "";
}

/** True when this is a truck and its type or capacity is still missing. */
export function truckDetailsMissing(value: VehicleDetailsValue): boolean {
  return value.type === "truck" && (!value.truck_type || payloadKgFromTonnes(value.payload_t) === null);
}

/** The truck fields as the API takes them - null for anything that isn't a truck. */
export function truckPayload(value: VehicleDetailsValue): { truck_type: string | null; payload_kg: number | null } {
  if (value.type !== "truck") return { truck_type: null, payload_kg: null };
  return { truck_type: value.truck_type || null, payload_kg: payloadKgFromTonnes(value.payload_t) };
}

export const EMPTY_VEHICLE_DETAILS: VehicleDetailsValue = {
  type: "sedan",
  make: "",
  model: "",
  year: "",
  registration: "",
  transmission: "Automatic",
  fuel: "Petrol",
  colour: "",
  truck_type: "",
  payload_t: "",
};

export function formatPlate(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  return clean.length > 3 ? `${clean.slice(0, 3)} ${clean.slice(3)}` : clean;
}

/** The logbook-derived fields, shared by the Add-a-vehicle page and the
 *  VehicleDetail "edit details" modal. Renders a run of `FormField`s (no
 *  grid wrapper - the caller supplies `O.formFields`). County / pickup
 *  address / rate are deliberately not here - the "Price & availability"
 *  modal owns those. */
export function VehicleDetailsFields({
  value,
  onChange,
  showErrors = false,
}: {
  value: VehicleDetailsValue;
  onChange: (next: VehicleDetailsValue) => void;
  showErrors?: boolean;
}): JSX.Element {
  const set = <K extends keyof VehicleDetailsValue>(key: K, v: VehicleDetailsValue[K]) => onChange({ ...value, [key]: v });

  return (
    <>
      <FormField label="Vehicle type">
        <Select value={value.type} onChange={(e) => set("type", e.target.value as VehicleType)}>
          {VEHICLE_CATEGORIES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </Select>
      </FormField>
      {value.type === "truck" && (
        <>
          <FormField label="Truck type" required error={showErrors && !value.truck_type ? "Pick the closest match." : undefined}>
            <Select value={value.truck_type} onChange={(e) => set("truck_type", e.target.value as TruckType | "")}>
              <option value="">Select a truck type</option>
              {TRUCK_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </FormField>
          <FormField
            label="Carries up to (tonnes)"
            required
            error={showErrors && payloadKgFromTonnes(value.payload_t) === null ? "Enter tonnes, e.g. 4 or 1.5." : undefined}
            helper="Hirers filter on this."
          >
            <TextInput
              inputMode="decimal"
              value={value.payload_t}
              onChange={(e) => set("payload_t", e.target.value.replace(/[^\d.]/g, "").slice(0, 5))}
              placeholder="4"
              error={showErrors && payloadKgFromTonnes(value.payload_t) === null}
            />
          </FormField>
        </>
      )}
      <FormField label="Make" required error={showErrors && !value.make.trim() ? "Required." : undefined} helper="Pick from the list or type your own.">
        <Combobox value={value.make} onChange={(v) => set("make", v)} options={MAKE_NAMES} defaultOptions={POPULAR_KENYAN_MAKES} placeholder="Toyota" error={showErrors && !value.make.trim()} emptyHint="Not listed - we'll use what you typed." />
      </FormField>
      <FormField label="Model" required error={showErrors && !value.model.trim() ? "Required." : undefined} helper="Include the trim if the logbook does.">
        <Combobox value={value.model} onChange={(v) => set("model", v)} options={modelsForMake(value.make)} placeholder="Land Cruiser Prado" error={showErrors && !value.model.trim()} emptyHint="Not listed - we'll use what you typed." />
      </FormField>
      <FormField label="Year" required error={showErrors && !value.year.trim() ? "Required." : undefined} helper="Four digits.">
        <TextInput value={value.year} onChange={(e) => set("year", e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="2019" error={showErrors && !value.year.trim()} />
      </FormField>
      <FormField label="Registration" required error={showErrors && !value.registration.trim() ? "Required." : undefined} helper="Spaced and uppercased as you type.">
        <TextInput value={value.registration} onChange={(e) => set("registration", formatPlate(e.target.value))} placeholder="KDL 442N" error={showErrors && !value.registration.trim()} />
      </FormField>
      <FormField label="Transmission">
        <Select value={value.transmission} onChange={(e) => set("transmission", e.target.value as Transmission)}>
          {TRANSMISSIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
      </FormField>
      <FormField label="Fuel">
        <Select value={value.fuel} onChange={(e) => set("fuel", e.target.value as Fuel)}>
          {FUELS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </Select>
      </FormField>
      <FormField label="Colour" helper="As written in the logbook.">
        <TextInput value={value.colour} onChange={(e) => set("colour", e.target.value)} placeholder="Pearl white" />
      </FormField>
    </>
  );
}
