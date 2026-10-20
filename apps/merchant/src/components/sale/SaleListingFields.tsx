import type { CSSProperties } from "react";
import { FormField, Select, TextInput, Toggle } from "../onboarding/primitives.js";
import { O } from "../onboarding/styles.js";
import { P } from "../portal/styles.js";
import { COUNTIES } from "../../lib/kenya.js";
import { VEHICLE_CATEGORIES } from "../../lib/vehicle-categories.js";
import type { SaleListingInput } from "../../lib/sales-api.js";

/**
 * The sale listing form, shared by "Sell a car" and the detail screen's
 * edit modal. Built from the portal's form primitives - the website canvas
 * has the selling vertical's promise, not a seller form.
 *
 * Three blocks, in the order a buyer reads them: the car, what's wrong
 * with it (the known-faults block is required - "it is the reason buyers
 * believe the rest of the advert"), and the price and where to see it.
 */

export const EMPTY_SALE: SaleListingInput = {
  category: "sedan",
  make: "",
  model: "",
  year: "",
  registration: "",
  chassis_number: "",
  mileage_km: "",
  engine_cc: "",
  transmission: "Automatic",
  fuel: "Petrol",
  colour: "",
  drive: "",
  import_status: "foreign_used",
  asking_price: "",
  negotiable: true,
  known_faults: "",
  accident_history: "none",
  accident_note: "",
  encumbered: false,
  service_history: "partial",
  county: "",
  viewing_area: "",
  description: "",
  auto_share_contact: false,
};

const REQUIRED: (keyof SaleListingInput)[] = [
  "make",
  "model",
  "year",
  "registration",
  "chassis_number",
  "mileage_km",
  "asking_price",
  "known_faults",
  "county",
  "viewing_area",
];

export function saleFormMissing(v: SaleListingInput): boolean {
  return REQUIRED.some((k) => !String(v[k]).trim()) || v.known_faults.trim().length < 4;
}

const sectionHead: CSSProperties = {
  font: "700 11px/1 'IBM Plex Mono',monospace",
  letterSpacing: "0.1em",
  color: "#5A6373",
  margin: "4px 0 12px",
};

export function SaleListingFields({
  value,
  onChange,
  showErrors,
  carLocked = false,
  plateLocked = false,
}: {
  value: SaleListingInput;
  onChange: (next: SaleListingInput) => void;
  showErrors: boolean;
  /** A reviewer has the car's details - only price, viewing and description stay editable. */
  carLocked?: boolean;
  /** Listed from a fleet car - the plate is that car's. */
  plateLocked?: boolean;
}): JSX.Element {
  const set = (k: keyof SaleListingInput) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  const digits = (k: keyof SaleListingInput) => (e: { target: { value: string } }) =>
    onChange({ ...value, [k]: e.target.value.replace(/\D/g, "") });
  const req = (k: keyof SaleListingInput) => (showErrors && !String(value[k]).trim() ? "Required." : undefined);
  const faultsError = showErrors && value.known_faults.trim().length < 4 ? 'Describe any known faults, or write "None known".' : undefined;
  const thisYear = new Date().getFullYear();

  return (
    <div>
      <div style={sectionHead}>THE CAR</div>
      <div style={O.formFields}>
        <FormField label="Type" required>
          <Select value={value.category} onChange={set("category")} disabled={carLocked}>
            {VEHICLE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Make" required error={req("make")}>
          <TextInput value={value.make} onChange={set("make")} placeholder="Toyota" disabled={carLocked} error={!!req("make")} />
        </FormField>
        <FormField label="Model" required error={req("model")}>
          <TextInput value={value.model} onChange={set("model")} placeholder="Fielder" disabled={carLocked} error={!!req("model")} />
        </FormField>
        <FormField label="Year of manufacture" required error={req("year")}>
          <TextInput value={value.year} onChange={digits("year")} inputMode="numeric" maxLength={4} placeholder={String(thisYear - 6)} disabled={carLocked} error={!!req("year")} />
        </FormField>
        <FormField label="Registration" required error={req("registration")} helper={plateLocked ? "From your fleet." : undefined}>
          <TextInput value={value.registration} onChange={set("registration")} placeholder="KDL 442N" disabled={carLocked || plateLocked} error={!!req("registration")} />
        </FormField>
        <FormField label="Chassis number" required error={req("chassis_number")} helper="Exactly as on the logbook.">
          <TextInput value={value.chassis_number} onChange={set("chassis_number")} disabled={carLocked} error={!!req("chassis_number")} />
        </FormField>
        <FormField label="Mileage (km)" required error={req("mileage_km")}>
          <TextInput value={value.mileage_km} onChange={digits("mileage_km")} inputMode="numeric" placeholder="96000" disabled={carLocked} error={!!req("mileage_km")} />
        </FormField>
        <FormField label="Engine (cc)">
          <TextInput value={value.engine_cc} onChange={digits("engine_cc")} inputMode="numeric" placeholder="1500" disabled={carLocked} />
        </FormField>
        <FormField label="Transmission" required>
          <Select value={value.transmission} onChange={set("transmission")} disabled={carLocked}>
            <option>Automatic</option>
            <option>Manual</option>
          </Select>
        </FormField>
        <FormField label="Fuel" required>
          <Select value={value.fuel} onChange={set("fuel")} disabled={carLocked}>
            <option>Petrol</option>
            <option>Diesel</option>
            <option>Hybrid</option>
            <option>Electric</option>
          </Select>
        </FormField>
        <FormField label="Drive">
          <Select value={value.drive} onChange={set("drive")} disabled={carLocked}>
            <option value="">Not sure</option>
            <option value="2wd">2WD</option>
            <option value="4wd">4WD</option>
            <option value="awd">AWD</option>
          </Select>
        </FormField>
        <FormField label="Colour">
          <TextInput value={value.colour} onChange={set("colour")} placeholder="Silver" disabled={carLocked} />
        </FormField>
        <FormField label="Where it came from" required>
          <Select value={value.import_status} onChange={set("import_status")} disabled={carLocked}>
            <option value="foreign_used">Foreign used (imported)</option>
            <option value="locally_used">Locally used</option>
            <option value="new">New</option>
          </Select>
        </FormField>
      </div>

      <div style={{ ...sectionHead, marginTop: 24 }}>WHAT A BUYER SHOULD KNOW</div>
      <FormField
        label="Known faults"
        required
        error={faultsError}
        helper={'Required. Anything you know is wrong, or "None known". It is the reason buyers believe the rest of the advert.'}
      >
        <textarea
          value={value.known_faults}
          onChange={set("known_faults")}
          disabled={carLocked}
          style={{ ...P.textarea, minHeight: 90, ...(faultsError ? { borderColor: "#D81E32" } : {}) }}
          placeholder="Air conditioning needs a regas. Small dent on the rear bumper."
        />
      </FormField>
      <div style={{ ...O.formFields, marginTop: 16 }}>
        <FormField label="Accident history" required>
          <Select value={value.accident_history} onChange={set("accident_history")} disabled={carLocked}>
            <option value="none">None</option>
            <option value="minor">Minor - cosmetic only</option>
            <option value="major">Major - structural or airbags</option>
          </Select>
        </FormField>
        <FormField label="Service history" required>
          <Select value={value.service_history} onChange={set("service_history")} disabled={carLocked}>
            <option value="full">Full, with records</option>
            <option value="partial">Partial</option>
            <option value="none">None</option>
          </Select>
        </FormField>
      </div>
      {value.accident_history !== "none" && (
        <div style={{ marginTop: 16 }}>
          <FormField label="What happened">
            <TextInput value={value.accident_note} onChange={set("accident_note")} disabled={carLocked} placeholder="Front bumper and bonnet replaced, 2023." />
          </FormField>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
        <Toggle on={value.encumbered} onToggle={() => !carLocked && onChange({ ...value, encumbered: !value.encumbered })} />
        <div>
          <div style={{ font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>A bank is on the logbook</div>
          <div style={O.helper}>The car is still being paid off. Buyers are told, and a bank clearance letter helps.</div>
        </div>
      </div>

      <div style={{ ...sectionHead, marginTop: 24 }}>PRICE AND VIEWING</div>
      <div style={O.formFields}>
        <FormField label="Asking price (KES)" required error={req("asking_price")} helper="CRAL takes no cut of the sale.">
          <TextInput value={value.asking_price} onChange={digits("asking_price")} inputMode="numeric" placeholder="1450000" error={!!req("asking_price")} />
        </FormField>
        <FormField label="County" required error={req("county")}>
          <Select value={value.county} onChange={set("county")}>
            <option value="">Pick a county</option>
            {COUNTIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Viewing area" required error={req("viewing_area")} helper="An area, not your street address.">
          <TextInput value={value.viewing_area} onChange={set("viewing_area")} placeholder="Kilimani" error={!!req("viewing_area")} />
        </FormField>
      </div>
      <div style={{ marginTop: 16 }}>
        <FormField label="Description" helper="No phone numbers or links - buyers reach you through CRAL.">
          <textarea value={value.description} onChange={set("description")} style={{ ...P.textarea, minHeight: 90 }} />
        </FormField>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Toggle on={value.negotiable} onToggle={() => onChange({ ...value, negotiable: !value.negotiable })} />
          <div style={{ font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>Price is negotiable</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Toggle on={value.auto_share_contact} onToggle={() => onChange({ ...value, auto_share_contact: !value.auto_share_contact })} />
          <div>
            <div style={{ font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>Share my number with buyers who ask</div>
            <div style={O.helper}>Off: you read each enquiry and choose who gets it.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
