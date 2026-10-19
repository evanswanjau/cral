import { useEffect, useMemo, useState } from "react";
import { P } from "../../components/portal/styles.js";
import { SaveBar } from "../../components/portal/SaveBar.js";
import { useToast } from "../../components/portal/Toast.js";
import { ApiClientError } from "../../lib/api.js";
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  type NotificationCategory,
  type NotificationPreferenceRow,
} from "../../lib/notifications-api.js";

/**
 * Settings → Notifications. The category × channel matrix -
 * shipped as "Notifications" per the 2026-09-02 naming call (the design
 * file names the tab "Alerts"). Formerly the standalone
 * `pages/NotificationSettings.tsx` route; folded in here unchanged except
 * for losing its own page heading (the shell provides one) and using the
 * shared SaveBar.
 */

type ChannelKey = "sms" | "email";
const CHANNELS: Array<[ChannelKey, string]> = [
  ["sms", "SMS"],
  ["email", "EMAIL"],
];

interface Draft {
  categories: Record<NotificationCategory, { sms: boolean; email: boolean }>;
}

function toDraft(rows: NotificationPreferenceRow[]): Draft {
  const categories = {} as Draft["categories"];
  for (const row of rows) categories[row.category] = { sms: row.sms, email: row.email };
  return { categories };
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

export function NotificationsTab(): JSX.Element {
  const toast = useToast();
  const { data, isLoading } = useNotificationPreferences();
  const save = useUpdateNotificationPreferences();

  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (data) setDraft(toDraft(data.categories));
  }, [data]);

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    const base = toDraft(data.categories);
    return JSON.stringify(base) !== JSON.stringify(draft);
  }, [data, draft]);

  if (isLoading || !data || !draft) {
    return <div style={{ ...P.card, padding: 20 }}>Loading…</div>;
  }

  function flip(category: NotificationCategory, channel: ChannelKey, locked: boolean): void {
    if (locked) {
      toast("This one always sends by SMS - it's about your money.", "#C77400");
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

  function reset(): void {
    if (data) setDraft(toDraft(data.categories));
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
      });
      toast("Notification settings saved.", "#0B8A5B");
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.message : "Couldn't save that. Try again in a moment.";
      toast(message, "#D81E32");
    }
  }

  return (
    <>
      <div style={P.ntSettingsWrap}>
        <div style={P.ntMatrix}>
          <div style={P.ntCardHead}>
            <div style={P.ntCardTitle}>Alerts</div>
            <div style={P.ntCardSub}>
              Money and reviewer messages always send by SMS - those rows can't be turned off.
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
        </div>

      </div>

      {dirty && <SaveBar onSave={onSave} onDiscard={reset} saving={save.isPending} />}
    </>
  );
}
