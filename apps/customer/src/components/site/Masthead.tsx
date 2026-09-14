import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import logo from "../../assets/cral-logo.png";
import { useIsAuthenticated, setSession } from "../../lib/auth.js";
import { logout } from "../../lib/auth-api.js";
import { listMyNotifications } from "../../lib/notifications-api.js";

/**
 * The public masthead, reproduced from the "Cruz Ride Auto - Website"
 * canvas with its own inline styles (the design is 100% inline-styled, so
 * this matches exactly rather than approximately).
 *
 * The signed-in state (My trips / notifications bell / sign out) is NOT
 * from the canvas - the design's account dropdown is part of
 * `Cruz Customer Portal.dc.html`, not pulled this session. Built here in
 * the same visual idiom as everything else on this masthead so trips,
 * notifications and account settings (all real since C8) are actually
 * reachable - previously this bar showed "Sign in" unconditionally even
 * to a signed-in renter, which meant nothing past the booking flow itself
 * had a way in except typing the URL directly.
 */

const NAV: Array<{ label: string; to: string }> = [
  { label: "Find a car", to: "/browse" },
  { label: "Find parts", to: "/parts" },
  { label: "Find services", to: "/services" },
];

function NotificationBell(): JSX.Element {
  const { data } = useQuery({
    queryKey: ["notifications", "mine", "bell"],
    queryFn: () => listMyNotifications({ limit: 1 }),
    refetchInterval: 60_000,
  });
  const unread = data?.unread ?? 0;
  return (
    <Link
      to="/notifications"
      style={{
        position: "relative",
        height: 38,
        width: 38,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        color: "#333B4A",
        textDecoration: "none",
        font: "600 15px/1 'Instrument Sans',sans-serif",
        flex: "none",
      }}
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
    >
      🔔
      {unread > 0 && (
        <span
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            minWidth: 15,
            height: 15,
            padding: "0 3px",
            borderRadius: 999,
            background: "#D81E32",
            color: "#FFFFFF",
            font: "700 9px/15px 'Instrument Sans',sans-serif",
            textAlign: "center",
          }}
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}

function AccountNav(): JSX.Element {
  const navigate = useNavigate();
  const linkStyle = {
    height: 38,
    padding: "0 12px",
    display: "flex",
    alignItems: "center",
    color: "#333B4A",
    borderRadius: 8,
    font: "600 14px/1 'Instrument Sans',sans-serif",
    whiteSpace: "nowrap",
    textDecoration: "none",
  } as const;
  return (
    <>
      <Link to="/trips" style={linkStyle}>
        My trips
      </Link>
      <NotificationBell />
      <Link to="/account" style={linkStyle}>
        Account
      </Link>
      <button
        type="button"
        onClick={async () => {
          // Best-effort revoke server-side - a failed request must not
          // strand the renter unable to sign out on their own device.
          try {
            await logout();
          } catch {
            /* local session is cleared regardless */
          }
          setSession(null);
          navigate("/");
        }}
        style={{
          height: 38,
          padding: "0 13px",
          background: "none",
          color: "#5A6373",
          border: "none",
          borderRadius: 8,
          font: "600 14px/1 'Instrument Sans',sans-serif",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Sign out
      </button>
    </>
  );
}

export function Masthead(): JSX.Element {
  const navigate = useNavigate();
  const isAuthenticated = useIsAuthenticated();
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: "rgba(255,255,255,.94)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid #E4E7EC",
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          margin: "0 auto",
          padding: "0 clamp(16px,4vw,40px)",
          height: 66,
          display: "flex",
          alignItems: "center",
          gap: "clamp(12px,3vw,34px)",
        }}
      >
        <Link to="/" style={{ display: "flex", alignItems: "center", flex: "none" }}>
          <img
            src={logo}
            alt="Cruz Ride Auto Limited"
            style={{ display: "block", height: 46, width: "auto" }}
          />
        </Link>

        <div
          className="cral-rail"
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 2,
            overflowX: "auto",
          }}
        >
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              style={{
                flex: "none",
                height: 34,
                display: "flex",
                alignItems: "center",
                padding: "0 12px",
                color: "#5A6373",
                borderRadius: 7,
                font: "500 14px/1 'Instrument Sans',sans-serif",
                whiteSpace: "nowrap",
                textDecoration: "none",
              }}
            >
              {n.label}
            </Link>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 9, flex: "none" }}>
          {isAuthenticated ? (
            <AccountNav />
          ) : (
            <button
              type="button"
              onClick={() => navigate("/sign-in")}
              style={{
                height: 38,
                padding: "0 13px",
                background: "none",
                color: "#333B4A",
                border: "none",
                borderRadius: 8,
                font: "600 14px/1 'Instrument Sans',sans-serif",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Sign in
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate("/browse")}
            style={{
              height: 38,
              padding: "0 16px",
              background: "#0F23A8",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 8,
              font: "600 14px/1 'Instrument Sans',sans-serif",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Find a car
          </button>
          <button
            type="button"
            onClick={() => navigate("/list-your-car")}
            style={{
              height: 38,
              padding: "0 15px",
              background: "#FFFFFF",
              color: "#333B4A",
              border: "1px solid #E4E7EC",
              borderRadius: 8,
              font: "600 14px/1 'Instrument Sans',sans-serif",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            List your car
          </button>
        </div>
      </div>
    </div>
  );
}
