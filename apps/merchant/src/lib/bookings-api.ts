import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiUpload } from "./api.js";

export type BookingFilter = "all" | "requests" | "upcoming" | "on_hire" | "completed" | "cancelled";
export type BookingStatus = "requested" | "confirmed" | "active" | "completed" | "declined" | "expired" | "cancelled";

export interface Money {
  amount: number;
  currency: string;
}

export interface BookingSummary {
  id: string;
  ref: string;
  status: BookingStatus;
  hirer_name: string;
  hirer_is_corporate: boolean;
  vehicle_registration: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_type: string;
  vehicle_year: string;
  vehicle_chauffeured: boolean;
  vehicle_pickup_address: string | null;
  pickup_at: string;
  dropoff_at: string;
  merchant_net: Money;
  requested_at: string;
  response_due_at: string | null;
}

export interface BookingEvent {
  kind: string;
  label: string;
  body: string | null;
  tone: "grey" | "blue" | "green" | "amber" | "red";
  actor_type: "merchant" | "hirer" | "system";
  occurred_at: string;
}

export interface BookingDetail extends BookingSummary {
  gross: Money;
  commission: Money;
  deposit: Money;
  cancellation_fee: Money | null;
  refund: Money | null;
  pickup_location: string;
  dropoff_location: string;
  note_from_hirer: string | null;
  payout_method: string;
  payout_detail: string;
  payout_account_name: string;
  has_pickup_condition_photos: boolean;
  deposit_release_at: string | null;
  rating_open_until: string | null;
  events: BookingEvent[];
}

export interface BookingListResult {
  data: BookingSummary[];
  next_cursor: string | null;
  has_more: boolean;
  counts: Record<BookingFilter, number>;
}

export function listBookings(filter: BookingFilter) {
  const q = filter === "all" ? "" : `?filter=${filter}`;
  return apiGet<BookingListResult>(`/merchant/bookings${q}`);
}

export function getBooking(id: string) {
  return apiGet<BookingDetail>(`/merchant/bookings/${id}`);
}

function idempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function confirmBooking(id: string) {
  return apiPost<BookingDetail>(`/merchant/bookings/${id}/confirm`, undefined, {
    headers: { "Idempotency-Key": idempotencyKey() },
  });
}

export interface DeclineBookingInput {
  reason_code: "not_free" | "rate_out_of_date" | "hirer_needs_checking" | "other";
  note?: string;
}

export function declineBooking(id: string, input: DeclineBookingInput) {
  return apiPost<BookingDetail>(`/merchant/bookings/${id}/decline`, input);
}

export function cancelBooking(id: string, reason: string) {
  return apiPost<BookingDetail>(`/merchant/bookings/${id}/cancel`, { reason }, { headers: { "Idempotency-Key": idempotencyKey() } });
}

export type HandoverState =
  | "created"
  | "qr_scanned"
  | "otp_sent"
  | "otp_verified"
  | "condition_logged"
  | "confirmed"
  | "completed"
  | "expired"
  | "failed"
  | "offline_pending"
  | "reconciled";

export interface Handover {
  id: string;
  booking_id: string;
  kind: "pickup" | "return";
  state: HandoverState;
  required: string[];
  masked_destination: string | null;
  expires_at: string;
  condition: { odometer_km: number | null; fuel_level: string | null; notes: string | null };
}

export function createHandover(bookingId: string, kind: "pickup" | "return") {
  return apiPost<Handover>(`/merchant/bookings/${bookingId}/handovers`, { kind });
}

export function verifyHandoverOtp(handoverId: string, code: string) {
  return apiPost<Handover>(`/merchant/handovers/${handoverId}/otp/verify`, { code });
}

export interface HandoverConditionInput {
  odometer_km?: number;
  fuel_level?: "empty" | "quarter" | "half" | "three_quarter" | "full";
  photo_document_ids?: string[];
  notes?: string;
}

export function logHandoverCondition(handoverId: string, input: HandoverConditionInput) {
  return apiPost<Handover>(`/merchant/handovers/${handoverId}/condition`, input);
}

export function confirmHandover(handoverId: string) {
  return apiPost<Handover>(`/merchant/handovers/${handoverId}/confirm`);
}

export interface CompleteHandoverResult {
  booking: BookingDetail;
  handover: Handover;
}

export function completeHandover(handoverId: string) {
  return apiPost<CompleteHandoverResult>(`/merchant/handovers/${handoverId}/complete`, undefined, {
    headers: { "Idempotency-Key": idempotencyKey() },
  });
}

export function uploadHandoverPhoto(handoverId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiUpload<{ document_id: string; original_name: string }>(`/merchant/handovers/${handoverId}/photos`, formData);
}

export type BookingReportKind = "claim" | "conduct";
export type BookingReportCategory = "damage" | "fuel_short" | "late_return" | "missing_equipment" | "cleaning" | "conduct" | "other";

export interface BookingReport {
  id: string;
  booking_id: string;
  kind: BookingReportKind;
  category: BookingReportCategory;
  description: string;
  amount: Money | null;
  evidence_document_ids: string[];
  status: "filed" | "under_review" | "resolved";
  escalated_dispute_id: string | null;
  filed_at: string;
}

export interface CreateBookingReportInput {
  kind: BookingReportKind;
  category: BookingReportCategory;
  description: string;
  amount?: number;
  evidence_document_ids?: string[];
}

export function listBookingReports(bookingId: string) {
  return apiGet<{ data: BookingReport[] }>(`/merchant/bookings/${bookingId}/reports`);
}

export function createBookingReport(bookingId: string, input: CreateBookingReportInput) {
  return apiPost<BookingReport>(`/merchant/bookings/${bookingId}/reports`, input);
}

export interface HirerHistory {
  name: string;
  member_since: string;
  trip_count: number;
  average_rating: number | null;
  completed_count: number;
  late_return_count: number;
  cancellation_count: number;
  licence_valid_to: string | null;
}

export function getHirerHistory(bookingId: string) {
  return apiGet<HirerHistory>(`/merchant/bookings/${bookingId}/hirer-history`);
}

export interface RateHirerInput {
  stars: number;
  comment?: string;
}

export function rateHirer(bookingId: string, input: RateHirerInput) {
  return apiPost<BookingDetail>(`/merchant/bookings/${bookingId}/rating`, input);
}

export function seedDevBookings() {
  return apiPost<{ seeded: number }>(`/merchant/bookings/dev-seed`);
}

// --- TanStack Query hooks -----------------------------------------------

export function useBookingList(filter: BookingFilter) {
  return useQuery({ queryKey: ["bookings", filter], queryFn: () => listBookings(filter) });
}

export function useBookingDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["booking", id],
    queryFn: () => getBooking(id as string),
    enabled: !!id,
  });
}

function useInvalidateBookings() {
  const queryClient = useQueryClient();
  return (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: ["bookings"] });
    if (id) void queryClient.invalidateQueries({ queryKey: ["booking", id] });
  };
}

export function useConfirmBooking(id: string) {
  const invalidate = useInvalidateBookings();
  return useMutation({ mutationFn: () => confirmBooking(id), onSuccess: () => invalidate(id) });
}

export function useDeclineBooking(id: string) {
  const invalidate = useInvalidateBookings();
  return useMutation({ mutationFn: (input: DeclineBookingInput) => declineBooking(id, input), onSuccess: () => invalidate(id) });
}

export function useCancelBooking(id: string) {
  const invalidate = useInvalidateBookings();
  return useMutation({ mutationFn: (reason: string) => cancelBooking(id, reason), onSuccess: () => invalidate(id) });
}

export function useCreateHandover(bookingId: string) {
  return useMutation({ mutationFn: (kind: "pickup" | "return") => createHandover(bookingId, kind) });
}

export function useVerifyHandoverOtp() {
  return useMutation({ mutationFn: ({ handoverId, code }: { handoverId: string; code: string }) => verifyHandoverOtp(handoverId, code) });
}

export function useLogHandoverCondition() {
  return useMutation({
    mutationFn: ({ handoverId, input }: { handoverId: string; input: HandoverConditionInput }) => logHandoverCondition(handoverId, input),
  });
}

export function useConfirmHandover() {
  return useMutation({ mutationFn: (handoverId: string) => confirmHandover(handoverId) });
}

export function useCompleteHandover(bookingId: string) {
  const invalidate = useInvalidateBookings();
  return useMutation({ mutationFn: (handoverId: string) => completeHandover(handoverId), onSuccess: () => invalidate(bookingId) });
}

export function useUploadHandoverPhoto() {
  return useMutation({ mutationFn: ({ handoverId, file }: { handoverId: string; file: File }) => uploadHandoverPhoto(handoverId, file) });
}

export function useBookingReports(bookingId: string | undefined) {
  return useQuery({
    queryKey: ["booking-reports", bookingId],
    queryFn: () => listBookingReports(bookingId as string),
    enabled: !!bookingId,
  });
}

export function useCreateBookingReport(bookingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBookingReportInput) => createBookingReport(bookingId, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["booking-reports", bookingId] }),
  });
}

export function useHirerHistory(bookingId: string | undefined) {
  return useQuery({
    queryKey: ["hirer-history", bookingId],
    queryFn: () => getHirerHistory(bookingId as string),
    enabled: !!bookingId,
  });
}

export function useRateHirer(id: string) {
  const invalidate = useInvalidateBookings();
  return useMutation({ mutationFn: (input: RateHirerInput) => rateHirer(id, input), onSuccess: () => invalidate(id) });
}

export function useSeedDevBookings() {
  const invalidate = useInvalidateBookings();
  return useMutation({ mutationFn: () => seedDevBookings(), onSuccess: () => invalidate() });
}
