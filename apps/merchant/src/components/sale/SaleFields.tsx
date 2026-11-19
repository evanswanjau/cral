import { FormField, Select, TextInput } from "../onboarding/primitives.js";
import { O } from "../onboarding/styles.js";
import { COUNTIES } from "../../lib/kenya.js";
import {
  ACCIDENT_LABELS,
  BODY_LABELS,
  IMPORT_LABELS,
  type AccidentHistory,
  type BodyType,
  type ImportStatus,
  type SaleListing,
  type SaleListingInput,
} from "../../lib/sales-api.js";

/**
 * The sale listing form, shared by "List a car for sale" and the detail
 * screen's edit modal (Phase 6 CS1). Numbers are kept as typed text and
 * turned into the API's shape by `toInput`. Not from a canvas; built from
 * tokens.ts and the portal's form primitives, the same as the premises form.
 */

export interface SaleFormValue {
  body_type: BodyType | "";
  make: string;
  model: string;
  year: string;
  registration: string;
  mileage_km: string;
  transmission: "automatic" | "manual" | "";
  fuel: "petrol" | "diesel" | "hybrid" | "electric" | "";
  engine_cc: string;
  colour: string;
  import_status: ImportStatus | "";
  accident_history: AccidentHistory | "";
  known_faults: string;
  encumbered: "yes" | "no" | "";
  price: string;
  negotiable: boolean;
  county: string;
  viewing_area: string;
  description: string;
}

export const EMPTY_SALE: SaleFormValue = {
  body_type: "",
  make: "",
  model: "",
  year: "",
  registration: "",
  mileage_km: "",
  transmission: "",
  fuel: "",
  engine_cc: "",
  colour: "",
  import_status: "",
  accident_history: "",
  known_faults: "",
  encumbered: "",
  price: "",
  negotiable: true,
  county: "",
  viewing_area: "",
  description: "",
};

const digits = (s: string) => s.replace(/[^\d]/g, "");
const num = (s: string) => Number(digits(s));

export function fromListing(l: SaleListing): SaleFormValue {
  return {
    body_type: l.body_type,
    make: l.make,
    model: l.model,
    year: String(l.year),
    registration: l.registration,
    mileage_km: String(l.mileage_km),
    transmission: l.transmission,
    fuel: l.fuel,
    engine_cc: l.engine_cc ? String(l.engine_cc) : "",
    colour: l.colour ?? "",
    import_status: l.import_status,
    accident_history: l.accident_history,
    known_faults: l.known_faults,
    encumbered: l.encumbered ? "yes" : "no",
    price: String(Math.round(l.asking_price.amount / 100)),
    negotiable: l.negotiable,
    county: l.county,
    viewing_area: l.viewing_area,
    description: l.description ?? "",
  };
}

/** Which fields are missing or wrong; empty when the form can be saved. */
export function saleFormErrors(v: SaleFormValue): Partial<Record<keyof SaleFormValue, string>> {
  const e: Partial<Record<keyof SaleFormValue, string>> = {};
  const year = num(v.year);
  if (!v.body_type) e.body_type = "Pick the body type.";
  if (!v.make.trim()) e.make = "Enter the make.";
  if (!v.model.trim()) e.model = "Enter the model.";
  if (year < 1950 || year > new Date().getFullYear() + 1) e.year = "Enter the year of manufacture.";
  if (v.registration.trim().length < 4) e.registration = "Enter the registration plate.";
  if (!digits(v.mileage_km)) e.mileage_km = "Enter the mileage in km.";
  if (!v.transmission) e.transmission = "Pick the gearbox.";
  if (!v.fuel) e.fuel = "Pick the fuel.";
  if (!v.import_status) e.import_status = "Pick one.";
  if (!v.accident_history) e.accident_history = "Pick one.";
  if (v.known_faults.trim().length < 2) e.known_faults = 'Describe any known faults, or write "None known".';
  if (!v.encumbered) e.encumbered = "Pick one.";
  if (num(v.price) < 1000) e.price = "Enter the asking price in shillings.";
  if (!v.county) e.county = "Pick the county the car is in.";
  if (v.viewing_area.trim().length < 2) e.viewing_area = "Say roughly where a buyer can view it.";
  return e;
}

export function toInput(v: SaleFormValue): SaleListingInput {
  return {
    body_type: v.body_type as BodyType,
    make: v.make.trim(),
    model: v.model.trim(),
    year: num(v.year),
    registration: v.registration.trim().toUpperCase(),
    mileage_km: num(v.mileage_km),
    transmission: v.transmission as SaleListingInput["transmission"],
    fuel: v.fuel as SaleListingInput["fuel"],
    engine_cc: digits(v.engine_cc) ? num(v.engine_cc) : null,
    colour: v.colour.trim() || null,
    import_status: v.import_status as ImportStatus,
    accident_history: v.accident_history as AccidentHistory,
    known_faults: v.known_faults.trim(),
    encumbered: v.encumbered === "yes",
    asking_price: { amount: num(v.price) * 100, currency: "KES" },
    negotiable: v.negotiable,
    county: v.county,
    viewing_area: v.viewing_area.trim(),
    description: v.description.trim() || null,
  };
}

export function SaleFields({
  value,
  onChange,
  showErrors,
  checkedLocked = false,
}: {
  value: SaleFormValue;
  onChange: (next: SaleFormValue) => void;
  showErrors: boolean;
  /** Live or paused: only price, negotiable, viewing area and description change. */
  checkedLocked?: boolean;
}): JSX.Element {
  const errors = showErrors ? saleFormErrors(value) : {};
  const set = (k: keyof SaleFormValue) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  const lock = checkedLocked;
  const full = { gridColumn: "1 / -1" };

  return (
    <div style={O.formFields}>
      <FormField label="Make" required error={errors.make}>
        <TextInput value={value.make} onChange={set("make")} disabled={lock} error={!!errors.make} placeholder="Toyota" />
      </FormField>
      <FormField label="Model" required error={errors.model}>
        <TextInput value={value.model} onChange={set("model")} disabled={lock} error={!!errors.model} placeholder="Prado TX" />
      </FormField>
      <FormField label="Year of manufacture" required error={errors.year}>
        <TextInput value={value.year} onChange={set("year")} disabled={lock} error={!!errors.year} inputMode="numeric" placeholder="2016" />
      </FormField>
      <FormField label="Registration plate" required error={errors.registration} helper="As on the logbook. Buyers don't see it.">
        <TextInput value={value.registration} onChange={set("registration")} disabled={lock} error={!!errors.registration} placeholder="KDA 123A" />
      </FormField>
      <FormField label="Body type" required error={errors.body_type}>
        <Select value={value.body_type} onChange={set("body_type")} disabled={lock}>
          <option value="">Select</option>
          {Object.entries(BODY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </FormField>
      <FormField label="Mileage (km)" required error={errors.mileage_km}>
        <TextInput value={value.mileage_km} onChange={set("mileage_km")} disabled={lock} error={!!errors.mileage_km} inputMode="numeric" placeholder="98000" />
      </FormField>
      <FormField label="Gearbox" required error={errors.transmission}>
        <Select value={value.transmission} onChange={set("transmission")} disabled={lock}>
          <option value="">Select</option>
          <option value="automatic">Automatic</option>
          <option value="manual">Manual</option>
        </Select>
      </FormField>
      <FormField label="Fuel" required error={errors.fuel}>
        <Select value={value.fuel} onChange={set("fuel")} disabled={lock}>
          <option value="">Select</option>
          <option value="petrol">Petrol</option>
          <option value="diesel">Diesel</option>
          <option value="hybrid">Hybrid</option>
          <option value="electric">Electric</option>
        </Select>
      </FormField>
      <FormField label="Engine (cc)" helper="Optional.">
        <TextInput value={value.engine_cc} onChange={set("engine_cc")} disabled={lock} inputMode="numeric" placeholder="2800" />
      </FormField>
      <FormField label="Colour" helper="Optional.">
        <TextInput value={value.colour} onChange={set("colour")} disabled={lock} placeholder="Pearl white" />
      </FormField>
      <FormField label="Import status" required error={errors.import_status}>
        <Select value={value.import_status} onChange={set("import_status")} disabled={lock}>
          <option value="">Select</option>
          {Object.entries(IMPORT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </FormField>
      <FormField label="Accident history" required error={errors.accident_history}>
        <Select value={value.accident_history} onChange={set("accident_history")} disabled={lock}>
          <option value="">Select</option>
          {Object.entries(ACCIDENT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </FormField>
      <FormField
        label="Is a bank or lender on the logbook?"
        required
        error={errors.encumbered}
        helper="Common with financed cars. CRAL checks this against the logbook."
      >
        <Select value={value.encumbered} onChange={set("encumbered")} disabled={lock}>
          <option value="">Select</option>
          <option value="no">No, the logbook is clear</option>
          <option value="yes">Yes, a bank or lender is joint owner</option>
        </Select>
      </FormField>
      <FormField label="County" required error={errors.county}>
        <Select value={value.county} onChange={set("county")} disabled={lock}>
          <option value="">Select a county</option>
          {COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </FormField>
      <div style={full}>
        <FormField label="Known faults" required error={errors.known_faults} helper='Anything a buyer should know. "None known" is fine if that is true.'>
          <TextInput value={value.known_faults} onChange={set("known_faults")} disabled={lock} error={!!errors.known_faults} placeholder="None known" />
        </FormField>
      </div>
      <FormField label="Asking price (KES)" required error={errors.price}>
        <TextInput value={value.price} onChange={set("price")} error={!!errors.price} inputMode="numeric" placeholder="6450000" />
      </FormField>
      <FormField label="Open to offers?">
        <Select value={value.negotiable ? "yes" : "no"} onChange={(e) => onChange({ ...value, negotiable: e.target.value === "yes" })}>
          <option value="yes">Yes, the price is negotiable</option>
          <option value="no">No, the price is fixed</option>
        </Select>
      </FormField>
      <div style={full}>
        <FormField label="Where buyers can view it" required error={errors.viewing_area} helper="An area, not your street address.">
          <TextInput value={value.viewing_area} onChange={set("viewing_area")} error={!!errors.viewing_area} placeholder="Westlands" />
        </FormField>
      </div>
      <div style={full}>
        <FormField label="Description" helper="Optional. Service history, extras, why you're selling.">
          <TextInput value={value.description} onChange={set("description")} placeholder="Full service history at the dealer. New tyres in March." />
        </FormField>
      </div>
    </div>
  );
}
