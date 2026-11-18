/**
 * Origin of the customer site, a separate app. Merchant terms don't exist
 * yet, so the merchant app's "terms" and "privacy notice" links open the
 * customer site's `/legal` until the owner supplies merchant terms.
 *
 * `VITE_CUSTOMER_APP_URL` overrides it (the mirror of the customer app's
 * `VITE_MERCHANT_APP_URL`); without it, a dev server points at the local
 * customer app and a build at production, so a build with no env set never
 * ships a localhost link.
 */
const CUSTOMER_APP_URL =
  (import.meta.env.VITE_CUSTOMER_APP_URL as string | undefined) ??
  (import.meta.env.DEV ? "http://localhost:5173" : "https://cral.co.ke");

export function customerLegalUrl(): string {
  return `${CUSTOMER_APP_URL}/legal`;
}
