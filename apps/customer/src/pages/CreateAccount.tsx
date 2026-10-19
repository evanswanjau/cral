import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { usePageTitle } from "../lib/use-page-title.js";
import { AuthShell } from "../components/auth/AuthShell.js";
import { Field, PasswordField, PrimaryButton, TextInput } from "../components/auth/primitives.js";
import { bookingFromNext, safeNext, withNext } from "../components/auth/next.js";
import { S } from "../components/auth/styles.js";
import { login, register as registerAccount } from "../lib/auth-api.js";
import { setSession, deviceId, TERMS_VERSION } from "../lib/auth.js";
import { ApiClientError } from "../lib/api.js";

/**
 * `/create-account`, in the merchant portal's auth layout (owner's call,
 * 2026-09-24).
 *
 * **It signs the new account in and resumes `next` itself.** An older
 * version sent people to `/sign-in` after an SMS code, which threw away
 * wherever they came from: someone half way through hiring a car had to
 * find it again and re-pick their dates. Registering and signing in are
 * one step here, and the last line of `submit` is the resume.
 *
 * Identity documents are **not** collected here. They are collected in the
 * booking flow, where the reason for asking is obvious, and `/documents`
 * covers the rest. The API gate (`documents_required`) is what actually
 * enforces them. The phone is verified the same way - at the booking
 * request, not in front of someone who just signed up.
 */
export function CreateAccount(): JSX.Element {
  usePageTitle("Create your account");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const booking = bookingFromNext(next);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [accountExists, setAccountExists] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setAccountExists(false);
    if (!fullName.trim() || !phone.trim() || !email.trim() || !password) {
      setError("Fill in your name, phone, email and password to continue.");
      return;
    }
    if (password.length < 10) {
      setError("Password needs to be at least 10 characters.");
      return;
    }

    setSubmitting(true);
    try {
      try {
        await registerAccount({
          email: email.trim(),
          password,
          role: "customer",
          full_name: fullName.trim(),
          phone: phone.trim(),
          accepted_terms_version: TERMS_VERSION,
        });
      } catch (err) {
        if (err instanceof ApiClientError && err.code === "account_exists") {
          setAccountExists(true);
          // The server names the field that collided - repeating "email"
          // when it was the phone sends people round in circles.
          setError(
            err.field === "phone"
              ? "That phone number is already on a CRAL account."
              : "That email already has a CRAL account.",
          );
          return;
        }
        throw err;
      }
      setSession(await login(email.trim(), password, deviceId()));
      navigate(next, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Couldn't reach CRAL. Check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      panel="register"
      next={next}
      heading="Create your account"
      subheading={
        booking
          ? "Set the account up and you land straight back on the car you were hiring."
          : "Give CRAL your details once. From your second hire on, requesting a car takes two taps."
      }
      error={
        error && (
          <>
            {error}
            {accountExists && (
              <>
                {" "}
                <Link to={withNext("/sign-in", next)} style={{ color: "#A50E22" }}>
                  Sign in instead
                </Link>
              </>
            )}
          </>
        )
      }
      footer={{ text: "Already have an account?", linkLabel: "Sign in", to: withNext("/sign-in", next) }}
    >
      <form onSubmit={submit} style={S.formStack} noValidate>
        <Field id="full-name" label="FULL NAME, AS ON YOUR LICENCE">
          <TextInput
            id="full-name"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Brian Kiptoo"
          />
        </Field>
        <Field id="phone" label="PHONE" helper="We'll ask you to confirm it with a code when you first book.">
          <TextInput
            id="phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0722 000 000"
          />
        </Field>
        <Field id="email" label="EMAIL ADDRESS">
          <TextInput
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </Field>
        <PasswordField
          id="password"
          label="PASSWORD"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          placeholder="At least 10 characters"
        />
        <PrimaryButton type="submit" disabled={submitting}>
          {submitting ? "Creating account…" : booking ? "Create account and continue" : "Create account"}
        </PrimaryButton>
        <p style={S.terms}>
          Creating an account accepts our{" "}
          <Link to="/legal" style={S.termsLink}>
            terms and conditions
          </Link>{" "}
          and{" "}
          <Link to="/legal" style={S.termsLink}>
            privacy policy
          </Link>
          .
        </p>
      </form>
    </AuthShell>
  );
}
