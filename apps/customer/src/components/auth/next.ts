/**
 * `?next=` handling shared by every auth page. `next` is how a
 * half-finished hire survives the detour through sign-in: it rides along
 * on every auth link and is the last thing each flow navigates to.
 */

/** `/cars/veh_123/book?from=2026-10-02&to=2026-10-03` (or the legacy
 * `/book/veh_123?...` still in flight in old sign-in links) -> its parts, or null. */
export function bookingFromNext(next: string): { vehicleId: string; from: string; to: string } | null {
  const match = /^\/(?:cars\/([^/?]+)\/book|book\/([^/?]+))\?(.*)$/.exec(next);
  if (!match) return null;
  const params = new URLSearchParams(match[3]);
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  if (!from || !to) return null;
  return { vehicleId: (match[1] ?? match[2]) as string, from, to };
}

/** "Back to the truck" and the like: the auth screens' back link names
 * what was being booked when `next` is a request in progress (UI7, row
 * U1), so a driver or tow request isn't told it is going back to a car. */
export function backLabel(next: string): string | null {
  const listing = /^\/(cars|trucks|machinery|drivers)\/(?!search(?:[/?#]|$))[^/?#]+/.exec(next);
  if (listing) {
    const noun = { cars: "car", trucks: "truck", machinery: "machine", drivers: "driver" }[listing[1] as "cars" | "trucks" | "machinery" | "drivers"];
    return `Back to the ${noun}`;
  }
  if (/^\/book\//.test(next)) return "Back to the car";
  if (/^\/towing(?:[/?#]|$)/.test(next)) return "Back to your tow request";
  return null;
}

/** `?next=` is only ever followed as an in-app path - an absolute or
 * protocol-relative value is an open redirect, not a resume. */
export function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

/** `path` with `next` carried along, or bare when there is nowhere to resume. */
export function withNext(path: string, next: string): string {
  return next && next !== "/" ? `${path}?next=${encodeURIComponent(next)}` : path;
}
