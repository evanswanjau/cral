import { COUNTIES } from "../../lib/kenya.js";
import { VEHICLE_CATEGORIES } from "../../lib/vehicle-categories.js";
import type { SaleForm } from "../../lib/sales-api.js";
import { Check, Field, Grid, inputStyle, textareaStyle } from "./ui.js";

const REQUIRED: (keyof SaleForm)[] = [
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

export function saleFormIncomplete(f: SaleForm): boolean {
  return REQUIRED.some((k) => !String(f[k]).trim()) || f.known_faults.trim().length < 4;
}

const head = { margin: "6px 0 12px", font: "700 11px/1 'IBM Plex Mono',monospace", letterSpacing: "0.1em", color: "#5A6373" };

/**
 * The private seller's form - the same fields the merchant portal asks
 * for, in the customer site's own look. `carLocked` once a reviewer has
 * read the car's details: price, viewing and description stay editable.
 */
export function SaleFormFields({
  value,
  onChange,
  showErrors,
  carLocked = false,
}: {
  value: SaleForm;
  onChange: (next: SaleForm) => void;
  showErrors: boolean;
  carLocked?: boolean;
}): JSX.Element {
  const set = (k: keyof SaleForm) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  const digits = (k: keyof SaleForm) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value.replace(/\D/g, "") });
  const err = (k: keyof SaleForm) => (showErrors && !String(value[k]).trim() ? "Required." : undefined);
  const red = (k: keyof SaleForm) => ({ ...inputStyle, ...(err(k) ? { borderColor: "#D81E32" } : {}) });

  return (
    <div>
      <div style={head}>THE CAR</div>
      <Grid>
        <Field label="Type">
          <select value={value.category} onChange={set("category")} disabled={carLocked} style={inputStyle}>
            {VEHICLE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Make" error={err("make")}>
          <input value={value.make} onChange={set("make")} placeholder="Toyota" disabled={carLocked} style={red("make")} />
        </Field>
        <Field label="Model" error={err("model")}>
          <input value={value.model} onChange={set("model")} placeholder="Fielder" disabled={carLocked} style={red("model")} />
        </Field>
        <Field label="Year of manufacture" error={err("year")}>
          <input value={value.year} onChange={digits("year")} inputMode="numeric" maxLength={4} disabled={carLocked} style={red("year")} />
        </Field>
        <Field label="Registration" error={err("registration")}>
          <input value={value.registration} onChange={set("registration")} placeholder="KDL 442N" disabled={carLocked} style={red("registration")} />
        </Field>
        <Field label="Chassis number" error={err("chassis_number")} helper="Exactly as on the logbook. Never shown to buyers.">
          <input value={value.chassis_number} onChange={set("chassis_number")} disabled={carLocked} style={red("chassis_number")} />
        </Field>
        <Field label="Mileage (km)" error={err("mileage_km")}>
          <input value={value.mileage_km} onChange={digits("mileage_km")} inputMode="numeric" disabled={carLocked} style={red("mileage_km")} />
        </Field>
        <Field label="Engine (cc, optional)">
          <input value={value.engine_cc} onChange={digits("engine_cc")} inputMode="numeric" disabled={carLocked} style={inputStyle} />
        </Field>
        <Field label="Transmission">
          <select value={value.transmission} onChange={set("transmission")} disabled={carLocked} style={inputStyle}>
            <option>Automatic</option>
            <option>Manual</option>
          </select>
        </Field>
        <Field label="Fuel">
          <select value={value.fuel} onChange={set("fuel")} disabled={carLocked} style={inputStyle}>
            <option>Petrol</option>
            <option>Diesel</option>
            <option>Hybrid</option>
            <option>Electric</option>
          </select>
        </Field>
        <Field label="Where it came from">
          <select value={value.import_status} onChange={set("import_status")} disabled={carLocked} style={inputStyle}>
            <option value="foreign_used">Foreign used (imported)</option>
            <option value="locally_used">Locally used</option>
            <option value="new">New</option>
          </select>
        </Field>
      </Grid>

      <div style={head}>WHAT A BUYER SHOULD KNOW</div>
      <Field
        label="Known faults"
        error={showErrors && value.known_faults.trim().length < 4 ? 'Required. Anything you know is wrong, or "None known".' : undefined}
        helper='Required. Anything you know is wrong, or "None known". It is the reason buyers believe the rest of the advert.'
      >
        <textarea value={value.known_faults} onChange={set("known_faults")} disabled={carLocked} style={textareaStyle} />
      </Field>
      <Grid>
        <Field label="Accident history">
          <select value={value.accident_history} onChange={set("accident_history")} disabled={carLocked} style={inputStyle}>
            <option value="none">None</option>
            <option value="minor">Minor - cosmetic only</option>
            <option value="major">Major - structural or airbags</option>
          </select>
        </Field>
        <Field label="Service history">
          <select value={value.service_history} onChange={set("service_history")} disabled={carLocked} style={inputStyle}>
            <option value="full">Full, with records</option>
            <option value="partial">Partial</option>
            <option value="none">None</option>
          </select>
        </Field>
      </Grid>
      <Check
        on={value.encumbered}
        onToggle={() => !carLocked && onChange({ ...value, encumbered: !value.encumbered })}
        label="A bank is on the logbook"
        helper="The car is still being paid off. Buyers are told."
      />

      <div style={head}>PRICE AND VIEWING</div>
      <Grid>
        <Field label="Asking price (KES)" error={err("asking_price")} helper="CRAL takes no cut of the sale.">
          <input value={value.asking_price} onChange={digits("asking_price")} inputMode="numeric" style={red("asking_price")} />
        </Field>
        <Field label="County" error={err("county")}>
          <select value={value.county} onChange={set("county")} style={red("county")}>
            <option value="">Pick a county</option>
            {COUNTIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Viewing area" error={err("viewing_area")} helper="An area, not your street address.">
          <input value={value.viewing_area} onChange={set("viewing_area")} placeholder="Kilimani" style={red("viewing_area")} />
        </Field>
      </Grid>
      <Field label="Description (optional)" helper="No phone numbers or links - buyers reach you through CRAL.">
        <textarea value={value.description} onChange={set("description")} style={textareaStyle} />
      </Field>
      <Check on={value.negotiable} onToggle={() => onChange({ ...value, negotiable: !value.negotiable })} label="Price is negotiable" />
      <Check
        on={value.auto_share_contact}
        onToggle={() => onChange({ ...value, auto_share_contact: !value.auto_share_contact })}
        label="Share my number with buyers who ask"
        helper="Off: you read each enquiry and choose who gets your number."
      />
    </div>
  );
}
