import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BackButton, PrimaryButton, Toggle } from "../components/onboarding/primitives.js";
import { O } from "../components/onboarding/styles.js";
import { P } from "../components/portal/styles.js";
import { useToast } from "../components/portal/Toast.js";
import { DriverFields, EMPTY_DRIVER, driverFormMissing, type DriverFormValue } from "../components/driver/DriverFields.js";
import { createDriver, useDriverList } from "../lib/drivers-api.js";
import { useProfile } from "../lib/settings-api.js";
import { usePageTitle } from "../lib/use-page-title.js";

/**
 * Add a driver (owner's call, 2026-10-18 - docs/plans/drivers.md). Built
 * from the portal's existing tokens and form primitives - there is no
 * canvas for drivers. "This is me" prefills from the account and reuses
 * the account's own ID and KRA PIN documents.
 */
export function AddDriver(): JSX.Element {
  usePageTitle("Add a driver");
  const navigate = useNavigate();
  const flash = useToast();
  const { data: profile } = useProfile();
  const { data: list } = useDriverList();
  const [value, setValue] = useState<DriverFormValue>(EMPTY_DRIVER);
  const [isMe, setIsMe] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canBeMe = profile?.owner_type === "individual" && !list?.data.some((d) => d.is_account_holder);

  function toggleMe() {
    const next = !isMe;
    setIsMe(next);
    if (next && profile) {
      setValue({
        ...value,
        full_name: [profile.first_name, profile.middle_name, profile.surname].filter(Boolean).join(" "),
        phone: profile.phone ?? "",
        national_id: profile.national_id ?? "",
        kra_pin: profile.kra_pin ?? "",
      });
    }
  }

  async function save() {
    if (driverFormMissing(value)) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createDriver({ ...value, is_account_holder: isMe });
      flash("Driver added - upload their documents next.", "#6FC8F0");
      navigate(`/drivers/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that driver. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <BackButton onClick={() => navigate("/drivers")}>← All drivers</BackButton>
      <h1 style={P.h1}>Add a driver</h1>
      <p style={{ ...P.lede, marginBottom: 20 }}>
        Hirers can book this driver with one of your cars, or to drive their own. You need their driving licence, national ID and KRA PIN.
      </p>

      {error && (
        <div style={{ marginBottom: 16, padding: "12px 14px", background: "#FDE7EA", border: "1px solid #F7BDC5", borderRadius: 8, color: "#A50E22", font: "600 13px/1.4 'Instrument Sans',sans-serif" }}>
          {error}
        </div>
      )}

      <div style={{ ...P.card, padding: 20, maxWidth: 820 }}>
        {canBeMe && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, paddingBottom: 16, borderBottom: "1px solid #E4E7EC" }}>
            <Toggle on={isMe} onToggle={toggleMe} />
            <div>
              <div style={{ font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>This is me</div>
              <div style={O.helper}>Uses your account details, ID and KRA PIN - you only add your licence.</div>
            </div>
          </div>
        )}
        <DriverFields value={value} onChange={setValue} showErrors={showErrors} />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, maxWidth: 820 }}>
        <BackButton onClick={() => navigate("/drivers")}>Cancel</BackButton>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {showErrors && driverFormMissing(value) && (
            <span style={{ font: "600 13px/1 'Instrument Sans',sans-serif", color: "#D81E32" }}>Check the highlighted fields.</span>
          )}
          <PrimaryButton onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save driver"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
