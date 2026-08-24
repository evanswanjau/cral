import type { ReactNode } from "react";
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
  /** Method toggle (Password / SMS code) — sign-in only. */
  methods?: ReactNode;
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
  methods,
  error,
  footer,
}: AuthShellProps): JSX.Element {
  return (
    <div style={S.page}>
      <BrandPanel />

      <div style={S.formPanel}>
        <div style={S.formInner}>
          <div style={{ marginBottom: 22 }}>
            <h2 style={S.heading}>{heading}</h2>
            <p style={S.subheading}>{subheading}</p>
          </div>

          {showGoogle && (
            <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
              <button
                type="button"
                disabled
                title="Google sign-in isn't connected yet"
                style={{ ...S.googleBtn, opacity: 0.55, cursor: "not-allowed" }}
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

          {methods}

          {children}

          {error && <ErrorBanner message={error} />}

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
