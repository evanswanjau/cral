import { useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrandPanel } from "../components/BrandPanel.js";
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

/**
 * Reproduced from the design canvas source ("Cruz Merchant Login.dc.html").
 * Styles are the design's own inline values verbatim — deliberately not
 * re-expressed as Tailwind utilities, because approximating them by eye is
 * exactly what drifted before. Behaviour is wired to the real identity API.
 */
export function SignIn(): JSX.Element {
  const [mode, setMode] = useState<Mode>("password");
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={S.page}>
      <BrandPanel />

      <div style={S.formPanel}>
        <div style={S.formInner}>
          <div style={{ marginBottom: 22 }}>
            <h2 style={S.h2}>Sign in</h2>
            <p style={S.sub}>Karibu tena. Use the phone number or email on your merchant account.</p>
          </div>

          <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
            <button
              type="button"
              disabled
              title="Google sign-in isn't connected yet"
              style={{ ...S.googleBtn, opacity: 0.55, cursor: "not-allowed" }}
            >
              <GoogleIcon />
              Continue with Google
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={S.hr} />
              <span style={S.orLabel}>OR</span>
              <span style={S.hr} />
            </div>
          </div>

          <div style={S.segment}>
            {(
              [
                { value: "password", label: "Password" },
                { value: "sms", label: "SMS code" },
              ] as const
            ).map((m) => {
              const active = m.value === mode;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => {
                    setMode(m.value);
                    setError(null);
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

          {mode === "password" ? (
            <PasswordForm onError={setError} />
          ) : (
            <SmsForm onError={setError} />
          )}

          {error && (
            <div style={S.errorBox}>
              <span style={S.errorDot} />
              <span style={S.errorText}>{error}</span>
            </div>
          )}

          <div style={S.bottom}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={S.bottomText}>New to CRAL?</span>
              <Link to="/create-account" style={S.link}>
                Register instead
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PasswordForm({ onError }: { onError: (m: string | null) => void }): JSX.Element {
  const navigate = useNavigate();
  const [who, setWho] = useState("");
  const [pw, setPw] = useState("");
  const [reveal, setReveal] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit() {
    onError(null);
    setBusy(true);
    try {
      const result = await login(who, pw, deviceId());
      setSession(result, remember);
      navigate("/");
    } catch (err) {
      onError(
        err instanceof ApiClientError && err.code === "account_locked"
          ? "Too many failed attempts. Try again in a few minutes, or reset your password."
          : err instanceof ApiClientError
            ? err.message
            : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      style={{ display: "grid", gap: 16 }}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div>
        <label htmlFor="who" style={S.label}>
          PHONE OR EMAIL
        </label>
        <input
          id="who"
          value={who}
          onChange={(e) => setWho(e.target.value)}
          placeholder="0733 376 061"
          autoComplete="username"
          style={S.input}
        />
      </div>

      <div>
        <div style={S.labelRow}>
          <label htmlFor="pw" style={S.label}>
            PASSWORD
          </label>
          <button type="button" onClick={() => setReveal((v) => !v)} style={S.revealBtn}>
            {reveal ? "Hide" : "Show"}
          </button>
        </div>
        <input
          id="pw"
          type={reveal ? "text" : "password"}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Your password"
          autoComplete="current-password"
          style={S.input}
        />
      </div>

      <div style={S.rememberRow}>
        <button type="button" onClick={() => setRemember((v) => !v)} style={S.rememberBtn}>
          <span
            style={{
              ...S.checkbox,
              border: `1.5px solid ${remember ? "#0F23A8" : "#CDD2DA"}`,
              background: remember ? "#0F23A8" : "#FFFFFF",
            }}
          >
            {remember ? "✓" : ""}
          </span>
          <span style={S.rememberLabel}>Keep me signed in</span>
        </button>
        <Link to="/forgot-password" style={S.forgotBtn}>
          Forgot password?
        </Link>
      </div>

      <button type="submit" disabled={busy} style={{ ...S.primaryBtn, opacity: busy ? 0.7 : 1 }}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

function SmsForm({ onError }: { onError: (m: string | null) => void }): JSX.Element {
  const navigate = useNavigate();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    onError(null);
    setBusy(true);
    try {
      await requestLoginOtp(`+254${phone.replace(/\D/g, "")}`);
      setStep("code");
    } catch (err) {
      onError(err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    onError(null);
    setBusy(true);
    try {
      const result = await verifyLoginOtp(`+254${phone.replace(/\D/g, "")}`, code, deviceId());
      setSession(result, true);
      navigate("/");
    } catch (err) {
      onError(err instanceof ApiClientError ? err.message : "That code didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "code") {
    return (
      <form
        style={{ display: "grid", gap: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          void verify();
        }}
      >
        <div>
          <label htmlFor="code" style={S.label}>
            SIX-DIGIT CODE
          </label>
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="000000"
            inputMode="numeric"
            maxLength={6}
            style={{ ...S.input, font: "500 15px/1 'IBM Plex Mono',monospace", letterSpacing: ".18em" }}
          />
          <div style={S.helper}>Sent to +254 {phone}. It expires in ten minutes.</div>
        </div>
        <button
          type="submit"
          disabled={busy || code.length !== 6}
          style={{ ...S.primaryBtn, opacity: busy || code.length !== 6 ? 0.7 : 1 }}
        >
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>
    );
  }

  return (
    <form
      style={{ display: "grid", gap: 16 }}
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <div>
        <label htmlFor="phone" style={S.label}>
          M-PESA PHONE NUMBER
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={S.prefix}>+254</span>
          <input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="733 376 061"
            inputMode="tel"
            style={{ ...S.input, flex: 1, minWidth: 0 }}
          />
        </div>
        <div style={S.helper}>
          Use the number your payouts go to. We text a six-digit code, free of charge.
        </div>
      </div>
      <button type="submit" disabled={busy || !phone} style={{ ...S.primaryBtn, opacity: busy || !phone ? 0.7 : 1 }}>
        {busy ? "Sending…" : "Send code"}
      </button>
    </form>
  );
}

function GoogleIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H1.05v2.34A9 9 0 0 0 9 18Z"
      />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H1.05a9 9 0 0 0 0 8.12l2.92-2.34Z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 1.05 4.94l2.92 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

const S: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,430px),1fr))",
    fontFamily: "'Instrument Sans',sans-serif",
  },
  formPanel: {
    background: "#FAFBFC",
    padding: "clamp(24px,4vw,48px) clamp(20px,4vw,56px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  formInner: { width: "100%", maxWidth: 420 },

  h2: {
    margin: "0 0 7px",
    font: "600 clamp(24px,3vw,30px)/1.15 Archivo,sans-serif",
    fontVariationSettings: "'wdth' 106",
    letterSpacing: "-.022em",
    color: "#0B0F1A",
  },
  sub: {
    margin: 0,
    font: "400 14px/1.55 'Instrument Sans',sans-serif",
    color: "#5A6373",
    textWrap: "pretty",
  } as CSSProperties,

  googleBtn: {
    height: 50,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 11,
    background: "#FFFFFF",
    border: "1px solid #CDD2DA",
    borderRadius: "var(--r)",
    font: "600 15px/1 'Instrument Sans',sans-serif",
    color: "#1A1F2B",
    cursor: "pointer",
    transition: "background 120ms cubic-bezier(.2,.8,.25,1)",
  },
  hr: { flex: 1, height: 1, background: "#E4E7EC" },
  orLabel: {
    font: "500 10px/1 'IBM Plex Mono',monospace",
    letterSpacing: ".1em",
    color: "#9AA2B0",
  },

  segment: {
    display: "flex",
    gap: 4,
    padding: 4,
    background: "#F1F3F6",
    borderRadius: 999,
    marginBottom: 20,
  },
  segmentBtn: {
    flex: 1,
    height: 38,
    border: "none",
    borderRadius: 999,
    font: "600 13px/1 'Instrument Sans',sans-serif",
    cursor: "pointer",
    transition: "background 120ms cubic-bezier(.2,.8,.25,1)",
  },

  label: {
    display: "block",
    font: "500 10px/1 'IBM Plex Mono',monospace",
    letterSpacing: ".1em",
    color: "#9AA2B0",
    marginBottom: 8,
  },
  labelRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  input: {
    width: "100%",
    height: 48,
    padding: "0 14px",
    background: "#FFFFFF",
    border: "1px solid #CDD2DA",
    borderRadius: "var(--r)",
    font: "400 15px/1 'Instrument Sans',sans-serif",
    color: "#1A1F2B",
  },
  prefix: {
    height: 48,
    padding: "0 13px",
    display: "inline-flex",
    alignItems: "center",
    background: "#F1F3F6",
    border: "1px solid #CDD2DA",
    borderRadius: "var(--r)",
    font: "500 15px/1 'IBM Plex Mono',monospace",
    color: "#333B4A",
    flex: "none",
  },
  helper: {
    font: "400 12px/1.5 'Instrument Sans',sans-serif",
    color: "#838C9B",
    marginTop: 8,
  },
  revealBtn: {
    background: "none",
    border: "none",
    padding: 0,
    font: "600 12px/1 'Instrument Sans',sans-serif",
    color: "#0F23A8",
    cursor: "pointer",
  },

  rememberRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  rememberBtn: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
  },
  checkbox: {
    width: 21,
    height: 21,
    borderRadius: "var(--r-sm)",
    color: "#FFFFFF",
    font: "600 11px/18px 'IBM Plex Mono',monospace",
    textAlign: "center",
    flex: "none",
  },
  rememberLabel: { font: "400 13px/1.4 'Instrument Sans',sans-serif", color: "#333B4A" },
  forgotBtn: {
    background: "none",
    border: "none",
    padding: 0,
    font: "600 13px/1 'Instrument Sans',sans-serif",
    color: "#0F23A8",
    cursor: "pointer",
    textDecoration: "none",
  },

  primaryBtn: {
    height: 50,
    background: "#0F23A8",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "var(--r)",
    font: "600 15px/1 'Instrument Sans',sans-serif",
    cursor: "pointer",
    transition: "background 120ms cubic-bezier(.2,.8,.25,1)",
  },

  errorBox: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    marginTop: 16,
    padding: "12px 14px",
    background: "#FDE7EA",
    border: "1px solid #F7BDC5",
    borderRadius: "var(--r)",
  },
  errorDot: { width: 8, height: 8, borderRadius: 999, background: "#D81E32", flex: "none" },
  errorText: { font: "600 13px/1.45 'Instrument Sans',sans-serif", color: "#A50E22" },

  bottom: {
    marginTop: 24,
    paddingTop: 20,
    borderTop: "1px solid #E4E7EC",
    display: "grid",
    gap: 14,
  },
  bottomText: { font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" },
  link: {
    font: "600 14px/1.5 'Instrument Sans',sans-serif",
    color: "#0F23A8",
    textDecoration: "none",
    borderBottom: "1px solid rgba(15,35,168,.26)",
  },
};
