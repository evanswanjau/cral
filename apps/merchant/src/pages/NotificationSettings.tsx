import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BackButton } from "../components/onboarding/primitives.js";
import { P } from "../components/portal/styles.js";
import { useToast } from "../components/portal/Toast.js";
import { ApiClientError } from "../lib/api.js";
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  type NotificationCategory,
  type NotificationPreferenceRow,
  type QuietHours,
} from "../lib/notifications-api.js";

type ChannelKey = "sms" | "email";
const CHANNELS: Array<[ChannelKey, string]> = [
  ["sms", "SMS"],
  ["email", "EMAIL"],
];

interface Draft {
  categories: Record<NotificationCategory, { sms: boolean; email: boolean }>;
  quiet: QuietHours;
}

function toDraft(rows: NotificationPreferenceRow[], quiet: QuietHours): Draft {
  const categories = {} as Draft["categories"];
  for (const row of rows) categories[row.category] = { sms: row.sms, email: row.email };
  return { categories, quiet };
}

function Toggle({
  on,
  locked,
  onToggle,
}: {
  on: boolean;
  locked: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        style={{
          ...P.ntToggle,
          cursor: locked ? "not-allowed" : "pointer",
          justifyContent: on ? "flex-end" : "flex-start",
          background: locked ? "#C3CBF5" : on ? "#0F23A8" : "#E4E7EC",
          borderColor: locked ? "#C3CBF5" : on ? "#0F23A8" : "#CDD2DA",
        }}
      >
        <span style={{ ...P.ntToggleKnob, background: locked ? "#F8F9FB" : "#FFFFFF" }} />
      </button>
    </div>
  );
}

export function NotificationSettings(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, isLoading } = useNotificationPreferences();
  const save = useUpdateNotificationPreferences();

  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (data) setDraft(toDraft(data.categories, data.quiet_hours));
  }, [data]);

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    const base = toDraft(data.categories, data.quiet_hours);
    return JSON.stringify(base) !== JSON.stringify(draft);
  }, [data, draft]);

  if (isLoading || !data || !draft) {
    return (
      <div style={{ maxWidth: 760 }}>
        <BackButton onClick={() => navigate("/notifications")}>← Back to notifications</BackButton>
        <h1 style={P.h1}>Notifications</h1>
        <div style={{ ...P.card, padding: 20, marginTop: 16 }}>Loading…</div>
      </div>
    );
  }

  function flip(category: NotificationCategory, channel: ChannelKey, locked: boolean): void {
    if (locked) {
      toast("This one always sends by SMS — it's about your money.", "#C77400");
      return;
    }
    setDraft((d) =>
      d
        ? {
            ...d,
            categories: {
              ...d.categories,
              [category]: { ...d.categories[category], [channel]: !d.categories[category][channel] },
            },
          }
        : d,
    );
  }

  function setQuiet(patch: Partial<QuietHours>): void {
    setDraft((d) => (d ? { ...d, quiet: { ...d.quiet, ...patch } } : d));
  }

  async function onSave(): Promise<void> {
    if (!draft) return;
    try {
      await save.mutateAsync({
        categories: data!.categories.map((row) => ({
          category: row.category,
          sms: draft.categories[row.category].sms,
          email: draft.categories[row.category].email,
        })),
        quiet_hours: {
          enabled: draft.quiet.enabled,
          from: draft.quiet.from,
          until: draft.quiet.until,
        },
      });
      toast("Notification settings saved.", "#0B8A5B");
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.message : "Couldn't save that. Try again in a moment.";
      toast(message, "#D81E32");
    }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <BackButton onClick={() => navigate("/notifications")}>← Back to notifications</BackButton>
      <h1 style={P.h1}>Notifications</h1>
      <p style={{ ...P.lede, marginBottom: 20 }}>
        Every alert always shows in the portal. Choose which ones also reach you by SMS and email. WhatsApp isn't
        available yet.
      </p>

      <div style={P.ntSettingsWrap}>
        <div style={P.ntMatrix}>
          <div style={P.ntCardHead}>
            <div style={P.ntCardTitle}>Alerts</div>
            <div style={P.ntCardSub}>
              Money and reviewer messages always send by SMS — those rows can't be turned off.
            </div>
          </div>

          <div style={P.ntMatrixCols}>
            <span />
            {CHANNELS.map(([key, label]) => (
              <span key={key} style={P.ntMatrixColLabel}>
                {label}
              </span>
            ))}
          </div>

          {data.categories.map((row) => (
            <div key={row.category} style={P.ntMatrixRow}>
              <div style={{ minWidth: 0 }}>
                <div style={P.ntMatrixRowLabel}>{row.label}</div>
                <div style={P.ntMatrixRowBody}>{row.body}</div>
              </div>
              {CHANNELS.map(([key]) => {
                const locked = row.locked.includes(key);
                return (
                  <Toggle
                    key={key}
                    on={draft.categories[row.category][key]}
                    locked={locked}
                    onToggle={() => flip(row.category, key, locked)}
                  />
                );
              })}
            </div>
          ))}

          <div style={P.ntMatrixFoot}>Quiet hours are not applied to payout or reviewer messages.</div>
        </div>

        <div style={P.ntQuietCard}>
          <div style={P.ntCardHead}>
            <div style={P.ntCardTitle}>Quiet hours</div>
            <div style={P.ntCardSub}>Booking alerts hold until morning. Everything else still comes through.</div>
          </div>
          <div style={P.ntQuietBody}>
            <div style={P.ntQuietToggleRow}>
              <span style={P.ntQuietToggleLabel}>Hold overnight alerts</span>
              <Toggle
                on={draft.quiet.enabled}
                locked={false}
                onToggle={() => setQuiet({ enabled: !draft.quiet.enabled })}
              />
            </div>
            <div style={P.ntQuietTimeGrid}>
              <label style={{ display: "block" }}>
                <span style={P.ntQuietTimeLabel}>From</span>
                <input
                  type="time"
                  value={draft.quiet.from}
                  onChange={(e) => setQuiet({ from: e.target.value })}
                  style={P.ntQuietTimeInput}
                />
              </label>
              <label style={{ display: "block" }}>
                <span style={P.ntQuietTimeLabel}>Until</span>
                <input
                  type="time"
                  value={draft.quiet.until}
                  onChange={(e) => setQuiet({ until: e.target.value })}
                  style={P.ntQuietTimeInput}
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div style={P.ntSaveBar}>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || save.isPending}
          style={{ ...P.addButton, opacity: dirty && !save.isPending ? 1 : 0.55 }}
        >
          {save.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
