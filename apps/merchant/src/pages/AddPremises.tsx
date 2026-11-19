import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BackButton, PrimaryButton } from "../components/onboarding/primitives.js";
import { P } from "../components/portal/styles.js";
import { useToast } from "../components/portal/Toast.js";
import { EMPTY_OUTLET, OutletFields, outletFormMissing, type OutletFormValue } from "../components/outlet/OutletFields.js";
import { createOutlet, MIN_PHOTOS } from "../lib/outlets-api.js";
import { usePageTitle } from "../lib/use-page-title.js";

/**
 * Add premises (Phase 4 GS1): a garage, or (PT1) a spare parts shop,
 * pre-picked by `?kind=parts`. Saves a draft; photos and "Send for a
 * visit" happen on the premises screen next. Not from a canvas; built
 * from tokens.ts and the portal's form primitives (AddDriver).
 */
export function AddPremises(): JSX.Element {
  usePageTitle("Add premises");
  const navigate = useNavigate();
  const flash = useToast();
  const [params] = useSearchParams();
  const [value, setValue] = useState<OutletFormValue>({ ...EMPTY_OUTLET, kind: params.get("kind") === "parts" ? "parts" : "garage" });
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (outletFormMissing(value)) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createOutlet(value);
      flash(`Saved. Add at least ${MIN_PHOTOS} photos next.`, "#6FC8F0");
      navigate(`/premises/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save those premises. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <BackButton onClick={() => navigate("/premises")}>← All premises</BackButton>
      <h1 style={P.h1}>Add premises</h1>
      <p style={{ ...P.lede, marginBottom: 20 }}>
        Your garage or parts shop as customers will find it. After you save, add photos and send it to CRAL. Someone
        from CRAL visits before it can take requests.
      </p>

      {error && (
        <div style={{ marginBottom: 16, padding: "12px 14px", background: "#FDE7EA", border: "1px solid #F7BDC5", borderRadius: 8, color: "#A50E22", font: "600 13px/1.4 'Instrument Sans',sans-serif" }}>
          {error}
        </div>
      )}

      <div style={{ ...P.card, padding: 20, maxWidth: 820 }}>
        <OutletFields value={value} onChange={setValue} showErrors={showErrors} kindEditable />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 16, maxWidth: 820 }}>
        <BackButton onClick={() => navigate("/premises")}>Cancel</BackButton>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {showErrors && outletFormMissing(value) && (
            <span style={{ font: "600 13px/1 'Instrument Sans',sans-serif", color: "#D81E32" }}>Check the highlighted fields.</span>
          )}
          <PrimaryButton onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save premises"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
