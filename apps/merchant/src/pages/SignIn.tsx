import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell } from "../components/auth/AuthShell.jsx";
import {
  Checkbox,
  CodeInput,
  Field,
  InfoBanner,
  PhoneInput,
  PrimaryButton,
  ResendRow,
  TextInput,
} from "../components/auth/primitives.jsx";
import { S } from "../components/auth/styles.js";
import { login, requestOtp, verifyLoginOtp } from "../lib/auth-api.js";
import { setSession } from "../lib/auth.js";
import { deviceId, toE164 } from "../lib/device.js";
import { ApiClientError } from "../lib/api.js";

type Method = "password" | "sms";
type SmsStep = "phone" | "code";

/** Sign in — the design's `isPassword`, `isPhoneEntry` and `isCodeEntry` branches. */
export function SignIn(): JSX.Element {
  const navigate = useNavigate();
  const [method, setMethod] = useState<Method>("password");
  const [error, setError] = useState<string | null>(null);

  // password
  const [who, setWho] = useState("");
  const [pw, setPw] = useState("");
  const [reveal, setReveal] = useState(false);
  const [remember, setRemember] = useState(true);

  // sms
  const [smsStep, setSmsStep] = useState<SmsStep>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");

  const [busy, setBusy] = useState(false);

  function fail(err: unknown, fallback: string) {
    if (err instanceof ApiClientError && err.code === "account_locked") {
      setError("Too many failed attempts. Try again in a few minutes, or reset your password.");
    } else {
      setError(err instanceof ApiClientError ? err.message : fallback);
    }
  }

  async function run(fn: () => Promise<void>, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      fail(err, fallback);
    } finally {
      setBusy(false);
    }
  }

  const signInWithPassword = () =>
    run(async () => {
      const result = await login(who, pw, deviceId());
      setSession(result, remember);
      navigate("/");
    }, "Something went wrong. Please try again.");

  const sendCode = () =>
    run(async () => {
      await requestOtp(toE164(phone), "login");
      setSmsStep("code");
    }, "We couldn't send that code. Please try again.");

  const signInWithCode = () =>
    run(async () => {
      const result = await verifyLoginOtp(toE164(phone), code, deviceId());
      setSession(result, true);
      navigate("/");
    }, "That code didn't work. Try again.");

  const methods = (
    <div style={S.segment}>
      {(
        [
          { value: "password", label: "Password" },
          { value: "sms", label: "SMS code" },
        ] as const
      ).map((m) => {
        const active = m.value === method;
        return (
          <button
            key={m.value}
            type="button"
            onClick={() => {
              setMethod(m.value);
              setError(null);
              setSmsStep("phone");
            }}
            style={{
              ...S.segmentBtn,
              background: active ? "#FFFFFF" : "transparent",
              color: active ? "#0B0F1A" : "#5A6373",
              boxShadow: active ? "0 1px 2px rgba(11,15,26,.12)" : "none",
            }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <AuthShell
      heading="Sign in"
      subheading="Karibu tena. Use the phone number or email on your merchant account."
      showGoogle
      methods={methods}
      error={error}
      footer={{ text: "New to CRAL?", linkLabel: "Register instead", to: "/create-account" }}
    >
      {method === "password" ? (
        <form
          style={S.formStack}
          onSubmit={(e) => {
            e.preventDefault();
            void signInWithPassword();
          }}
        >
          <Field id="who" label="PHONE OR EMAIL">
            <TextInput
              id="who"
              value={who}
              onChange={(e) => setWho(e.target.value)}
              placeholder="0733 376 061"
              autoComplete="username"
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
            <Checkbox checked={remember} onToggle={() => setRemember((v) => !v)} label="Keep me signed in" />
            <Link to="/forgot-password" style={S.smallLink}>
              Forgot password?
            </Link>
          </div>

          <PrimaryButton type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </PrimaryButton>
        </form>
      ) : smsStep === "phone" ? (
        <form
          style={S.formStack}
          onSubmit={(e) => {
            e.preventDefault();
            void sendCode();
          }}
        >
          <Field
            id="phone"
            label="M-PESA PHONE NUMBER"
            // Accounts start email-only, so the phone may not be on file yet
            // until onboarding collects it — say so rather than failing blankly.
            helper="Use the number your payouts go to. If you haven't added one yet, sign in with your password."
          >
            <PhoneInput id="phone" value={phone} onChange={setPhone} />
          </Field>
          <PrimaryButton type="submit" disabled={busy || !phone.trim()}>
            {busy ? "Sending…" : "Text me a code"}
          </PrimaryButton>
        </form>
      ) : (
        <form
          style={S.formStack}
          onSubmit={(e) => {
            e.preventDefault();
            void signInWithCode();
          }}
        >
          <InfoBanner
            text={`Code sent to +254 ${phone}`}
            action={
              <button
                type="button"
                onClick={() => {
                  setSmsStep("phone");
                  setCode("");
                  setError(null);
                }}
                style={{ ...S.inlineBtn, flex: "none" }}
              >
                Change
              </button>
            }
          />
          <Field id="code" label="SIX-DIGIT CODE">
            <CodeInput id="code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
          </Field>
          <PrimaryButton type="submit" disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : "Sign in"}
          </PrimaryButton>
          <ResendRow
            line="It expires in ten minutes."
            disabled={busy}
            onResend={() => void sendCode()}
          />
        </form>
      )}
    </AuthShell>
  );
}
