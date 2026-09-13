import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePageTitle } from "../lib/use-page-title.js";
import {
  listMyNotifications,
  markAllMyNotificationsRead,
  markMyNotificationRead,
  type NotificationFilter,
  type NotificationRow,
} from "../lib/notifications-api.js";

/**
 * `/notifications` - a renter's own feed (C8, Migration B). Not pulled
 * from a canvas file (the merchant portal's own Notifications screen has
 * one; the customer portal's equivalent - "Cruz Customer Portal.dc.html" -
 * hasn't been pulled this session). Built in the same visual idiom as
 * Trips.tsx, which this screen most resembles.
 */

const FILTERS: Array<{ key: NotificationFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
];

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function Row({ row, onRead }: { row: NotificationRow; onRead: (id: string) => void }): JSX.Element {
  const content = (
    <div
      style={{
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        padding: "16px 18px",
        background: row.read ? "#FFFFFF" : "#F5F7FE",
        border: "1px solid #E4E7EC",
        borderRadius: 12,
      }}
    >
      <span
        style={{
          flex: "none",
          width: 8,
          height: 8,
          borderRadius: 999,
          marginTop: 6,
          background: row.read ? "transparent" : "#0F23A8",
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div style={{ font: "600 14.5px/1.35 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>
            {row.title}
          </div>
          <span style={{ flex: "none", font: "400 12px/1.4 'Instrument Sans',sans-serif", color: "#9AA2B0" }}>
            {timeAgo(row.occurred_at)}
          </span>
        </div>
        <p style={{ margin: "4px 0 0", font: "400 13.5px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
          {row.body}
        </p>
        {row.cta && row.cta_href && (
          <span style={{ display: "inline-block", marginTop: 8, font: "600 13px/1.4 'Instrument Sans',sans-serif", color: "#0F23A8" }}>
            {row.cta} →
          </span>
        )}
      </div>
    </div>
  );

  if (!row.cta_href) {
    return (
      <button
        type="button"
        onClick={() => !row.read && onRead(row.id)}
        style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, cursor: row.read ? "default" : "pointer" }}
      >
        {content}
      </button>
    );
  }

  return (
    <Link to={row.cta_href} onClick={() => !row.read && onRead(row.id)} style={{ display: "block", textDecoration: "none" }}>
      {content}
    </Link>
  );
}

export function Notifications(): JSX.Element {
  usePageTitle("Notifications");
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", "mine", filter],
    queryFn: () => listMyNotifications({ filter }),
  });

  const markReadMutation = useMutation({
    mutationFn: markMyNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", "mine"] }),
  });
  const markAllMutation = useMutation({
    mutationFn: markAllMyNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", "mine"] }),
  });

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "clamp(28px,4vw,44px) 20px clamp(50px,7vw,80px)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <h1
          style={{
            margin: 0,
            font: "700 clamp(26px,3.4vw,34px)/1.12 Archivo,sans-serif",
            fontVariationSettings: "'wdth' 108",
            letterSpacing: "-.026em",
            color: "#0B0F1A",
          }}
        >
          Notifications
        </h1>
        {(data?.unread ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => markAllMutation.mutate()}
            disabled={markAllMutation.isPending}
            style={{
              height: 34,
              padding: "0 13px",
              background: "#FFFFFF",
              color: "#0F23A8",
              border: "1px solid #B6C0F4",
              borderRadius: 8,
              font: "600 13px/1 'Instrument Sans',sans-serif",
              cursor: "pointer",
            }}
          >
            Mark all read
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 7, marginBottom: 20 }}>
        {FILTERS.map((f) => {
          const on = filter === f.key;
          const count = f.key === "unread" ? data?.unread : data?.counts.all;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              style={{
                height: 34,
                padding: "0 13px",
                background: on ? "#0B0F1A" : "#FFFFFF",
                color: on ? "#FFFFFF" : "#333B4A",
                border: `1px solid ${on ? "#0B0F1A" : "#E4E7EC"}`,
                borderRadius: 999,
                font: "600 13px/1 'Instrument Sans',sans-serif",
                cursor: "pointer",
              }}
            >
              {f.label}
              {count !== undefined && count > 0 ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>

      {isLoading && <p style={{ font: "400 15px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>Loading…</p>}

      {!isLoading && (data?.data.length ?? 0) === 0 && (
        <div
          style={{
            background: "#FFFFFF",
            border: "1px dashed #CDD2DA",
            borderRadius: 12,
            padding: "40px 24px",
            textAlign: "center",
            font: "600 15px/1.4 'Instrument Sans',sans-serif",
            color: "#0B0F1A",
          }}
        >
          {filter === "unread" ? "Nothing unread." : "No notifications yet."}
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {data?.data.map((row) => (
          <Row key={row.id} row={row} onRead={(id) => markReadMutation.mutate(id)} />
        ))}
      </div>
    </div>
  );
}
