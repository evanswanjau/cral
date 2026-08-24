import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { BrandPanel } from "../components/BrandPanel.js";
import { TextInput } from "../components/TextInput.js";
import { SegmentedControl } from "../components/SegmentedControl.js";
import { login, requestLoginOtp, verifyLoginOtp } from "../lib/auth-api.js";
import { setSession } from "../lib/auth.js";
import { ApiClientError } from "../lib/api.js";

type Mode = "password" | "sms";

function deviceId(): string {
  const KEY = "cral_merchant_device_id";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = `dev_${crypto.randomUUID()}`;
    window.localStorage.setItem(KEY, id);
  }
  return id;
}

export function SignIn(): JSX.Element {
  const [mode, setMode] = useState<Mode>("password");

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <BrandPanel />
      <div className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-600">
            Karibu tena. Use the phone number or email on your merchant account.
          </p>

          <button
            type="button"
            disabled
            title="Google sign-in isn't connected yet"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-400 cursor-not-allowed"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="my-6 flex items-center gap-3">
            <hr className="flex-1 border-slate-200" />
            <span className="text-xs font-medium text-slate-400">OR</span>
            <hr className="flex-1 border-slate-200" />
          </div>

          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[
              { value: "password", label: "Password" },
              { value: "sms", label: "SMS code" },
            ]}
          />

          <div className="mt-6">{mode === "password" ? <PasswordForm /> : <SmsForm />}</div>

          <p className="mt-6 text-sm text-slate-600">
            New to CRAL?{" "}
            <Link to="/create-account" className="font-semibold text-indigo-800 hover:underline">
              Register instead
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

interface PasswordFormValues {
  identifier: string;
  password: string;
}

function PasswordForm(): JSX.Element {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const {
    register: field,
    handleSubmit,
    formState: { errors },
  } = useForm<PasswordFormValues>();

  async function onSubmit(values: PasswordFormValues) {
    setServerError(null);
    setSubmitting(true);
    try {
      const result = await login(values.identifier, values.password, deviceId());
      setSession(result, keepSignedIn);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "account_locked") {
        setServerError("Too many failed attempts. Try again in a few minutes, or reset your password.");
      } else {
        setServerError(
          err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
      <TextInput
        id="identifier"
        label="Phone or email"
        placeholder="0733 376 061"
        autoComplete="username"
        {...field("identifier", { required: "Enter your phone or email." })}
        error={errors.identifier}
      />
      <TextInput
        id="password"
        label="Password"
        type={showPassword ? "text" : "password"}
        placeholder="Your password"
        autoComplete="current-password"
        labelAction={
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="text-xs font-semibold text-indigo-800 hover:underline"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        }
        {...field("password", { required: "Enter your password." })}
        error={errors.password}
      />

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={keepSignedIn}
            onChange={(e) => setKeepSignedIn(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-indigo-800 focus:ring-indigo-800"
          />
          Keep me signed in
        </label>
        <Link to="/forgot-password" className="text-sm font-semibold text-indigo-800 hover:underline">
          Forgot password?
        </Link>
      </div>

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-indigo-800 py-3 text-sm font-semibold text-white hover:bg-indigo-900 disabled:opacity-60"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

function SmsForm(): JSX.Element {
  const navigate = useNavigate();
  const [step, setStep] = useState<"request" | "verify">("request");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onRequest() {
    setServerError(null);
    setSubmitting(true);
    try {
      await requestLoginOtp(identifier);
      setStep("verify");
    } catch (err) {
      setServerError(err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onVerify() {
    setServerError(null);
    setSubmitting(true);
    try {
      const result = await verifyLoginOtp(identifier, code, deviceId());
      setSession(result, true);
      navigate("/");
    } catch (err) {
      setServerError(err instanceof ApiClientError ? err.message : "That code didn't work. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "verify") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">
          We sent a 6-digit code to <strong>{identifier}</strong>.
        </p>
        <TextInput
          id="sms-code"
          label="Code"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        {serverError && <p className="text-sm text-red-600">{serverError}</p>}
        <button
          type="button"
          onClick={onVerify}
          disabled={submitting || code.length !== 6}
          className="rounded-lg bg-indigo-800 py-3 text-sm font-semibold text-white hover:bg-indigo-900 disabled:opacity-60"
        >
          {submitting ? "Verifying…" : "Sign in"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <TextInput
        id="sms-identifier"
        label="Phone or email"
        placeholder="0733 376 061"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
      />
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <button
        type="button"
        onClick={onRequest}
        disabled={submitting || !identifier}
        className="rounded-lg bg-indigo-800 py-3 text-sm font-semibold text-white hover:bg-indigo-900 disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Send code"}
      </button>
    </div>
  );
}

function GoogleIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  );
}
