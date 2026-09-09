import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catches a render-time throw instead of letting it blank the whole
 * console. Used at two levels (see main.tsx and AppLayout.tsx): once around
 * the whole app as a last resort, and once inside the shell so a broken
 * page keeps the nav and the reviewer can go somewhere else.
 *
 * `resetKey` is how the inner one recovers: pass the pathname and
 * navigating away clears the error.
 */
interface Props {
  children: ReactNode;
  resetKey?: string;
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
    console.error("[admin] render error", error, info.componentStack);
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
          margin: compact ? 0 : "80px auto",
          padding: 24,
          maxWidth: 560,
          background: "#FFFFFF",
          border: "1px solid #E4E7EC",
          borderRadius: 12,
        }}
      >
        <div style={{ font: "600 15px/1.2 Archivo,sans-serif", color: "#1A1F2B" }}>
          This page didn't load
        </div>
        <p style={{ margin: 0, font: "400 13px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
          Something broke while drawing this screen. Nothing you were reviewing has changed -
          {compact ? " pick another page from the menu, or try again." : " try again."} If it keeps
          happening, tell the platform team.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
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
            onClick={() => window.location.assign("/")}
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
            Console home
          </button>
        </div>
      </div>
    );
  }
}
