import { useNavigate, useSearchParams } from "react-router-dom";
import { P } from "../components/portal/styles.js";
import { useProfile } from "../lib/settings-api.js";
import { BusinessTab } from "./settings/BusinessTab.js";
import { PayoutsTab } from "./settings/PayoutsTab.js";
import { NotificationsTab } from "./settings/NotificationsTab.js";
import { SecurityTab } from "./settings/SecurityTab.js";

/**
 * Settings — one tabbed page, per "Cruz Merchant Settings.dc.html". The
 * design has five tabs (Business · Payouts · Alerts · People · Security);
 * we ship four:
 *  - "Alerts" is "Notifications" (2026-09-02 naming call).
 *  - "People" is omitted — team accounts / roles / invites is a multi-user
 *    authorization feature with real permission differences, deferred to
 *    its own phase. Shipping the roster read-only would fabricate trust the
 *    way the hardcoded `id_verified` badge did. Same posture as dropping
 *    the WhatsApp column from the Alerts matrix.
 *
 * `/settings/security` and `/settings/notifications` still work — App.tsx
 * redirects them to `?tab=…`.
 */

const TABS = [
  { key: "business", label: "Business" },
  { key: "payouts", label: "Payouts" },
  { key: "notifications", label: "Notifications" },
  { key: "security", label: "Security" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function Settings(): JSX.Element {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: profile } = useProfile();

  const raw = params.get("tab");
  const tab: TabKey = (TABS.find((t) => t.key === raw)?.key ?? "business") as TabKey;
  const setTab = (key: TabKey) =>
    setParams(key === "business" ? {} : { tab: key }, { replace: true });

  const name =
    profile?.owner_type === "company"
      ? profile.company_name || "Your business"
      : [profile?.first_name, profile?.surname].filter(Boolean).join(" ") || "Your account";
  const approved = Boolean(profile?.approved_at);

  return (
    <div>
      <div style={P.listHead}>
        <div>
          <h1 style={P.h1}>Settings</h1>
          <p style={P.lede}>Your business details, where money lands, and how CRAL reaches you.</p>
        </div>
        <button type="button" style={P.setBackBtn} onClick={() => navigate("/vehicles")}>
          Back to dashboard
        </button>
      </div>

      {profile && (
        <div style={P.setAccountCard}>
          <div style={P.setAccountLabel}>ACCOUNT</div>
          <span style={{ ...P.setChip, ...(approved ? P.setChipOk : P.setChipWarn) }}>
            {approved ? "✓ VERIFIED" : "PENDING REVIEW"}
          </span>
          <div style={P.setAccountText}>
            {approved
              ? `${name} has been a merchant since ${fmtDate(profile.member_since)}.`
              : `${name}'s account is being reviewed. You've been signed up since ${fmtDate(
                  profile.member_since,
                )}.`}
          </div>
        </div>
      )}

      <div style={P.setTabStrip} role="tablist" aria-label="Settings sections">
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
                ...P.setTab,
                background: active ? "#0B0F1A" : "#FFFFFF",
                color: active ? "#FFFFFF" : "#333B4A",
                borderColor: active ? "#0B0F1A" : "#CDD2DA",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "business" && <BusinessTab />}
      {tab === "payouts" && <PayoutsTab />}
      {tab === "notifications" && <NotificationsTab />}
      {tab === "security" && <SecurityTab />}
    </div>
  );
}
