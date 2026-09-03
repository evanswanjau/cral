import { kes } from "@cral/types";
import { db } from "../../db/client.js";
import { getOrCreateMerchant } from "../merchant/service.js";
import type { DocumentKind, DocumentRow, MerchantRow, VehicleRow } from "../merchant/db-types.js";
import type { BookingRow } from "../bookings/db-types.js";
import type { PayoutRunLineRow } from "../payouts/db-types.js";
import type { NotificationRow } from "../notifications/db-types.js";
import { serialize as serializeNotification } from "../notifications/service.js";
import { EXPIRING_WITHIN_DAYS, VEHICLE_DOC_KINDS, effectiveDocState } from "../vehicles/service.js";
import { payoutMonthlyNet, payoutPosition } from "../payouts/service.js";

/**
 * The merchant portal's landing read.
 *
 * This module aggregates; it does not decide. Every figure below comes from
 * the service that already owns that rule - `payoutPosition` for anything
 * money-shaped, `effectiveDocState` for document bands, the notifications
 * feed for activity. That is the whole point of the file: the dashboard shows
 * the same numbers as Payouts, Vehicles and Bookings, and the only way to
 * guarantee that is to read their code rather than re-derive their logic.
 *
 * It aggregates server-side rather than on the client because every list
 * endpoint here is cursor-paginated (spec §2). Totals derived from a page of
 * `data` would describe the first page while the copy claims to describe the
 * account.
 */

const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The Nairobi calendar day an instant falls on, as "YYYY-MM-DD". */
function nairobiDay(instant: Date): string {
  return new Date(instant.getTime() + NAIROBI_OFFSET_MS).toISOString().slice(0, 10);
}

/** Midnight Nairobi on `day`, as the UTC instant it corresponds to. */
function nairobiDayStart(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - NAIROBI_OFFSET_MS);
}

/**
 * Monday-to-Sunday around `now`, in Nairobi. Kenya's working week starts on
 * Monday, and the design's "Bookings this week" is a working-week list.
 */
function nairobiWeek(now: Date): { from: string; to: string; start: Date; end: Date } {
  const shifted = new Date(now.getTime() + NAIROBI_OFFSET_MS);
  const dow = (shifted.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(shifted.getTime() - dow * DAY_MS).toISOString().slice(0, 10);
  const sunday = new Date(Date.parse(`${monday}T00:00:00.000Z`) + 6 * DAY_MS).toISOString().slice(0, 10);
  return {
    from: monday,
    to: sunday,
    start: nairobiDayStart(monday),
    // Exclusive end: midnight at the start of the following Monday.
    end: new Date(nairobiDayStart(sunday).getTime() + DAY_MS),
  };
}

/** Whole hire days between two instants, floored at one - a same-day hire is a day. */
function hireDays(from: Date, to: Date): number {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS));
}

/** Hire days of `booking` that fall inside [start, end) - the week's share, not the whole hire. */
function daysInWindow(booking: BookingRow, start: Date, end: Date): number {
  const from = booking.pickup_at > start ? booking.pickup_at : start;
  const to = booking.dropoff_at < end ? booking.dropoff_at : end;
  return to <= from ? 0 : Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS));
}

/**
 * Account-level documents required before an account is complete. Mirrors
 * `assertCompleteForSubmission`'s `requiredOwnerDocs`: a company carries its
 * own three on top of the two every merchant gives.
 */
function requiredOwnerDocs(merchant: MerchantRow): DocumentKind[] {
  const personal: DocumentKind[] = ["national_id", "kra_pin"];
  return merchant.owner_type === "company"
    ? [...personal, "certificate_of_incorporation", "company_kra_pin", "cr12"]
    : personal;
}

function displayNameOf(merchant: MerchantRow): string | null {
  if (merchant.owner_type === "company" && merchant.company_name) return merchant.company_name;
  return [merchant.first_name, merchant.surname].filter(Boolean).join(" ") || null;
}

function vehicleTitle(vehicle: VehicleRow): string {
  return [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------
// The read
// ---------------------------------------------------------------------

export async function getDashboard(userId: string, now: Date = new Date()) {
  const merchant = await getOrCreateMerchant(userId);
  const week = nairobiWeek(now);

  const [user, vehicles, ownerDocs, position, earnings] = await Promise.all([
    db("users").where({ id: merchant.user_id }).first("full_name", "phone"),
    db<VehicleRow>("vehicles").where({ merchant_id: merchant.id }).orderBy("created_at", "desc").select("*"),
    db<DocumentRow>("documents").where({ merchant_id: merchant.id, vehicle_id: null }).select("*"),
    payoutPosition(merchant.id, now),
    payoutMonthlyNet(merchant.id, 6, now),
  ]);

  const vehicleIds = vehicles.map((v) => v.id);
  const vehicleDocs = vehicleIds.length
    ? await db<DocumentRow>("documents").whereIn("vehicle_id", vehicleIds).select("*")
    : [];
  const docsFor = (vehicleId: string) => vehicleDocs.filter((d) => d.vehicle_id === vehicleId);

  // ---------------------------------------------------------------- status
  const required = requiredOwnerDocs(merchant);
  const outstandingOwnerDocs = required.filter((kind) => {
    const state = effectiveDocState(ownerDocs.find((d) => d.kind === kind));
    return state === "missing" || state === "rejected";
  }).length;

  // -------------------------------------------------------- needs action
  // `action` and `rejected` are the two listing states that are waiting on
  // the merchant - the same pair the Vehicles screen buckets as
  // `needs_action`, so the banner count and that filter's count agree.
  const needsAction = vehicles.filter((v) => v.status === "action" || v.status === "rejected");

  // ------------------------------------------------------- week bookings
  const weekRows = await db<BookingRow>("bookings")
    .where({ merchant_id: merchant.id })
    // Overlap, not containment: a hire that started last week and is still
    // running is exactly what "on hire this week" means.
    .where("pickup_at", "<", week.end)
    .where("dropoff_at", ">=", week.start)
    .whereIn("status", ["requested", "confirmed", "active", "completed"])
    .orderBy("pickup_at", "asc")
    .select("*");

  const hirerIds = [...new Set(weekRows.map((b) => b.hirer_id))];
  const hirers = hirerIds.length ? await db("users").whereIn("id", hirerIds).select("id", "full_name") : [];
  const hirerName = new Map<string, string>(hirers.map((h) => [h.id as string, (h.full_name as string) ?? "Hirer"]));
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

  const weekBookings = weekRows.map((b) => {
    const vehicle = vehicleById.get(b.vehicle_id);
    return {
      id: b.id,
      ref: b.ref,
      status: b.status,
      hirer_name: hirerName.get(b.hirer_id) ?? "Hirer",
      vehicle_id: b.vehicle_id,
      vehicle_registration: vehicle?.registration ?? "",
      vehicle_label: vehicle
        ? [vehicleTitle(vehicle), vehicle.chauffeured ? "with driver" : "self-drive", b.pickup_location]
            .filter(Boolean)
            .join(" · ")
        : b.pickup_location,
      pickup_at: b.pickup_at.toISOString(),
      dropoff_at: b.dropoff_at.toISOString(),
      hire_days: hireDays(b.pickup_at, b.dropoff_at),
      merchant_net: kes(b.merchant_net_amount),
      gross: kes(b.gross_amount),
    };
  });

  // ---------------------------------------------------------------- fleet
  // Whole-set counts, page-sized list: the design's "7 VEHICLES · 4 DOCUMENTS
  // OUTSTANDING" describes the fleet, while only four rows are drawn.
  let outstandingVehicleDocs = 0;
  for (const vehicle of vehicles) {
    for (const kind of VEHICLE_DOC_KINDS) {
      const state = effectiveDocState(docsFor(vehicle.id).find((d) => d.kind === kind));
      if (state === "missing" || state === "rejected") outstandingVehicleDocs++;
    }
  }

  const fleet = vehicles.slice(0, 4).map((vehicle) => ({
    id: vehicle.id,
    registration: vehicle.registration,
    title: vehicleTitle(vehicle),
    status: vehicle.status,
    verification_badge: vehicle.verification_badge,
    daily_rate: vehicle.daily_rate_amount > 0 ? kes(vehicle.daily_rate_amount) : null,
    documents: VEHICLE_DOC_KINDS.map((kind) => ({
      kind,
      state: effectiveDocState(docsFor(vehicle.id).find((d) => d.kind === kind)),
    })),
  }));

  // --------------------------------------------------------- next payout
  // The card must add up to the tile above it, and the tile is
  // `payoutPosition.nextPayoutAmount` - runs already cut and waiting to go out
  // *plus* payable bookings no run has picked up yet. Listing only the second
  // half showed "KES 0 · nothing waiting" directly under a tile reading
  // KES 22,500, which is the exact disagreement this module exists to prevent.
  const pendingRunLines = position.pendingRuns.length
    ? await db<PayoutRunLineRow>("payout_run_lines")
        .whereIn(
          "payout_run_id",
          position.pendingRuns.map((r) => r.id),
        )
        .orderBy("dropoff_at", "asc")
        .select("*")
    : [];

  const projectionVehicles = new Map(vehicles.map((v) => [v.id, v.registration]));
  const projectionHirerIds = [...new Set([...position.payable, ...position.clearing].map((b) => b.hirer_id))];
  const projectionHirers = projectionHirerIds.length
    ? await db("users").whereIn("id", projectionHirerIds).select("id", "full_name")
    : [];
  const projectionHirerName = new Map<string, string>(
    projectionHirers.map((h) => [h.id as string, (h.full_name as string) ?? "Hirer"]),
  );

  const projectionLine = (b: BookingRow) => ({
    booking_id: b.id,
    ref: b.ref,
    hirer_name: projectionHirerName.get(b.hirer_id) ?? "Hirer",
    vehicle_registration: projectionVehicles.get(b.vehicle_id) ?? "",
    dropoff_at: b.dropoff_at.toISOString(),
    hire_days: hireDays(b.pickup_at, b.dropoff_at),
    net: kes(b.merchant_net_amount),
  });

  // Totals are the sum of the line snapshots, and commission is the
  // difference between them - never `gross × COMMISSION_RATE`. A later rate
  // change must not rewrite what a merchant is about to be paid, which is the
  // same rule `payout_run_lines` follows once a run is actually cut.
  // A cut run's lines are denormalised snapshots and carry their own names and
  // registrations, so they render even if the booking is later archived.
  const cutLine = (line: PayoutRunLineRow) => ({
    booking_id: line.booking_id ?? "",
    ref: line.booking_ref,
    hirer_name: line.hirer_name,
    vehicle_registration: line.vehicle_registration,
    dropoff_at: line.dropoff_at.toISOString(),
    hire_days: hireDays(line.pickup_at, line.dropoff_at),
    net: kes(line.net_amount),
  });

  const projectionGross =
    position.payable.reduce((sum, b) => sum + b.gross_amount, 0) +
    pendingRunLines.reduce((sum, l) => sum + l.gross_amount, 0);
  const projectionNet =
    position.payable.reduce((sum, b) => sum + b.merchant_net_amount, 0) +
    pendingRunLines.reduce((sum, l) => sum + l.net_amount, 0);

  // ------------------------------------------------------------- expiring
  const horizon = new Date(now.getTime() + EXPIRING_WITHIN_DAYS * DAY_MS).toISOString().slice(0, 10);
  const today = nairobiDay(now);
  const expiringDoc = vehicleDocs
    .filter((d) => VEHICLE_DOC_KINDS.includes(d.kind as (typeof VEHICLE_DOC_KINDS)[number]))
    .filter((d) => d.expires_at !== null && d.expires_at >= today && d.expires_at <= horizon)
    .sort((a, b) => (a.expires_at! < b.expires_at! ? -1 : 1))[0];

  // A vehicle's `insurance_expiry` is collected at onboarding before any
  // insurance document carries a date of its own, so it is a second source
  // for the same fact. Whichever lapses first is the one worth showing.
  const expiringVehicle = vehicles
    .filter((v) => v.status === "live" || v.status === "paused")
    .filter((v) => v.insurance_expiry !== null && v.insurance_expiry >= today && v.insurance_expiry <= horizon)
    .sort((a, b) => (a.insurance_expiry! < b.insurance_expiry! ? -1 : 1))[0];

  const expiring = pickSoonestExpiry(expiringDoc, expiringVehicle, vehicleById);

  // ------------------------------------------------------------- activity
  const activityRows = await db<NotificationRow>("notifications")
    .where({ merchant_id: merchant.id })
    .orderBy("occurred_at", "desc")
    .orderBy("id", "desc")
    .limit(5)
    .select("*");

  const liveVehicles = vehicles.filter((v) => v.status === "live").length;
  const previousMonthNet = earnings.series[earnings.series.length - 2]?.net ?? 0;

  return {
    greeting: {
      first_name: merchant.first_name ?? (user?.full_name ? String(user.full_name).split(" ")[0] : null) ?? null,
      today,
      on_hire_count: position.onHireCount,
      next_payout_date: position.nextDate,
    },
    merchant_status: {
      owner_type: merchant.owner_type === "company" ? "company" : "individual",
      display_name: displayNameOf(merchant),
      // Nothing sets `approved_at` in Phase 1 - there is no admin portal - so
      // this is normally false and the client renders the in-review variant.
      // A decorative tick here would be the fabricated-trust badge again.
      approved: merchant.approved_at !== null,
      approved_at: merchant.approved_at ? merchant.approved_at.toISOString() : null,
      documents_complete: outstandingOwnerDocs === 0,
      outstanding_document_count: outstandingOwnerDocs,
    },
    needs_action: {
      vehicle_count: needsAction.length,
      vehicles: needsAction.slice(0, 2).map((v) => ({
        id: v.id,
        registration: v.registration,
        reviewer_note: v.reviewer_note_resolved ? null : v.reviewer_note,
      })),
    },
    tiles: {
      paid_this_month: {
        amount: kes(position.paidThisMonth),
        run_count: position.paidThisMonthRuns,
        previous_month_amount: kes(previousMonthNet),
      },
      on_hire: { count: position.onHireCount, live_vehicle_count: liveVehicles },
      week: {
        booking_count: weekRows.length,
        hire_days: weekRows.reduce((sum, b) => sum + daysInWindow(b, week.start, week.end), 0),
        request_count: weekRows.filter((b) => b.status === "requested").length,
      },
      awaiting_payout: {
        // Reads `payoutPosition`, so this is the same figure as the
        // `next_payout` tile on GET /merchant/payouts by construction.
        amount: kes(position.nextPayoutAmount),
        hire_count: position.nextHires,
        date: position.nextDate,
      },
    },
    earnings: {
      months: earnings.months,
      months_with_data: earnings.months_with_data,
      series: earnings.series.map((m) => ({
        month: m.month,
        label: monthLabel(m.month),
        net: kes(m.net),
        current: m.current,
      })),
    },
    week_bookings: {
      from: week.from,
      to: week.to,
      booking_count: weekRows.length,
      hire_days: weekRows.reduce((sum, b) => sum + daysInWindow(b, week.start, week.end), 0),
      bookings: weekBookings.slice(0, 4),
    },
    fleet: {
      vehicle_count: vehicles.length,
      outstanding_document_count: outstandingVehicleDocs,
      vehicles: fleet,
    },
    next_payout: {
      date: position.nextDate,
      destination: {
        method: merchant.payout_method === "bank" ? "bank" : "mpesa",
        detail:
          merchant.payout_method === "bank"
            ? (merchant.bank_account_number ?? "-")
            : (user?.phone ?? merchant.payout_detail ?? "-"),
      },
      gross: kes(projectionGross),
      commission: kes(projectionGross - projectionNet),
      net: kes(projectionNet),
      lines: [...pendingRunLines.map(cutLine), ...position.payable.map(projectionLine)],
      clearing: position.clearing.map(projectionLine),
    },
    expiring,
    activity: activityRows.map((row) => {
      const full = serializeNotification(row);
      return {
        id: full.id,
        title: full.title,
        body: full.body,
        kind: full.kind,
        ref: full.ref,
        occurred_at: full.occurred_at,
        read: full.read,
        cta_href: full.cta_href ?? null,
      };
    }),
  };
}

/** "2026-08" -> "AUG". The chart's axis labels; three letters is all it fits. */
function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00.000Z`)
    .toLocaleDateString("en-GB", { timeZone: "UTC", month: "short" })
    .toUpperCase();
}

/**
 * The expiry card shows one document. Two sources can supply it - an uploaded
 * document's own `expires_at`, and the vehicle's `insurance_expiry` collected
 * at onboarding - so take whichever lapses first rather than letting the
 * card's answer depend on which query ran.
 */
function pickSoonestExpiry(
  doc: DocumentRow | undefined,
  vehicle: VehicleRow | undefined,
  vehicleById: Map<string, VehicleRow>,
) {
  const fromDoc = doc
    ? {
        vehicle_id: doc.vehicle_id as string,
        registration: vehicleById.get(doc.vehicle_id as string)?.registration ?? "",
        kind: doc.kind,
        expires_on: doc.expires_at as string,
      }
    : null;
  const fromVehicle = vehicle
    ? {
        vehicle_id: vehicle.id,
        registration: vehicle.registration,
        kind: "comprehensive_insurance" as const,
        expires_on: vehicle.insurance_expiry as string,
      }
    : null;

  if (!fromDoc) return fromVehicle;
  if (!fromVehicle) return fromDoc;
  return fromDoc.expires_on <= fromVehicle.expires_on ? fromDoc : fromVehicle;
}
