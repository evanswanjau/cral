import { useEffect, useRef, useState, type ReactNode } from "react";
import { CodeInput } from "@cral/ui";
import { startPhoneVerification, confirmPhoneVerification, updateMyPhone } from "../../lib/auth-api.js";
import { ApiClientError } from "../../lib/api.js";

/**
 * Prove the account's phone with an SMS code, in place (UI3, proposal 1.1
 * row D4). Moved out of `Booking.tsx`'s verify stage unchanged in look and
 * copy, so the car booking and a driver request run the same step instead
 * of sending anyone to `/account` (which is the devices list and has no
 * phone step).
 *
 * It sends the first code itself when it mounts (once, even under
 * StrictMode's double effect), and calls `onVerified` once the code is
 * accepted. `startEditing` opens on "Use a different number", for an
 * account with no phone on it at all.
 *
 * Not from a canvas; the markup is Booking.tsx's verify stage, built from
 * tokens.ts.
 */

const label = {
  display: "block",
  font: "600 12px/1 'Instrument Sans',sans-serif",
  color: "#5A6373",
  marginBottom: 7,
} as const;

const monoField = {
  width: "100%",
  height: 46,
  padding: "0 13px",
  border: "1px solid #CDD2DA",
  borderRadius: 8,
  font: "500 15px/1 'IBM Plex Mono',monospace",
  color: "#0B0F1A",
  background: "#FFFFFF",
  boxSizing: "border-box",
} as const;

const linkButton = {
  background: "none",
  border: "none",
  minHeight: 44,
  padding: "0 4px",
  font: "500 13px/1 'Instrument Sans',sans-serif",
  cursor: "pointer",
} as const;

function ErrorNote({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div
      role="alert"
      style={{
        marginBottom: 16,
        padding: "13px 15px",
        background: "#FDE7EA",
        border: "1px solid #F7BDC5",
        borderRadius: 8,
        font: "500 13.5px/1.5 'Instrument Sans',sans-serif",
        color: "#A50E22",
      }}
    >
      {children}
    </div>
  );
}

export function PhoneVerify({
  onVerified,
  headingLevel = "h2",
  startEditing = false,
}: {
  onVerified: () => void;
  headingLevel?: "h1" | "h2";
  startEditing?: boolean;
}): JSX.Element {
  const [code, setCode] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [editingPhone, setEditingPhone] = useState(startEditing);
  const [newPhone, setNewPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sent = useRef(false);

  const failWith = (e: unknown) => {
    setError(e instanceof ApiClientError ? e.message : "Something went wrong. Try again.");
  };

  const sendCode = async () => {
    setError(null);
    try {
      const res = await startPhoneVerification();
      setMaskedPhone(res.masked_destination);
    } catch (e) {
      failWith(e);
    }
  };

  useEffect(() => {
    if (sent.current || startEditing) return;
    sent.current = true;
    void sendCode();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmCode = async () => {
    setError(null);
    if (code.trim().length < 4) {
      setError("Enter the code we texted you.");
      return;
    }
    setSubmitting(true);
    try {
      await confirmPhoneVerification(code.trim());
      setCode("");
      onVerified();
    } catch (e) {
      failWith(e);
    } finally {
      setSubmitting(false);
    }
  };

  const savePhone = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await updateMyPhone(newPhone);
      setEditingPhone(false);
      setNewPhone("");
      await sendCode();
    } catch (e) {
      failWith(e);
    } finally {
      setSubmitting(false);
    }
  };

  const primaryButton = {
    width: "100%",
    height: 50,
    background: "#0F23A8",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 8,
    font: "600 16px/1 'Instrument Sans',sans-serif",
    cursor: submitting ? "default" : "pointer",
    opacity: submitting ? 0.7 : 1,
  } as const;

  const Heading = headingLevel;

  return (
    <div>
      <Heading
        style={{
          margin: "0 0 8px",
          font: "700 clamp(22px,2.8vw,29px)/1.12 Archivo,sans-serif",
          fontVariationSettings: "'wdth' 108",
          letterSpacing: "-.025em",
          color: "#0B0F1A",
        }}
      >
        Confirm your phone number.
      </Heading>
      <p style={{ margin: "0 0 20px", font: "400 15px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
        {editingPhone
          ? "Add the number we should text a code to."
          : maskedPhone
            ? `We've sent an SMS code to ${maskedPhone}. Enter it below to continue.`
            : "We've sent you an SMS code. Enter it below to continue."}
      </p>

      {editingPhone ? (
        <div style={{ display: "grid", gap: 12, marginBottom: 18 }}>
          <label style={{ display: "block" }}>
            <span style={label}>Your phone number</span>
            <input
              type="tel"
              autoComplete="tel"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="0722 000 000"
              style={monoField}
            />
          </label>
          {error && <ErrorNote>{error}</ErrorNote>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={savePhone}
              disabled={submitting || !newPhone}
              style={{ ...primaryButton, width: "auto", padding: "0 20px" }}
            >
              {submitting ? "Saving…" : "Save and send a code"}
            </button>
            {!startEditing && (
              <button
                type="button"
                onClick={() => {
                  setEditingPhone(false);
                  setError(null);
                }}
                style={{
                  height: 50,
                  padding: "0 20px",
                  background: "#FFFFFF",
                  color: "#333B4A",
                  border: "1px solid #E4E7EC",
                  borderRadius: 8,
                  font: "600 15px/1 'Instrument Sans',sans-serif",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 18 }}>
            <span style={label}>The six-digit code</span>
            <CodeInput label="The six-digit code" value={code} onChange={setCode} autoFocus />
          </div>

          {error && <ErrorNote>{error}</ErrorNote>}

          <button type="button" onClick={confirmCode} disabled={submitting} style={primaryButton}>
            {submitting ? "Checking…" : "Confirm and continue"}
          </button>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginTop: 6 }}>
            <button type="button" onClick={sendCode} style={{ ...linkButton, color: "#0F23A8" }}>
              Send it again
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingPhone(true);
                setError(null);
              }}
              style={{ ...linkButton, color: "#5A6373" }}
            >
              Use a different number
            </button>
          </div>
        </>
      )}
    </div>
  );
}
