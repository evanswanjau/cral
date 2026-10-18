import { FormField, Select, TextInput } from "../onboarding/primitives.js";
import { O } from "../onboarding/styles.js";
import { COUNTIES } from "../../lib/kenya.js";
import type { DriverInput } from "../../lib/drivers-api.js";

/**
 * The short driver form, shared by "Add a driver" and the detail screen's
 * edit modal. Deliberately light (owner's call, 2026-10-18): who they are,
 * their licence, where they work, and what they charge.
 */

export type DriverFormValue = Required<Omit<DriverInput, "is_account_holder">>;

export const EMPTY_DRIVER: DriverFormValue = {
  full_name: "",
  phone: "",
  national_id: "",
  kra_pin: "",
  licence_number: "",
  licence_expiry: "",
  county: "",
  daily_rate: "",
  hourly_rate: "",
  trip_rate: "",
};

export function driverFormMissing(v: DriverFormValue): boolean {
  return (
    !v.full_name.trim() ||
    !v.phone.trim() ||
    !v.national_id.trim() ||
    !v.kra_pin.trim() ||
    !v.licence_number.trim() ||
    !v.licence_expiry ||
    !v.county ||
    !(v.daily_rate.trim() || v.hourly_rate.trim() || v.trip_rate.trim())
  );
}

function todayIso(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function DriverFields({
  value,
  onChange,
  showErrors,
  identityLocked = false,
}: {
  value: DriverFormValue;
  onChange: (next: DriverFormValue) => void;
  showErrors: boolean;
  /** A reviewer has the identity fields - only county and rates stay editable. */
  identityLocked?: boolean;
}): JSX.Element {
  const set = (k: keyof DriverFormValue) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  const req = (k: keyof DriverFormValue) => (showErrors && !String(value[k]).trim() ? "Required." : undefined);
  const noRate = showErrors && !(value.daily_rate.trim() || value.hourly_rate.trim() || value.trip_rate.trim());
  const digits = (k: "daily_rate" | "hourly_rate" | "trip_rate") => (e: { target: { value: string } }) =>
    onChange({ ...value, [k]: e.target.value.replace(/\D/g, "") });

  return (
    <div style={O.formFields}>
      <FormField label="Full name" required error={req("full_name")} helper="As it appears on the licence.">
        <TextInput value={value.full_name} onChange={set("full_name")} disabled={identityLocked} error={!!req("full_name")} />
      </FormField>
      <FormField label="Phone" required error={req("phone")} helper="We text them the job details.">
        <TextInput value={value.phone} onChange={set("phone")} placeholder="0712 345 678" disabled={identityLocked} error={!!req("phone")} />
      </FormField>
      <FormField label="National ID number" required error={req("national_id")}>
        <TextInput value={value.national_id} onChange={set("national_id")} disabled={identityLocked} error={!!req("national_id")} />
      </FormField>
      <FormField label="KRA PIN" required error={req("kra_pin")}>
        <TextInput value={value.kra_pin} onChange={set("kra_pin")} disabled={identityLocked} error={!!req("kra_pin")} />
      </FormField>
      <FormField label="Licence number" required error={req("licence_number")}>
        <TextInput value={value.licence_number} onChange={set("licence_number")} disabled={identityLocked} error={!!req("licence_number")} />
      </FormField>
      <FormField label="Licence expiry" required error={req("licence_expiry")}>
        <TextInput type="date" min={todayIso()} value={value.licence_expiry} onChange={set("licence_expiry")} disabled={identityLocked} error={!!req("licence_expiry")} />
      </FormField>
      <FormField label="County" required error={req("county")} helper="Where they take jobs.">
        <Select value={value.county} onChange={set("county")}>
          <option value="">Select a county</option>
          {COUNTIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
      </FormField>
      <div style={{ gridColumn: "1 / -1" }}>
        <div style={{ ...O.label, marginBottom: 8 }}>
          Rates<span style={O.required}> *</span>
        </div>
        <div style={O.formFields}>
          <FormField label="Per day (KES)">
            <TextInput inputMode="numeric" value={value.daily_rate} onChange={digits("daily_rate")} placeholder="3000" error={noRate} />
          </FormField>
          <FormField label="Per hour (KES)">
            <TextInput inputMode="numeric" value={value.hourly_rate} onChange={digits("hourly_rate")} placeholder="500" error={noRate} />
          </FormField>
          <FormField label="Per trip (KES)">
            <TextInput inputMode="numeric" value={value.trip_rate} onChange={digits("trip_rate")} placeholder="8000" error={noRate} />
          </FormField>
        </div>
        <div style={{ ...(noRate ? O.fieldError : O.helper) }}>
          {noRate
            ? "Set at least one rate."
            : "Set any you offer. The hirer pays this; you keep it after CRAL's service fee (see the merchant terms)."}
        </div>
      </div>
    </div>
  );
}
