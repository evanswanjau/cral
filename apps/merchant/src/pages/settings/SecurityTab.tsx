import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormField, PrimaryButton, TextInput } from "../../components/onboarding/primitives.js";
import { O } from "../../components/onboarding/styles.js";
import { P } from "../../components/portal/styles.js";
import { useToast } from "../../components/portal/Toast.js";
import { ApiClientError } from "../../lib/api.js";
import {
  cancelAccountDeletion,
  changePassword,
  disable2fa,
  enable2fa,
  listSessions,
  requestAccountDeletion,
  revokeAllSessions,
  revokeSession,
  getTwoFactorState,
  type SessionRow,
} from "../../lib/auth-api.js";
import { useProfile } from "../../lib/settings-api.js";

/**
 * Settings → Security. 2FA is a plain switch now (the account phone is
 * already verified, so there's no handset step); the former
 * enrol-by-phone flow is gone. Close-account is real self-service with a
 * 30-day grace period, not a support hand-off.
 */
export function SecurityTab(): JSX.Element {
  const qc = useQueryClient();
  const twoFa = useQuery({ queryKey: ["2fa"], queryFn: getTwoFactorState });
  const { data: profile } = useProfile();
  const refresh2fa = () => qc.invalidateQueries({ queryKey: ["2fa"] });

  return (
    <div style={P.setBodyWrap}>
      <div style={P.setBodyMain}>
        <div style={P.setCard}>
          <div style={{ ...P.setCardHead, ...P.setCardTitle }}>Signing in</div>
          <div style={P.setFieldStack}>
            <PasswordRow />
            <div style={P.setSignDivider} />
            <TwoFactorRow
              state={twoFa.data}
              loading={twoFa.isLoading}
              phoneVerified={Boolean(profile?.phone_verified)}
              onChanged={refresh2fa}
            />
          </div>
        </div>

        <SessionsCard />
      </div>

      <div style={P.setBodySide}>
        <CloseAccountCard
          status={profile?.account_status ?? "active"}
          scheduledAt={profile?.deletion_scheduled_at ?? null}
          confirmName={
            profile?.owner_type === "company"
              ? profile.company_name ?? ""
              : [profile?.first_name, profile?.surname].filter(Boolean).join(" ")
          }
        />
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
            <TextInput type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </FormField>
          <FormField label="New password">
            <TextInput type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </FormField>
          <PrimaryButton onClick={() => void submit()} disabled={busy || current.length < 1 || next.length < 10}>
            {busy ? "Saving…" : "Update password"}
          </PrimaryButton>
          {error && <div style={O.fieldError}>{error}</div>}
        </div>
      )}
    </div>
  );
}

// --- 2FA switch ----------------------------------------------------

function Switch({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      disabled={disabled}
      style={{
        ...P.ntToggle,
        flex: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        justifyContent: on ? "flex-end" : "flex-start",
        background: disabled ? "#E4E7EC" : on ? "#0F23A8" : "#E4E7EC",
        borderColor: disabled ? "#CDD2DA" : on ? "#0F23A8" : "#CDD2DA",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{ ...P.ntToggleKnob, background: "#FFFFFF" }} />
    </button>
  );
}

function TwoFactorRow({
  state,
  loading,
  phoneVerified,
  onChanged,
}: {
  state: { enabled: boolean; masked_destination: string | null } | undefined;
  loading: boolean;
  phoneVerified: boolean;
  onChanged: () => void;
}): JSX.Element {
  const flash = useToast();
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const enabled = Boolean(state?.enabled);

  async function turnOn(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await enable2fa();
      setCodes(res.recovery_codes);
      onChanged();
    } catch (e) {
      flash(e instanceof ApiClientError ? e.message : "Couldn't turn that on.", "#D81E32");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await disable2fa(password);
      setDisabling(false);
      setPassword("");
      flash("SMS codes at sign-in are off.", "#8C97A8");
      onChanged();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "That password isn't right.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={P.setSignRow}>
        <div style={P.setSignMain}>
          <div style={P.setSignTitle}>SMS code at sign-in</div>
          <div style={P.setSignSub}>
            {enabled
              ? `A six-digit code to ${state?.masked_destination ?? "your phone"} when you sign in on a new device.`
              : phoneVerified
                ? "Add a texted code to your password when you sign in on a new device."
                : "Verify your phone number on the My profile tab first."}
          </div>
        </div>
        {loading ? (
          <span style={O.helper}>…</span>
        ) : (
          <Switch
            on={enabled}
            disabled={busy || (!enabled && !phoneVerified)}
            onToggle={() => {
              if (enabled) setDisabling((v) => !v);
              else void turnOn();
            }}
          />
        )}
      </div>

      {disabling && enabled && (
        <div style={{ ...P.setInlineNote, display: "grid", gap: 10, maxWidth: 380 }}>
          <span>Enter your password to turn SMS codes off.</span>
          <FormField label="Password">
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </FormField>
          <div style={{ display: "flex", gap: 8 }}>
            <PrimaryButton onClick={() => void turnOff()} disabled={busy || !password}>
              {busy ? "Turning off…" : "Turn off"}
            </PrimaryButton>
            <button type="button" style={P.setSignBtn} onClick={() => setDisabling(false)}>
              Cancel
            </button>
          </div>
          {error && <div style={O.fieldError}>{error}</div>}
        </div>
      )}

      {codes && <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />}
    </div>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }): JSX.Element {
  return (
    <div style={{ ...P.setInlineNote, display: "grid", gap: 12, maxWidth: 420 }}>
      <div style={O.helper}>
        SMS codes are on. Save these ten recovery codes somewhere safe - each works once if you
        can&rsquo;t get a text. This is the only time we&rsquo;ll show them.
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
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <PrimaryButton onClick={onDone}>I&rsquo;ve saved them</PrimaryButton>
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
            <span style={{ ...P.setSessionDot, background: s.is_current ? "#0B8A5B" : "#CDD2DA" }} />
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

// --- close account ------------------------------------------------

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

function CloseAccountCard({
  status,
  scheduledAt,
  confirmName,
}: {
  status: string;
  scheduledAt: string | null;
  confirmName: string;
}): JSX.Element {
  const qc = useQueryClient();
  const flash = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const pending = status === "pending_deletion";
  const target = confirmName.trim();
  const canConfirm = target.length === 0 || typed.trim().toLowerCase() === target.toLowerCase();

  async function requestDelete(): Promise<void> {
    setBusy(true);
    try {
      await requestAccountDeletion();
      await qc.invalidateQueries({ queryKey: ["merchant-profile"] });
      await qc.invalidateQueries({ queryKey: ["sessions"] });
      setOpen(false);
      setTyped("");
      flash("Account scheduled for deletion. You're signed out on other devices.", "#D81E32");
    } catch (e) {
      flash(e instanceof ApiClientError ? e.message : "Couldn't do that. Try again.", "#D81E32");
    } finally {
      setBusy(false);
    }
  }

  async function keepAccount(): Promise<void> {
    setBusy(true);
    try {
      await cancelAccountDeletion();
      await qc.invalidateQueries({ queryKey: ["merchant-profile"] });
      flash("Your account is active again.", "#0B8A5B");
    } catch (e) {
      flash(e instanceof ApiClientError ? e.message : "Couldn't do that. Try again.", "#D81E32");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={P.setCloseCard}>
      <div style={P.setCloseBar} />
      <div style={P.setCloseBody}>
        <div style={P.setCloseTitle}>{pending ? "Deletion scheduled" : "Delete this account"}</div>
        {pending ? (
          <>
            <p style={P.setCloseText}>
              Your account and listings will be permanently deleted
              {scheduledAt ? ` on ${fmtDate(scheduledAt)}` : " in 30 days"}. Bookings already running
              still finish and still pay out. Sign in any time before then to stop it.
            </p>
            <button type="button" style={P.setSignBtn} onClick={() => void keepAccount()} disabled={busy}>
              {busy ? "…" : "Keep my account"}
            </button>
          </>
        ) : !open ? (
          <>
            <p style={P.setCloseText}>
              Listings come down and no new bookings can be made. Hires already running still finish
              and still pay out. You have 30 days to change your mind; your records stay with CRAL for
              seven years, as the law requires.
            </p>
            <button type="button" style={P.setCloseBtn} onClick={() => setOpen(true)}>
              Delete account
            </button>
          </>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <p style={P.setCloseText}>
              This can&rsquo;t be undone after 30 days.
              {target ? ` Type "${target}" to confirm.` : ""}
            </p>
            {target ? (
              <input
                style={P.setInput}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={target}
                aria-label="Type your name to confirm"
              />
            ) : null}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                style={{ ...P.setCloseBtn, opacity: canConfirm && !busy ? 1 : 0.5 }}
                onClick={() => void requestDelete()}
                disabled={!canConfirm || busy}
              >
                {busy ? "…" : "Delete my account"}
              </button>
              <button
                type="button"
                style={P.setSignBtn}
                onClick={() => {
                  setOpen(false);
                  setTyped("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
