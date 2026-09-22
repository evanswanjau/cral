/**
 * Line glyphs for the spec grid on a listing.
 *
 * Purely decorative - `aria-hidden`, and every cell still carries its
 * overline word ("TRANSMISSION") and its value. That is the design
 * system's rule applied to icons rather than colour: a glyph reinforces a
 * label, it never replaces one. A renter who cannot tell a fuel pump from
 * a jerrycan at 16px still reads "FUEL / Petrol".
 *
 * Drawn on a 16x16 box at 1.5 stroke in neutral-500 (#838C9B), the same
 * weight and colour as the overline they sit beside, so the row reads as
 * one line of type rather than type plus illustration.
 */
export type SpecIconName =
  | "category"
  | "transmission"
  | "fuel"
  | "seats"
  | "driver"
  | "hire";

const PATHS: Record<SpecIconName, JSX.Element> = {
  // A car in profile.
  category: (
    <>
      <path d="M2 10.5h12M3.5 10.5V13M12.5 10.5V13" />
      <path d="M2.4 10.5l1.2-4a1.4 1.4 0 011.3-1h6.2a1.4 1.4 0 011.3 1l1.2 4" />
      <path d="M4.6 8.2h6.8" />
    </>
  ),
  // A gear lever in its gate.
  transmission: (
    <>
      <path d="M8 3.6v8.8" />
      <path d="M3.6 3.6v3.2a1.4 1.4 0 001.4 1.4h6a1.4 1.4 0 001.4-1.4V3.6" />
      <circle cx="8" cy="13" r="1.1" />
      <circle cx="3.6" cy="3" r="0.9" />
      <circle cx="12.4" cy="3" r="0.9" />
    </>
  ),
  // A fuel pump.
  fuel: (
    <>
      <path d="M3 13.5V4a1.2 1.2 0 011.2-1.2h3.6A1.2 1.2 0 019 4v9.5" />
      <path d="M2 13.5h8" />
      <path d="M4.6 6.6h2.8" />
      <path d="M9 7.2h2a1 1 0 011 1v2.4a1 1 0 001 1 1 1 0 001-1V6.2L12.4 4.6" />
    </>
  ),
  // A seat in profile.
  seats: (
    <>
      <path d="M4.6 2.8h2.2a1.4 1.4 0 011.4 1.3l.4 4.3H4.2l.4-4.3a1.4 1.4 0 011.4-1.3z" />
      <path d="M3.4 9.6h7.4a1.4 1.4 0 011.4 1.4v2.2" />
      <path d="M3.4 9.6v3.6" />
    </>
  ),
  // A person at the wheel.
  driver: (
    <>
      <circle cx="8" cy="8" r="5.4" />
      <circle cx="8" cy="8" r="2" />
      <path d="M8 2.6V6M3.3 10.7l2.9-1.7M12.7 10.7l-2.9-1.7" />
    </>
  ),
  // A clock.
  hire: (
    <>
      <circle cx="8" cy="8" r="5.6" />
      <path d="M8 4.8V8l2.2 1.6" />
    </>
  ),
};

export function SpecIcon({ name, color = "#838C9B" }: { name: SpecIconName; color?: string }): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: "none", display: "block" }}
    >
      {PATHS[name]}
    </svg>
  );
}
