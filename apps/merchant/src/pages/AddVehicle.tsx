import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Combobox } from "../components/onboarding/Combobox.js";
import { Earnings } from "../components/onboarding/steps/Vehicles.js";
import { RateField } from "../components/onboarding/RateField.js";
import { MAKE_NAMES, modelsForMake, POPULAR_KENYAN_MAKES } from "../lib/vehicle-catalogue.js";
import { VEHICLE_CATEGORIES, type VehicleType } from "../lib/vehicle-categories.js";
import { COUNTIES } from "../lib/kenya.js";
import { BackButton, FormField, PrimaryButton, Select, TextInput } from "../components/onboarding/primitives.js";
import { O } from "../components/onboarding/styles.js";
import { P } from "../components/portal/styles.js";
import { useToast } from "../components/portal/Toast.js";
import { createVehicle } from "../lib/vehicles-api.js";

type Transmission = "Automatic" | "Manual";
type Fuel = "Petrol" | "Diesel" | "Hybrid" | "Electric";

const VEHICLE_TYPES = VEHICLE_CATEGORIES;
const TRANSMISSIONS: Transmission[] = ["Automatic", "Manual"];
const FUELS: Fuel[] = ["Petrol", "Diesel", "Hybrid", "Electric"];

function formatPlate(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  return clean.length > 3 ? `${clean.slice(0, 3)} ${clean.slice(3)}` : clean;
}

/**
 * A standalone "add a vehicle to an already-submitted fleet" screen - the
 * design's own prototype punts this ("lives in the onboarding flow"), but
 * onboarding is a one-time wizard that's already been submitted by the
 * time a merchant reaches this screen, so it needs its own home. Reuses
 * onboarding's Combobox/vehicle-catalogue/primitives for the same look,
 * but talks to the vehicles module rather than the onboarding draft.
 */
export function AddVehicle(): JSX.Element {
  const navigate = useNavigate();
  const flash = useToast();
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<VehicleType>("sedan");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [registration, setRegistration] = useState("");
  const [transmission, setTransmission] = useState<Transmission>("Automatic");
  const [fuel, setFuel] = useState<Fuel>("Petrol");
  const [colour, setColour] = useState("");
  const [county, setCounty] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [dailyRate, setDailyRate] = useState("");
  const [rateMode, setRateMode] = useState<"list" | "net">("list");

  const requiredFilled = make.trim() && model.trim() && year.trim() && registration.trim() && county.trim() && pickupAddress.trim() && dailyRate.trim();

  async function handleSave() {
    if (!requiredFilled) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createVehicle({
        type,
        make: make.trim(),
        model: model.trim(),
        year: year.trim(),
        registration: registration.trim(),
        transmission,
        fuel,
        colour: colour.trim() || undefined,
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
          <FormField label="Vehicle type">
            <Select value={type} onChange={(e) => setType(e.target.value as VehicleType)}>
              {VEHICLE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Make" required error={showErrors && !make.trim() ? "Required." : undefined} helper="Pick from the list or type your own.">
            <Combobox value={make} onChange={setMake} options={MAKE_NAMES} defaultOptions={POPULAR_KENYAN_MAKES} placeholder="Toyota" error={showErrors && !make.trim()} emptyHint="Not listed - we'll use what you typed." />
          </FormField>
          <FormField label="Model" required error={showErrors && !model.trim() ? "Required." : undefined} helper="Include the trim if the logbook does.">
            <Combobox value={model} onChange={setModel} options={modelsForMake(make)} placeholder="Land Cruiser Prado" error={showErrors && !model.trim()} emptyHint="Not listed - we'll use what you typed." />
          </FormField>
          <FormField label="Year" required error={showErrors && !year.trim() ? "Required." : undefined} helper="Four digits.">
            <TextInput value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="2019" error={showErrors && !year.trim()} />
          </FormField>
          <FormField label="Registration" required error={showErrors && !registration.trim() ? "Required." : undefined} helper="Spaced and uppercased as you type.">
            <TextInput value={registration} onChange={(e) => setRegistration(formatPlate(e.target.value))} placeholder="KDL 442N" error={showErrors && !registration.trim()} />
          </FormField>
          <FormField label="Transmission">
            <Select value={transmission} onChange={(e) => setTransmission(e.target.value as Transmission)}>
              {TRANSMISSIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Fuel">
            <Select value={fuel} onChange={(e) => setFuel(e.target.value as Fuel)}>
              {FUELS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Colour" helper="As written in the logbook.">
            <TextInput value={colour} onChange={(e) => setColour(e.target.value)} placeholder="Pearl white" />
          </FormField>
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
