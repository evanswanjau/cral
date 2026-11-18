import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { isTwoFactorRequired, login, register, requestOtp, verifySignupOtp } from "../lib/auth-api.js";
import { setSession } from "../lib/auth.js";
import { deviceId } from "../lib/device.js";
import { ApiClientError } from "../lib/api.js";
import { usePageTitle } from "../lib/use-page-title.js";
import { customerLegalUrl } from "../lib/customer-site.js";
import { rememberOffer } from "../lib/supplier-types.js";
import { forgetAgentCode, readAgentCode } from "../lib/agent-link.js";

/**
 * Create account - the design's `isRegister` / `isRegisterVerify` branches,
 * built to the canvas exactly: email and a password, nothing else.
 *
 * Name and phone deliberately are not asked for here. They're collected in
 * onboarding, where the phone sits next to "this is where your payouts
 * land" and the reason for asking is self-evident - instead of putting an
 * SMS round-trip in front of someone who hasn't seen the product yet.
 * `GET /auth/registration-state` reports what's still outstanding.
 *
 * The one departure from the canvas copy is the password minimum: the
 * design says eight, spec §6 sets ten and checks it against a breach list,
 * so eight would be rejected server-side and the copy would be lying.
 *
 * `?offer=<type>` (from a `/join/<type>` page) is kept in sessionStorage
 * for onboarding's "What do you offer?" step to pre-select. No API change.
 *
 * A sales agent's `?a=` code (PR AG2, kept by `App.tsx` from whichever page
 * the link opened) goes with the sign-up, so the agent gets the credit.
 */
export function CreateAccount(): JSX.Element {
  usePageTitle("Create your account");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const offer = params.get("offer");
  // sessionStorage outlives the email-code round trip into onboarding.
  useEffect(() => rememberOffer(offer), [offer]);
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
      await register(email.trim(), pw, readAgentCode());
      forgetAgentCode();
      setStep("verify");
    }, "We couldn't create that account. Please try again.");

  const verify = () =>
    run(async () => {
      await verifySignupOtp(email.trim(), code);
      // /auth/otp/verify's signup branch only flips email_verified - it
      // doesn't issue a session (see identity.yaml), so sign in with the
      // password still held in state rather than sending someone who just
      // finished signing up back to a sign-in form to type it again.
      const result = await login(email.trim(), pw, deviceId());
      if (isTwoFactorRequired(result)) {
        // Nobody can enrol yet (no settings UI), so a brand-new account
        // never hits this - but if that ever changes, fail toward sign-in
        // rather than pretending the session exists.
        navigate("/sign-in", { replace: true });
        return;
      }
      setSession(result, true);
      navigate("/onboarding", { replace: true });
    }, "That code didn't work. Try again.");

  const resend = () =>
    run(async () => {
      await requestOtp(email.trim(), "signup");
    }, "We couldn't resend that code. Please try again.");

  if (step === "verify") {
    return (
      <AuthShell
        panel="register"
        heading="Confirm your email"
        subheading="Enter the six-digit code we sent. Then we'll start on your details."
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
              label="Six-digit code"
              value={code}
              onChange={setCode}
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
      panel="register"
      heading="Create your account"
      subheading="Email and a password to start. Your details and what you offer come next."
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
          <a href={customerLegalUrl()} target="_blank" rel="noreferrer" style={S.termsLink}>
            terms
          </a>{" "}
          and{" "}
          <a href={customerLegalUrl()} target="_blank" rel="noreferrer" style={S.termsLink}>
            privacy notice
          </a>
          .
        </p>
      </form>
    </AuthShell>
  );
}
