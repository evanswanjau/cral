import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catches a render-time throw instead of letting it unmount the whole
 * tree. React's default on an uncaught render error is to blank the page;
 * on a public marketplace that reads as "the site is down" rather than
 * "one panel broke".
 *
 * Used at two levels (see main.tsx and SiteShell.tsx):
 *
 *  - around the whole app, as the last resort
 *  - inside the site shell, keyed on the pathname, so a broken page keeps
 *    the masthead and clears when the visitor navigates away
 */
interface Props {
  children: ReactNode;
  /** Changing this clears a caught error - pass the route path. */
  resetKey?: string;
  /** Softer copy for the in-shell boundary, where the nav is still there. */
  compact?: boolean;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidUpdate(previous: Props): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // No error-reporting service is wired up yet, so the console is all
    // there is. Log the component stack too - the message alone rarely
    // says which screen died.
    console.error("[customer] render error", error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const compact = this.props.compact ?? false;

    return (
      <div
        role="alert"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 12,
          margin: compact ? "60px auto" : "80px auto",
          padding: 24,
          maxWidth: 560,
          background: "#FFFFFF",
          border: "1px solid #E4E7EC",
          borderRadius: 12,
        }}
      >
        <div style={{ font: "600 15px/1.2 Archivo,sans-serif", color: "#0B0F1A" }}>
          This page didn't load
        </div>
        <p
          style={{
            margin: 0,
            font: "400 13px/1.6 'Instrument Sans',sans-serif",
            color: "#5A6473",
          }}
        >
          Something broke while drawing this screen. Nothing you were looking at has changed -
          {compact ? " pick another page from the menu, or try again." : " try again."} If it keeps
          happening, contact CRAL support.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              this.setState({ error: null });
            }}
            style={{
              height: 40,
              padding: "0 17px",
              background: "#FFFFFF",
              color: "#1A1F2B",
              border: "1px solid #CDD2DA",
              borderRadius: 8,
              font: "600 14px/1 'Instrument Sans',sans-serif",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.assign("/");
            }}
            style={{
              height: 40,
              padding: "0 20px",
              background: "#0F23A8",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              font: "600 14px/1 'Instrument Sans',sans-serif",
              cursor: "pointer",
            }}
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }
}
