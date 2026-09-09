import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminLogout } from "../../lib/auth-api.js";
import { setSession } from "../../lib/auth.js";
import { PM, ROLE_LABEL } from "./styles.js";

/**
 * The account chip + dropdown in the masthead, reproduced from
 * "Cruz Admin Profile Menu.dc.html" with its own inline styles. The two
 * menu items ("Your profile", "Notification preferences") route to
 * placeholders until their slices land.
 */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function ProfileMenu({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: string;
}): JSX.Element {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!open) return;
      if (rootRef.current?.contains(e.target as Node)) return;
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
      await adminLogout();
    } catch {
      // Signing out locally regardless — a failed revoke call still means
      // the reviewer meant to leave.
    }
    setSession(null);
    navigate("/sign-in", { replace: true });
  }

  const roleLabel = ROLE_LABEL[role] ?? role;
  const initials = initialsOf(name || email);

  return (
    <div ref={rootRef} style={PM.root}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" style={PM.trigger}>
        <span style={PM.avatar(30)}>{initials}</span>
        <span style={{ display: "block" }}>
          <span style={PM.triggerName}>{name || email}</span>
          <span style={PM.triggerRole}>{roleLabel}</span>
        </span>
        <svg width="10" height="7" viewBox="0 0 10 7" aria-hidden="true" style={{ flex: "none", display: "block", marginLeft: 1 }}>
          <path d="M1 1.5 5 5.5 9 1.5" fill="none" stroke="#838C9B" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div role="menu" style={PM.menu}>
          <div style={PM.head}>
            <div style={PM.headRow}>
              <span style={PM.avatar(38)}>{initials}</span>
              <div style={{ minWidth: 0 }}>
                <div style={PM.headName}>{name || email}</div>
                <div style={PM.headEmail}>{email}</div>
              </div>
            </div>
            <div style={PM.roleRow}>
              <span style={PM.roleName}>{roleLabel}</span>
              <span style={PM.roleTag}>STAFF</span>
            </div>
          </div>

          {!confirming ? (
            <>
              <div style={PM.items}>
                {[
                  { label: "Your profile", note: "Name, phone and role", to: "/profile" },
                  {
                    label: "Notification preferences",
                    note: "What reaches your phone vs inbox",
                    to: "/settings/notifications",
                  },
                ].map((it) => (
                  <button
                    key={it.to}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      navigate(it.to);
                    }}
                    style={PM.item}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={PM.itemLabel}>{it.label}</span>
                      <span style={PM.itemNote}>{it.note}</span>
                    </span>
                    <svg width="6" height="10" viewBox="0 0 6 10" aria-hidden="true" style={{ flex: "none", display: "block" }}>
                      <path d="M1 1 5 5 1 9" fill="none" stroke="#5A6373" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                ))}
              </div>
              <div style={PM.logoutWrap}>
                <button type="button" role="menuitem" onClick={() => setConfirming(true)} style={PM.logoutBtn}>
                  <span style={{ display: "block", width: 16, height: 16, border: "1.5px solid #D81E32", borderRightColor: "transparent", borderRadius: 999, flex: "none" }} />
                  <span style={{ flex: 1 }}>Log out</span>
                </button>
              </div>
              <div style={PM.sessionLine}>SIGNED IN ON THIS DEVICE</div>
            </>
          ) : (
            <div style={PM.confirmWrap}>
              <div style={PM.confirmTitle}>Log out of the console?</div>
              <p style={PM.confirmBody}>
                Your queue stays assigned to you. You will need your password to come back in.
              </p>
              <div style={PM.confirmStack}>
                <button type="button" onClick={() => void handleLogout()} style={PM.confirmYes}>
                  Yes, log out
                </button>
                <button type="button" onClick={() => setConfirming(false)} style={PM.confirmNo}>
                  Stay signed in
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
