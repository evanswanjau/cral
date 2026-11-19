import type { CSSProperties, ReactNode } from "react";
import type { CarInput } from "../../lib/garage-api.js";

/**
 * The car form (Phase 4 GS2), shared by "My cars" and the garage request
 * form's "another car" fields. The chassis number is optional here and is
 * shown only to a garage asked to quote, never publicly.
 *
 * Not from a canvas; built from tokens.ts and the towing form's fields.
 */

export type CarDraft = { make: string; model: string; year: string; plate: string; chassis_number: string };

export const EMPTY_CAR: CarDraft = { make: "", model: "", year: "", plate: "", chassis_number: "" };

export const fieldInput: CSSProperties = {
  width: "100%",
  height: 46,
  padding: "0 13px",
  border: "1px solid #CDD2DA",
  borderRadius: 8,
  font: "400 15px/1 'Instrument Sans',sans-serif",
  color: "#0B0F1A",
  background: "#FFFFFF",
  boxSizing: "border-box",
};

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }): JSX.Element {
  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <span style={{ display: "block", marginBottom: 6, font: "600 12.5px/1.3 'Instrument Sans',sans-serif", color: "#333B4A" }}>
        {label}
      </span>
      {children}
      {hint && <span style={{ display: "block", marginTop: 4, font: "400 12px/1.4 'Instrument Sans',sans-serif", color: "#838C9B" }}>{hint}</span>}
    </label>
  );
}

/** Null when the draft is ready to send; otherwise what to fix. */
export function carDraftProblem(d: CarDraft): string | null {
  const year = Number(d.year);
  if (d.make.trim().length < 2 || !d.model.trim()) return "Enter the car's make and model.";
  if (!Number.isInteger(year) || year < 1960 || year > new Date().getFullYear() + 1) return "Enter the year the car was made.";
  if (d.plate.trim().length < 4) return "Enter the number plate.";
  return null;
}

export function toCarInput(d: CarDraft): CarInput {
  return {
    make: d.make.trim(),
    model: d.model.trim(),
    year: Number(d.year),
    plate: d.plate.trim(),
    chassis_number: d.chassis_number.trim() || null,
  };
}

export function CarFields({ value, onChange }: { value: CarDraft; onChange: (next: CarDraft) => void }): JSX.Element {
  const set = (k: keyof CarDraft) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,150px),1fr))", gap: 12 }}>
      <Field label="Make">
        <input style={fieldInput} value={value.make} onChange={set("make")} placeholder="Toyota" autoComplete="off" />
      </Field>
      <Field label="Model">
        <input style={fieldInput} value={value.model} onChange={set("model")} placeholder="Fielder" autoComplete="off" />
      </Field>
      <Field label="Year">
        <input style={fieldInput} value={value.year} onChange={(e) => onChange({ ...value, year: e.target.value.replace(/\D/g, "").slice(0, 4) })} inputMode="numeric" placeholder="2014" />
      </Field>
      <Field label="Number plate">
        <input style={fieldInput} value={value.plate} onChange={set("plate")} placeholder="KDA 123B" autoComplete="off" />
      </Field>
      <div style={{ gridColumn: "1 / -1" }}>
        <Field label="Chassis number (optional)" hint="From the logbook. Only garages you ask see it, so they quote for your exact car.">
          <input style={fieldInput} value={value.chassis_number} onChange={set("chassis_number")} autoComplete="off" />
        </Field>
      </div>
    </div>
  );
}
