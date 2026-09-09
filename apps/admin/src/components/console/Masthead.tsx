import { useNavigate } from "react-router-dom";
import { C } from "./styles.js";
import { ProfileMenu } from "./ProfileMenu.js";

/**
 * The console masthead: 4px blue strip, wordmark, the ADMIN CONSOLE pill
 * and its single 14° skewed rule, a live clock, an (inert) notifications
 * bell, and the account menu. From "Cruz Admin Vehicles.dc.html".
 *
 * The bell is deliberately dead in this slice — it points at a separate
 * staff-facing notification stream that has no generators yet. A badge that
 * counts nothing is worse than an absent one; see the plan's finding §5.
 */
function nowInNairobi(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")} ${get("year")} · ${get("hour")}:${get("minute")} EAT`.toUpperCase();
}

export function Masthead({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: string;
}): JSX.Element {
  const navigate = useNavigate();

  return (
    <>
      <div style={C.topStrip} />
      <div style={C.mast}>
        <div style={C.mastInner}>
          <div style={C.mastLeft}>
            <button type="button" onClick={() => navigate("/")} title="Console home" style={C.logoBtn}>
              <img src="/logo.png" alt="Cruz Ride Auto Limited" style={C.logo} />
            </button>
            <span style={C.mastRule} />
            <span style={C.consolePill}>ADMIN CONSOLE</span>
            <span style={C.skewRule} />
          </div>
          <div style={C.mastRight}>
            <span style={C.clock}>{nowInNairobi()}</span>
            <span style={C.mastRuleThin} />
            <span style={C.bellBtn} title="Notifications (not in this release)" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
                <path
                  d="M10 2a5 5 0 0 0-5 5v3.2c0 .5-.16 1-.46 1.4L3.3 13.6c-.5.66-.03 1.6.8 1.6h11.8c.83 0 1.3-.94.8-1.6l-1.24-1.98a2.4 2.4 0 0 1-.46-1.4V7a5 5 0 0 0-5-5Z"
                  fill="none"
                  stroke="#5A6373"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path d="M7.5 17a2.5 2.5 0 0 0 5 0" fill="none" stroke="#5A6373" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
            <span style={C.mastRuleThin} />
            <ProfileMenu name={name} email={email} role={role} />
          </div>
        </div>
      </div>
    </>
  );
}
