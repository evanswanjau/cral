import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api.js";
import type { Money } from "./bookings-api.js";
import type { BookingStatus } from "./bookings-api.js";
import type { DocReviewState, VehicleStatus } from "../components/portal/status.js";
import type { NotificationKind } from "./notifications-api.js";

/**
 * One aggregate read behind the whole landing screen. It exists because every
 * list endpoint is cursor-paginated: totals derived from a page of `data`
 * would describe the first page while the copy claims to describe the
 * account. See `openapi/merchant-dashboard.yaml`.
 */

export interface DashboardGreeting {
  first_name: string | null;
  /** Nairobi calendar day, "YYYY-MM-DD". */
  today: string;
  on_hire_count: number;
  next_payout_date: string | null;
}

export interface DashboardMerchantStatus {
  owner_type: "individual" | "company";
  display_name: string | null;
  /**
   * `merchants.approved_at`. Nothing sets it in Phase 1 - there is no admin
   * portal - so this is normally false and the card must render the
   * in-review variant rather than a decorative tick.
   */
  approved: boolean;
  approved_at: string | null;
  documents_complete: boolean;
  outstanding_document_count: number;
}

export interface DashboardNeedsAction {
  /** Whole-set count; `vehicles` is capped so the banner stays one strip. */
  vehicle_count: number;
  vehicles: { id: string; registration: string; reviewer_note: string | null }[];
}

export interface DashboardTiles {
  paid_this_month: { amount: Money; run_count: number; previous_month_amount: Money };
  on_hire: { count: number; live_vehicle_count: number };
  week: { booking_count: number; hire_days: number; request_count: number };
  awaiting_payout: { amount: Money; hire_count: number; date: string | null };
}

export interface DashboardEarnings {
  months: number;
  months_with_data: number;
  series: { month: string; label: string; net: Money; current: boolean }[];
}

export interface DashboardWeekBooking {
  id: string;
  ref: string;
  status: BookingStatus;
  hirer_name: string;
  vehicle_id: string;
  vehicle_registration: string;
  vehicle_label: string;
  pickup_at: string;
  dropoff_at: string;
  hire_days: number;
  merchant_net: Money;
  gross: Money;
}

export interface DashboardFleetVehicle {
  id: string;
  registration: string;
  title: string;
  status: VehicleStatus;
  verification_badge: "none" | "pending" | "active";
  daily_rate: Money | null;
  documents: { kind: "logbook" | "comprehensive_insurance" | "tracker_certificate"; state: DocReviewState }[];
}

export interface DashboardPayoutLine {
  booking_id: string;
  ref: string;
  hirer_name: string;
  vehicle_registration: string;
  dropoff_at: string;
  hire_days: number;
  net: Money;
}

export interface DashboardNextPayout {
  date: string | null;
  destination: { method: string; detail: string };
  gross: Money;
  commission: Money;
  net: Money;
  lines: DashboardPayoutLine[];
  /** Not payable yet - still on hire, or the hold has not lapsed. */
  clearing: DashboardPayoutLine[];
}

export interface DashboardExpiring {
  vehicle_id: string;
  registration: string;
  kind: "comprehensive_insurance" | "logbook" | "tracker_certificate";
  /** Bare Nairobi calendar day; the "in N days" figure is ours to compute. */
  expires_on: string;
}

export interface DashboardActivityItem {
  id: string;
  title: string;
  body: string | null;
  kind: NotificationKind;
  ref: string | null;
  occurred_at: string;
  read: boolean;
  cta_href: string | null;
}

export interface Dashboard {
  greeting: DashboardGreeting;
  merchant_status: DashboardMerchantStatus;
  needs_action: DashboardNeedsAction;
  tiles: DashboardTiles;
  earnings: DashboardEarnings;
  week_bookings: {
    from: string;
    to: string;
    booking_count: number;
    hire_days: number;
    bookings: DashboardWeekBooking[];
  };
  fleet: { vehicle_count: number; outstanding_document_count: number; vehicles: DashboardFleetVehicle[] };
  next_payout: DashboardNextPayout;
  expiring: DashboardExpiring | null;
  activity: DashboardActivityItem[];
}

export function getDashboard() {
  return apiGet<Dashboard>("/merchant/dashboard");
}

export function useDashboard() {
  return useQuery({ queryKey: ["dashboard"], queryFn: getDashboard });
}
