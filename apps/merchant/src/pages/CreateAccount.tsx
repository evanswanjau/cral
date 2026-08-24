import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthShell } from "../components/auth/AuthShell.jsx";
import {
  CodeInput,
  Field,
  InfoBanner,
  PhoneInput,
  PrimaryButton,
  ResendRow,
  TextInput,
} from "../components/auth/primitives.jsx";
import { S } from "../components/auth/styles.js";
import { register, requestOtp, verifySignupOtp } from "../lib/auth-api.js";
import { toE164 } from "../lib/device.js";
import { ApiClientError } from "../lib/api.js";

/**
 * Create account — the design's `isRegister` / `isRegisterVerify` branches.
 *
 * Two deliberate deviations from the canvas screen, both forced by the API
 * contract rather than by preference (flagged for a product decision):
 *  1. The canvas collects only email + password. `POST /auth/register`
 *     requires full_name and phone as well, because spec §4 makes the phone
 *     number the account's identity in Kenya — so those two fields are added
 *     here, in the same field vocabulary.
 *  2. The canvas verifies by emailing a code ("Change email"). The API sends
 *     the sign-up OTP to the phone, so the verify step here is phone-based.
 */
export function CreateAccount(): JSX.Element {
  const navigate = useNavigate();
  const [step, setStep] = useState<"details" | "verify">("details");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [reveal, setReveal] = useState(false);
  const [code, setCode] = useState("");

  async function run(fn: () => Promise<void>, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "account_exists") {
        setError("An account with that phone or email already exists. Try signing in instead.");
      } else {
        setError(err instanceof ApiClientError ? err.message : fallback);
      }
    } finally {
      setBusy(false);
    }
  }

  const createAccount = () =>
    run(async () => {
      await register({ full_name: fullName, phone: toE164(phone), email, password: pw });
      setStep("verify");
    }, "We couldn't create that account. Please try again.");

  const verify = () =>
    run(async () => {
      await verifySignupOtp(toE164(phone), code);
      navigate("/sign-in", { replace: true });
    }, "That code didn't work. Try again.");

  const resend = () =>
    run(async () => {
      await requestOtp(toE164(phone), "signup");
    }, "We couldn't resend that code. Please try again.");

  if (step === "verify") {
    return (
      <AuthShell
        heading="Confirm your number"
        subheading="We texted a six-digit code. Enter it to finish setting up your merchant account."
        error={error}
        footer={{ text: "Already have an account?", linkLabel: "Sign in", to: "/sign-in" }}
      >
        <form
          style={S.formStack}
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <InfoBanner
            text={`Code sent to +254 ${phone}`}
            action={
              <button
                type="button"
                onClick={() => {
                  setStep("details");
                  setCode("");
                  setError(null);
                }}
                style={{ ...S.inlineBtn, flex: "none" }}
              >
                Change
              </button>
            }
          />
          <Field id="reg-code" label="SIX-DIGIT CODE">
            <CodeInput id="reg-code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
          </Field>
          <PrimaryButton type="submit" disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : "Verify and start setup"}
          </PrimaryButton>
          <ResendRow line="It expires in ten minutes." disabled={busy} onResend={() => void resend()} />
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading="Create your account"
      subheading="List your vehicles, answer booking requests, and get paid straight to M-Pesa."
      showGoogle
      error={error}
      footer={{ text: "Already have an account?", linkLabel: "Sign in", to: "/sign-in" }}
    >
      <form
        style={S.formStack}
        onSubmit={(e) => {
          e.preventDefault();
          void createAccount();
        }}
      >
        <Field id="name" label="FULL NAME">
          <TextInput
            id="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Wanjiku Mwangi"
            autoComplete="name"
          />
        </Field>

        <Field
          id="reg-phone"
          label="M-PESA PHONE NUMBER"
          helper="This is how you sign in, and where your payouts go."
        >
          <PhoneInput id="reg-phone" value={phone} onChange={setPhone} />
        </Field>

        <Field id="email" label="EMAIL ADDRESS">
          <TextInput
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.co.ke"
            autoComplete="email"
          />
        </Field>

        <Field
          id="reg-pw"
          label="PASSWORD"
          helper="Ten characters or more. We check your number before anything else."
          action={
            <button type="button" onClick={() => setReveal((v) => !v)} style={S.inlineBtn}>
              {reveal ? "Hide" : "Show"}
            </button>
          }
        >
          <TextInput
            id="reg-pw"
            type={reveal ? "text" : "password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="At least 10 characters"
            autoComplete="new-password"
          />
        </Field>

        <PrimaryButton
          type="submit"
          disabled={busy || !fullName.trim() || !phone.trim() || !email.trim() || pw.length < 10}
        >
          {busy ? "Creating account…" : "Create account"}
        </PrimaryButton>

        <p style={S.terms}>
          By creating an account you agree to the CRAL merchant terms and privacy notice.
        </p>
      </form>
    </AuthShell>
  );
}
