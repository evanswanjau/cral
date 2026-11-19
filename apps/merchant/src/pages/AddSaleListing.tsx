import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BackButton, PrimaryButton } from "../components/onboarding/primitives.js";
import { P } from "../components/portal/styles.js";
import { useToast } from "../components/portal/Toast.js";
import { EMPTY_SALE, SaleFields, saleFormErrors, toInput, type SaleFormValue } from "../components/sale/SaleFields.js";
import { createSaleListing, MIN_SALE_PHOTOS } from "../lib/sales-api.js";
import { usePageTitle } from "../lib/use-page-title.js";

/**
 * List a car for sale (Phase 6 CS1). Saves a draft; photos, the logbook
 * and "Send to CRAL" happen on the listing screen next. Not from a canvas;
 * built from tokens.ts and the portal's form primitives (AddPremises).
 */
export function AddSaleListing(): JSX.Element {
  usePageTitle("List a car for sale");
  const navigate = useNavigate();
  const flash = useToast();
  const [value, setValue] = useState<SaleFormValue>(EMPTY_SALE);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalid = Object.keys(saleFormErrors(value)).length > 0;

  async function save() {
    if (invalid) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createSaleListing(toInput(value));
      flash(`Saved. Add at least ${MIN_SALE_PHOTOS} photos and the logbook next.`, "#6FC8F0");
      navigate(`/sales/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this listing. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <BackButton onClick={() => navigate("/sales")}>← Cars for sale</BackButton>
      <h1 style={P.h1}>List a car for sale</h1>
      <p style={{ ...P.lede, marginBottom: 20 }}>
        The car as buyers will see it. After you save, add photos and the logbook and send it to CRAL. We check the
        listing against the logbook before it goes up.
      </p>

      {error && (
        <div style={{ marginBottom: 16, padding: "12px 14px", background: "#FDE7EA", border: "1px solid #F7BDC5", borderRadius: 8, color: "#A50E22", font: "600 13px/1.4 'Instrument Sans',sans-serif" }}>
          {error}
        </div>
      )}

      <div style={{ ...P.card, padding: 20, maxWidth: 820 }}>
        <SaleFields value={value} onChange={setValue} showErrors={showErrors} />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 16, maxWidth: 820 }}>
        <BackButton onClick={() => navigate("/sales")}>Cancel</BackButton>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {showErrors && invalid && (
            <span style={{ font: "600 13px/1 'Instrument Sans',sans-serif", color: "#D81E32" }}>Check the highlighted fields.</span>
          )}
          <PrimaryButton onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save listing"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
