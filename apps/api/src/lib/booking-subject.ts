import { db } from "../db/client.js";
import type { DriverRow, VehicleRow } from "../modules/merchant/db-types.js";

/**
 * What a booking is for (owner's call, 2026-10-18 - docs/plans/drivers.md):
 * a car, a car with one of its merchant's drivers, or a driver alone to
 * drive the renter's own car. Every reader that used to assume "a booking
 * has a vehicle" describes it through here, so the merchant's list, the
 * emails, the payout lines and the dashboard all name it the same way.
 */

export interface BookingSubjectDriver {
  id: string;
  full_name: string;
  phone: string;
}

export interface BookingSubject {
  vehicle: VehicleRow | null;
  driver: BookingSubjectDriver | null;
  /** "KDL 442N", or the driver's name for a driver-only booking. */
  short: string;
  /** "Toyota Axio · KDL 442N", "... with driver Peter Kamau", or "Driver Peter Kamau · your own car". */
  long: string;
}

interface SubjectKeys {
  vehicle_id: string | null;
  driver_id: string | null;
  hire_car_details?: string | null;
}

function describe(vehicle: VehicleRow | null, driver: BookingSubjectDriver | null, carDetails: string | null): BookingSubject {
  if (vehicle) {
    const car = `${vehicle.make} ${vehicle.model} · ${vehicle.registration}`;
    return {
      vehicle,
      driver,
      short: vehicle.registration,
      long: driver ? `${car} with driver ${driver.full_name}` : car,
    };
  }
  const name = driver?.full_name ?? "Driver";
  return {
    vehicle: null,
    driver,
    short: name,
    long: `Driver ${name} · ${carDetails ? `renter's car (${carDetails})` : "renter's own car"}`,
  };
}

export async function subjectsFor(bookings: SubjectKeys[]): Promise<Map<SubjectKeys, BookingSubject>> {
  const vehicleIds = [...new Set(bookings.map((b) => b.vehicle_id).filter((v): v is string => !!v))];
  const driverIds = [...new Set(bookings.map((b) => b.driver_id).filter((v): v is string => !!v))];
  const [vehicles, drivers] = await Promise.all([
    vehicleIds.length ? db<VehicleRow>("vehicles").whereIn("id", vehicleIds) : Promise.resolve([] as VehicleRow[]),
    driverIds.length
      ? db<DriverRow>("drivers").whereIn("id", driverIds).select("id", "full_name", "phone")
      : Promise.resolve([] as BookingSubjectDriver[]),
  ]);
  const vById = new Map(vehicles.map((v) => [v.id, v]));
  const dById = new Map((drivers as BookingSubjectDriver[]).map((d) => [d.id, d]));
  const out = new Map<SubjectKeys, BookingSubject>();
  for (const b of bookings) {
    out.set(
      b,
      describe(
        b.vehicle_id ? (vById.get(b.vehicle_id) ?? null) : null,
        b.driver_id ? (dById.get(b.driver_id) ?? null) : null,
        b.hire_car_details ?? null,
      ),
    );
  }
  return out;
}

export async function subjectOf(booking: SubjectKeys): Promise<BookingSubject> {
  return (await subjectsFor([booking])).get(booking)!;
}
