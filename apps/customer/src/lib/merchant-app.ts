/**
 * Origin of the separate merchant portal - a different app, different
 * sign-in. "List your car" always hands off here rather than being a page
 * of its own in this app; listing a car has only ever lived in
 * `apps/merchant` (onboarding wizard, the standalone Add-a-vehicle page).
 *
 * Points at the merchant app's bare root, not `/create-account` directly -
 * `apps/merchant`'s own `/` is now a marketing/sign-up landing page for
 * signed-out visitors (owner's call, 2026-09-20), so the hand-off lands
 * there rather than skipping straight to the sign-up form.
 */
const MERCHANT_APP_URL = (import.meta.env.VITE_MERCHANT_APP_URL as string | undefined) ?? "http://localhost:5174";

export function merchantLandingUrl(): string {
  return MERCHANT_APP_URL;
}
