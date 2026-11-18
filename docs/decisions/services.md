# Services (towing today)

Read before touching towing, `service_requests`, or adding a service
vertical. "Services" is a deliberate owner's call (2026-09-23) beyond the
older delivery plan; the queue for what comes next is
`docs/plans/verticals-roadmap.md`.

- **Towing and recovery is CRAL-run dispatch, not a hire booking.** No
  merchant, no vehicle, no `computeBookingPricing`: its own table
  (`service_requests`, `svc_`), because "per km or subject to discussion"
  has no fixed price at request time. Contracts
  `openapi/customer-services.yaml` + `openapi/admin-services.yaml`;
  modules `modules/service-requests/` (renter) and
  `modules/admin-service-requests/` (Ops: `admin_support` or
  `admin_reviewer`, the `services` queue).
- **v1 is lead capture, not transactional.** A renter picks
  `mechanical_breakdown` or `accident` and says where they are; an admin
  quotes by hand - a figure, or no `amount_cents` for "subject to
  discussion" (a real state, distinct from "not yet quoted"); the renter
  accepts or cancels. No payment rail and **no computed per-km fare**:
  there's no GPS/routing input to back one, and inventing one repeats the
  fabricated-badge mistake.
- **Ops is emailed whenever it has to act**: a new request, an accepted
  quote ("dispatch") and a cancel after quoting, via `emailDispatch`,
  which escapes the renter's text. The renter isn't notified of their own
  accept. The Ops queue's default "Open" view is `requested` + `quoted` +
  `accepted` (an accepted job most needs someone).
- **Every state change is conditional on the state that was checked**
  (`service-requests/service.ts#transition`, `WHERE id AND status`); the
  loser of a race gets 409 `service_request_changed`.
- `contact_phone` is normalised to E.164 (`lib/identifier.ts#normalizePhone`,
  422 `invalid_phone`); `POST /services/towing` is limited to 5 an hour
  per renter, since each one emails dispatch.
- Customer UI `/towing` (`pages/towing/TowingHome.tsx`, UI3), its own
  public sub-site: the request form is open to visitors, kept in
  `sessionStorage` through sign-in and sent on return (the POST still
  needs an account), with CRAL's phone number for the urgent case and a
  signed-in renter's requests below. `/services/towing` redirects there
  forever, because the quote email's "View request" button pointed at it;
  the email now links `/towing` (still a hardcoded production host). Ops UI
  `pages/services/`, list-and-file idiom.
