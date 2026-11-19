import { CheckSquare } from "@phosphor-icons/react/dist/ssr/CheckSquare";
import { Square } from "@phosphor-icons/react/dist/ssr/Square";
import { FormField, Select, TextInput } from "../onboarding/primitives.js";
import { O } from "../onboarding/styles.js";
import { P } from "../portal/styles.js";
import { COUNTIES } from "../../lib/kenya.js";
import { SERVICE_LABELS, SERVICE_TYPES, type OutletInput, type ServiceType } from "../../lib/outlets-api.js";

/**
 * The premises form, shared by "Add premises" and the detail screen's edit
 * modal (Phase 4 GS1). Not from a canvas; built from tokens.ts and the
 * portal's existing form primitives, the same as the driver form.
 */

export type OutletFormValue = OutletInput;

export const EMPTY_OUTLET: OutletFormValue = {
  name: "",
  address: "",
  county: "",
  phone: "",
  opening_hours: "",
  service_types: [],
};

export function outletFormMissing(v: OutletFormValue): boolean {
  return (
    v.name.trim().length < 2 ||
    v.address.trim().length < 5 ||
    !v.county ||
    v.opening_hours.trim().length < 3 ||
    v.service_types.length === 0
  );
}

export function OutletFields({
  value,
  onChange,
  showErrors,
  detailsLocked = false,
}: {
  value: OutletFormValue;
  onChange: (next: OutletFormValue) => void;
  showErrors: boolean;
  /** CRAL has these premises: name, address and county stay as sent. */
  detailsLocked?: boolean;
}): JSX.Element {
  const set = (k: Exclude<keyof OutletFormValue, "service_types">) => (e: { target: { value: string } }) =>
    onChange({ ...value, [k]: e.target.value });
  const err = (k: keyof OutletFormValue, min: number, msg: string) =>
    showErrors && String(value[k]).trim().length < min ? msg : undefined;
  const noService = showErrors && value.service_types.length === 0;

  function toggle(t: ServiceType) {
    const on = value.service_types.includes(t);
    onChange({ ...value, service_types: on ? value.service_types.filter((x) => x !== t) : [...value.service_types, t] });
  }

  return (
    <div style={O.formFields}>
      <FormField label="Name on site" required error={err("name", 2, "Enter the name customers see.")} helper="The name on your sign, as customers know it.">
        <TextInput value={value.name} onChange={set("name")} disabled={detailsLocked} error={!!err("name", 2, "x")} placeholder="Mwangi Motors" />
      </FormField>
      <FormField label="County" required error={showErrors && !value.county ? "Pick the county." : undefined}>
        <Select value={value.county} onChange={set("county")} disabled={detailsLocked}>
          <option value="">Select a county</option>
          {COUNTIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
      </FormField>
      <div style={{ gridColumn: "1 / -1" }}>
        <FormField
          label="Address"
          required
          error={err("address", 5, "Enter the street, building and how to find you.")}
          helper="Street, building and a landmark. Someone from CRAL visits this address."
        >
          <TextInput
            value={value.address}
            onChange={set("address")}
            disabled={detailsLocked}
            error={!!err("address", 5, "x")}
            placeholder="Enterprise Road, next to the Total station"
          />
        </FormField>
      </div>
      <FormField label="Opening hours" required error={err("opening_hours", 3, "Enter your opening hours.")}>
        <TextInput value={value.opening_hours} onChange={set("opening_hours")} error={!!err("opening_hours", 3, "x")} placeholder="Mon to Sat, 8am to 6pm" />
      </FormField>
      <FormField label="Phone at the premises" helper="Optional, if the premises has its own number.">
        <TextInput value={value.phone} onChange={set("phone")} inputMode="tel" placeholder="0712 345 678" />
      </FormField>
      <div style={{ gridColumn: "1 / -1" }}>
        <div style={{ ...O.label, marginBottom: 8 }}>
          Services you do here<span style={O.required}> *</span>
        </div>
        <div role="group" aria-label="Services you do here" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SERVICE_TYPES.map((t) => {
            const on = value.service_types.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(t)}
                style={{
                  ...P.actionBtn,
                  minHeight: 44,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: on ? "#EDEFFC" : "#FFFFFF",
                  borderColor: on ? "#0F23A8" : noService ? "#D81E32" : "#CDD2DA",
                  color: on ? "#0F23A8" : "#0B0F1A",
                }}
              >
                {on ? <CheckSquare size={18} weight="fill" color="#0F23A8" /> : <Square size={18} color="#A7AEBB" />}
                {SERVICE_LABELS[t]}
              </button>
            );
          })}
        </div>
        <div style={noService ? O.fieldError : O.helper}>
          {noService ? "Tick at least one service." : "Only what you can do on site today. The visit checks this."}
        </div>
      </div>
    </div>
  );
}
