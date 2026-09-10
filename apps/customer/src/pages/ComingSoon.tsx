import { Link } from "react-router-dom";
import { usePageTitle } from "../lib/use-page-title.js";

/**
 * Placeholder for public routes the masthead and home page link to but
 * that are not built yet (browse, car detail, the marketing pages). It
 * resolves the route so a direct link or a nav click lands somewhere on
 * brand rather than on a blank 404. Each of these gets its real screen in
 * a later PR.
 */
export function ComingSoon({ title }: { title: string }): JSX.Element {
  usePageTitle(title);
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "clamp(60px,10vw,120px) 24px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginBottom: 14,
        }}
      >
        <span
          style={{
            display: "block",
            width: 18,
            height: 5,
            background: "#D81E32",
            transform: "skewX(-14deg)",
          }}
        />
        <span
          style={{
            font: "500 10px/1 'IBM Plex Mono',monospace",
            letterSpacing: ".12em",
            color: "#838C9B",
          }}
        >
          COMING SOON
        </span>
      </div>
      <h1
        style={{
          margin: "0 0 12px",
          font: "700 clamp(28px,4vw,40px)/1.1 Archivo,sans-serif",
          fontVariationSettings: "'wdth' 110",
          letterSpacing: "-.028em",
          color: "#0B0F1A",
        }}
      >
        {title}
      </h1>
      <p
        style={{
          margin: "0 0 24px",
          font: "400 16px/1.6 'Instrument Sans',sans-serif",
          color: "#5A6373",
          maxWidth: 480,
        }}
      >
        This part of Cruz Ride Auto is on the way. The home page is live now - start there.
      </p>
      <Link
        to="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          height: 44,
          padding: "0 19px",
          background: "#0F23A8",
          color: "#FFFFFF",
          borderRadius: 8,
          font: "600 14px/1 'Instrument Sans',sans-serif",
          textDecoration: "none",
        }}
      >
        Back to home
      </Link>
    </div>
  );
}
