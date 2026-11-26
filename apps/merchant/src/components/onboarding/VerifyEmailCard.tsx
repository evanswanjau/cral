import { useState } from "react";
import { CodeInput } from "@cral/ui";
import { EnvelopeSimple } from "@phosphor-icons/react/dist/ssr/EnvelopeSimple";
import { O } from "./styles.js";
import { requestOtp, verifySignupOtp } from "../../lib/auth-api.js";

/**
 * The "Verify your email" step on Review (PR H6 of
 * `docs/plans/hire-that-works.md`). Submit is refused with
 * `email_not_verified` until the sign-in email has passed a code check, so
 * nobody goes live on an address nobody has read. Reuses the sign-up code
 * pair (`/auth/otp/request` + `/auth/otp/verify`, purpose `signup`), which
 * flips `users.email_verified` - no new endpoint.
 */
export function VerifyEmailCard({
  email,
  showError,
  onVerified,
}: {
  email: string;
  showError: boolean;
  onVerified: () => void;
}): JSX.Element {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [masked, setMasked] = useState("");

  async function send(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await requestOtp(email, "signup");
      setMasked(res.masked_destination);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await verifySignupOtp(email, code.trim());
      onVerified();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        ...O.card,
        marginBottom: 20,
        border: `1px solid ${showError ? "#F7BDC5" : "#F5D9A3"}`,
        background: showError ? "#FEF3F4" : "#FFFBF2",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <EnvelopeSimple size={18} weight="bold" color="#8A5200" />
        <div style={O.cardTitle}>Verify your email</div>
      </div>
      <p style={{ ...O.helper, marginTop: 0, marginBottom: 12 }}>
        We send booking requests and payout notices to {email || "your sign-in email"}. Confirm it with a code
        before you submit.
      </p>
      {!sent ? (
        <button type="button" style={{ ...O.primaryBtnSmall, height: 44 }} disabled={busy || !email} onClick={() => void send()}>
          {busy ? "Sending…" : "Send code"}
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ font: "500 13px/1.4 'Instrument Sans',sans-serif", color: "#475467" }}>
            Enter the 6-digit code we sent to {masked || email}.
          </span>
          <div style={{ display: "flex", alignItems: "stretch", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 220px", maxWidth: 360 }}>
              <CodeInput label="Email code" value={code} onChange={setCode} autoFocus />
            </div>
            <button
              type="button"
              style={{ ...O.primaryBtnSmall, height: 44, flex: "none" }}
              disabled={code.length !== 6 || busy}
              onClick={() => void confirm()}
            >
              {busy ? "Checking…" : "Confirm"}
            </button>
            <button
              type="button"
              style={{ ...O.secondaryBtnSmall, height: 44, flex: "none" }}
              disabled={busy}
              onClick={() => void send()}
            >
              Resend
            </button>
          </div>
        </div>
      )}
      {error && <div style={{ ...O.fieldError, marginTop: 6 }}>{error}</div>}
    </div>
  );
}
