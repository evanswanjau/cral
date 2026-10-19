import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { usePageTitle } from "../lib/use-page-title.js";
import { AuthShell } from "../components/auth/AuthShell.js";
import { Field, InfoBanner, PasswordField, PrimaryButton, TextInput } from "../components/auth/primitives.js";
import { bookingFromNext, safeNext, withNext } from "../components/auth/next.js";
import { S } from "../components/auth/styles.js";
import { login } from "../lib/auth-api.js";
import { setSession, deviceId } from "../lib/auth.js";
import { ApiClientError } from "../lib/api.js";

/**
 * `/sign-in`, in the merchant portal's auth layout (owner's call,
 * 2026-09-24). Email + password only: sign-in has no SMS mode (2026-08-24,
 * SMS is only ever a *second* factor), same as the merchant portal.
 *
 * The fields are plain controlled inputs inside a real `<form onSubmit>`.
 * An earlier version registered them through a `FormField` wrapper that
 * didn't forward its ref, so a browser- or password-manager-autofilled
 * value was read as empty and signing in "did nothing".
 */
export function SignIn(): JSX.Element {
  usePageTitle("Sign in");
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const fromBooking = bookingFromNext(next) !== null;
  // Set by ResetPassword on the way here.
  const justReset = (location.state as { justReset?: boolean } | null)?.justReset === true;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await login(email.trim(), password, deviceId());
      // A 2FA-enrolled account gets no tokens from this call - the session
      // is created by /auth/2fa/challenge. Storing the response blindly
      // would look signed in while every request 401s. No renter can enrol
      // today (the toggle is a merchant-portal screen), so this reports
      // rather than pretends.
      if (!result.access_token) {
        setError("This account needs a code to sign in. That step isn't built here yet - contact CRAL support.");
        return;
      }
      setSession(result);
      navigate(next, { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(
          err.code === "account_locked"
            ? "Too many failed attempts. Try again in a few minutes, or reset your password."
            : err.message,
        );
      } else {
        setError("Couldn't reach CRAL. Check your connection and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      panel="signin"
      next={next}
      heading="Sign in to CRAL"
      subheading={
        fromBooking
          ? "Sign in and you pick the hire up exactly where you left it."
          : "Welcome back. Enter your email and password to continue."
      }
      error={error}
      footer={{ text: "New to CRAL?", linkLabel: "Create an account", to: withNext("/create-account", next) }}
    >
      <form onSubmit={onSubmit} style={S.formStack} noValidate>
        {justReset && <InfoBanner text="Password changed. Sign in with your new one." />}
        <Field id="email" label="EMAIL ADDRESS">
          <TextInput
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </Field>
        <PasswordField
          id="password"
          label="PASSWORD"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          placeholder="Your password"
          action={
            <Link to={withNext("/forgot-password", next)} style={{ ...S.inlineBtn, textDecoration: "none" }}>
              Forgot it?
            </Link>
          }
        />
        <PrimaryButton type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
