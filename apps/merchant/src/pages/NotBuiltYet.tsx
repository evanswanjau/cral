import { Link } from "react-router-dom";
import { BrandPanel } from "../components/BrandPanel.js";

/** Placeholder for screens not in scope yet — keeps links from Sign in from breaking the router. */
export function NotBuiltYet({ title }: { title: string }): JSX.Element {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,430px),1fr))",
        fontFamily: "'Instrument Sans',sans-serif",
      }}
    >
      <BrandPanel />
      <div
        style={{
          background: "#FAFBFC",
          padding: "clamp(24px,4vw,48px) clamp(20px,4vw,56px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ width: "100%", maxWidth: 420 }}>
          <h2
            style={{
              margin: "0 0 7px",
              font: "600 clamp(24px,3vw,30px)/1.15 Archivo,sans-serif",
              fontVariationSettings: "'wdth' 106",
              letterSpacing: "-.022em",
              color: "#0B0F1A",
            }}
          >
            {title}
          </h2>
          <p style={{ margin: 0, font: "400 14px/1.55 'Instrument Sans',sans-serif", color: "#5A6373" }}>
            This screen isn&apos;t built yet.
          </p>
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #E4E7EC" }}>
            <Link
              to="/sign-in"
              style={{
                font: "600 14px/1.5 'Instrument Sans',sans-serif",
                color: "#0F23A8",
                textDecoration: "none",
                borderBottom: "1px solid rgba(15,35,168,.26)",
              }}
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
