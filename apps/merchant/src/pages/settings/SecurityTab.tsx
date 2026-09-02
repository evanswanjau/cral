import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormField, PrimaryButton, TextInput } from "../../components/onboarding/primitives.js";
import { O } from "../../components/onboarding/styles.js";
import { P } from "../../components/portal/styles.js";
import { useToast } from "../../components/portal/Toast.js";
import { ApiClientError } from "../../lib/api.js";
import { toE164 } from "../../lib/device.js";
import {
  changePassword,
  disable2fa,
  enroll2fa,
  getTwoFactorState,
  listSessions,
  revokeAllSessions,
  revokeSession,
  sendTwoFactorChallenge,
  verify2fa,
  type SessionRow,
} from "../../lib/auth-api.js";

/** Support line, same number as the portal's masthead "Help" link. */
const SUPPORT_WA = "https://wa.me/254733376061?text=I%20want%20to%20close%20my%20CRAL%20merchant%20account";

/**
 * Settings → Security. Folds in the former standalone
 * `pages/SecuritySettings.tsx` (2FA enrol/disable) and adds the two pieces
 * the design's Security tab also carries: a password change and the
 * "where you are signed in" session list with "sign out everywhere".
 * Close-account is a support hand-off, not self-service (no product
 * definition yet for live listings / in-flight bookings / retention).
 */
export function SecurityTab(): JSX.Element {
  const qc = useQueryClient();
  const twoFa = useQuery({ queryKey: ["2fa"], queryFn: getTwoFactorState });
  const refresh2fa = () => qc.invalidateQueries({ queryKey: ["2fa"] });

  return (
    <div style={P.setBodyWrap}>
      <div style={P.setBodyMain}>
        <div style={P.setCard}>
          <div style={{ ...P.setCardHead, ...P.setCardTitle }}>Signing in</div>
          <div style={P.setFieldStack}>
            <PasswordRow />
            <div style={P.setSignDivider} />
            <div style={P.setSignRow}>
              <div style={P.setSignMain}>
                <div style={P.setSignTitle}>SMS code at sign-in</div>
                <div style={P.setSignSub}>
                  {twoFa.data?.enabled
                    ? `A six-digit code to ${twoFa.data.masked_destination ?? "your phone"} every time you sign in on a new device.`
                    : "Add a texted code to your password when you sign in on a new device."}
                </div>
              </div>
            </div>
            {twoFa.isLoading || !twoFa.data ? (
              <div style={O.helper}>Loading…</div>
            ) : twoFa.data.enabled ? (
              <TwoFactorOn state={twoFa.data} onChanged={refresh2fa} />
            ) : (
              <TwoFactorOff onChanged={refresh2fa} />
            )}
          </div>
        </div>

        <SessionsCard />
      </div>

      <div style={P.setBodySide}>
        <div style={P.setCloseCard}>
          <div style={P.setCloseBar} />
          <div style={P.setCloseBody}>
            <div style={P.setCloseTitle}>Close this account</div>
            <p style={P.setCloseText}>
              Listings come down and no new bookings can be made. Hires already running still finish
              and still pay out. Your records stay with CRAL for seven years, as the law requires.
            </p>
            <a href={SUPPORT_WA} target="_blank" rel="noreferrer" style={P.setCloseBtn}>
              Contact CRAL to close
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- password -------------------------------------------------------

function PasswordRow(): JSX.Element {
  const flash = useToast();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const { sessions_revoked } = await changePassword(current, next);
      flash(
        sessions_revoked > 0
          ? `Password changed. ${sessions_revoked} other ${sessions_revoked === 1 ? "device" : "devices"} signed out.`
          : "Password changed.",
        "#0B8A5B",
      );
      setOpen(false);
      setCurrent("");
      setNext("");
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={P.setSignRow}>
        <div style={P.setSignMain}>
          <div style={P.setSignTitle}>Password</div>
          <div style={P.setSignSub}>Choose a strong one you don't use anywhere else.</div>
        </div>
        <button type="button" style={P.setSignBtn} onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : "Change password"}
        </button>
      </div>
      {open && (
        <div style={{ display: "grid", gap: 12, maxWidth: 380 }}>
          <FormField label="Current password">
            <TextInput
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
          </FormField>
          <FormField label="New password">
            <TextInput
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
            />
          </FormField>
          <PrimaryButton
            onClick={() => void submit()}
            disabled={busy || current.length < 1 || next.length < 10}
          >
            {busy ? "Saving…" : "Update password"}
          </PrimaryButton>
          {error && <div style={O.fieldError}>{error}</div>}
        </div>
      )}
    </div>
  );
}

// --- sessions ------------------------------------------------------

function uaLabel(ua: string | null): string {
  if (!ua) return "Browser";
  const mobile = /Mobi|Android|iPhone|iPad/i.test(ua);
  const name = /Edg/i.test(ua)
    ? "Edge"
    : /OPR|Opera/i.test(ua)
      ? "Opera"
      : /Firefox/i.test(ua)
        ? "Firefox"
        : /Chrome|CriOS/i.test(ua)
          ? "Chrome"
          : /Safari/i.test(ua)
            ? "Safari"
            : "Browser";
  return `${name}${mobile ? " Mobile" : ""}`.toUpperCase();
}

function seenLabel(iso: string): string {
  const d = new Date(iso);
  if (Date.now() - d.getTime() < 5 * 60 * 1000) return "ACTIVE NOW";
  return d
    .toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(",", " ·")
    .toUpperCase();
}

function SessionsCard(): JSX.Element {
  const qc = useQueryClient();
  const flash = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["sessions"], queryFn: listSessions });
  const [busyId, setBusyId] = useState<string | null>(null);

  async function signOutOne(id: string): Promise<void> {
    setBusyId(id);
    try {
      await revokeSession(id);
      await qc.invalidateQueries({ queryKey: ["sessions"] });
      flash("Signed out on that device.", "#8C97A8");
    } catch (e) {
      flash(e instanceof ApiClientError ? e.message : "Couldn't sign that one out.", "#D81E32");
    } finally {
      setBusyId(null);
    }
  }

  async function signOutAll(): Promise<void> {
    try {
      const { revoked } = await revokeAllSessions();
      await qc.invalidateQueries({ queryKey: ["sessions"] });
      flash(
        revoked > 0
          ? `Signed out on ${revoked} other ${revoked === 1 ? "device" : "devices"}.`
          : "No other devices were signed in.",
        "#8C97A8",
      );
    } catch (e) {
      flash(e instanceof ApiClientError ? e.message : "Couldn't sign the others out.", "#D81E32");
    }
  }

  const sessions: SessionRow[] = data?.data ?? [];

  return (
    <div style={P.setCard}>
      <div style={P.setCardHeadRow}>
        <span style={P.setCardTitle}>Where you are signed in</span>
        <button
          type="button"
          style={P.setDangerBtnSmall}
          onClick={() => void signOutAll()}
          disabled={sessions.length < 2}
        >
          Sign out everywhere
        </button>
      </div>
      {isLoading ? (
        <div style={{ padding: 18, ...O.helper }}>Loading…</div>
      ) : (
        sessions.map((s) => (
          <div key={s.id} style={P.setListRow}>
            <span
              style={{ ...P.setSessionDot, background: s.is_current ? "#0B8A5B" : "#CDD2DA" }}
            />
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={P.setListName}>{s.device}</div>
              <div style={P.setListMeta}>
                {uaLabel(s.user_agent)} · {seenLabel(s.last_seen_at)}
              </div>
            </div>
            {s.is_current ? (
              <span style={{ ...P.setSessionTag, color: "#076945" }}>This device</span>
            ) : (
              <button
                type="button"
                style={{ ...P.setSessionTag, background: "none", border: "none", cursor: "pointer", color: "#0F23A8" }}
                onClick={() => void signOutOne(s.id)}
                disabled={busyId === s.id}
              >
                {busyId === s.id ? "Signing out…" : "Sign out"}
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// --- 2FA (ported from the former SecuritySettings page) -------------

function TwoFactorOn({
  state,
  onChanged,
}: {
  state: { masked_destination: string | null; recovery_codes_remaining: number | null };
  onChanged: () => void;
}): JSX.Element {
  const flash = useToast();
  const [step, setStep] = useState<"idle" | "confirm">("idle");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await sendTwoFactorChallenge();
      setStep("confirm");
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Couldn't text a code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await disable2fa(password, code.trim());
      flash("Two-factor authentication is off.");
      onChanged();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "That didn't work. Check your password and code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...P.setInlineNote, display: "grid", gap: 12 }}>
      <div style={O.helper}>
        {state.recovery_codes_remaining ?? 0} recovery code
        {state.recovery_codes_remaining === 1 ? "" : "s"} left.
      </div>
      {step === "idle" ? (
        <button type="button" style={P.setSignBtn} disabled={busy} onClick={() => void sendCode()}>
          {busy ? "Texting…" : "Turn it off"}
        </button>
      ) : (
        <div style={{ display: "grid", gap: 12, maxWidth: 380 }}>
          <FormField label="Your password">
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </FormField>
          <FormField label="Texted code (or a recovery code)">
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9A-Za-z-]/g, "").slice(0, 20))}
              inputMode="numeric"
              placeholder="123456"
            />
          </FormField>
          <PrimaryButton
            onClick={() => void turnOff()}
            disabled={busy || !password || code.trim().length < 6}
          >
            {busy ? "Turning off…" : "Turn off two-factor"}
          </PrimaryButton>
        </div>
      )}
      {error && <div style={O.fieldError}>{error}</div>}
    </div>
  );
}

function TwoFactorOff({ onChanged }: { onChanged: () => void }): JSX.Element {
  const flash = useToast();
  const [step, setStep] = useState<"idle" | "phone" | "code" | "codes">("idle");
  const [digits, setDigits] = useState("");
  const [code, setCode] = useState("");
  const [masked, setMasked] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await enroll2fa(toE164(digits));
      setMasked(res.masked_destination);
      setStep("code");
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Couldn't text that number. Check it and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await verify2fa(code.trim());
      setRecoveryCodes(res.recovery_codes);
      setStep("codes");
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "That code isn't right.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "idle") {
    return (
      <button type="button" style={P.setSignBtn} onClick={() => setStep("phone")}>
        Set it up
      </button>
    );
  }

  if (step === "codes") {
    return (
      <div style={{ ...P.setInlineNote, display: "grid", gap: 12 }}>
        <div style={O.helper}>
          Save these ten recovery codes somewhere safe. Each works once if you can&rsquo;t get a text.
          This is the only time we&rsquo;ll show them.
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 8,
            font: "500 14px/1.4 'IBM Plex Mono',monospace",
            background: "#FFFFFF",
            border: "1px solid #E4E7EC",
            borderRadius: 10,
            padding: 14,
          }}
        >
          {recoveryCodes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <PrimaryButton
          onClick={() => {
            flash("Two-factor authentication is on.");
            onChanged();
          }}
        >
          I&rsquo;ve saved them
        </PrimaryButton>
      </div>
    );
  }

  return (
    <div style={{ ...P.setInlineNote, display: "grid", gap: 12, maxWidth: 400 }}>
      {step === "phone" ? (
        <div style={{ display: "grid", gap: 12 }}>
          <FormField label="Phone number">
            <div style={{ display: "flex", gap: 8 }}>
              <span style={O.phonePrefix}>+254</span>
              <TextInput
                value={digits}
                onChange={(e) =>
                  setDigits(e.target.value.replace(/\D/g, "").replace(/^(?:254|0)/, "").slice(0, 9))
                }
                placeholder="712 345 678"
                inputMode="tel"
                style={{ flex: 1 }}
              />
            </div>
          </FormField>
          <PrimaryButton onClick={() => void sendCode()} disabled={busy || digits.length < 9}>
            {busy ? "Texting…" : "Send code"}
          </PrimaryButton>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <FormField label={`6-digit code texted to ${masked}`}>
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="123456"
            />
          </FormField>
          <div style={{ display: "flex", gap: 10 }}>
            <PrimaryButton onClick={() => void confirm()} disabled={busy || code.length !== 6}>
              {busy ? "Checking…" : "Turn on two-factor"}
            </PrimaryButton>
            <button type="button" style={P.setSignBtn} disabled={busy} onClick={() => void sendCode()}>
              Resend
            </button>
          </div>
        </div>
      )}
      {error && <div style={O.fieldError}>{error}</div>}
    </div>
  );
}
