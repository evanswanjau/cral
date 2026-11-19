import type { ReactNode } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { loadDraftFromServer } from "../lib/onboarding-draft.js";
import { getMe } from "../lib/auth-api.js";
import { AppHeader } from "../components/portal/AppHeader.js";
import { SideNav } from "../components/portal/SideNav.js";
import { navSections } from "../components/portal/nav-sections.js";
import { useOffering } from "../lib/use-offering.js";
import { MerchantStatusCard } from "../components/portal/MerchantStatusCard.js";
import { ToastProvider } from "../components/portal/Toast.js";
import { ErrorBoundary } from "../components/ErrorBoundary.js";
import { P } from "../components/portal/styles.js";
import { useBookingList } from "../lib/bookings-api.js";
import { useDriverList } from "../lib/drivers-api.js";
import { useNotificationUnread } from "../lib/notifications-api.js";
import { useProfile } from "../lib/settings-api.js";
import { useGarageRequests } from "../lib/garage-api.js";
import { useGarageOrders } from "../lib/garage-orders-api.js";

export function AppLayout(): ReactNode {
  // Shares the ["onboarding"] cache key with RequireOnboarding/Onboarding - 
  // by the time AppLayout mounts, onboarding is already submitted, so this
  // is just reading the merchant's name/company for the header chip.
  const { data: draft } = useQuery({ queryKey: ["onboarding"], queryFn: loadDraftFromServer });
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const { data: bookings } = useBookingList("all");
  const { data: drivers } = useDriverList();
  const { data: notificationUnread } = useNotificationUnread();
  // The design hangs the merchant-status card under the nav, and only on
  // the dashboard. It reads the dashboard query the page has already
  // fetched, so this costs no second request.
  const { pathname } = useLocation();
  const onDashboard = pathname === "/";
  const { data: profile } = useProfile();
  const offering = useOffering();
  const { data: garageRequests } = useGarageRequests("to_quote", offering.showPremises);
  const { data: garageJobs } = useGarageOrders("active", offering.showPremises);

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
          rating={profile?.merchant_rating ?? null}
        />
        <div style={P.body}>
          <div style={P.bodyInner}>
            <SideNav
              items={navSections(offering, {
                driverActionCount: drivers?.counts.needs_action ?? 0,
                bookingCount: bookings?.counts.all ?? 0,
                notificationUnread: notificationUnread ?? 0,
                premisesActionCount: offering.premisesActionCount,
                saleActionCount: offering.saleActionCount,
                quoteRequestCount: garageRequests?.counts.to_quote ?? 0,
                garageJobCount: garageJobs?.counts.to_start ?? 0,
              })}
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
