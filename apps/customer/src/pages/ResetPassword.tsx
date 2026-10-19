import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { usePageTitle } from "../lib/use-page-title.js";
import { AuthShell } from "../components/auth/AuthShell.js";
import { PasswordField, PrimaryButton } from "../components/auth/primitives.js";
import { S } from "../components/auth/styles.js";
import { checkPasswordReset, resetPassword } from "../lib/auth-api.js";
import { ApiClientError } from "../lib/api.js";

type State = "checking" | "valid" | "expired";

/**
 * `/reset-password?token=...` - where the emailed link lands. The token is
 * the only credential (reset is by emailed link only, 2026-08-24), so a
 * bare visit with no token goes straight to the "ask for a new one"
 * screen; there is no phone + code form any more.
 *
 * On success every session on the account has been revoked server-side,
 * so this sends the renter to sign in again with a confirmation banner.
 */
export function ResetPassword(): JSX.Element {
  usePageTitle("Choose a new password");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token");

  const [state, setState] = useState<State>(token ? "checking" : "expired");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let live = true;
    checkPasswordReset({ token })
      .then((r) => live && setState(r.valid ? "valid" : "expired"))
      .catch(() => live && setState("expired"));
    return () => {
      live = false;
    };
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError("Your new password needs to be at least 10 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await resetPassword({ token: token!, new_password: password });
      navigate("/sign-in", { replace: true, state: { justReset: true } });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "reset_token_expired") {
        setState("expired");
      } else if (err instanceof ApiClientError && err.code === "password_breached") {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking") {
    return (
      <AuthShell panel="recover" heading="Checking your link…" subheading="One moment.">
        <div />
      </AuthShell>
    );
  }

  // The graceful end for an expired, used or missing link (spec §26,
  // `reset_token_expired`) - never a dead end.
  if (state === "expired") {
    return (
      <AuthShell
        panel="recover"
        heading="This link has expired"
        subheading="Reset links work once and only last 30 minutes, for your security. Ask for a new one and we'll get you back in."
        footer={{ text: "Remembered it?", linkLabel: "Back to sign in", to: "/sign-in" }}
      >
        <Link to="/forgot-password" style={{ ...S.primaryBtn, display: "grid", placeItems: "center", textDecoration: "none" }}>
          Send me a new link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      panel="recover"
      heading="Choose a new password"
      subheading="Pick something you haven't used before. You'll be signed out everywhere and can sign in straight away."
      error={error}
    >
      <form onSubmit={onSubmit} style={S.formStack} noValidate>
        <PasswordField
          id="new-password"
          label="NEW PASSWORD"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          placeholder="At least 10 characters"
        />
        <PasswordField
          id="confirm-password"
          label="TYPE IT AGAIN"
          autoComplete="new-password"
          value={confirm}
          onChange={setConfirm}
          placeholder="The same password"
        />
        <PrimaryButton type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save new password"}
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
