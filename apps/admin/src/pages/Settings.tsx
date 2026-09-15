import type { CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { usePageTitle } from "../lib/use-page-title.js";
import { Placeholder } from "./Placeholder.js";
import { TeamTab } from "./settings/TeamTab.js";

/**
 * Settings — one tabbed screen, per "Cruz Admin Settings.dc.html"'s own
 * six tabs: Review rules · Money · Communication · Invoicing · Team ·
 * Audit log (docs/plans/admin-merchants-vehicle-review.md finding §6 —
 * read straight off that file — says Team and the audit reader are tabs
 * *inside* Settings, not standalone nav items).
 *
 * An earlier pass shipped Team as its own top-level route because this
 * shell didn't exist yet; folded back in here to match the design
 * (2026-09-15). `/team` now redirects to `/settings?tab=team` for the
 * bookmark that briefly existed. Only Team is built — the other five
 * tabs render the same "not built yet" card every other unbuilt console
 * screen uses (`Placeholder`), same footing as Dashboard/Payouts/etc.
 * `platform_settings` already backs a real "Review rules" tab (SLA,
 * auto-checks, required documents) — it just has no UI yet.
 */
const TABS = [
  { key: "review-rules", label: "Review rules" },
  { key: "money", label: "Money" },
  { key: "communication", label: "Communication" },
  { key: "invoicing", label: "Invoicing" },
  { key: "team", label: "Team" },
  { key: "audit-log", label: "Audit log" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function Settings(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: TabKey = (TABS.find((t) => t.key === raw)?.key ?? "review-rules") as TabKey;
  const setTab = (key: TabKey) => setParams(key === "review-rules" ? {} : { tab: key }, { replace: true });

  usePageTitle(`Settings - ${TABS.find((t) => t.key === tab)!.label}`);

  return (
    <div>
      <h1 style={S.h1}>Settings</h1>
      <p style={S.lede}>
        Review rules, money, how CRAL reaches merchants, invoicing, the Ops team, and the audit
        trail.
      </p>

      <div style={S.tabStrip} role="tablist" aria-label="Settings sections">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              style={{
                ...S.tab,
                background: active ? "#0F23A8" : "#FFFFFF",
                color: active ? "#FFFFFF" : "#333B4A",
                borderColor: active ? "#0F23A8" : "#E4E7EC",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "review-rules" && <Placeholder title="Review rules" />}
      {tab === "money" && <Placeholder title="Money" />}
      {tab === "communication" && <Placeholder title="Communication" />}
      {tab === "invoicing" && <Placeholder title="Invoicing" />}
      {tab === "team" && <TeamTab />}
      {tab === "audit-log" && <Placeholder title="Audit log" />}
    </div>
  );
}

const S = {
  h1: {
    margin: "0 0 7px",
    font: "600 clamp(25px,3.4vw,32px)/1.1 Archivo,sans-serif",
    fontVariationSettings: "'wdth' 106",
    letterSpacing: "-.022em",
    color: "#1A1F2B",
  },
  lede: { margin: "0 0 20px", font: "400 14px/1.55 'Instrument Sans',sans-serif", color: "#5A6373", maxWidth: 620 },
  tabStrip: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 },
  tab: {
    height: 38,
    padding: "0 16px",
    border: "1px solid",
    borderRadius: "var(--r)",
    font: "600 13px/1 'Instrument Sans',sans-serif",
    cursor: "pointer",
  },
} satisfies Record<string, CSSProperties>;
