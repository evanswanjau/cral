import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { logout } from "../../lib/auth-api.js";
import { setSession } from "../../lib/auth.js";

/**
 * Literal values from the design bundle's "Cruz Profile Menu.dc.html" — the
 * account chip in the portal header and its dropdown, including the
 * log-out confirmation state. Local to this component, same reasoning as
 * `components/onboarding/styles.ts`'s header note: kept as literals rather
 * than Tailwind so this matches the canvas exactly.
 */
const M = {
  trigger: { display: "flex", alignItems: "center", gap: 9, padding: "4px 8px 4px 4px", background: "none", border: "1px solid transparent", borderRadius: 999, cursor: "pointer", textAlign: "left" } satisfies CSSProperties,
  avatar: (size: number): CSSProperties => ({ width: size, height: size, borderRadius: 999, background: "#EDEFFC", color: "#0F23A8", font: `600 ${size === 30 ? 12 : 14}px/${size}px 'IBM Plex Mono',monospace`, textAlign: "center", flex: "none" }),
  triggerName: { display: "block", font: "600 13px/1.2 'Instrument Sans',sans-serif", color: "#0B0F1A" } satisfies CSSProperties,
  triggerCompany: { display: "block", font: "400 11px/1.3 'Instrument Sans',sans-serif", color: "#838C9B" } satisfies CSSProperties,
  menu: { position: "absolute", top: "calc(100% + 8px)", right: 0, width: 280, background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", boxShadow: "0 18px 44px -14px rgba(11,15,26,.28),0 2px 6px rgba(11,15,26,.06)", zIndex: 60, overflow: "hidden" } satisfies CSSProperties,
  head: { padding: "15px 16px 14px", borderBottom: "1px solid #F1F3F6" } satisfies CSSProperties,
  headRow: { display: "flex", alignItems: "center", gap: 11, marginBottom: 12 } satisfies CSSProperties,
  headName: { font: "600 14px/1.25 'Instrument Sans',sans-serif", color: "#0B0F1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  headEmail: { font: "400 12px/1.35 'Instrument Sans',sans-serif", color: "#838C9B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  companyRow: { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#F8F9FB", borderRadius: "var(--r)" } satisfies CSSProperties,
  companyDot: { width: 16, height: 16, borderRadius: 999, background: "#DDF3E9", color: "#076945", font: "600 9px/16px 'IBM Plex Mono',monospace", textAlign: "center", flex: "none" } satisfies CSSProperties,
  companyName: { flex: 1, minWidth: 0, font: "600 12px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  companyTag: { font: "500 9px/1 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#076945", flex: "none" } satisfies CSSProperties,
  items: { padding: 6 } satisfies CSSProperties,
  item: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    width: "100%",
    padding: 10,
    background: "none",
    border: "none",
    borderRadius: "var(--r)",
    cursor: "pointer",
    textAlign: "left",
    font: "600 13px/1.3 'Instrument Sans',sans-serif",
    color: "#1A1F2B",
  } satisfies CSSProperties,
  logoutWrap: { padding: 6, borderTop: "1px solid #F1F3F6" } satisfies CSSProperties,
  logoutBtn: { display: "flex", alignItems: "center", gap: 9, width: "100%", padding: 10, background: "none", border: "none", borderRadius: "var(--r)", cursor: "pointer", textAlign: "left", font: "600 13px/1.3 'Instrument Sans',sans-serif", color: "#D81E32" } satisfies CSSProperties,
  confirmWrap: { padding: "15px 16px 16px" } satisfies CSSProperties,
  confirmTitle: { font: "600 14px/1.35 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 5 } satisfies CSSProperties,
  confirmBody: { margin: "0 0 14px", font: "400 12px/1.55 'Instrument Sans',sans-serif", color: "#5A6373", textWrap: "pretty" } satisfies CSSProperties,
  confirmStack: { display: "grid", gap: 8 } satisfies CSSProperties,
  confirmYes: { height: 42, background: "#D81E32", color: "#FFFFFF", border: "none", borderRadius: "var(--r)", font: "600 13px/1 'Instrument Sans',sans-serif", cursor: "pointer" } satisfies CSSProperties,
  confirmNo: { height: 42, background: "#FFFFFF", color: "#1A1F2B", border: "1px solid #CDD2DA", borderRadius: "var(--r)", font: "600 13px/1 'Instrument Sans',sans-serif", cursor: "pointer" } satisfies CSSProperties,
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function ProfileMenu({
  name,
  company,
  email,
}: {
  name: string;
  company: string | null;
  email: string;
}): JSX.Element {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!open) return;
      if (rootRef.current && rootRef.current.contains(e.target as Node)) return;
      setOpen(false);
      setConfirming(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        setOpen(false);
        setConfirming(false);
      }
    }
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // Already signing them out locally regardless — see Onboarding.tsx's identical note.
    }
    setSession(null);
    navigate("/sign-in", { replace: true });
  }

  const initials = initialsOf(name || email);

  return (
    <div ref={rootRef} style={{ position: "relative", fontFamily: "'Instrument Sans',sans-serif" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" style={M.trigger}>
        <span style={M.avatar(30)}>{initials}</span>
        <span style={{ display: "block" }}>
          <span style={M.triggerName}>{name || email}</span>
          <span style={M.triggerCompany}>{company ?? "—"}</span>
        </span>
        <svg width="10" height="7" viewBox="0 0 10 7" aria-hidden="true" style={{ flex: "none", display: "block", marginLeft: 1 }}>
          <path d="M1 1.5 5 5.5 9 1.5" fill="none" stroke="#838C9B" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div role="menu" style={M.menu}>
          <div style={M.head}>
            <div style={M.headRow}>
              <span style={M.avatar(38)}>{initials}</span>
              <div style={{ minWidth: 0 }}>
                <div style={M.headName}>{name || email}</div>
                <div style={M.headEmail}>{email}</div>
              </div>
            </div>
            {company && (
              <div style={M.companyRow}>
                <span style={M.companyDot}>✓</span>
                <span style={M.companyName}>{company}</span>
                <span style={M.companyTag}>VERIFIED</span>
              </div>
            )}
          </div>

          {!confirming ? (
            <>
              <div style={M.items}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    navigate("/settings");
                  }}
                  style={M.item}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                    <circle cx="8" cy="5.5" r="2.75" fill="none" stroke="#5A6373" strokeWidth="1.5" />
                    <path d="M2.75 13.5c.7-2.4 2.8-3.75 5.25-3.75s4.55 1.35 5.25 3.75" fill="none" stroke="#5A6373" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <span style={{ flex: 1 }}>My profile</span>
                </button>
              </div>
              <div style={M.logoutWrap}>
                <button type="button" role="menuitem" onClick={() => setConfirming(true)} style={M.logoutBtn}>
                  <span style={{ display: "block", width: 16, height: 16, border: "1.5px solid #D81E32", borderRightColor: "transparent", borderRadius: 999, flex: "none" }} />
                  <span style={{ flex: 1 }}>Log out</span>
                </button>
              </div>
            </>
          ) : (
            <div style={M.confirmWrap}>
              <div style={M.confirmTitle}>Log out of CRAL?</div>
              <p style={M.confirmBody}>Bookings keep running while you are away. You will need your password to come back in.</p>
              <div style={M.confirmStack}>
                <button type="button" onClick={() => void handleLogout()} style={M.confirmYes}>Yes, log out</button>
                <button type="button" onClick={() => setConfirming(false)} style={M.confirmNo}>Stay signed in</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
