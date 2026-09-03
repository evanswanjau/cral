import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BrandPanel } from "../BrandPanel.js";
import { ErrorBanner, GoogleIcon } from "./primitives.jsx";
import { S } from "./styles.js";

export interface AuthShellProps {
  heading: string;
  subheading: string;
  children: ReactNode;
  /** Rendered by the design above the OR rule; only sign-in and register show it. */
  showGoogle?: boolean;
  error?: string | null;
  /** The bordered link row at the bottom ("New to CRAL? Register instead", etc.). */
  footer?: { text: string; linkLabel: string; to: string };
}

/**
 * The shared auth layout: dark brand panel + light form panel, matching the
 * design canvas's single auth template. Every auth screen is a set of
 * children inside this shell, exactly as the design expresses them as
 * `sc-if` branches of one file.
 */
export function AuthShell({
  heading,
  subheading,
  children,
  showGoogle = false,
  error,
  footer,
}: AuthShellProps): JSX.Element {
  const [googleNotice, setGoogleNotice] = useState<string | null>(null);

  return (
    <div style={S.page}>
      {/*
        The grid's own `auto-fit,minmax(min(100%,430px),1fr)` (styles.ts)
        already stacks these two panels below ~860px - that part needs no
        media query. What it doesn't do is reorder them: DOM order keeps the
        brand panel first, so on a phone someone scrolls past the whole
        pitch before reaching the actual sign-in form. This flips the form
        to the top only below that same 860px stacking point, and is
        deliberately a real media query rather than a JS width check - 
        `S.formPanel` still holds every pixel value verbatim from the
        design, this only reorders the two existing DOM nodes.
      */}
      <style>{`@media (max-width: 860px) { .cral-auth-form-panel { order: -1; } }`}</style>

      <BrandPanel />

      <div className="cral-auth-form-panel" style={S.formPanel}>
        <div style={S.formInner}>
          <div style={{ marginBottom: 22 }}>
            <h2 style={S.heading}>{heading}</h2>
            <p style={S.subheading}>{subheading}</p>
          </div>

          {showGoogle && (
            <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
              <button
                type="button"
                onClick={() =>
                  setGoogleNotice(
                    "Google sign-in isn’t connected yet - use your email and password for now.",
                  )
                }
                style={S.googleBtn}
              >
                <GoogleIcon />
                Continue with Google
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={S.rule} />
                <span style={S.orLabel}>OR</span>
                <span style={S.rule} />
              </div>
            </div>
          )}

          {children}

          {(error ?? googleNotice) && <ErrorBanner message={(error ?? googleNotice)!} />}

          {footer && (
            <div style={S.bottom}>
              <div style={S.bottomRow}>
                <span style={S.bottomText}>{footer.text}</span>
                <Link to={footer.to} style={S.bottomLink}>
                  {footer.linkLabel}
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
