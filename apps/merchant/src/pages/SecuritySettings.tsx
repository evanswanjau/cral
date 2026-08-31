import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BackButton, FormField, PrimaryButton, TextInput } from "../components/onboarding/primitives.js";
import { O } from "../components/onboarding/styles.js";
import { P } from "../components/portal/styles.js";
import { useToast } from "../components/portal/Toast.js";
import { ApiClientError } from "../lib/api.js";
import { toE164 } from "../lib/device.js";
import {
  disable2fa,
  enroll2fa,
  getTwoFactorState,
  sendTwoFactorChallenge,
  verify2fa,
} from "../lib/auth-api.js";

/**
 * Settings → Security. The first settings screen in the merchant portal —
 * built when SMS went live (owner's call, 2026-08-31) so opt-in two-factor
 * has a home. Deliberately plain: there's no canvas design for settings
 * yet, so this follows the portal's own card/primitive vocabulary rather
 * than inventing one.
 */
export function SecuritySettings(): JSX.Element {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["2fa"], queryFn: getTwoFactorState });
  const refresh = () => qc.invalidateQueries({ queryKey: ["2fa"] });

  return (
    <div style={{ maxWidth: 640 }}>
      <BackButton onClick={() => navigate("/vehicles")}>← Back to portal</BackButton>
      <h1 style={P.h1}>Security</h1>
      <p style={{ ...P.lede, marginBottom: 20 }}>
        Two-factor authentication adds a texted code to your password when you sign in.
      </p>

      {isLoading || !data ? (
        <div style={{ ...P.card, padding: 20 }}>Loading…</div>
      ) : data.enabled ? (
        <TwoFactorOn state={data} onChanged={refresh} />
      ) : (
        <TwoFactorOff onChanged={refresh} />
      )}
    </div>
  );
}

// --- enrolled -------------------------------------------------------

function TwoFactorOn({
  state,
  onChanged,
}: {
  state: { masked_destination: string | null; recovery_codes_remaining: number | null };
  onChanged: () => void;
}): JSX.Element {
  const flash = useToast();
  const [step, setStep] = useState<"idle" | "confirm">("idle");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await sendTwoFactorChallenge();
      setStep("confirm");
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Couldn't text a code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await disable2fa(password, code.trim());
      flash("Two-factor authentication is off.");
      onChanged();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "That didn't work. Check your password and code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...P.card, padding: 20, display: "grid", gap: 14 }}>
      <div>
        <div style={{ font: "700 15px/1.3 Archivo,sans-serif" }}>Two-factor is on</div>
        <div style={{ ...O.helper, marginTop: 4 }}>
          Codes text to {state.masked_destination ?? "your phone"} ·{" "}
          {state.recovery_codes_remaining ?? 0} recovery code
          {state.recovery_codes_remaining === 1 ? "" : "s"} left
        </div>
      </div>

      {step === "idle" ? (
        <button type="button" style={O.secondaryBtnSmall} disabled={busy} onClick={() => void sendCode()}>
          {busy ? "Texting…" : "Turn it off"}
        </button>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <FormField label="Your password">
            <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </FormField>
          <FormField label="Texted code (or a recovery code)">
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9A-Za-z-]/g, "").slice(0, 20))}
              inputMode="numeric"
              placeholder="123456"
            />
          </FormField>
          <PrimaryButton onClick={() => void turnOff()} disabled={busy || !password || code.trim().length < 6}>
            {busy ? "Turning off…" : "Turn off two-factor"}
          </PrimaryButton>
        </div>
      )}
      {error && <div style={O.fieldError}>{error}</div>}
    </div>
  );
}

// --- not enrolled -------------------------------------------------

function TwoFactorOff({ onChanged }: { onChanged: () => void }): JSX.Element {
  const flash = useToast();
  const [step, setStep] = useState<"phone" | "code" | "codes">("phone");
  const [digits, setDigits] = useState("");
  const [code, setCode] = useState("");
  const [masked, setMasked] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await enroll2fa(toE164(digits));
      setMasked(res.masked_destination);
      setStep("code");
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Couldn't text that number. Check it and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await verify2fa(code.trim());
      setRecoveryCodes(res.recovery_codes);
      setStep("codes");
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "That code isn't right.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "codes") {
    return (
      <div style={{ ...P.card, padding: 20, display: "grid", gap: 14 }}>
        <div>
          <div style={{ font: "700 15px/1.3 Archivo,sans-serif" }}>Two-factor is on</div>
          <div style={{ ...O.helper, marginTop: 4 }}>
            Save these ten recovery codes somewhere safe. Each works once if you can&rsquo;t get a text.
            This is the only time we&rsquo;ll show them.
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 8,
            font: "500 14px/1.4 'IBM Plex Mono',monospace",
            background: "#F8FAFC",
            border: "1px solid #E4E7EC",
            borderRadius: 10,
            padding: 14,
          }}
        >
          {recoveryCodes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <PrimaryButton
          onClick={() => {
            flash("Two-factor authentication is on.");
            onChanged();
          }}
        >
          I&rsquo;ve saved them
        </PrimaryButton>
      </div>
    );
  }

  return (
    <div style={{ ...P.card, padding: 20, display: "grid", gap: 14 }}>
      <div>
        <div style={{ font: "700 15px/1.3 Archivo,sans-serif" }}>Set up two-factor</div>
        <div style={{ ...O.helper, marginTop: 4 }}>
          Choose the number to text. It can be different from your payout number.
        </div>
      </div>

      {step === "phone" ? (
        <div style={{ display: "grid", gap: 12 }}>
          <FormField label="Phone number">
            <div style={{ display: "flex", gap: 8 }}>
              <span style={O.phonePrefix}>+254</span>
              <TextInput
                value={digits}
                onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 9))}
                placeholder="712 345 678"
                inputMode="tel"
                style={{ flex: 1 }}
              />
            </div>
          </FormField>
          <PrimaryButton onClick={() => void sendCode()} disabled={busy || digits.length < 9}>
            {busy ? "Texting…" : "Send code"}
          </PrimaryButton>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <FormField label={`6-digit code texted to ${masked}`}>
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="123456"
            />
          </FormField>
          <div style={{ display: "flex", gap: 10 }}>
            <PrimaryButton onClick={() => void confirm()} disabled={busy || code.length !== 6}>
              {busy ? "Checking…" : "Turn on two-factor"}
            </PrimaryButton>
            <button type="button" style={O.secondaryBtnSmall} disabled={busy} onClick={() => void sendCode()}>
              Resend
            </button>
          </div>
        </div>
      )}
      {error && <div style={O.fieldError}>{error}</div>}
    </div>
  );
}
