# Customer portal (`apps/customer`)

The detailed status, gaps and decisions are in
[`docs/plans/customer-portal.md`](../plans/customer-portal.md) - read it
before working here. This file keeps the rules that cross into other
portals.

- **A renter's booking is a real `bookings` row** the merchant sees in
  their Bookings screen; `POST /bookings` prices server-side
  (`bookings-payouts.md`). Payment is an STK push (`payments.md`).
- **Renters get their own notifications.** `notifications.merchant_id` is
  nullable and `user_id` exists; `notify()` takes exactly one of
  `merchantId` / `userId`. Confirming, declining or merchant-cancelling a
  booking writes the hirer an in-app row (`GET /me/notifications`,
  `openapi/customer-notifications.yaml`). Renter documents (ID, licence
  with expiry) use `documents.user_id` the same way.
- **Hire groups** (PR H1 of `docs/plans/hire-that-works.md`, 2026-11-26):
  the catalog takes `group=cars|trucks|machinery`, cars = sedan + SUV +
  van, so "any type" on the cars page never lists a truck or a machine.
  `GET /catalog/hire-summary` gives each group's live count and cheapest
  price in that listing's own unit (quote-first listings counted, never
  priced); `GET /catalog/counties?group=` counts one group. Machines carry
  a `machine_type` filter.
- **The pickup code is never shown in the customer app**: only a hash
  exists and the code goes out by email; trip detail shows the handover's
  state.
- **Renters see a driver's full name** and nothing else about them
  (`drivers.md`).
- Auth screens share the merchant auth layout; a renter's reset link opens
  on the customer site.
- "List your car" sends people to the merchant app; the customer copy was
  dropped.
- Several screens were built without a canvas file (marketing pages, C8
  trips/account/notifications, towing, truck forms); see `design.md`.
- Deployed twice: `cral.co.ke` (production, VPS) and
  `app-cral.vercel.app` (tracks `develop`, talks to the dev API) - see
  `deploy.md`.

- Customer PRs are numbered `C*` (C4 booking flow, C8 trips, C9 marketing, C11 Ops renters/bookings). Renter documents: `documents.merchant_id` nullable + `user_id`.
