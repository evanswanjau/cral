import { Outlet, useLocation } from "react-router-dom";
import { ErrorBoundary } from "../ErrorBoundary.js";
import { Masthead } from "./Masthead.js";
import { Footer } from "./Footer.js";

/**
 * The public site frame: masthead, routed page, footer. The inner error
 * boundary is keyed on the pathname so a broken page keeps the masthead
 * and clears on navigation (the outer one in main.tsx catches what breaks
 * outside the shell).
 */
export function SiteShell(): JSX.Element {
  const { pathname } = useLocation();
  return (
    <div
      style={{
        fontFamily: "'Instrument Sans',sans-serif",
        color: "#1A1F2B",
        background: "#FAFBFC",
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: "100vh",
      }}
    >
      <Masthead />
      <ErrorBoundary compact resetKey={pathname}>
        <Outlet />
      </ErrorBoundary>
      <Footer />
    </div>
  );
}
