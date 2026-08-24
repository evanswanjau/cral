import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell } from "../components/auth/AuthShell.jsx";
import { Checkbox, Field, PrimaryButton, TextInput } from "../components/auth/primitives.jsx";
import { S } from "../components/auth/styles.js";
import { isTwoFactorRequired, login } from "../lib/auth-api.js";
import { setSession } from "../lib/auth.js";
import { deviceId } from "../lib/device.js";
import { ApiClientError } from "../lib/api.js";

/**
 * Sign in — the design's `isPassword` branch only.
 *
 * The canvas also draws an SMS-code method (`isPhoneEntry` / `isCodeEntry`),
 * but accounts are email + password from sign-up onwards, so a phone may not
 * be on file at all and the tab was a dead end more often than not. Second
 * factors belong in account settings later, not as a competing way in.
 */
export function SignIn(): JSX.Element {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [reveal, setReveal] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);

  async function signInWithPassword() {
    setError(null);
    setBusy(true);
    try {
      const result = await login(email.trim(), pw, deviceId());
      // Nobody can be enrolled yet — settings has no 2FA screen — but the
      // API can return this branch, and it carries no tokens. Say so rather
      // than storing an undefined session.
      if (isTwoFactorRequired(result)) {
        setError("This account needs a sign-in code, and that step isn't built yet.");
        return;
      }
      setSession(result, remember);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "account_locked") {
        setError("Too many failed attempts. Try again in a few minutes, or reset your password.");
      } else {
        setError(
          err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.",
        );
      }
    } finally {
      setBusy(false);
    }
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
