import { useState } from "react";
import { AuthShell } from "../components/auth/AuthShell.jsx";
import { Field, InfoBanner, PrimaryButton, TextInput } from "../components/auth/primitives.jsx";
import { S } from "../components/auth/styles.js";
import { forgotPassword } from "../lib/auth-api.js";

/**
 * Forgot password. No canvas file exists for this screen (the design's auth
 * template covers sign-in, register and their code steps only), so it is
 * composed entirely from the shared auth primitives - same shell, fields,
 * banner and button - rather than invented styling.
 *
 * Email only, matching sign-in and sign-up: the account's identity is its
 * email address, so the way back in is always an emailed link.
 *
 * The response is deliberately identical whether or not the account exists
 * (spec §6: always 202, never reveal enumeration), so the confirmation copy
 * is conditional-free and the request error is swallowed.
 */
export function ForgotPassword(): JSX.Element {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await forgotPassword(email.trim()).catch(() => null);
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthShell
        heading="Check your email"
        subheading="If that account exists, we've sent it a way back in."
        footer={{ text: "Remembered it?", linkLabel: "Back to sign in", to: "/sign-in" }}
      >
        <div style={S.formStack}>
          <InfoBanner text={`Instructions sent to ${email.trim()}`} />
          <p style={{ ...S.subheading, margin: 0 }}>
            Open the link in that email to choose a new password. It expires in thirty minutes.
          </p>
          <div style={S.splitRow}>
            <span style={S.resendLine}>Nothing arrived?</span>
            <button
              type="button"
              onClick={() => setSent(false)}
              style={{ ...S.smallLink, cursor: "pointer" }}
            >
              Try another email
            </button>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading="Forgot your password?"
      subheading="Give us the email on your merchant account and we'll send you a way back in."
      footer={{ text: "Remembered it?", linkLabel: "Back to sign in", to: "/sign-in" }}
    >
      <form
        style={S.formStack}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field id="email" label="EMAIL ADDRESS" helper="We'll email you a link.">
          <TextInput
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.co.ke"
            autoComplete="email"
            autoFocus
          />
        </Field>
        <PrimaryButton type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send me a way back in"}
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
