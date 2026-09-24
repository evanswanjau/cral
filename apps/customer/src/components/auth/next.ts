/**
 * `?next=` handling shared by every auth page. `next` is how a
 * half-finished hire survives the detour through sign-in: it rides along
 * on every auth link and is the last thing each flow navigates to.
 */

/** `/book/veh_123?from=2026-10-02&to=2026-10-03` -> its parts, or null. */
export function bookingFromNext(next: string): { vehicleId: string; from: string; to: string } | null {
  const match = /^\/book\/([^/?]+)\?(.*)$/.exec(next);
  if (!match) return null;
  const params = new URLSearchParams(match[2]);
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  if (!from || !to) return null;
  return { vehicleId: match[1] as string, from, to };
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
