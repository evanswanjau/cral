import type { ReactNode } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { loadDraftFromServer } from "../lib/onboarding-draft.js";
import { getMe } from "../lib/auth-api.js";
import { AppHeader } from "../components/portal/AppHeader.js";
import { SideNav } from "../components/portal/SideNav.js";
import { MerchantStatusCard } from "../components/portal/MerchantStatusCard.js";
import { ToastProvider } from "../components/portal/Toast.js";
import { ErrorBoundary } from "../components/ErrorBoundary.js";
import { P } from "../components/portal/styles.js";
import { useVehicleList } from "../lib/vehicles-api.js";
import { useBookingList } from "../lib/bookings-api.js";
import { useNotificationUnread } from "../lib/notifications-api.js";
import { useProfile } from "../lib/settings-api.js";

export function AppLayout(): ReactNode {
  // Shares the ["onboarding"] cache key with RequireOnboarding/Onboarding - 
  // by the time AppLayout mounts, onboarding is already submitted, so this
  // is just reading the merchant's name/company for the header chip.
  const { data: draft } = useQuery({ queryKey: ["onboarding"], queryFn: loadDraftFromServer });
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const { data: vehicles } = useVehicleList("all");
  const { data: bookings } = useBookingList("all");
  const { data: notificationUnread } = useNotificationUnread();
  // The design hangs the merchant-status card under the nav, and only on
  // the dashboard. It reads the dashboard query the page has already
  // fetched, so this costs no second request.
  const { pathname } = useLocation();
  const onDashboard = pathname === "/";
  const { data: profile } = useProfile();

  const name = [draft?.firstName, draft?.surname].filter(Boolean).join(" ");
  const company = draft?.ownerType === "company" ? draft.companyName || null : null;

  return (
    <ToastProvider>
      <div style={P.page}>
        <AppHeader
          name={name}
          company={company}
          email={me?.email ?? ""}
          approved={Boolean(profile?.approved_at)}
        />
        <div style={P.body}>
          <div style={P.bodyInner}>
            <SideNav
              vehicleCount={vehicles?.counts.all ?? 0}
              bookingCount={bookings?.counts.all ?? 0}
              notificationUnread={notificationUnread ?? 0}
              footer={onDashboard ? <MerchantStatusCard /> : null}
            />
            <div style={P.main}>
              {/* Scoped to the page, not the shell - a screen that throws
                  leaves the nav standing so the merchant can go somewhere
                  else. Keyed on the path so navigating away clears it. */}
              <ErrorBoundary resetKey={pathname} compact>
                <Outlet />
              </ErrorBoundary>
            </div>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
