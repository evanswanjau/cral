import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePageTitle } from "../lib/use-page-title.js";
import {
  cancelMyBooking,
  getMyBooking,
  type BookingDetail,
  type HandoverStatus,
} from "../lib/bookings-api.js";
import { getPaymentState, payForBooking } from "../lib/payments-api.js";
import { BOOKING_STEPS, BookingSteps } from "../components/site/BookingSteps.js";
import { formatMoney, photoSrc } from "../lib/catalog-api.js";
import { VEHICLE_CATEGORY_LABEL } from "../lib/vehicle-categories.js";
import { ApiClientError } from "../lib/api.js";

/**
 * `/bookings/:id` - **the home of a booking once it exists**, and the whole
 * reason a renter can now close the tab, come back from an SMS, or just
 * hit refresh without losing their place (2026-09-19).
 *
 * Every stage after the request lives here and is derived from server
 * state on each load, never from React state a reload would discard:
 * `requested` waits on the owner with a live countdown, `confirmed` is
 * where the M-Pesa prompt is sent and re-sent, and a paid booking shows
 * its receipt. The notification a renter gets when an owner accepts links
 * straight here, so "your booking was approved" lands somewhere they can
 * actually act.
 *
 * Still true from C8: the handover section shows a code's *state*, never
 * the code (only its hash exists server-side; the real one goes out by
 * email), and there is no deposit line anywhere - there is no deposit
 * (owner's call 2026-09-11).
 */

const HANDOVER_STATE_COPY: Record<HandoverStatus["state"], string> = {
  otp_sent: "sent to your email",
  otp_verified: "code confirmed",
  condition_logged: "condition logged",
  confirmed: "confirmed",
  completed: "done",
  expired: "expired - ask the owner to send a new one",
  failed: "too many wrong attempts - ask the owner to send a new one",
};

function HandoverCard({ handovers }: { handovers: HandoverStatus[] }): JSX.Element | null {
  if (handovers.length === 0) return null;
  // Newest first, per booking - at most one pickup and one return in this
  // reduced handover protocol (see CLAUDE.md's own note on that).
  const latestByKind = new Map<HandoverStatus["kind"], HandoverStatus>();
  for (const h of handovers) if (!latestByKind.has(h.kind)) latestByKind.set(h.kind, h);

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E4E7EC",
        borderRadius: 12,
        padding: "clamp(18px,2.4vw,24px)",
        marginBottom: 16,
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ font: "600 14px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>
        Handover
      </div>
      {(["pickup", "return"] as const).map((kind) => {
        const h = latestByKind.get(kind);
        if (!h) return null;
        const isOpen = h.state === "otp_sent";
        return (
          <div key={kind} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ font: "400 13.5px/1.4 'Instrument Sans',sans-serif", color: "#5A6373" }}>
              {kind === "pickup" ? "Pickup code" : "Return code"}
            </span>
            <span style={{ font: "500 13.5px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A", textAlign: "right" }}>
              {isOpen && h.masked_destination
                ? `Sent to ${h.masked_destination} - read it to the merchant`
                : HANDOVER_STATE_COPY[h.state]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const CARD = {
  background: "#FFFFFF",
  border: "1px solid #E4E7EC",
  borderRadius: 12,
  padding: "clamp(18px,2.4vw,24px)",
  marginBottom: 16,
} as const;

function Pill({ tone, children }: { tone: "amber" | "green" | "blue" | "red"; children: string }): JSX.Element {
  const tones = {
    amber: { bg: "#FFF3D6", border: "#F0D089", fg: "#8A5200" },
    green: { bg: "#DDF3E9", border: "#A8DEC7", fg: "#076945" },
    blue: { bg: "#EDEFFC", border: "#DCE1FA", fg: "#0F23A8" },
    red: { bg: "#FDE7EA", border: "#F7BDC5", fg: "#A50E22" },
  }[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 9,
        padding: "6px 13px",
        background: tones.bg,
        border: "1px solid " + tones.border,
        borderRadius: 999,
        font: "600 12px/1.4 'Instrument Sans',sans-serif",
        color: tones.fg,
        marginBottom: 14,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: 999, background: tones.fg }} />
      {children}
    </span>
  );
}

/** A small spinning ring - the STK-push wait is the one place this app asks someone to sit and watch. */
function Spinner({ size = 22 }: { size?: number }): JSX.Element {
  return (
    <svg
      className="cral-spin"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ flex: "none" }}
    >
      <circle cx="12" cy="12" r="10" stroke="#DCE1FA" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="#0F23A8" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Countdown({ dueAt }: { dueAt: string }): JSX.Element {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, new Date(dueAt).getTime() - now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      {pad(Math.floor(left / 3_600_000))}:{pad(Math.floor((left % 3_600_000) / 60_000))}:
      {pad(Math.floor((left % 60_000) / 1000))}
    </span>
  );
}

/** Waiting on the owner - the stage a request sits in for up to twelve hours. */
function WaitingCard({ booking }: { booking: BookingDetail }): JSX.Element {
  const ownerFirst = booking.vehicle.owner_display_name.split(" ")[0] ?? "the owner";
  return (
    <div style={CARD}>
      <Pill tone="amber">{"Waiting for " + ownerFirst}</Pill>
      <div
        style={{
          font: "700 19px/1.25 Archivo,sans-serif",
          fontVariationSettings: "'wdth' 108",
          color: "#0B0F1A",
          marginBottom: 6,
        }}
      >
        Request sent. The clock is on the owner now.
      </div>
      <p style={{ margin: "0 0 16px", font: "400 14px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
        {/*
         * True again since 2026-09-21: the owner answers before any money
         * moves, so a waiting renter has paid nothing.
         */}
        This page moves on by itself the moment {ownerFirst} answers - and we&apos;ll text and
        email you too. Nothing has been charged, and nothing will be until they accept.
      </p>
      {booking.response_due_at && (
        <div style={{ padding: "14px 16px", background: "#F8F9FB", borderRadius: 8 }}>
          <div
            style={{
              font: "500 10px/1 'IBM Plex Mono',monospace",
              letterSpacing: ".1em",
              color: "#9AA2B0",
              marginBottom: 7,
            }}
          >
            REQUEST LAPSES IN
          </div>
          <div style={{ font: "600 22px/1 'IBM Plex Mono',monospace", color: "#0B0F1A" }}>
            <Countdown dueAt={booking.response_due_at} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The paying half of a confirmed booking. Everything it renders comes from
 * `GET /bookings/{id}/payment`, so a reload mid-prompt picks up exactly
 * where it was rather than offering to charge the renter a second time.
 */
function PaymentCard({ booking }: { booking: BookingDetail }): JSX.Element {
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: payment, refetch } = useQuery({
    queryKey: ["bookings", booking.id, "payment"],
    queryFn: () => getPaymentState(booking.id),
    // While a prompt is live the renter is looking at their phone, not at
    // us - poll so the confirmation lands on its own.
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 3000 : false),
    retry: false,
  });

  // A reload after a failed prompt would otherwise show an empty number
  // field for a booking that already has one on file - pre-fill it once,
  // so "try again" genuinely offers the number that just failed.
  useEffect(() => {
    if (payment?.phone && !phone) setPhone(payment.phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment?.phone]);

  const send = async () => {
    setError(null);
    if (!phone.trim()) {
      setError("Enter the M-Pesa number the prompt should go to.");
      return;
    }
    setSending(true);
    try {
      await payForBooking(booking.id, phone.trim());
      await refetch();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Couldn't send the prompt. Try again.");
    } finally {
      setSending(false);
    }
  };

  if (payment?.status === "success") {
    const ownerFirst = booking.vehicle.owner_display_name.split(" ")[0] ?? "the owner";
    // Only reachable for a booking paid under the old pay-first flow
    // (2026-09-20 to 2026-09-21) whose owner never answered.
    const waitingOnOwner = booking.status === "requested";
    /*
     * The canvas's `collectTips` (`Cruz Ride Auto - Website.dc.html`,
     * `bkDone`), minus its third line - "more than three hours late costs
     * you half a day's rate" is a policy nothing in this product
     * implements, and inventing a charge is worse than omitting one. The
     * pickup-code line replaces it: that one is real (`confirmBooking`
     * already promises it by email, and HandoverCard below shows its
     * state).
     */
    const tips = [
      `Match the plate on the car to ${booking.vehicle.registration} before anything else.`,
      "Walk around the car together and make sure you're both happy with its condition before you drive off.",
      "We email you a pickup code when the handover starts - read it to the owner, and never send it to anyone who asks for it first.",
    ];

    return (
      <div style={CARD}>
        <Pill tone={waitingOnOwner ? "blue" : "green"}>
          {waitingOnOwner ? "Paid - waiting for " + ownerFirst : "Paid and confirmed"}
        </Pill>
        <div
          style={{
            font: "700 19px/1.25 Archivo,sans-serif",
            fontVariationSettings: "'wdth' 108",
            color: "#0B0F1A",
            marginBottom: 6,
          }}
        >
          {waitingOnOwner ? "Paid. The clock is on the owner now." : "The car is yours for those dates."}
        </div>
        <p style={{ margin: "0 0 20px", font: "400 14px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
          {/*
           * The design says the owner's number is on the booking from now
           * on. It is not - no endpoint gives a renter the owner's phone
           * (see customer-bookings' own note), so claiming it here would
           * send someone looking for something that isn't there.
           */}
          {waitingOnOwner
            ? `${ownerFirst} has twelve hours to answer. Declined or unanswered, you are refunded in full.`
            : "A confirmation is on its way to your email, with everything below in it."}
        </p>

        {/* The canvas's two fact tiles: the booking's own reference, and
            the M-Pesa receipt a renter can match to their SMS. */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
          <div style={{ flex: "1 1 150px", padding: "15px 17px", background: "#F8F9FB", borderRadius: 8 }}>
            <div
              style={{
                font: "500 10px/1 'IBM Plex Mono',monospace",
                letterSpacing: ".1em",
                color: "#9AA2B0",
                marginBottom: 8,
              }}
            >
              BOOKING
            </div>
            <div style={{ font: "600 18px/1.2 'IBM Plex Mono',monospace", letterSpacing: ".04em", color: "#0B0F1A" }}>
              {booking.ref}
            </div>
          </div>
          {payment.receipt && (
            <div style={{ flex: "1 1 150px", padding: "15px 17px", background: "#F8F9FB", borderRadius: 8 }}>
              <div
                style={{
                  font: "500 10px/1 'IBM Plex Mono',monospace",
                  letterSpacing: ".1em",
                  color: "#9AA2B0",
                  marginBottom: 8,
                }}
              >
                M-PESA
              </div>
              <div style={{ font: "600 18px/1.2 'IBM Plex Mono',monospace", letterSpacing: ".04em", color: "#0B0F1A" }}>
                {payment.receipt}
              </div>
            </div>
          )}
        </div>

        {/* "Before you drive off" - only once the hire is actually on. While
            the owner is still deciding there is nothing to prepare for. */}
        {!waitingOnOwner && (
          <div
            style={{
              background: "#FBF8F2",
              border: "1px solid #E4E7EC",
              borderRadius: 10,
              padding: "18px 20px",
            }}
          >
            <div style={{ font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 12 }}>
              Before you drive off
            </div>
            <div style={{ display: "grid", gap: 9 }}>
              {tips.map((t) => (
                <div key={t} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span
                    style={{
                      flex: "none",
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: "#D81E32",
                      marginTop: 7,
                    }}
                  />
                  <span style={{ font: "400 14px/1.55 'Instrument Sans',sans-serif", color: "#333B4A" }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const live = payment?.status === "pending";
  const accepted = booking.status === "confirmed" || booking.status === "active";
  const failed =
    payment && (payment.status === "failed" || payment.status === "expired" || payment.status === "cancelled");

  return (
    <div style={CARD}>
      {/*
       * The pill states `booking.status`, never an assumption: this card
       * is normally reached only once the owner has accepted, but a
       * legacy pay-first booking can still render it while `requested`,
       * and announcing "<Owner> accepted" over a request they have not
       * seen is exactly the falsehood this replaced.
       */}
      <Pill tone={live ? "amber" : accepted ? "green" : "blue"}>
        {live
          ? "Waiting for your PIN"
          : accepted
            ? booking.vehicle.owner_display_name + " accepted"
            : "Request sent"}
      </Pill>
      <div
        style={{
          font: "700 19px/1.25 Archivo,sans-serif",
          fontVariationSettings: "'wdth' 108",
          color: "#0B0F1A",
          marginBottom: 6,
        }}
      >
        {live ? "Check your phone for the prompt." : "Pay by M-Pesa to lock in the dates."}
      </div>
      <p style={{ margin: "0 0 16px", font: "400 14px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
        {live
          ? "A Safaricom prompt for " +
            formatMoney(booking.total_due) +
            " is on its way to " +
            (payment?.phone ?? "your phone") +
            ". Enter your M-Pesa PIN there and nowhere else."
          : `${booking.vehicle.owner_display_name} has accepted. One prompt, the owner's rate for your dates, nothing on top - and the car is yours for them.`}
      </p>

      {/*
       * A live prompt polls on its own (the `refetchInterval` above) and
       * this card swaps to the paid layout the moment that lands - nobody
       * has to refresh or click anything. The spinner is just so "waiting"
       * doesn't read as "stuck".
       */}
      {live && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "16px 18px",
            background: "#F8F9FB",
            borderRadius: 10,
            marginBottom: 16,
          }}
        >
          <Spinner />
          <div>
            <div style={{ font: "600 13.5px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>
              Waiting for your confirmation
            </div>
            <div style={{ font: "400 12.5px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
              This page moves on by itself the moment you enter your PIN - no need to refresh.
            </div>
          </div>
        </div>
      )}

      {failed && (
        <div
          style={{
            marginBottom: 14,
            padding: "12px 14px",
            background: "#FFF3DB",
            border: "1px solid #F5D9A3",
            borderRadius: 8,
            font: "400 13px/1.55 'Instrument Sans',sans-serif",
            color: "#8A5200",
          }}
        >
          {payment?.status === "expired"
            ? "That prompt timed out. Nothing was charged and the car is still held for you."
            : (payment?.failure_reason ?? "That prompt didn't go through. Nothing was charged.")}
          {" "}Try again below, or use a different M-Pesa number if this one isn't working.
        </div>
      )}

      {!live && (
        <>
          <label style={{ display: "block", marginBottom: 14 }}>
            <span
              style={{
                display: "block",
                font: "600 12px/1 'Instrument Sans',sans-serif",
                color: "#5A6373",
                marginBottom: 7,
              }}
            >
              {failed ? "Try again with this number, or enter a different one" : "Number the prompt goes to"}
            </span>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0722 000 000"
              style={{
                width: "100%",
                height: 48,
                padding: "0 13px",
                border: "1px solid #CDD2DA",
                borderRadius: 8,
                font: "500 16px/1 'IBM Plex Mono',monospace",
                color: "#0B0F1A",
                background: "#FFFFFF",
              }}
            />
          </label>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "baseline",
              padding: "16px 18px",
              background: "#0B0F1A",
              borderRadius: 10,
              marginBottom: 14,
              flexWrap: "wrap",
            }}
          >
            <span style={{ font: "500 13px/1.4 'Instrument Sans',sans-serif", color: "#A7B0BE" }}>
              Prompt will ask for
            </span>
            <span
              style={{
                font: "700 22px/1 Archivo,sans-serif",
                fontVariationSettings: "'wdth' 106",
                color: "#FFFFFF",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatMoney(booking.total_due)}
            </span>
          </div>
        </>
      )}

      {error && (
        <div
          style={{
            marginBottom: 14,
            padding: "12px 14px",
            background: "#FDE7EA",
            border: "1px solid #F7BDC5",
            borderRadius: 8,
            font: "500 13px/1.5 'Instrument Sans',sans-serif",
            color: "#A50E22",
          }}
        >
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={send}
        disabled={sending}
        style={{
          width: "100%",
          height: 50,
          background: "#0F23A8",
          color: "#FFFFFF",
          border: "none",
          borderRadius: 8,
          font: "600 16px/1 'Instrument Sans',sans-serif",
          cursor: sending ? "default" : "pointer",
          opacity: sending ? 0.7 : 1,
        }}
      >
        {sending ? "Sending…" : live ? "Send the prompt again" : failed ? "Try again" : "Send the STK push"}
      </button>
    </div>
  );
}

export function TripDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  /**
   * Polled while the booking is waiting on the owner, so the renter never
   * has to leave or reload this page to find out they were accepted - the
   * screen advances to the next step on its own the moment the owner
   * answers. Polling stops as soon as there is nothing left to wait for.
   */
  const { data: booking, isLoading } = useQuery({
    queryKey: ["bookings", id],
    queryFn: () => getMyBooking(id!),
    enabled: !!id,
    retry: false,
    refetchInterval: (query) => (query.state.data?.status === "requested" ? 8000 : false),
    // An answer that lands while the tab was in the background should be
    // on screen the moment they look at it again.
    refetchOnWindowFocus: true,
  });

  /**
   * Read at page level, not only inside `PaymentCard`: the step rail and
   * the choice between "pay" and "wait" both turn on whether the money
   * has landed. Same query key the card uses, so it is one request.
   */
  const { data: pagePayment } = useQuery({
    queryKey: ["bookings", id, "payment"],
    queryFn: () => getPaymentState(id!),
    enabled: !!id,
    retry: false,
  });

  usePageTitle(booking ? booking.ref : "Trip");

  if (isLoading || !booking) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "60px 24px" }}>
        <p style={{ font: "400 15px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>Loading…</p>
      </div>
    );
  }

  const paid = pagePayment?.status === "success";
  const accepted =
    booking.status === "confirmed" || booking.status === "active" || booking.status === "completed";
  /**
   * How far along the rail this booking is, in the restored order
   * (Request -> Owner accepts -> Pay -> Confirmed, 2026-09-21). A
   * `requested` booking is still on step 1, waiting on the owner; once
   * accepted it moves to Pay, and paying is what completes it. Request
   * is always behind us by the time a booking exists, so the floor is 0.
   */
  const stepIndex = accepted ? (paid ? 3 : 2) : 0;

  const canCancel = booking.status === "requested" || booking.status === "confirmed";

  const cancel = async () => {
    setError(null);
    setCancelling(true);
    try {
      await cancelMyBooking(booking.id);
      await queryClient.invalidateQueries({ queryKey: ["bookings", id] });
      setConfirmingCancel(false);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Couldn't cancel that. Try again.");
    } finally {
      setCancelling(false);
    }
  };

  const card = {
    background: "#FFFFFF",
    border: "1px solid #E4E7EC",
    borderRadius: 12,
    padding: "clamp(18px,2.4vw,24px)",
  } as const;

  const dayLabel = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "clamp(28px,4vw,44px) 20px clamp(50px,7vw,80px)" }}>
      <button
        type="button"
        onClick={() => navigate("/bookings")}
        style={{
          height: 34,
          padding: "0 12px 0 8px",
          background: "none",
          border: "none",
          font: "600 13px/1 'Instrument Sans',sans-serif",
          color: "#5A6373",
          cursor: "pointer",
          marginBottom: 14,
        }}
      >
        ← My bookings
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
        <h1
          style={{
            margin: 0,
            font: "700 clamp(24px,3vw,30px)/1.15 Archivo,sans-serif",
            fontVariationSettings: "'wdth' 108",
            color: "#0B0F1A",
          }}
        >
          {booking.vehicle.make} {booking.vehicle.model} {booking.vehicle.year}
        </h1>
        <span style={{ font: "500 13px/1 'IBM Plex Mono',monospace", color: "#838C9B" }}>{booking.ref}</span>
      </div>
      <p style={{ margin: "0 0 22px", font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
        {booking.vehicle.owner_display_name}
      </p>

      {/*
       * The same rail `/book/:vehicleId` shows, continued. The booking
       * moved to its own URL so a reload cannot lose it (2026-09-19),
       * but to the renter this is still the journey they started - the
       * rail is what says so, instead of the trip page reading as an
       * unrelated screen they were dumped on.
       */}
      <BookingSteps steps={BOOKING_STEPS} doneIndex={stepIndex} />

      {/*
       * Two columns, the same shape as `/book/:vehicleId`: what to do now
       * on the left, the car and its figures alongside. Continuing that
       * card is what makes this read as the next step of one journey
       * rather than a summary table bolted under the payment box.
       */}
      <div style={{ display: "flex", gap: "clamp(16px,2.4vw,26px)", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 400px", minWidth: 300 }}>

      {/*
       * The owner answers first, then the renter pays (2026-09-21,
       * reversing 2026-09-20). So a `requested` booking only ever waits -
       * the API refuses to charge one - and the payment card appears when
       * the request is accepted. It stays on `active` because a prompt
       * that failed can still be retried after pickup.
       *
       * `requested && paid` is not reachable under this flow; it is still
       * handled because bookings paid under the old one exist.
       */}
      {booking.status === "requested" &&
        (paid ? <PaymentCard booking={booking} /> : <WaitingCard booking={booking} />)}
      {(booking.status === "confirmed" || booking.status === "active") && (
        <PaymentCard booking={booking} />
      )}

      <HandoverCard handovers={booking.handovers} />

      {booking.status === "declined" && booking.decline_reason_code && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ font: "600 14px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 4 }}>
            The owner declined
          </div>
          <p style={{ margin: 0, font: "400 13.5px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
            {booking.decline_reason_code.replace(/_/g, " ")}
          </p>
        </div>
      )}

      {booking.cancel_reason && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ font: "600 14px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 4 }}>
            Cancelled
          </div>
          <p style={{ margin: 0, font: "400 13.5px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
            {booking.cancel_reason}
          </p>
        </div>
      )}

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            background: "#FDE7EA",
            border: "1px solid #F7BDC5",
            borderRadius: 8,
            font: "500 13px/1.5 'Instrument Sans',sans-serif",
            color: "#A50E22",
          }}
        >
          {error}
        </div>
      )}

      {!confirmingCancel && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {paid && (
            <>
              <Link
                to="/bookings"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 44,
                  padding: "0 18px",
                  background: "#0F23A8",
                  color: "#FFFFFF",
                  borderRadius: 8,
                  font: "600 14px/1 'Instrument Sans',sans-serif",
                  textDecoration: "none",
                }}
              >
                Manage this booking
              </Link>
              <Link
                to="/"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 44,
                  padding: "0 18px",
                  background: "#FFFFFF",
                  color: "#333B4A",
                  border: "1px solid #E4E7EC",
                  borderRadius: 8,
                  font: "600 14px/1 'Instrument Sans',sans-serif",
                  textDecoration: "none",
                }}
              >
                Back to CRAL
              </Link>
            </>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={() => setConfirmingCancel(true)}
              style={{
                height: 44,
                padding: "0 18px",
                background: "#FFFFFF",
                color: "#A50E22",
                border: "1px solid #F7BDC5",
                borderRadius: 8,
                font: "600 14px/1 'Instrument Sans',sans-serif",
                cursor: "pointer",
              }}
            >
              {booking.status === "requested" ? "Withdraw request" : "Cancel booking"}
            </button>
          )}
          {!paid && !canCancel && (
            <Link to="/browse" style={{ font: "600 14px/1.4 'Instrument Sans',sans-serif", color: "#0F23A8" }}>
              Find another car →
            </Link>
          )}
        </div>
      )}

      {canCancel && confirmingCancel && (
        <div
          style={{
            ...card,
            borderColor: "#F7BDC5",
            background: "#FFFBFB",
          }}
        >
          <div style={{ font: "600 15px/1.35 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 6 }}>
            {booking.status === "requested" ? "Withdraw this request?" : "Cancel this booking?"}
          </div>
          <p style={{ margin: "0 0 16px", font: "400 13.5px/1.55 'Instrument Sans',sans-serif", color: "#5A6373" }}>
            {booking.status === "requested"
              ? "Nothing has been charged, so there's nothing to refund. The owner will no longer see this request."
              : paid
                ? `You'll be refunded in full - ${formatMoney(booking.total_due)} back to the number you paid with. The dates go back on offer for someone else.`
                : "Nothing has been charged, so there's nothing to refund. The dates go back on offer for someone else."}
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={cancel}
              disabled={cancelling}
              style={{
                height: 44,
                padding: "0 18px",
                background: "#A50E22",
                color: "#FFFFFF",
                border: "none",
                borderRadius: 8,
                font: "600 14px/1 'Instrument Sans',sans-serif",
                cursor: cancelling ? "default" : "pointer",
                opacity: cancelling ? 0.7 : 1,
              }}
            >
              {cancelling
                ? "Cancelling…"
                : booking.status === "requested"
                  ? "Yes, withdraw it"
                  : "Yes, cancel it"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingCancel(false)}
              disabled={cancelling}
              style={{
                height: 44,
                padding: "0 18px",
                background: "#FFFFFF",
                color: "#5A6373",
                border: "1px solid #CDD2DA",
                borderRadius: 8,
                font: "600 14px/1 'Instrument Sans',sans-serif",
                cursor: cancelling ? "default" : "pointer",
              }}
            >
              No, keep it
            </button>
          </div>
        </div>
      )}
        </div>

        {/* ---- the car, alongside - continued from the booking page ---- */}
        <aside
          style={{
            flex: "0 0 300px",
            minWidth: 260,
            background: "#FFFFFF",
            border: "1px solid #E4E7EC",
            borderRadius: 12,
            padding: "clamp(18px,2.4vw,22px)",
            position: "sticky",
            top: 82,
          }}
        >
          <div
            style={{
              aspectRatio: "16 / 10",
              borderRadius: 10,
              background: "#F1F3F6",
              position: "relative",
              overflow: "hidden",
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {booking.vehicle.primary_photo_url ? (
              <img
                src={photoSrc(booking.vehicle.primary_photo_url)}
                alt={`${booking.vehicle.make} ${booking.vehicle.model}`}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center 75%",
                }}
              />
            ) : (
              <span
                style={{
                  font: "500 10px/1.5 'IBM Plex Mono',monospace",
                  letterSpacing: ".1em",
                  color: "#9AA2B0",
                }}
              >
                NO PHOTO YET
              </span>
            )}
          </div>
          <div style={{ font: "600 15px/1.35 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 4 }}>
            {booking.vehicle.make} {booking.vehicle.model} {booking.vehicle.year}
          </div>
          <div style={{ font: "500 12px/1.4 'IBM Plex Mono',monospace", color: "#838C9B", marginBottom: 8 }}>
            {booking.vehicle.registration} · {booking.vehicle.county ?? "Location on request"}
          </div>
          <div style={{ font: "400 12.5px/1.5 'Instrument Sans',sans-serif", color: "#5A6373", marginBottom: 16 }}>
            {VEHICLE_CATEGORY_LABEL[booking.vehicle.category] ?? booking.vehicle.category} ·{" "}
            {booking.vehicle.seats} seats ·{" "}
            {booking.vehicle.transmission === "manual" ? "Manual" : "Auto"} ·{" "}
            {booking.vehicle.chauffeured ? "With driver" : "Self-drive"}
          </div>

          <div style={{ display: "grid", gap: 9, paddingTop: 14, borderTop: "1px solid #F1F3F6" }}>
            <Row label="Status" value={booking.status.replace(/_/g, " ")} />
            <Row label="Pickup" value={dayLabel(booking.pickup_at)} />
            <Row label="Return" value={dayLabel(booking.dropoff_at)} />
            <Row label="Where" value={booking.pickup_location} />
            {booking.note_from_hirer && <Row label="Your note" value={booking.note_from_hirer} />}
            <div style={{ borderTop: "1px solid #F1F3F6", paddingTop: 9 }}>
              <Row bold label="Total" value={formatMoney(booking.total_due)} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }): JSX.Element {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span
        style={{
          font: bold ? "600 14px/1.4 'Instrument Sans',sans-serif" : "400 13.5px/1.4 'Instrument Sans',sans-serif",
          color: bold ? "#0B0F1A" : "#5A6373",
        }}
      >
        {label}
      </span>
      <span
        style={{
          font: bold ? "700 15px/1.4 Archivo,sans-serif" : "500 13.5px/1.4 'Instrument Sans',sans-serif",
          color: "#0B0F1A",
          textAlign: "right",
          maxWidth: "60%",
        }}
      >
        {value}
      </span>
    </div>
  );
}
