import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { usePageTitle } from "../lib/use-page-title.js";
import { AuthShell } from "../components/auth/AuthShell.js";
import { Field, InfoBanner, PrimaryButton, TextInput } from "../components/auth/primitives.js";
import { safeNext, withNext } from "../components/auth/next.js";
import { S } from "../components/auth/styles.js";
import { forgotPassword } from "../lib/auth-api.js";
import { ApiClientError } from "../lib/api.js";

/**
 * `/forgot-password`. Email only - a reset is always an emailed link
 * (2026-08-24: no password reset by SMS). The request tells the API this
 * is the customer site, so the link opens `/reset-password` here and not
 * in the merchant portal (it used to, for everyone).
 *
 * The confirmation is the same whether or not an account exists (spec §6):
 * the API always answers 202, and this page never shows a lookup result.
 * Only a rate limit or a dead connection is reported.
 */
export function ForgotPassword(): JSX.Element {
  usePageTitle("Reset your password");
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));

  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function send() {
    setError(null);
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Enter the email address on your account.");
      return;
    }
    setBusy(true);
    try {
      const result = await forgotPassword(value);
      setSentTo(value);
      setCooldown(result.retry_after || 60);
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.status === 429
          ? "That's a few requests in a row. Wait a little and try again."
          : "Couldn't reach CRAL. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send();
  };

  if (sentTo) {
    return (
      <AuthShell
        panel="recover"
        next={next}
        heading="Check your email"
        subheading={
          <>
            If there's a CRAL account for <strong style={{ color: "#0B0F1A" }}>{sentTo}</strong>, a link to choose
            a new password is on its way. It expires in 30 minutes.
          </>
        }
        error={error}
        footer={{ text: "Remembered it?", linkLabel: "Back to sign in", to: withNext("/sign-in", next) }}
      >
        <div style={S.formStack}>
          <InfoBanner text="Nothing there? Check your spam folder, or send it again." />
          <div style={S.splitRow}>
            <button
              type="button"
              style={S.smallLink}
              onClick={() => {
                setSentTo(null);
                setError(null);
              }}
            >
              Use a different email
            </button>
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || cooldown > 0}
              style={{
                ...S.smallLink,
                color: busy || cooldown > 0 ? "#A7AEBB" : "#0F23A8",
                cursor: busy || cooldown > 0 ? "not-allowed" : "pointer",
              }}
            >
              {cooldown > 0 ? `Send again in ${cooldown}s` : busy ? "Sending…" : "Send again"}
            </button>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      panel="recover"
      next={next}
      heading="Forgot your password?"
      subheading="Enter the email on your account and we'll send you a link to choose a new one."
      error={error}
      footer={{ text: "Remembered it?", linkLabel: "Back to sign in", to: withNext("/sign-in", next) }}
    >
      <form onSubmit={onSubmit} style={S.formStack} noValidate>
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
        <PrimaryButton type="submit" disabled={busy}>
          {busy ? "Sending…" : "Email me a reset link"}
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
