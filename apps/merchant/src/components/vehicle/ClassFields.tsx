import { FormField, Select, TextInput } from "../onboarding/primitives.js";
import { MACHINE_TYPES, type MachineType, type VehicleType } from "../../lib/vehicle-categories.js";

/**
 * The fields that depend on what kind of vehicle this is (PR H1 of
 * `docs/plans/hire-that-works.md`): seats for a car or van, a machine type
 * for machinery, and the plate - or, for a machine with none, its serial
 * number. Shared by onboarding's vehicle form and the portal's
 * `VehicleDetailsFields`, so the two ask the same questions.
 */

export type RegistrationKind = "plate" | "serial";

/** Seats are asked for a sedan, SUV or van; trucks and machines aren't picked by them. */
export function asksSeats(type: VehicleType): boolean {
  return type === "sedan" || type === "suv" || type === "van";
}

/** Seats typed as text -> a usable number, or null. 1 to 70, the API's range. */
export function seatsFromText(text: string): number | null {
  const n = Number(text);
  return Number.isInteger(n) && n >= 1 && n <= 70 ? n : null;
}

/** True when this is a machine and its type is still missing (the API refuses it at submission). */
export function machineTypeMissing(type: VehicleType, machineType: string): boolean {
  return type === "machinery" && !machineType;
}

/**
 * Kenyan plates are 3 letters + 3 digits + 1 letter (KDL 442N). Space is
 * inserted after the first three characters as the merchant types.
 */
export function formatPlate(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  return clean.length > 3 ? `${clean.slice(0, 3)} ${clean.slice(3)}` : clean;
}

/** A machine's serial number: uppercased, letters, digits and dashes, 20 at most (the column's size). */
export function formatSerial(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
}

export function SeatsField({
  value,
  onChange,
  showErrors,
}: {
  value: string;
  onChange: (next: string) => void;
  showErrors: boolean;
}): JSX.Element {
  const bad = showErrors && seatsFromText(value) === null;
  return (
    <FormField label="Seats" required error={bad ? "Enter a number, e.g. 5 or 7." : undefined} helper="Including the driver. Hirers filter on this.">
      <TextInput
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 2))}
        placeholder="5"
        error={bad}
      />
    </FormField>
  );
}

export function MachineTypeField({
  value,
  onChange,
  showErrors,
}: {
  value: MachineType | "";
  onChange: (next: MachineType | "") => void;
  showErrors: boolean;
}): JSX.Element {
  return (
    <FormField label="Machine type" required error={showErrors && !value ? "Pick the closest match." : undefined} helper="Hirers filter on this.">
      <Select value={value} onChange={(e) => onChange(e.target.value as MachineType | "")}>
        <option value="">Select a machine type</option>
        {MACHINE_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </Select>
    </FormField>
  );
}

/**
 * The plate field; for machinery, first asks whether the machine has a
 * plate at all (decision 4: a machine may list by serial number).
 * Switching between the two clears what was typed, since a plate and a
 * serial number are formatted differently.
 */
export function RegistrationField({
  type,
  kind,
  value,
  onChange,
  showErrors,
}: {
  type: VehicleType;
  kind: RegistrationKind;
  value: string;
  onChange: (next: { registration: string; registrationKind: RegistrationKind }) => void;
  showErrors: boolean;
}): JSX.Element {
  const serial = type === "machinery" && kind === "serial";
  const missing = showErrors && !value.trim();
  return (
    <>
      {type === "machinery" && (
        <FormField label="Number plate">
          <Select
            value={kind}
            onChange={(e) => onChange({ registration: "", registrationKind: e.target.value as RegistrationKind })}
          >
            <option value="plate">It has a number plate</option>
            <option value="serial">No plate: use the serial number</option>
          </Select>
        </FormField>
      )}
      <FormField
        label={serial ? "Serial number" : "Registration"}
        required
        error={missing ? "Required." : undefined}
        helper={serial ? "From the machine's plate or its papers." : "Spaced and uppercased as you type."}
      >
        <TextInput
          value={value}
          onChange={(e) =>
            onChange({
              registration: serial ? formatSerial(e.target.value) : formatPlate(e.target.value),
              registrationKind: serial ? "serial" : "plate",
            })
          }
          placeholder={serial ? "CAT0320DKJ12345" : "KDL 442N"}
          error={missing}
        />
      </FormField>
    </>
  );
}
