import { z } from "zod";
import { PaginationQuerySchema } from "@cral/types";

/** Matches the design's five filter pills — see Cruz Merchant Portal.dc.html's `filters`. */
export const VEHICLE_FILTERS = ["all", "awaiting_approval", "needs_action", "live", "draft"] as const;
export type VehicleFilter = (typeof VEHICLE_FILTERS)[number];

export const ListVehiclesQuerySchema = PaginationQuerySchema.extend({
  filter: z.enum(VEHICLE_FILTERS).default("all"),
});
export type ListVehiclesQuery = z.infer<typeof ListVehiclesQuerySchema>;

export const CreateVehicleSchema = z.object({
  type: z.enum(["Car", "SUV", "Van", "Pickup", "Lorry"]),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.string().min(1),
  registration: z.string().min(1),
  transmission: z.enum(["Automatic", "Manual"]),
  fuel: z.enum(["Petrol", "Diesel", "Hybrid", "Electric"]),
  colour: z.string().optional(),
  seats: z.number().int().min(1).max(70).optional(),
  pickup_address: z.string().min(1),
  daily_rate: z.string().min(1),
  minimum_hire_days: z.number().int().min(1).max(30).optional(),
  chauffeured: z.boolean().optional(),
});
export type CreateVehicleInput = z.infer<typeof CreateVehicleSchema>;

/** Body for the "Price & availability" modal — only what that modal edits. */
export const PriceAvailabilitySchema = z.object({
  daily_rate: z.string().optional(),
  minimum_hire_days: z.number().int().min(1).max(30).optional(),
  pickup_address: z.string().optional(),
  chauffeured: z.boolean().optional(),
});
export type PriceAvailabilityInput = z.infer<typeof PriceAvailabilitySchema>;

export const DeleteVehicleSchema = z.object({
  registration: z.string().min(1),
});
export type DeleteVehicleInput = z.infer<typeof DeleteVehicleSchema>;

export const MessageReviewerSchema = z.object({
  message: z.string().trim().min(1, "Write a message first."),
});
export type MessageReviewerInput = z.infer<typeof MessageReviewerSchema>;

const VEHICLE_DOCUMENT_KINDS = ["logbook", "comprehensive_insurance", "tracker_certificate"] as const;
export const UploadVehicleDocumentQuerySchema = z.object({
  kind: z.enum(VEHICLE_DOCUMENT_KINDS),
  expires_at: z.string().optional(),
});
export type UploadVehicleDocumentQuery = z.infer<typeof UploadVehicleDocumentQuerySchema>;
