import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthShell } from "../components/auth/AuthShell.jsx";
import {
  CodeInput,
  Field,
  InfoBanner,
  PrimaryButton,
  ResendRow,
  TextInput,
} from "../components/auth/primitives.jsx";
import { S } from "../components/auth/styles.js";
import { register, requestOtp, verifySignupOtp } from "../lib/auth-api.js";
import { ApiClientError } from "../lib/api.js";

/**
 * Create account — the design's `isRegister` / `isRegisterVerify` branches,
 * built to the canvas exactly: email and a password, nothing else.
 *
 * Name and phone deliberately are not asked for here. They're collected in
 * onboarding, where the phone sits next to "this is where your payouts
 * land" and the reason for asking is self-evident — instead of putting an
 * SMS round-trip in front of someone who hasn't seen the product yet.
 * `GET /auth/registration-state` reports what's still outstanding.
 *
 * The one departure from the canvas copy is the password minimum: the
 * design says eight, spec §6 sets ten and checks it against a breach list,
 * so eight would be rejected server-side and the copy would be lying.
 */
export function CreateAccount(): JSX.Element {
  const navigate = useNavigate();
  const [step, setStep] = useState<"details" | "verify">("details");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        setError("An account with that email already exists. Try signing in instead.");
      } else {
        setError(err instanceof ApiClientError ? err.message : fallback);
      }
    } finally {
      setBusy(false);
    }
  }

  const createAccount = () =>
    run(async () => {
      await register(email.trim(), pw);
      setStep("verify");
    }, "We couldn't create that account. Please try again.");

  const verify = () =>
    run(async () => {
      await verifySignupOtp(email.trim(), code);
      navigate("/sign-in", { replace: true });
    }, "That code didn't work. Try again.");

  const resend = () =>
    run(async () => {
      await requestOtp(email.trim(), "signup");
    }, "We couldn't resend that code. Please try again.");

  if (step === "verify") {
    return (
      <AuthShell
        heading="Confirm your email"
        subheading="Enter the six-digit code we sent. Then we'll start on your company papers."
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
            text={`Code sent to ${email.trim()}`}
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
            <CodeInput
              id="reg-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
          </Field>
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? "Checking…" : "Verify and start setup"}
          </PrimaryButton>
          <ResendRow
            line="It expires in ten minutes."
            disabled={busy}
            onResend={() => void resend()}
          />
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading="Create your account"
      subheading="Email and a password to start. Company papers and vehicles come next."
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

        <PrimaryButton type="submit" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </PrimaryButton>

        <p style={S.terms}>
          By creating an account you agree to the CRAL merchant{" "}
          <a href="#" style={S.termsLink}>
            terms
          </a>{" "}
          and{" "}
          <a href="#" style={S.termsLink}>
            privacy notice
          </a>
          .
        </p>
      </form>
    </AuthShell>
  );
}
