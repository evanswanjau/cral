import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthShell } from "../components/auth/AuthShell.jsx";
import { Field, InfoBanner, PrimaryButton, TextInput } from "../components/auth/primitives.jsx";
import { S } from "../components/auth/styles.js";
import { forgotPassword } from "../lib/auth-api.js";

/**
 * Forgot password. No canvas file exists for this screen (the design's auth
 * template covers sign-in, register and their code steps only), so it is
 * composed entirely from the shared auth primitives — same shell, fields,
 * banner and button — rather than invented styling.
 *
 * The response is deliberately identical whether or not the account exists
 * (spec §6: always 202, never reveal enumeration), so the confirmation copy
 * is conditional-free and the request error is swallowed.
 */
export function ForgotPassword(): JSX.Element {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [sent, setSent] = useState(false);
  const [channel, setChannel] = useState<"email" | "sms">("sms");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await forgotPassword(identifier).catch(() => null);
      if (res?.channel_hint) setChannel(res.channel_hint);
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthShell
        heading="Check your messages"
        subheading="If that account exists, we've sent it a way back in."
        footer={{ text: "Remembered it?", linkLabel: "Back to sign in", to: "/sign-in" }}
      >
        <div style={S.formStack}>
          <InfoBanner text={`Instructions sent to ${identifier}`} />
          <p style={{ ...S.subheading, margin: 0 }}>
            {channel === "email"
              ? "Open the link in that email to choose a new password. It expires in thirty minutes."
              : "Enter the six-digit code we texted you to choose a new password. It expires in ten minutes."}
          </p>
          <PrimaryButton type="button" onClick={() => navigate("/reset-password")}>
            I have a code
          </PrimaryButton>
          <div style={S.splitRow}>
            <span style={S.resendLine}>Nothing arrived?</span>
            <button
              type="button"
              onClick={() => setSent(false)}
              style={{ ...S.smallLink, cursor: "pointer" }}
            >
              Try another number
            </button>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading="Forgot your password?"
      subheading="Give us the phone number or email on your merchant account and we'll send you a way back in."
      footer={{ text: "Remembered it?", linkLabel: "Back to sign in", to: "/sign-in" }}
    >
      <form
        style={S.formStack}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field
          id="identifier"
          label="PHONE OR EMAIL"
          helper="We'll text a code, or email a link — whichever your account is verified on."
        >
          <TextInput
            id="identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="0733 376 061"
            autoComplete="username"
            autoFocus
          />
        </Field>
        <PrimaryButton type="submit" disabled={busy || !identifier.trim()}>
          {busy ? "Sending…" : "Send me a way back in"}
        </PrimaryButton>
        <p style={S.terms}>
          Admin accounts can&apos;t reset this way — another admin has to issue an invite.
        </p>
      </form>
    </AuthShell>
  );
}
