import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getMe, logout } from "../../lib/auth-api.js";
import { setSession } from "../../lib/auth.js";
import { listMyNotifications } from "../../lib/notifications-api.js";
import { listMyBookings } from "../../lib/bookings-api.js";
import { merchantLandingUrl } from "../../lib/merchant-app.js";

/**
 * The masthead's account avatar + dropdown, pulled from
 * `docs/brand/canvas/Cruz Ride Auto - Website.dc.html` (its `acctRef`/
 * `toggleAcct`/`acctOpen`/`acctTabs`/`acctLinks` markup) - values inlined
 * verbatim rather than approximated.
 *
 * The canvas fixture is dual-role (a signed-in account can be `isMerchant`
 * and see a completely different link set). `apps/customer` never has a
 * merchant signed in - merchants use `apps/merchant` - so only the renter
 * branch of the design is reproduced. Two rows the design ties to screens
 * this app doesn't have are handled per CLAUDE.md's "flag, don't
 * fabricate" rule rather than silently dropped:
 *   - "Payments and receipts" has no dedicated screen (receipts live on
 *     each trip's own detail page) - omitted.
 *   - "Sell a car" is tagged SOON in the design itself - kept inert (no
 *     navigation), not linked to a page that doesn't exist.
 * "Notifications" is NOT in the canvas's link list at all (the design's
 * masthead has no bell), but C8's renter feed is real and needs to stay
 * reachable, so it's added as the first Hiring-tab row - same reasoning
 * as the standalone-bell button this component replaces.
 */

const TABS: Array<{ key: "hiring" | "listing"; label: string }> = [
  { key: "hiring", label: "Hiring" },
  { key: "listing", label: "Listing" },
];

interface LinkRowDef {
  label: string;
  go: (() => void) | null;
  tag: string;
  tagColor?: string;
}

function LinkRow({ label, go, tag, tagColor = "#8C97A8" }: LinkRowDef): JSX.Element {
  return (
    <button
      type="button"
      disabled={!go}
      onClick={() => go?.()}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        width: "100%",
        height: 38,
        padding: "0 12px",
        background: "none",
        border: "none",
        borderRadius: 7,
        cursor: go ? "pointer" : "default",
        textAlign: "left",
        font: "500 13.5px/1 'Instrument Sans',sans-serif",
        color: go ? "#333B4A" : "#A7B0BE",
      }}
    >
      <span>{label}</span>
      {tag && (
        <span style={{ font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".06em", color: tagColor }}>
          {tag}
        </span>
      )}
    </button>
  );
}

export function AccountMenu(): JSX.Element {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"hiring" | "listing">("hiring");
  const rootRef = useRef<HTMLDivElement>(null);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe, staleTime: 60_000 });

  // Only fetched once the dropdown is actually open - a masthead that
  // mounts on every page must not cost two extra requests nobody asked to
  // see yet.
  const { data: notifications } = useQuery({
    queryKey: ["notifications", "mine", "unread-count"],
    queryFn: () => listMyNotifications({ limit: 1 }),
    enabled: open,
  });
  const { data: bookings } = useQuery({
    queryKey: ["bookings", "mine", "count"],
    queryFn: () => listMyBookings({ limit: 1 }),
    enabled: open,
  });

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (!me) {
    // A skeleton circle rather than nothing - the layout must not jump once
    // `/me` resolves a beat after the token check flips `isAuthenticated`.
    return <div style={{ width: 40, height: 40, borderRadius: 999, background: "#F1F3F6", flex: "none" }} />;
  }

  const verified = me.renter_verification.verified;
  const anyPending = me.renter_verification.documents.some((d) => d.state === "pending");
  const docTag = verified ? "CLEAR" : anyPending ? "IN REVIEW" : "DUE";
  const docsDue = !verified;

  const initials = (me.full_name ?? me.email)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  const unread = notifications?.unread ?? 0;
  const bookingCount = bookings?.counts.all ?? 0;

  const goTo = (path: string) => () => {
    close();
    navigate(path);
  };
  const goExternal = (url: string) => () => {
    close();
    window.location.assign(url);
  };

  const hiringLinks: LinkRowDef[] = [
    {
      label: "Notifications",
      go: goTo("/notifications"),
      tag: unread > 0 ? String(unread > 9 ? "9+" : unread) : "",
      tagColor: "#D81E32",
    },
    { label: "My bookings", go: goTo("/bookings"), tag: bookingCount > 0 ? String(bookingCount) : "" },
    { label: "Parts and service orders", go: goTo("/parts"), tag: "SOON" },
    { label: "My documents", go: goTo("/documents"), tag: docTag, tagColor: verified ? "#1B8A5A" : "#C77400" },
  ];
  const listingLinks: LinkRowDef[] = [
    { label: "List your car", go: goExternal(merchantLandingUrl()), tag: "FREE", tagColor: "#1B8A5A" },
    { label: "What CRAL checks first", go: goTo("/how-we-protect-you"), tag: "" },
    { label: "Sell a car", go: null, tag: "SOON" },
  ];

  const tabStyle = (active: boolean) =>
    ({
      flex: 1,
      height: 32,
      background: active ? "#FFFFFF" : "transparent",
      color: active ? "#0B0F1A" : "#5A6373",
      border: "none",
      borderRadius: 6,
      font: `${active ? 600 : 500} 12.5px/1 'Instrument Sans',sans-serif`,
      cursor: "pointer",
      boxShadow: active ? "0 1px 3px rgba(11,15,26,.12)" : "none",
    }) as const;

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Your account"
        title={me.full_name ?? me.email}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          padding: 0,
          background: "#EDEFFC",
          border: "1px solid #DCE1FA",
          borderRadius: 999,
          cursor: "pointer",
        }}
      >
        <span style={{ font: "600 13px/1 Archivo,sans-serif", color: "#0F23A8" }}>{initials || "?"}</span>
        {docsDue && (
          <span
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              width: 12,
              height: 12,
              borderRadius: 999,
              background: "#D81E32",
              border: "2px solid #FFFFFF",
            }}
          />
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: 47,
            right: 0,
            width: 262,
            background: "#FFFFFF",
            border: "1px solid #E4E7EC",
            borderRadius: 12,
            boxShadow: "0 20px 44px rgba(11,15,26,.16)",
            padding: 8,
            zIndex: 60,
          }}
        >
          <div style={{ padding: "10px 12px 13px", borderBottom: "1px solid #F1F3F6", marginBottom: 6 }}>
            <div style={{ font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 4 }}>
              {me.full_name ?? me.email}
            </div>
            {me.phone && (
              <div style={{ font: "500 11.5px/1.4 'IBM Plex Mono',monospace", color: "#838C9B", marginBottom: 9 }}>
                {me.phone}
              </div>
            )}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "4px 10px",
                background: "#EDEFFC",
                border: "1px solid #DCE1FA",
                borderRadius: 999,
                font: "600 10.5px/1.4 'Instrument Sans',sans-serif",
                color: "#0F23A8",
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 999, background: "#0F23A8" }} />
              {verified ? "Verified renter" : "Renter"}
            </span>
          </div>

          <div style={{ display: "flex", gap: 4, padding: 4, background: "#F1F3F6", borderRadius: 9, marginBottom: 6 }}>
            {TABS.map((t) => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)} style={tabStyle(tab === t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {(tab === "hiring" ? hiringLinks : listingLinks).map((row) => (
            <LinkRow key={row.label} {...row} />
          ))}

          <div style={{ borderTop: "1px solid #F1F3F6", marginTop: 6, paddingTop: 6 }}>
            <button
              type="button"
              onClick={async () => {
                close();
                // Best-effort revoke server-side - a failed request must not
                // strand the renter unable to sign out on their own device.
                try {
                  await logout();
                } catch {
                  /* local session is cleared regardless */
                }
                setSession(null);
                navigate("/");
              }}
              style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                height: 38,
                padding: "0 12px",
                background: "none",
                border: "none",
                borderRadius: 7,
                cursor: "pointer",
                textAlign: "left",
                font: "500 13.5px/1 'Instrument Sans',sans-serif",
                color: "#D81E32",
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
