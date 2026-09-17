import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Earnings } from "../components/onboarding/steps/Vehicles.js";
import { RateField } from "../components/onboarding/RateField.js";
import {
  EMPTY_VEHICLE_DETAILS,
  VehicleDetailsFields,
  type VehicleDetailsValue,
} from "../components/vehicle/VehicleDetailsFields.js";
import { COUNTIES } from "../lib/kenya.js";
import { BackButton, FormField, PrimaryButton, Select, TextInput } from "../components/onboarding/primitives.js";
import { O } from "../components/onboarding/styles.js";
import { P } from "../components/portal/styles.js";
import { useToast } from "../components/portal/Toast.js";
import { createVehicle } from "../lib/vehicles-api.js";

/**
 * A standalone "add a vehicle to an already-submitted fleet" screen - the
 * design's own prototype punts this ("lives in the onboarding flow"), but
 * onboarding is a one-time wizard that's already been submitted by the
 * time a merchant reaches this screen, so it needs its own home. Reuses
 * onboarding's field primitives for the same look, but talks to the
 * vehicles module rather than the onboarding draft. The logbook fields
 * are the shared `VehicleDetailsFields` (also used by the edit modal on
 * VehicleDetail).
 */
export function AddVehicle(): JSX.Element {
  const navigate = useNavigate();
  const flash = useToast();
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [details, setDetails] = useState<VehicleDetailsValue>(EMPTY_VEHICLE_DETAILS);
  const [county, setCounty] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [dailyRate, setDailyRate] = useState("");
  const [rateMode, setRateMode] = useState<"list" | "net">("list");

  const requiredFilled =
    details.make.trim() &&
    details.model.trim() &&
    details.year.trim() &&
    details.registration.trim() &&
    county.trim() &&
    pickupAddress.trim() &&
    dailyRate.trim();

  async function handleSave() {
    if (!requiredFilled) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createVehicle({
        type: details.type,
        make: details.make.trim(),
        model: details.model.trim(),
        year: details.year.trim(),
        registration: details.registration.trim(),
        transmission: details.transmission,
        fuel: details.fuel,
        colour: details.colour.trim() || undefined,
        county: county.trim(),
        pickup_address: pickupAddress.trim(),
        daily_rate: dailyRate.trim(),
        rate_mode: rateMode,
      });
      flash("Draft created - add its documents and photos next.", "#6FC8F0");
      navigate(`/vehicles/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that vehicle. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <BackButton onClick={() => navigate("/vehicles")}>← All vehicles</BackButton>
      <h1 style={P.h1}>Add a vehicle</h1>
      <p style={{ ...P.lede, marginBottom: 20 }}>
        Copy the make, model and registration straight from the logbook. Documents and photos come next.
      </p>

      {error && (
        <div style={{ marginBottom: 16, padding: "12px 14px", background: "#FDE7EA", border: "1px solid #F7BDC5", borderRadius: 8, color: "#A50E22", font: "600 13px/1.4 'Instrument Sans',sans-serif" }}>
          {error}
        </div>
      )}

      <div style={O.formRow}>
        <div style={O.formMain}>
      <div style={{ ...P.card, padding: 20 }}>
        <div style={O.formFields}>
          <VehicleDetailsFields value={details} onChange={setDetails} showErrors={showErrors} />
          <FormField label="County" required error={showErrors && !county.trim() ? "Required." : undefined} helper="Where this vehicle is based.">
            <Select value={county} onChange={(e) => setCounty(e.target.value)}>
              <option value="">Select a county</option>
              {COUNTIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Pickup address" required error={showErrors && !pickupAddress.trim() ? "Required." : undefined} helper="Road or estate, plus town - hirers see the area only.">
            <TextInput value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} placeholder="Westlands, Nairobi" error={showErrors && !pickupAddress.trim()} />
          </FormField>
          <div style={{ gridColumn: "1 / -1" }}>
            <RateField
              grossValue={dailyRate}
              mode={rateMode}
              onChange={(g, m) => {
                setDailyRate(g);
                setRateMode(m);
              }}
              error={showErrors && !dailyRate.trim()}
            />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
        <BackButton onClick={() => navigate("/vehicles")}>Cancel</BackButton>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {showErrors && !requiredFilled && (
            <span style={{ font: "600 13px/1 'Instrument Sans',sans-serif", color: "#D81E32" }}>Check the highlighted fields.</span>
          )}
          <PrimaryButton onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving…" : "Save vehicle"}
          </PrimaryButton>
        </div>
      </div>
        </div>

        <Earnings dailyRate={dailyRate} />
      </div>
    </div>
  );
}
