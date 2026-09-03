import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell } from "../components/auth/AuthShell.jsx";
import { Checkbox, Field, PrimaryButton, TextInput } from "../components/auth/primitives.jsx";
import { S } from "../components/auth/styles.js";
import {
  completeTwoFactorChallenge,
  isTwoFactorRequired,
  login,
  resendTwoFactorChallenge,
} from "../lib/auth-api.js";
import { setSession } from "../lib/auth.js";
import { deviceId } from "../lib/device.js";
import { ApiClientError } from "../lib/api.js";
import { usePageTitle } from "../lib/use-page-title.js";

/**
 * Sign in - the design's `isPassword` branch only.
 *
 * Password is the only way in from this form. An account with opt-in SMS
 * 2FA (enrolled from Settings → Security) gets a second step here: the
 * password login returns no tokens, just a challenge, and the texted code
 * finishes it.
 */
export function SignIn(): JSX.Element {
  usePageTitle("Sign in");
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [reveal, setReveal] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);

  // Set once a password login comes back needing a code.
  const [challenge, setChallenge] = useState<{
    id: string;
    masked: string;
    channel: "sms" | "email";
  } | null>(null);
  const [code, setCode] = useState("");
  const [resending, setResending] = useState(false);
  const [resentNote, setResentNote] = useState<string | null>(null);

  async function signInWithPassword() {
    setError(null);
    setBusy(true);
    try {
      const result = await login(email.trim(), pw, deviceId());
      if (isTwoFactorRequired(result)) {
        setChallenge({ id: result.challenge_id, masked: result.masked_destination, channel: "sms" });
        return;
      }
      setSession(result, remember);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "account_locked") {
        setError("Too many failed attempts. Try again in a few minutes, or reset your password.");
      } else if (err instanceof ApiClientError && err.code === "invalid_credentials") {
        // The API's message says "phone or email" because it's shared with
        // the customer portal, which still supports both - merchant is
        // email-only, so override with copy that matches this form.
        setError("That email and password don't match.");
      } else {
        setError(
          err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    setError(null);
    setBusy(true);
    try {
      const result = await completeTwoFactorChallenge(challenge!.id, code.trim());
      setSession(result, remember);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "two_factor_challenge_expired") {
        setError("That sign-in attempt expired. Enter your password again.");
        setChallenge(null);
        setCode("");
      } else {
        setError(err instanceof ApiClientError ? err.message : "That code didn't work. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function resend(channel: "sms" | "email") {
    if (!challenge) return;
    setResending(true);
    setError(null);
    try {
      const res = await resendTwoFactorChallenge(challenge.id, channel);
      setChallenge({ id: res.challenge_id, masked: res.masked_destination, channel: res.channel });
      setCode("");
      setResentNote(
        channel === "email"
          ? `Sent a code to ${res.masked_destination}.`
          : `Texted a new code to ${res.masked_destination}.`,
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't send another code. Try again.");
    } finally {
      setResending(false);
    }
  }

  if (challenge) {
    const dest =
      challenge.channel === "email"
        ? `emailed a 6-digit code to ${challenge.masked}`
        : `texted a 6-digit code to ${challenge.masked}`;
    return (
      <AuthShell
        heading="Enter your code"
        subheading={`We ${dest}. It expires in 10 minutes.`}
        error={error}
      >
        <form
          style={S.formStack}
          onSubmit={(e) => {
            e.preventDefault();
            void submitCode();
          }}
        >
          <Field id="code" label="SIGN-IN CODE">
            <TextInput
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
            />
          </Field>
          <PrimaryButton type="submit" disabled={busy || code.trim().length !== 6}>
            {busy ? "Checking…" : "Finish signing in"}
          </PrimaryButton>

          {resentNote && <p style={S.helper}>{resentNote}</p>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            <button type="button" style={S.inlineBtn} disabled={resending} onClick={() => void resend("sms")}>
              Resend text
            </button>
            <button type="button" style={S.inlineBtn} disabled={resending} onClick={() => void resend("email")}>
              Email me the code instead
            </button>
          </div>
          <p style={S.helper}>
            Still not getting it? <a href="https://wa.me/254733376061?text=2FA%20help">Contact CRAL support</a>.
          </p>
          <button
            type="button"
            style={S.inlineBtn}
            onClick={() => {
              setChallenge(null);
              setCode("");
              setError(null);
              setResentNote(null);
            }}
          >
            Start over
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading="Sign in"
      subheading="Karibu tena. Use the email and password on your merchant account."
      showGoogle
      error={error}
      footer={{ text: "New to CRAL?", linkLabel: "Register instead", to: "/create-account" }}
    >
      <form
        style={S.formStack}
        onSubmit={(e) => {
          e.preventDefault();
          void signInWithPassword();
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
          id="pw"
          label="PASSWORD"
          action={
            <button type="button" onClick={() => setReveal((v) => !v)} style={S.inlineBtn}>
              {reveal ? "Hide" : "Show"}
            </button>
          }
        >
          <TextInput
            id="pw"
            type={reveal ? "text" : "password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Your password"
            autoComplete="current-password"
          />
        </Field>

        <div style={S.splitRow}>
          <Checkbox
            checked={remember}
            onToggle={() => setRemember((v) => !v)}
            label="Keep me signed in"
          />
          <Link to="/forgot-password" style={S.smallLink}>
            Forgot password?
          </Link>
        </div>

        <PrimaryButton type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
