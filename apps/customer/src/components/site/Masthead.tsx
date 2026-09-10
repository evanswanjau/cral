import { Link, useNavigate } from "react-router-dom";
import logo from "../../assets/cral-logo.png";

/**
 * The public masthead, reproduced from the "Cruz Ride Auto - Website"
 * canvas with its own inline styles (the design is 100% inline-styled, so
 * this matches exactly rather than approximately). Signed-out only for
 * now - the account dropdown lands with customer auth/trips.
 */

const NAV: Array<{ label: string; to: string }> = [
  { label: "Find a car", to: "/browse" },
  { label: "How it works", to: "/how-it-works" },
  { label: "How we protect you", to: "/how-we-protect-you" },
  { label: "Corporate", to: "/corporate" },
  { label: "Help", to: "/help" },
];

export function Masthead(): JSX.Element {
  const navigate = useNavigate();
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
