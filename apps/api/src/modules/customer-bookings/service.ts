import { ApiError, kes, type Money } from "@cral/types";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { nextBookingRef } from "../../lib/booking-ref.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { computeBookingPricing } from "../../lib/booking-pricing.js";
import { encodeCursor, decodeCursor } from "../../lib/pagination.js";
import { notify } from "../../lib/notifications.js";
import { recordRefund, executeRefund } from "../../lib/refunds.js";
import {
  earliestPickupDayKey,
  inclusiveHireDays,
  nairobiDayKey,
} from "../../lib/dates.js";
import { enqueueNotificationDelivery } from "../../jobs/notification-delivery.js";
import { baseCatalogQuery } from "../catalog/service.js";
import { basePublicDriverQuery, driverPublicName, requirePublicDriver } from "../catalog/drivers.js";
import { subjectOf } from "../../lib/booking-subject.js";
import type { DriverRow, MerchantRow } from "../merchant/db-types.js";
import { getRenterVerification } from "../customer-account/service.js";
import type { BookingRow, BookingStatus, HandoverRow } from "../bookings/db-types.js";
import type { CancelBookingInput, CreateBookingInput, ListMyBookingsQuery } from "./schemas.js";

/**
 * The renter's side of a booking. A row created here is an ordinary
 * `bookings` row - it lands in the merchant's existing Bookings queue
 * untouched, and is the first real generator for the
 * `category: "booking"` notification that portal has always rendered.
 *
 * Nothing is charged here. The design's own words: "Send request, pay
 * nothing yet." Payment (`POST /bookings/{id}/pay`) only applies once the
 * merchant has accepted and the booking is `confirmed`.
 */

export interface RequestContext {
  ip: string | null;
  requestId: string | null;
}


/**
 * How long a merchant has to answer. Read from the merchant module's own
 * constant rather than redeclared, so the countdown the renter sees and
 * the deadline the expiry sweep enforces cannot drift apart.
 *
 * NOTE: this is 12 hours. The canvas copy says four ("{owner} has four
 * hours to accept", "REQUEST LAPSES IN"). Flagged rather than silently
 * changed - moving it alters merchant-side behaviour that already ships.
 */
const RESPONSE_WINDOW_HOURS = 12;

interface PublicVehicleForBooking {
  id: string;
  merchant_id: string;
  make: string;
  model: string;
  year: string;
  type: string;
  registration: string;
  seats: number;
  transmission: string;
  chauffeured: boolean;
  county: string | null;
  pickup_address: string | null;
  daily_rate_amount: number;
  hiring_unit: string;
  hourly_rate_amount: number | null;
  trip_rate_amount: number | null;
  minimum_hire_days: number;
  m_user_id: string;
  m_owner_type: string;
  m_company_name: string | null;
  m_trading_name: string | null;
  m_first_name: string | null;
  m_surname: string | null;
  m_payout_method: string;
  m_payout_same: boolean;
  m_payout_detail: string | null;
}

/**
 * The same two gates the public catalog applies, from the same place: a
 * car is only actionable while it is a live listing on an approved
 * merchant. A car that fails either is a 404, never a 403 - a renter
 * should not be able to tell a paused listing from one that never was.
 */
async function requirePublicVehicle(vehicleId: string): Promise<PublicVehicleForBooking> {
  const row = (await baseCatalogQuery()
    .where("v.id", vehicleId)
    .select(
      "v.id",
      "v.merchant_id",
      "v.make",
      "v.model",
      "v.year",
      "v.type",
      "v.registration",
      "v.seats",
      "v.transmission",
      "v.chauffeured",
      "v.county",
      "v.pickup_address",
      "v.daily_rate_amount",
      "v.hiring_unit",
      "v.hourly_rate_amount",
      "v.trip_rate_amount",
      "v.minimum_hire_days",
      "m.user_id as m_user_id",
      "m.owner_type as m_owner_type",
      "m.company_name as m_company_name",
      "m.trading_name as m_trading_name",
      "m.first_name as m_first_name",
      "m.surname as m_surname",
      "m.payout_method as m_payout_method",
      "m.payout_same as m_payout_same",
      "m.payout_detail as m_payout_detail",
    )
    .first()) as PublicVehicleForBooking | undefined;

  if (!row) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "vehicle_not_found",
      message: "That listing isn't available.",
    });
  }
  return row;
}

function ownerDisplayName(v: PublicVehicleForBooking): string {
  if (v.m_owner_type === "company") {
    return v.m_trading_name || v.m_company_name || "(no name on file)";
  }
  return v.m_first_name || "(no name on file)";
}

/**
 * Hire days are Nairobi calendar days, counted inclusively (owner's call,
 * 2026-09-19): the 19th to the 19th is one day, the 19th to the 20th is
 * two. Delegates to the shared helper so the client's quote and the
 * stored price cannot drift apart.
 */
function daysBetween(pickup: Date, dropoff: Date): number {
  return inclusiveHireDays(pickup, dropoff);
}

/** Hours between two instants, rounded up - a 45-minute job is billed as one hour, not zero. */
function hoursBetween(pickup: Date, dropoff: Date): number {
  return Math.max(1, Math.ceil((dropoff.getTime() - pickup.getTime()) / (60 * 60 * 1000)));
}

/**
 * What a booking is actually priced on, picked off the vehicle's own
 * `hiring_unit` (owner's call, 2026-09-23) - day (unchanged default),
 * hour, or trip. `quantity` feeds straight into `computeBookingPricing`,
 * which has always just multiplied a rate by a quantity regardless of what
 * that quantity counts.
 */
function unitPricingBasis(
  vehicle: PublicVehicleForBooking,
  pickupAt: Date,
  dropoffAt: Date,
): { unit: string; quantity: number; rateAmountCents: number } {
  if (vehicle.hiring_unit === "hour") {
    if (!vehicle.hourly_rate_amount) {
      throw new ApiError({
        status: 422,
        type: "validation_error",
        code: "vehicle_not_bookable",
        message: "This listing has no hourly rate set yet.",
      });
    }
    return { unit: "hour", quantity: hoursBetween(pickupAt, dropoffAt), rateAmountCents: vehicle.hourly_rate_amount };
  }
  if (vehicle.hiring_unit === "trip") {
    if (!vehicle.trip_rate_amount) {
      throw new ApiError({
        status: 422,
        type: "validation_error",
        code: "vehicle_not_bookable",
        message: "This listing has no trip rate set yet.",
      });
    }
    // A trip is a flat fee - the pickup/dropoff window still matters for
    // scheduling and availability, just not for the price.
    return { unit: "trip", quantity: 1, rateAmountCents: vehicle.trip_rate_amount };
  }
  const days = daysBetween(pickupAt, dropoffAt);
  if (days < vehicle.minimum_hire_days) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "below_minimum_hire",
      message: `This car is hired for a minimum of ${vehicle.minimum_hire_days} ${
        vehicle.minimum_hire_days === 1 ? "day" : "days"
      }.`,
      field: "dropoff_at",
    });
  }
  return { unit: "day", quantity: days, rateAmountCents: vehicle.daily_rate_amount };
}

/**
 * The driver's part of a booking (docs/plans/drivers.md): one of their
 * three rates, on the same quantity rules as a car - inclusive Nairobi days,
 * hours rounded up, or a flat trip. A car + driver booking defaults to the
 * car's own unit so the two legs count the same span.
 */
function driverPricingBasis(
  driver: DriverRow,
  requested: string | undefined,
  pickupAt: Date,
  dropoffAt: Date,
): { unit: string; quantity: number; rateAmountCents: number } {
  const rates: Record<string, number | null> = {
    day: driver.daily_rate_amount,
    hour: driver.hourly_rate_amount,
    trip: driver.trip_rate_amount,
  };
  const unit = requested ?? (["day", "hour", "trip"].find((u) => rates[u]) as string);
  const rate = rates[unit];
  if (!rate) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "driver_rate_unavailable",
      message: `This driver doesn't offer a ${unit === "day" ? "daily" : unit === "hour" ? "hourly" : "per-trip"} rate.`,
      field: "driver_unit",
    });
  }
  const quantity =
    unit === "hour" ? hoursBetween(pickupAt, dropoffAt) : unit === "trip" ? 1 : daysBetween(pickupAt, dropoffAt);
  return { unit, quantity, rateAmountCents: rate };
}

// ---------------------------------------------------------------------
// Serialization - the same public projection the catalog uses
// ---------------------------------------------------------------------

interface VehicleFacts {
  id: string;
  make: string;
  model: string;
  year: string;
  /** The five-category slug. `category` on the wire, `type` in the DB. */
  category: string;
  registration: string;
  county: string | null;
  seats: number;
  transmission: string;
  chauffeured: boolean;
  owner_display_name: string;
  primary_photo_url: string | null;
}

async function vehicleFactsFor(vehicleIds: string[]): Promise<Map<string, VehicleFacts>> {
  const out = new Map<string, VehicleFacts>();
  if (!vehicleIds.length) return out;

  const [rows, photos] = await Promise.all([
    db("vehicles as v")
      .join("merchants as m", "m.id", "v.merchant_id")
      .whereIn("v.id", vehicleIds)
      .select(
        "v.id",
        "v.make",
        "v.model",
        "v.year",
        "v.type",
        "v.registration",
        "v.county",
        "v.seats",
        "v.transmission",
        "v.chauffeured",
        "m.owner_type as m_owner_type",
        "m.company_name as m_company_name",
        "m.trading_name as m_trading_name",
        "m.first_name as m_first_name",
      ),
    db("documents")
      .whereIn("vehicle_id", vehicleIds)
      .where("kind", "vehicle_photo")
      .orderBy("created_at", "asc")
      .select("id", "vehicle_id"),
  ]);

  const firstPhoto = new Map<string, string>();
  for (const p of photos as { id: string; vehicle_id: string }[]) {
    if (!firstPhoto.has(p.vehicle_id)) firstPhoto.set(p.vehicle_id, p.id);
  }

  for (const r of rows as (PublicVehicleForBooking & { id: string })[]) {
    const photoId = firstPhoto.get(r.id);
    out.set(r.id, {
      id: r.id,
      make: r.make,
      model: r.model,
      year: r.year,
      // `category` on the wire, per the frozen contract - the column is
      // called `type`, and serializing it under that name meant every
      // client reading `vehicle.category` got undefined.
      category: r.type,
      registration: r.registration,
      county: r.county,
      seats: r.seats,
      transmission: r.transmission.toLowerCase(),
      chauffeured: r.chauffeured,
      owner_display_name: ownerDisplayName(r),
      primary_photo_url: photoId ? `/catalog/vehicles/${r.id}/photos/${photoId}` : null,
    });
  }
  return out;
}

interface DriverFacts {
  id: string;
  display_name: string;
  /** Who the driver drives for - the same public owner name a car shows. */
  merchant_name: string;
}

async function driverFactsFor(driverIds: (string | null)[]): Promise<Map<string, DriverFacts>> {
  const ids = [...new Set(driverIds.filter((d): d is string => !!d))];
  if (!ids.length) return new Map();
  const rows = (await db("drivers as d")
    .join("merchants as m", "m.id", "d.merchant_id")
    .whereIn("d.id", ids)
    .select("d.id", "d.full_name", "m.owner_type", "m.company_name", "m.trading_name", "m.first_name")) as Array<
    Pick<DriverRow, "id" | "full_name"> & Pick<MerchantRow, "owner_type" | "company_name" | "trading_name" | "first_name">
  >;
  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        display_name: driverPublicName(r.full_name),
        merchant_name:
          r.owner_type === "company"
            ? r.trading_name || r.company_name || "(no name on file)"
            : r.first_name || "(no name on file)",
      },
    ]),
  );
}

function serializeSummary(b: BookingRow, vehicle: VehicleFacts | undefined, driver: DriverFacts | undefined = undefined) {
  return {
    id: b.id,
    ref: b.ref,
    status: b.status,
    pickup_at: b.pickup_at.toISOString(),
    dropoff_at: b.dropoff_at.toISOString(),
    days: daysBetween(b.pickup_at, b.dropoff_at),
    rate_unit: b.rate_unit,
    rate_quantity: b.rate_quantity,
    gross: kes(b.gross_amount) as Money,
    vehicle: vehicle ?? null,
    // Set when a driver is on the booking; `vehicle` is null on a
    // driver-only booking (the renter's own car, `hire_car_details`).
    driver: driver ?? null,
    driver_amount: b.driver_amount === null ? null : (kes(b.driver_amount) as Money),
    driver_rate_unit: b.driver_rate_unit,
    driver_rate_quantity: b.driver_rate_quantity,
    hire_car_details: b.hire_car_details,
    created_at: b.created_at.toISOString(),
  };
}

/**
 * The renter's own view of a handover in progress or done - never the OTP
 * itself (only its hash exists server-side; the real code only ever went
 * out by email, see bookings/service.ts#createHandover). This is "is there
 * a code on its way / has pickup or return happened", the state Trip
 * detail (C8) renders - not a second copy of the merchant's handover UI.
 */
function serializeHandoverForHirer(h: HandoverRow) {
  return {
    kind: h.kind,
    state: h.state,
    masked_destination: h.masked_destination,
    otp_expires_at: h.otp_expires_at ? h.otp_expires_at.toISOString() : null,
    completed_at: h.completed_at ? h.completed_at.toISOString() : null,
  };
}

async function handoversForHirer(bookingId: string) {
  const rows = await db<HandoverRow>("handovers")
    .where({ booking_id: bookingId })
    .orderBy("created_at", "desc");
  return rows.map(serializeHandoverForHirer);
}

function serializeDetail(
  b: BookingRow,
  vehicle: VehicleFacts | undefined,
  driver: DriverFacts | undefined,
  handovers: ReturnType<typeof serializeHandoverForHirer>[],
) {
  return {
    ...serializeSummary(b, vehicle, driver),
    // Zero on a customer-created booking - CRAL takes no deposit for now
    // (owner's call, 2026-09-11). Kept in the shape so the field does not
    // appear and disappear if that changes.
    deposit: kes(b.deposit_amount) as Money,
    // CRAL charges the renter no booking fee and takes no deposit, so what
    // they are asked for is exactly the hire. Composed here rather than on
    // the client so the figure on the screen is one the server produced.
    total_due: kes(b.gross_amount + b.deposit_amount) as Money,
    pickup_location: b.pickup_location,
    dropoff_location: b.dropoff_location,
    note_from_hirer: b.note_from_hirer,
    response_due_at: b.response_due_at ? b.response_due_at.toISOString() : null,
    decline_reason_code: b.decline_reason_code,
    cancel_reason: b.cancel_reason,
    handovers,
  };
}

async function detailOf(b: BookingRow) {
  const linked = b.linked_booking_id
    ? await db<BookingRow>("bookings").where({ id: b.linked_booking_id }).first("id", "ref", "status", "gross_amount")
    : undefined;
  const [facts, drivers, handovers] = await Promise.all([
    vehicleFactsFor(b.vehicle_id ? [b.vehicle_id] : []),
    driverFactsFor([b.driver_id]),
    handoversForHirer(b.id),
  ]);
  return {
    ...serializeDetail(
      b,
      b.vehicle_id ? facts.get(b.vehicle_id) : undefined,
      b.driver_id ? drivers.get(b.driver_id) : undefined,
      handovers,
    ),
    // The other half of a car + another owner's driver request.
    linked_booking: linked
      ? { id: linked.id, ref: linked.ref, status: linked.status, gross: kes(linked.gross_amount) as Money }
      : null,
  };
}

// ---------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------

export async function createBooking(
  userId: string,
  input: CreateBookingInput,
  ctx: RequestContext,
) {
  const pickupAt = new Date(input.pickup_at);
  const dropoffAt = new Date(input.dropoff_at);

  // Same-day hires are legitimate - out in the morning, back by six - so
  // the comparison is on Nairobi calendar days, not on the instants. A
  // return *day* before the pickup day is the only ordering error.
  const pickupDay = nairobiDayKey(pickupAt);
  const dropoffDay = nairobiDayKey(dropoffAt);
  if (dropoffDay < pickupDay) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "invalid_dates",
      message: "The return date can't be before the pickup date.",
      field: "dropoff_at",
    });
  }
  if (!(dropoffAt.getTime() > pickupAt.getTime())) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "invalid_dates",
      message: "The return time has to be after the pickup time.",
      field: "dropoff_at",
    });
  }
  // Cars are back with their owner by six, so a hire can't start after
  // that either (owner's call, 2026-09-19). The client's date input
  // already carries this as its `min`; re-checked here because a typed-in
  // date bypasses the attribute.
  const earliest = earliestPickupDayKey();
  if (pickupDay < earliest) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "invalid_dates",
      message:
        pickupDay < nairobiDayKey(new Date())
          ? "Pickup can't be in the past."
          : "It's past six in Nairobi, so the earliest pickup is tomorrow.",
      field: "pickup_at",
    });
  }

  const vehicle = input.vehicle_id ? await requirePublicVehicle(input.vehicle_id) : null;
  const driver = input.driver_id ? await requirePublicDriver(input.driver_id) : null;
  // The car's owner's own drivers come first (owner's call, 2026-10-19).
  // Only when they have none can the renter add another owner's driver -
  // and then the request is split into two linked bookings, one per
  // owner, so every booking still pays out once, to one merchant.
  const otherOwnersDriver = !!(vehicle && driver && driver.merchant_id !== vehicle.merchant_id);
  if (vehicle && driver && vehicle.chauffeured && otherOwnersDriver) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "driver_not_for_this_car",
      message: "This car already comes with a driver.",
      field: "driver_id",
    });
  }
  if (otherOwnersDriver) {
    const ownerDriver = await basePublicDriverQuery().where("d.merchant_id", vehicle!.merchant_id).first("d.id");
    if (ownerDriver) {
      throw new ApiError({
        status: 422,
        type: "validation_error",
        code: "owner_driver_first",
        message: "This car's owner has their own drivers - pick one of them.",
        field: "driver_id",
      });
    }
  }
  const carDetails = input.hire_car_details?.trim() || null;
  if (!vehicle && !carDetails) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "hire_car_details_required",
      message: "Tell the driver what car they'll be driving.",
      field: "hire_car_details",
    });
  }

  const carLeg = vehicle ? unitPricingBasis(vehicle, pickupAt, dropoffAt) : null;
  const driverLeg = driver ? driverPricingBasis(driver, input.driver_unit ?? carLeg?.unit, pickupAt, dropoffAt) : null;

  // What gets booked, one row per owner: normally one; two when the driver
  // is another owner's (see the owner-first rule above).
  interface Part {
    merchantId: string;
    vehicle: PublicVehicleForBooking | null;
    driver: Awaited<ReturnType<typeof requirePublicDriver>> | null;
    carLeg: typeof carLeg;
    driverLeg: typeof driverLeg;
    carDetails: string | null;
  }
  const parts: Part[] = otherOwnersDriver
    ? [
        { merchantId: vehicle!.merchant_id, vehicle, driver: null, carLeg, driverLeg: null, carDetails: null },
        {
          merchantId: driver!.merchant_id,
          vehicle: null,
          driver,
          carLeg: null,
          driverLeg,
          carDetails: `${vehicle!.make} ${vehicle!.model} ${vehicle!.registration}, hired on CRAL from ${ownerDisplayName(vehicle!)}`.slice(0, 200),
        },
      ]
    : [
        {
          merchantId: (vehicle?.merchant_id ?? driver?.merchant_id) as string,
          vehicle,
          driver,
          carLeg,
          driverLeg,
          carDetails: vehicle ? null : carDetails,
        },
      ];

  // A reachable, proven phone before the request goes out (owner's call,
  // 2026-09-19). This is the same "verify where the reason is
  // self-evident" call the merchant side made for the payout number: the
  // owner rings this number, the M-Pesa prompt goes to it, and it is how
  // the renter is told their request was accepted - which is an SMS, and
  // `notification-delivery.ts` will not text an unverified number.
  const account = await db("users").where({ id: userId }).first("phone", "phone_verified");
  if (!account?.phone) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "phone_required",
      message: "Add the phone number the owner should reach you on.",
      field: "phone",
    });
  }
  if (!account.phone_verified) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "phone_verification_required",
      message: "Confirm your phone number so the owner can reach you and we can text you their answer.",
      field: "phone",
    });
  }

  // Identity documents must be on file to request. Ops acceptance is a
  // separate, later gate - the design is explicit that a renter may send
  // a request while their licence is still being read, and that only the
  // keys wait for it.
  const verification = await getRenterVerification(userId);
  // Someone hiring a driver for their own car isn't driving one of ours,
  // so only their ID is asked for, not their licence.
  const notUploaded = verification.documents.filter(
    (d) => d.state === "missing" && (vehicle || d.kind !== "driving_licence"),
  );
  if (notUploaded.length > 0) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "documents_required",
      message: `Add your ${notUploaded.map((d) => d.kind.replace(/_/g, " ")).join(" and ")} before requesting a car.`,
      field: "documents",
    });
  }

  // Only a confirmed or active hire holds dates. A renter's own pending
  // requests deliberately do not - the design allows requesting two cars
  // for the same dates, since only one of them can ever be confirmed.
  const clash = vehicle
    ? await db<BookingRow>("bookings")
        .where({ vehicle_id: vehicle.id })
        .whereIn("status", ["confirmed", "active"])
        .where("pickup_at", "<", dropoffAt)
        .where("dropoff_at", ">", pickupAt)
        .first()
    : null;
  if (clash) {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "dates_unavailable",
      message: "That car is already booked for those dates.",
    });
  }

  // Same rule for the driver: one driver, one job at a time.
  if (driver) {
    const driverClash = await db<BookingRow>("bookings")
      .where({ driver_id: driver.id })
      .whereIn("status", ["confirmed", "active"])
      .where("pickup_at", "<", dropoffAt)
      .where("dropoff_at", ">", pickupAt)
      .first();
    if (driverClash) {
      throw new ApiError({
        status: 409,
        type: "conflict",
        code: "driver_unavailable",
        message: "That driver is already booked for those dates.",
      });
    }
  }

  const hirer = await db("users").where({ id: userId }).first("full_name", "phone");

  const created = await db.transaction(async (trx) => {
    const rows: { booking: BookingRow; notificationId: string }[] = [];
    for (const part of parts) {
      // Every figure is computed here, from the stored rates - one leg per
      // thing hired, summed, the same commission on each.
      const carPricing = part.carLeg ? computeBookingPricing(part.carLeg.rateAmountCents, part.carLeg.quantity) : null;
      const driverPricing = part.driverLeg
        ? computeBookingPricing(part.driverLeg.rateAmountCents, part.driverLeg.quantity)
        : null;
      const sum = (pick: (p: ReturnType<typeof computeBookingPricing>) => Money) =>
        (carPricing ? pick(carPricing).amount : 0) + (driverPricing ? pick(driverPricing).amount : 0);
      const pricing = {
        gross: kes(sum((p) => p.gross)),
        commission: kes(sum((p) => p.commission)),
        merchantNet: kes(sum((p) => p.merchantNet)),
      };
      const unit = part.carLeg?.unit ?? part.driverLeg!.unit;
      const quantity = part.carLeg?.quantity ?? part.driverLeg!.quantity;

      // Snapshot of where the merchant is paid, taken now so a later
      // payout-settings change can't rewrite an existing booking.
      const m = (await trx<MerchantRow>("merchants").where({ id: part.merchantId }).first())!;
      const merchantUser = await trx("users").where({ id: m.user_id }).first("phone");
      const location = part.vehicle?.county ?? vehicle?.county ?? part.driver?.county ?? "To be agreed with the owner";

      const [inserted] = await trx<BookingRow>("bookings")
        .insert({
          id: generateId("booking"),
          ref: await nextBookingRef(trx),
          merchant_id: part.merchantId,
          vehicle_id: part.vehicle?.id ?? null,
          driver_id: part.driver?.id ?? null,
          driver_amount: driverPricing ? driverPricing.gross.amount : null,
          driver_currency: driverPricing ? driverPricing.gross.currency : null,
          driver_rate_unit: part.driverLeg?.unit ?? null,
          driver_rate_quantity: part.driverLeg?.quantity ?? null,
          hire_car_details: part.carDetails,
          linked_booking_id: rows[0]?.booking.id ?? null,
          hirer_id: userId,
          status: "requested",
          pickup_at: pickupAt,
          dropoff_at: dropoffAt,
          rate_unit: unit,
          rate_quantity: quantity,
          // The exact pickup address is withheld until the booking is
          // confirmed; the county is what the renter has seen all along.
          pickup_location: location,
          dropoff_location: location,
          note_from_hirer: input.note_from_hirer ?? null,
          gross_amount: pricing.gross.amount,
          gross_currency: pricing.gross.currency,
          commission_amount: pricing.commission.amount,
          commission_currency: pricing.commission.currency,
          merchant_net_amount: pricing.merchantNet.amount,
          merchant_net_currency: pricing.merchantNet.currency,
          // CRAL takes no deposit for now (owner's call, 2026-09-11). There
          // is no disbursement rail, so a deposit could be collected and not
          // returned - and a stored figure nobody holds is exactly the kind
          // of fiction the hardcoded `id_verified` badge was removed for.
          //
          // CONSEQUENCE, flagged: the merchant claim flow caps a claim at
          // `deposit_amount`, so on a customer-created booking every claim
          // exceeds the cap and escalates straight to a dispute. That is
          // truthful (there is no deposit to claim against) but it means the
          // claim path is effectively dispute-only until a deposit exists.
          deposit_amount: 0,
          deposit_currency: "KES",
          payout_method: m.payout_method,
          payout_detail: (m.payout_same ? merchantUser?.phone : m.payout_detail) ?? "",
          payout_account_name:
            m.owner_type === "company"
              ? m.trading_name || m.company_name || "(no name on file)"
              : m.first_name || "(no name on file)",
          response_due_at: new Date(Date.now() + RESPONSE_WINDOW_HOURS * 60 * 60 * 1000),
        })
        .returning("*");
      if (!inserted) throw new Error("Failed to create booking");

      const subject = await subjectOf(inserted);
      const notificationId = await notify(trx, {
        merchantId: part.merchantId,
        category: "booking",
        title: "New booking request",
        body: `${hirer?.full_name ?? "A renter"} asked for ${subject.long} from ${pickupAt.toDateString()} to ${dropoffAt.toDateString()}.`,
        ref: inserted.ref,
        subjectType: "booking",
        subjectId: inserted.id,
      });

      await writeAuditEntry(trx, {
        actorType: "user",
        actorId: userId,
        action: "booking.requested",
        entityType: "booking",
        entityId: inserted.id,
        after: {
          vehicle_id: part.vehicle?.id ?? null,
          driver_id: part.driver?.id ?? null,
          merchant_id: part.merchantId,
          linked_booking_id: inserted.linked_booking_id,
          pickup_at: pickupAt.toISOString(),
          dropoff_at: dropoffAt.toISOString(),
          gross_amount: pricing.gross.amount,
          deposit_amount: 0,
        },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      rows.push({ booking: inserted, notificationId });
    }
    // Point the first at the second too, so either side finds its pair.
    if (rows.length === 2) {
      const [first] = await trx<BookingRow>("bookings")
        .where({ id: rows[0]!.booking.id })
        .update({ linked_booking_id: rows[1]!.booking.id })
        .returning("*");
      rows[0]!.booking = first!;
    }
    return rows;
  });

  // After the commit, never inside it: a failed SMS or email must not
  // roll back the booking the renter just made.
  for (const { booking, notificationId } of created) {
    await enqueueNotificationDelivery(booking.merchant_id, [notificationId]);
  }

  return detailOf(created[0]!.booking);
}

// ---------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------

const FILTER_STATUSES: Record<Exclude<ListMyBookingsQuery["filter"], "all">, BookingStatus[]> = {
  upcoming: ["requested", "confirmed"],
  on_hire: ["active"],
  completed: ["completed"],
  cancelled: ["cancelled", "declined", "expired"],
};

export async function listMyBookings(userId: string, query: ListMyBookingsQuery) {
  const all = await db<BookingRow>("bookings").where({ hirer_id: userId }).select("status");
  const counts: Record<string, number> = {
    all: all.length,
    upcoming: 0,
    on_hire: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const row of all) {
    for (const [key, statuses] of Object.entries(FILTER_STATUSES)) {
      if (statuses.includes(row.status)) counts[key] = (counts[key] ?? 0) + 1;
    }
  }

  const qb = db<BookingRow>("bookings").where({ hirer_id: userId });
  if (query.filter !== "all") qb.whereIn("status", FILTER_STATUSES[query.filter]);

  if (query.cursor) {
    const decoded = decodeCursor(query.cursor);
    if (decoded) {
      qb.where((b) => {
        b.where("created_at", "<", decoded.v).orWhere((inner) => {
          inner.where("created_at", "=", decoded.v).andWhere("id", "<", decoded.id);
        });
      });
    }
  }

  const fetched = await qb
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .limit(query.limit + 1);

  const hasMore = fetched.length > query.limit;
  const rows = hasMore ? fetched.slice(0, query.limit) : fetched;
  const facts = await vehicleFactsFor([...new Set(rows.map((r) => r.vehicle_id).filter((v): v is string => !!v))]);
  const drivers = await driverFactsFor(rows.map((r) => r.driver_id));
  const last = rows[rows.length - 1];

  return {
    data: rows.map((r) =>
      serializeSummary(
        r,
        r.vehicle_id ? facts.get(r.vehicle_id) : undefined,
        r.driver_id ? drivers.get(r.driver_id) : undefined,
      ),
    ),
    next_cursor:
      hasMore && last ? encodeCursor({ v: last.created_at.toISOString(), id: last.id }) : null,
    has_more: hasMore,
    counts,
  };
}

async function requireOwnBooking(userId: string, bookingId: string): Promise<BookingRow> {
  const booking = await db<BookingRow>("bookings")
    .where({ id: bookingId, hirer_id: userId })
    .first();
  if (!booking) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "booking_not_found",
      message: "That booking doesn't exist on your account.",
    });
  }
  return booking;
}

export async function getMyBooking(userId: string, bookingId: string) {
  return detailOf(await requireOwnBooking(userId, bookingId));
}

// ---------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------

export async function cancelMyBooking(
  userId: string,
  bookingId: string,
  input: CancelBookingInput,
  ctx: RequestContext,
) {
  const booking = await requireOwnBooking(userId, bookingId);

  const withdrawable = booking.status === "requested";
  const cancellable = booking.status === "confirmed" && Date.now() < booking.pickup_at.getTime();
  if (!withdrawable && !cancellable) {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "booking_not_cancellable",
      message:
        booking.status === "confirmed"
          ? "The pickup time has passed - contact the owner to sort this out."
          : "This booking can no longer be cancelled.",
    });
  }

  const { row: updated, refundId } = await db.transaction(async (trx) => {
    const changed = await trx<BookingRow>("bookings")
      .where({ id: booking.id, status: booking.status })
      .update({ status: "cancelled", cancel_reason: input.reason ?? null });
    if (changed === 0) {
      throw new ApiError({
        status: 409,
        type: "conflict",
        code: "booking_not_cancellable",
        message: "This booking was just answered - reload to see where it stands.",
      });
    }

    await writeAuditEntry(trx, {
      actorType: "user",
      actorId: userId,
      action: withdrawable ? "booking.withdrawn" : "booking.cancelled_by_hirer",
      entityType: "booking",
      entityId: booking.id,
      before: { status: booking.status },
      after: { status: "cancelled", reason: input.reason ?? null },
      ip: ctx.ip,
      requestId: ctx.requestId,
    });

    // A withdrawn request was never paid (`initiatePayment` refuses one
    // that isn't `confirmed`/`active`), so `recordRefund` finds no
    // `success` payment and returns null - only the `cancellable` branch
    // (always before pickup, per the guard above) can ever have one to
    // give back. Full refund always: this path has no late-cancellation
    // fee, unlike the merchant's own cancel - a renter cancelling their
    // own hire before pickup owes nothing either way.
    const refundId = await recordRefund(trx, {
      bookingId: booking.id,
      reason: "hirer_cancelled",
      actorId: userId,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });

    const row = await trx<BookingRow>("bookings").where({ id: booking.id }).first();
    return { row: row as BookingRow, refundId };
  });

  // Post-commit, same rule as every other refund in this codebase - a
  // failed send must not roll back the cancellation itself.
  if (refundId) await executeRefund(refundId, booking.ref);

  return detailOf(updated);
}

