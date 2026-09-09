import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { adminLogin, adminVerifyTwoFactor } from "../lib/auth-api.js";
import { setSession } from "../lib/auth.js";
import { deviceId } from "../lib/device.js";
import { ApiClientError } from "../lib/api.js";
import { usePageTitle } from "../lib/use-page-title.js";

/**
 * Ops sign-in. No canvas file exists for this screen — it's built in the
 * console's own visual language (the 4px blue strip, the ADMIN CONSOLE
 * pill and its 14° rule, Archivo at 'wdth' 106) and flagged as such in the
 * plan.
 *
 * Two steps, matching spec §8: email + password, then the mandatory
 * six-digit code texted to the admin's phone. A correct password returns
 * no tokens.
 */
export function SignIn(): JSX.Element {
  usePageTitle("Sign in");
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [challenge, setChallenge] = useState<{ token: string; masked: string } | null>(null);
  const [code, setCode] = useState("");

  async function submitPassword() {
    setError(null);
    setBusy(true);
    try {
      const res = await adminLogin(email.trim(), password, deviceId());
      setChallenge({ token: res.challenge_token, masked: res.masked_destination });
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.code === "invalid_admin_credentials"
          ? "That email and password do not match."
          : err instanceof ApiClientError
            ? err.message
            : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    setError(null);
    setBusy(true);
    try {
      const pair = await adminVerifyTwoFactor(challenge!.token, code.trim());
      setSession(pair);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "admin_challenge_expired") {
        setError("That sign-in attempt expired. Enter your password again.");
        setChallenge(null);
        setCode("");
      } else {
        setError(
          err instanceof ApiClientError ? err.message : "That code didn't work. Try again.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={S.page}>
      <div style={S.topStrip} />
      <div style={S.card}>
        <div style={S.brandRow}>
          <img src="/logo.png" alt="Cruz Ride Auto Limited" style={S.logo} />
          <span style={S.rule} />
          <span style={S.pill}>ADMIN CONSOLE</span>
          <span style={S.skew} />
        </div>

        {!challenge ? (
          <form
            style={S.form}
            onSubmit={(e) => {
              e.preventDefault();
              void submitPassword();
            }}
          >
            <div>
              <h1 style={S.h1}>Sign in</h1>
              <p style={S.sub}>Ops access is staff only. A code is texted to your phone after your password.</p>
            </div>

            <label style={S.field}>
              <span style={S.label}>EMAIL</span>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@cruzrideauto.co.ke"
                style={S.input}
              />
            </label>

            <label style={S.field}>
              <span style={S.labelRow}>
                <span style={S.label}>PASSWORD</span>
                <button type="button" onClick={() => setReveal((v) => !v)} style={S.inlineBtn}>
                  {reveal ? "Hide" : "Show"}
                </button>
              </span>
              <input
                type={reveal ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                style={S.input}
              />
            </label>

            {error && <div style={S.error}>{error}</div>}

            <button type="submit" disabled={busy || !email || !password} style={S.primary}>
              {busy ? "Checking…" : "Continue"}
            </button>
          </form>
        ) : (
          <form
            style={S.form}
            onSubmit={(e) => {
              e.preventDefault();
              void submitCode();
            }}
          >
            <div>
              <h1 style={S.h1}>Enter your code</h1>
              <p style={S.sub}>
                We texted a 6-digit code to {challenge.masked}. It expires in 10 minutes.
              </p>
            </div>

            <label style={S.field}>
              <span style={S.label}>SIGN-IN CODE</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                style={{ ...S.input, ...S.codeInput }}
              />
            </label>

            {error && <div style={S.error}>{error}</div>}

            <button type="submit" disabled={busy || code.length !== 6} style={S.primary}>
              {busy ? "Checking…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => {
                setChallenge(null);
                setCode("");
                setError(null);
              }}
              style={S.inlineBtn}
            >
              Start over
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const S = {
  page: {
    minHeight: "100vh",
    background: "#FAFBFC",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    fontFamily: "'Instrument Sans',sans-serif",
  },
  topStrip: { position: "fixed", top: 0, left: 0, right: 0, height: 4, background: "#0F23A8" },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "#FFFFFF",
    border: "1px solid #E4E7EC",
    borderRadius: "var(--r-lg)",
    padding: "clamp(24px,4vw,36px)",
    boxShadow: "0 18px 44px -20px rgba(11,15,26,.22)",
  },
  brandRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 22 },
  logo: { height: 26, width: "auto", display: "block" },
  rule: { width: 1, height: 20, background: "#E4E7EC" },
  pill: {
    padding: "5px 11px",
    background: "#F1F3F6",
    borderRadius: 999,
    font: "500 11px/1 'IBM Plex Mono',monospace",
    letterSpacing: ".09em",
    color: "#0B0F1A",
  },
  skew: { width: 20, height: 6, background: "#D81E32", transform: "skewX(-14deg)" },
  form: { display: "grid", gap: 16 },
  h1: {
    margin: "0 0 6px",
    font: "600 clamp(23px,3vw,28px)/1.15 Archivo,sans-serif",
    fontVariationSettings: "'wdth' 106",
    letterSpacing: "-.022em",
    color: "#1A1F2B",
  },
  sub: { margin: 0, font: "400 13px/1.55 'Instrument Sans',sans-serif", color: "#5A6373", textWrap: "pretty" },
  field: { display: "grid", gap: 8 },
  labelRow: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  label: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".1em", color: "#9AA2B0" },
  input: {
    width: "100%",
    height: 46,
    padding: "0 14px",
    background: "#FFFFFF",
    border: "1px solid #CDD2DA",
    borderRadius: "var(--r)",
    font: "400 15px/1 'Instrument Sans',sans-serif",
    color: "#1A1F2B",
  },
  codeInput: {
    height: 54,
    font: "600 24px/1 'IBM Plex Mono',monospace",
    letterSpacing: ".3em",
    textAlign: "center",
  },
  inlineBtn: {
    background: "none",
    border: "none",
    padding: 0,
    font: "600 12px/1 'Instrument Sans',sans-serif",
    color: "#0F23A8",
    cursor: "pointer",
    justifySelf: "start",
  },
  primary: {
    height: 46,
    background: "#0F23A8",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "var(--r)",
    font: "600 14px/1 'Instrument Sans',sans-serif",
    cursor: "pointer",
  },
  error: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    background: "#FDE7EA",
    border: "1px solid #F7BDC5",
    borderRadius: "var(--r)",
    font: "600 13px/1.45 'Instrument Sans',sans-serif",
    color: "#A50E22",
  },
} satisfies Record<string, CSSProperties>;
