import { z } from "zod";
import { KENYA_COUNTIES } from "../../lib/counties.js";
import { MAX_PAYLOAD_KG } from "../vehicles/categories.js";

/**
 * A car, a car with one of its merchant's drivers, or a driver alone for
 * the renter's own car (docs/plans/drivers.md) - at least one of
 * `vehicle_id` / `driver_id`. `driver_unit` picks which of the driver's
 * rates prices their part; for a car it defaults to the car's own unit.
 * `hire_car_details` says what car a driver-only booking is for.
 */
export const CreateBookingSchema = z
  .object({
    vehicle_id: z.string().min(1).optional(),
    driver_id: z.string().min(1).optional(),
    driver_unit: z.enum(["day", "hour", "trip"]).optional(),
    hire_car_details: z.string().trim().max(200).optional().nullable(),
    pickup_at: z.string().datetime({ offset: true }),
    dropoff_at: z.string().datetime({ offset: true }),
    note_from_hirer: z.string().max(1000).optional().nullable(),
    // Truck listings only (PR T2): where the load goes from and to, and
    // what it is. Required for a truck, refused for anything else - see
    // `createBooking`. Weight is optional and in kg (the form asks tonnes).
    route_from: z.string().trim().min(1).max(200).optional(),
    route_from_county: z.enum(KENYA_COUNTIES).optional(),
    route_to: z.string().trim().min(1).max(200).optional(),
    route_to_county: z.enum(KENYA_COUNTIES).optional(),
    cargo_description: z.string().trim().min(1).max(300).optional(),
    cargo_kg: z.number().int().positive().max(MAX_PAYLOAD_KG).optional().nullable(),
  })
  .refine((v) => v.vehicle_id || v.driver_id, { message: "Pick a car or a driver.", path: ["vehicle_id"] });

export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;

export const ListMyBookingsQuerySchema = z.object({
  filter: z.enum(["all", "upcoming", "on_hire", "completed", "cancelled"]).default("all"),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type ListMyBookingsQuery = z.infer<typeof ListMyBookingsQuerySchema>;

export const CancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type CancelBookingInput = z.infer<typeof CancelBookingSchema>;
