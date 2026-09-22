/**
 * The four-step progress rail a renter follows from request to confirmed.
 *
 * Shared between `/book/:vehicleId` (steps 1-2) and `/bookings/:bookingId`
 * (steps 2-4) deliberately. The booking is created on the first screen
 * and then lives at its own URL - that split exists so a reload cannot
 * throw the booking away (2026-09-19) - but to the renter it is one
 * journey, and seeing the same rail either side is what makes the second
 * URL read as "still going" rather than "some new page".
 *
 * Order since 2026-09-21 (owner's call, reversing 2026-09-20): the owner
 * accepts first and the renter pays after, so the owner's decision is
 * step 2 and Pay is step 3. This is the canvas's own order too.
 */

/** A renter who already had an account: no sign-up step. */
export const BOOKING_STEPS = ["Request", "Owner accepts", "Pay", "Confirmed"] as const;

/** A first-timer signs up inline, which pushes everything along one. */
export const NEW_ACCOUNT_BOOKING_STEPS = ["Your account", "Request", "Owner accepts", "Pay"] as const;

export function BookingSteps({
  steps,
  doneIndex,
}: {
  steps: readonly string[];
  /** Index of the furthest step reached. -1 renders every step as pending. */
  doneIndex: number;
}): JSX.Element {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: "clamp(20px,2.8vw,28px)", flexWrap: "wrap" }}>
      {steps.map((label, i) => {
        const done = i <= doneIndex;
        return (
          <div key={label} style={{ flex: "1 1 120px", minWidth: 100 }}>
            <div style={{ height: 4, borderRadius: 999, background: done ? "#0F23A8" : "#E4E7EC", marginBottom: 9 }} />
            <div
              style={{
                font: "600 11px/1.3 'IBM Plex Mono',monospace",
                letterSpacing: ".07em",
                color: done ? "#0B0F1A" : "#9AA2B0",
              }}
            >
              {i + 1}. {label.toUpperCase()}
            </div>
          </div>
        );
      })}
    </div>
  );
}
