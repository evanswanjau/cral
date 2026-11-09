import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BackButton, PrimaryButton } from "../components/onboarding/primitives.js";
import { P } from "../components/portal/styles.js";
import { useToast } from "../components/portal/Toast.js";
import { EMPTY_SALE, SaleListingFields, saleFormMissing } from "../components/sale/SaleListingFields.js";
import { createSaleListing, type SaleListingInput } from "../lib/sales-api.js";
import { useVehicleDetail } from "../lib/vehicles-api.js";
import { usePageTitle } from "../lib/use-page-title.js";

/**
 * Sell a car (docs/plans/car-sales.md). `?vehicle=<id>` starts from a fleet
 * car: its details prefill and its logbook is copied onto the listing, so
 * only the photos and the disclosures are new work.
 */
export function AddSaleListing(): JSX.Element {
  usePageTitle("Sell a car");
  const navigate = useNavigate();
  const flash = useToast();
  const [params] = useSearchParams();
  const vehicleId = params.get("vehicle") ?? undefined;
  const { data: vehicle } = useVehicleDetail(vehicleId);
  const [value, setValue] = useState<SaleListingInput>(EMPTY_SALE);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vehicle) return;
    setValue((v) => ({
      ...v,
      category: vehicle.type,
      make: vehicle.make,
      model: vehicle.model,
      year: String(vehicle.year),
      registration: vehicle.registration,
      transmission: vehicle.transmission,
      fuel: vehicle.fuel,
      colour: vehicle.colour ?? "",
      county: vehicle.county ?? "",
    }));
  }, [vehicle]);

  async function save() {
    if (saleFormMissing(value)) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createSaleListing({ ...value, ...(vehicleId ? { vehicle_id: vehicleId } : {}) });
      flash("Saved as a draft - add the photos next.", "#6FC8F0");
      navigate(`/sales/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that listing. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const back = vehicleId ? `/vehicles/${vehicleId}` : "/sales";
  return (
    <div>
      <BackButton onClick={() => navigate(back)}>← {vehicleId ? "Back to the car" : "All listings"}</BackButton>
      <h1 style={P.h1}>{vehicle ? `Sell ${vehicle.make} ${vehicle.model}` : "Sell a car"}</h1>
      <p style={{ ...P.lede, marginBottom: 20 }}>
        Describe the car honestly. Next you add the logbook and eight photos, and a reviewer reads them before the advert goes live. Buyers never see your phone number unless you share it.
      </p>

      {error && (
        <div style={{ marginBottom: 16, padding: "12px 14px", background: "#FDE7EA", border: "1px solid #F7BDC5", borderRadius: 8, color: "#A50E22", font: "600 13px/1.4 'Instrument Sans',sans-serif" }}>
          {error}
        </div>
      )}

      <div style={{ ...P.card, padding: 20, maxWidth: 860 }}>
        <SaleListingFields value={value} onChange={setValue} showErrors={showErrors} plateLocked={!!vehicleId} />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, maxWidth: 860 }}>
        <BackButton onClick={() => navigate(back)}>Cancel</BackButton>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {showErrors && saleFormMissing(value) && (
            <span style={{ font: "600 13px/1 'Instrument Sans',sans-serif", color: "#D81E32" }}>Check the highlighted fields.</span>
          )}
          <PrimaryButton onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save and add photos"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
