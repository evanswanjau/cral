import { useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { P } from "../components/portal/styles.js";
import { NOTIFICATION_KIND } from "../components/portal/status.js";
import { useToast } from "../components/portal/Toast.js";
import {
  FILTER_LABEL,
  FILTER_ORDER,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationList,
  useNotificationPreferences,
  useSeedDevNotifications,
  type NotificationFilter,
  type NotificationRow,
} from "../lib/notifications-api.js";

/** "15 AUG 2026 · 07:12" — the design's mono timestamp, in Nairobi time. */
function formatWhen(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000);
  const date = shifted
    .toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase();
  const time = shifted.toISOString().slice(11, 16);
  return `${date} · ${time}`;
}

/** Nairobi calendar day for grouping. */
function nairobiDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function dayGroup(iso: string, todayKey: string, yesterdayKey: string): "TODAY" | "YESTERDAY" | "EARLIER" {
  const day = nairobiDay(iso);
  if (day === todayKey) return "TODAY";
  if (day === yesterdayKey) return "YESTERDAY";
  return "EARLIER";
}

const GROUP_ORDER = ["TODAY", "YESTERDAY", "EARLIER"] as const;

function Row({
  row,
  onOpen,
}: {
  row: NotificationRow;
  onOpen: (row: NotificationRow) => void;
}): JSX.Element {
  const [hover, setHover] = useState(false);
  const kind = NOTIFICATION_KIND[row.kind];
  return (
    <div
      onClick={() => onOpen(row)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...P.ntRow,
        background: hover ? "#FAFBFC" : row.read ? "#FFFFFF" : "#FCFDFF",
      }}
    >
      <span style={{ ...P.ntIcon, background: kind.tint, border: `1px solid ${kind.border}`, color: kind.text }}>
        {row.icon}
      </span>
      <div style={P.ntRowMain}>
        <div style={P.ntRowTitleLine}>
          <span style={P.ntRowTitle}>{row.title}</span>
          {!row.read && <span style={P.ntUnreadDot} />}
        </div>
        <div style={P.ntRowBody}>{row.body}</div>
        <div style={P.ntRowMeta}>
          <span style={P.ntWhen}>{formatWhen(row.occurred_at)}</span>
          {row.ref && <span style={P.ntRefChip}>{row.ref}</span>}
        </div>
      </div>
      {row.cta && <span style={P.ntCta}>{row.cta} ›</span>}
    </div>
  );
}

function SkeletonRow(): JSX.Element {
  const bar = (width: number, height = 12): CSSProperties => ({ ...P.skeletonBar, width, height });
  return (
    <div style={{ ...P.ntRow, cursor: "default" }}>
      <div className="cral-shimmer" style={{ ...bar(34, 34), borderRadius: 999 }} />
      <div style={P.ntRowMain}>
        <div className="cral-shimmer" style={bar(220)} />
        <div className="cral-shimmer" style={{ ...bar(320, 10), marginTop: 8 }} />
        <div className="cral-shimmer" style={{ ...bar(120, 10), marginTop: 8 }} />
      </div>
    </div>
  );
}

export function Notifications(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const [filter, setFilter] = useState<NotificationFilter>("all");

  const { data, isLoading } = useNotificationList(filter);
  const { data: prefs } = useNotificationPreferences();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const seed = useSeedDevNotifications();

  const now = new Date();
  const todayKey = nairobiDay(now.toISOString());
  const yesterdayKey = nairobiDay(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());

  function open(row: NotificationRow): void {
    if (!row.read) markRead.mutate(row.id);
    if (row.cta_href) navigate(row.cta_href);
  }

  const rows = data?.data ?? [];
  const grouped = GROUP_ORDER.map((label) => ({
    label,
    items: rows.filter((r) => dayGroup(r.occurred_at, todayKey, yesterdayKey) === label),
  })).filter((g) => g.items.length > 0);

  const counts = data?.counts;
  const shownCount = rows.length;
  const summary =
    `${shownCount} ${shownCount === 1 ? "NOTIFICATION" : "NOTIFICATIONS"}` +
    (data ? ` · ${data.unread ? `${data.unread} UNREAD` : "ALL READ"}` : "");

  // The side card's channel line, made true and specific from the
  // merchant's own preferences rather than the design's hard-coded copy.
  const channelLine = (() => {
    if (!prefs) return "Alerts here also go out by SMS and email, per your settings.";
    const sms = prefs.categories.some((c) => c.sms);
    const email = prefs.categories.some((c) => c.email);
    if (sms && email) return "Alerts here also go out by SMS and by email, per your settings.";
    if (sms) return "Alerts here also go out by SMS, per your settings.";
    if (email) return "Alerts here also go out by email, per your settings.";
    return "Right now every alert stays in-app only — turn on SMS or email in settings.";
  })();

  return (
    <div style={{ display: "flex", gap: "clamp(18px,2.6vw,30px)", alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 300 }}>
        <div style={P.listHead}>
          <div>
            <h1 style={P.h1}>Notifications</h1>
            <p style={P.lede}>
              Booking requests, money movements, document decisions and hirer ratings. Open one to go straight to it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => markAll.mutate(undefined, { onSuccess: () => toast("All notifications marked read.", "#0B8A5B") })}
            disabled={markAll.isPending || !data?.unread}
            style={{ ...P.ntMarkAllBtn, opacity: data?.unread ? 1 : 0.55 }}
          >
            Mark all read
          </button>
        </div>

        {data?.urgent && (
          <div style={P.ntUrgent}>
            <span style={P.ntUrgentDot} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={P.ntUrgentTitle}>A booking request is waiting: {data.urgent.title}</div>
              <div style={P.ntUrgentBody}>{data.urgent.body}</div>
            </div>
            <button type="button" onClick={() => open(data.urgent as NotificationRow)} style={P.ntUrgentBtn}>
              Open request
            </button>
          </div>
        )}

        <div style={P.filterRow}>
          {FILTER_ORDER.map((key) => {
            const on = filter === key;
            const count = counts ? counts[key] : undefined;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                style={{
                  ...P.filterPill,
                  background: on ? "#0B0F1A" : "#FFFFFF",
                  border: `1px solid ${on ? "#0B0F1A" : "#CDD2DA"}`,
                  color: on ? "#FFFFFF" : "#333B4A",
                }}
              >
                <span>{FILTER_LABEL[key]}</span>
                {count !== undefined && (
                  <span style={{ ...P.ntFilterCount, color: on ? "#8C97A8" : "#A7AEBB" }}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        <div style={P.card}>
          {isLoading && [0, 1, 2].map((i) => <SkeletonRow key={i} />)}

          {!isLoading && rows.length === 0 && (
            <div style={P.emptyWrap}>
              <div style={P.emptyIcon}>◍</div>
              <div style={P.emptyTitle}>Nothing here yet</div>
              <p style={P.emptyBody}>
                {filter === "all"
                  ? "As bookings come in, money moves and documents are reviewed, you'll see it here."
                  : "No notifications match this filter."}
              </p>
              {import.meta.env.DEV && filter === "all" && (
                <button type="button" onClick={() => seed.mutate()} disabled={seed.isPending} style={P.actionBtn}>
                  {seed.isPending ? "Seeding…" : "Seed demo notifications"}
                </button>
              )}
            </div>
          )}

          {!isLoading &&
            grouped.map((group) => (
              <div key={group.label}>
                <div style={P.ntGroupLabel}>{group.label}</div>
                {group.items.map((row) => (
                  <Row key={row.id} row={row} onOpen={open} />
                ))}
              </div>
            ))}

          {!isLoading && rows.length > 0 && (
            <div style={P.ntFooter}>
              <span style={P.ntFooterLeft}>{summary}</span>
              <span style={P.ntFooterRight}>Kept for 90 days.</span>
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: "0 0 240px", minWidth: 220 }}>
        <div style={P.ntSideCard}>
          <div style={P.ntSideLabel}>WHERE THESE GO</div>
          <div style={P.ntSideText}>{channelLine}</div>
          <Link to="/settings/notifications" style={P.ntSideBtn}>
            Alert settings
          </Link>
        </div>
      </div>
    </div>
  );
}
