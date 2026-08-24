import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthShell } from "../components/auth/AuthShell.jsx";
import {
  CodeInput,
  Field,
  InfoBanner,
  PhoneInput,
  PrimaryButton,
  TextInput,
} from "../components/auth/primitives.jsx";
import { S } from "../components/auth/styles.js";
import { checkPasswordReset, resetPassword } from "../lib/auth-api.js";
import { toE164 } from "../lib/device.js";
import { ApiClientError } from "../lib/api.js";

type View = "checking" | "form" | "expired" | "done";

/**
 * Reset password. Like Forgot, this screen has no canvas file and is built
 * from the shared auth primitives.
 *
 * Two paths, per spec §6: an emailed link (`?token=`) or a texted code
 * (phone + code). With a token we verify it up front via
 * /auth/password/reset/check, so an expired link says so *before* the
 * person types a new password twice — the delivery plan calls that dead end
 * out explicitly as a gap in the original designs.
 */
export function ResetPassword(): JSX.Element {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token");

  const [view, setView] = useState<View>(token ? "checking" : "form");
  const [masked, setMasked] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [reveal, setReveal] = useState(false);
  const [revoked, setRevoked] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    checkPasswordReset({ token })
      .then((r) => {
        if (cancelled) return;
        setMasked(r.masked_identifier ?? null);
        setView(r.valid ? "form" : "expired");
      })
      .catch(() => {
        if (!cancelled) setView("expired");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const res = await resetPassword(
        token
          ? { token, new_password: pw }
          : { phone: toE164(phone), code, new_password: pw },
      );
      setRevoked(res.sessions_revoked);
      setView("done");
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "reset_token_expired") {
        setView("expired");
      } else if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (view === "checking") {
    return (
      <AuthShell heading="Checking your link…" subheading="One moment.">
        <div style={S.formStack}>
          <InfoBanner text="Making sure this link is still good" />
        </div>
      </AuthShell>
    );
  }

  if (view === "expired") {
    return (
      <AuthShell
        heading="This link has expired"
        subheading="Reset links and codes are short-lived on purpose. Ask for a new one and you'll be straight back in."
        footer={{ text: "Remembered it?", linkLabel: "Back to sign in", to: "/sign-in" }}
      >
        <div style={S.formStack}>
          <Link to="/forgot-password" style={{ textDecoration: "none" }}>
            <PrimaryButton type="button" style={{ width: "100%" }}>
              Send me a new one
            </PrimaryButton>
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (view === "done") {
    return (
      <AuthShell
        heading="Password changed"
        subheading="You're all set. Use your new password to sign in."
        footer={{ text: "Ready?", linkLabel: "Go to sign in", to: "/sign-in" }}
      >
        <div style={S.formStack}>
          <InfoBanner
            text={
              revoked > 0
                ? `Signed out of ${revoked} other ${revoked === 1 ? "device" : "devices"}`
                : "Signed out everywhere else"
            }
          />
          <p style={{ ...S.subheading, margin: 0 }}>
            Anyone still signed in on another phone or laptop has been signed out, so a stolen session
            can't outlive the reset.
          </p>
          <PrimaryButton type="button" onClick={() => navigate("/sign-in", { replace: true })}>
            Sign in
          </PrimaryButton>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading="Choose a new password"
      subheading={
        masked
          ? `Setting a new password for ${masked}.`
          : "Enter the code we sent you, then pick something new."
      }
      error={error}
      footer={{ text: "Remembered it?", linkLabel: "Back to sign in", to: "/sign-in" }}
    >
      <form
        style={S.formStack}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {!token && (
          <>
            <Field id="reset-phone" label="M-PESA PHONE NUMBER">
              <PhoneInput id="reset-phone" value={phone} onChange={setPhone} />
            </Field>
            <Field id="reset-code" label="SIX-DIGIT CODE">
              <CodeInput id="reset-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
          </>
        )}

        <Field
          id="new-pw"
          label="NEW PASSWORD"
          helper="Ten characters or more, and not one you've used on a site that's been breached."
          action={
            <button type="button" onClick={() => setReveal((v) => !v)} style={S.inlineBtn}>
              {reveal ? "Hide" : "Show"}
            </button>
          }
        >
          <TextInput
            id="new-pw"
            type={reveal ? "text" : "password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="At least 10 characters"
            autoComplete="new-password"
          />
        </Field>

        <PrimaryButton
          type="submit"
          disabled={busy || pw.length < 10 || (!token && (code.length !== 6 || !phone.trim()))}
        >
          {busy ? "Saving…" : "Save new password"}
        </PrimaryButton>

        <p style={S.terms}>
          Setting a new password signs you out on every other device.
        </p>
      </form>
    </AuthShell>
  );
}
