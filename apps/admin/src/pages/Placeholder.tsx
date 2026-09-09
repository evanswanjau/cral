import { usePageTitle } from "../lib/use-page-title.js";

/**
 * Stand-in for every console screen that isn't built yet. PR 1 ships the
 * foundation (auth, RBAC, the shell); Vehicle review and the Merchants lens
 * are the next two PRs, and the rest of the nav lands in later slices.
 */
export function Placeholder({ title }: { title: string }): JSX.Element {
  usePageTitle(title);
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E4E7EC",
        borderRadius: "var(--r-lg)",
        padding: "clamp(24px,4vw,40px)",
        maxWidth: 560,
      }}
    >
      <div style={{ font: "600 18px/1.2 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", color: "#1A1F2B" }}>
        {title}
      </div>
      <p style={{ margin: "10px 0 0", font: "400 13px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
        This part of the console isn't built yet. Sign-in, roles and the shell are in place; the
        screens land in the slices that follow.
      </p>
    </div>
  );
}
