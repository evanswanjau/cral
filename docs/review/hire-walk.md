# Hire walk - before every release

Two halves: a command that runs the nine walks through the API, and a
short list of screens to look at by hand. Plan: H7 of
[`docs/plans/hire-that-works.md`](../plans/hire-that-works.md).

## 1. The command

Needs Postgres and Redis up (`docker compose -f infra/docker-compose.yml
up -d`) and the local database migrated (`npm run migrate`). Then:

```bash
npm run walk:hire            # add -- --verbose to see every call and the API output
```

It prints one line per walk and ends with `9 of 9 passed.`:

```
PASS car     merchant sign up, onboard, submit  (suv)
PASS car     ops      approve owner, review, go live  (24 checks)
PASS car     customer find, book, pay, hand over, return  (H-… CB-… completed)
...                                              (same for truck and machine)
```

A failure names the step and the API's answer, for example
`step: merchant: submit` / `api: 422 {"error":{"code":"email_not_verified",…}}`,
and the command exits 1. Later walks for the same type are skipped.

**What each walk does**

| Job | Car (SUV, self-drive) | Truck (flatbed 10 t, with driver) | Machine (excavator, serial number, with operator) |
|---|---|---|---|
| Merchant | sign up, email code, owner details, phone code, vehicle, 3 photos, 2 owner + 3 vehicle documents, insurance expiry, terms, submit | same, plus truck type and payload | same, with `registration_kind: serial` and `machine_type` |
| Ops | sign in with the SMS code, owner checklist and documents, approve owner, every vehicle check, 3 documents, approve listing (must be `live`) | same | same |
| Customer | listing opens; it shows on its page (`group=cars`, county); request; owner accepts; pay is refused (`papers_not_cleared`) until Ops clears the ID and licence; pay; console M-Pesa callback; pickup with the emailed code; return; booking `completed` | per trip, "quote me first"; request with route and load; confirm before quote refused (`quote_required`); quote KES 35,000; renter accepts; pay; handover | per day; owner accepts; pay; handover |

**Why it is safe.** The command never uses an API that is already
running. It starts its own copy of `apps/api` on port 4100 (`WALK_PORT`
to change it) with the email, SMS, payment and disbursement adapters set
to `console` and storage set to `local`, on Redis database 7 so no other
API's workers pick up its messages. Before it starts, it clears the
sign-up and code rate-limit counters in that database 7 only (sign-up
allows 10 an hour and each run signs up four accounts), so it can run
back to back. It reads the email and SMS codes from
that copy's output, and only from lines the console adapters print. It
refuses to start if the database or Redis is not on this machine, if
`NODE_ENV` is production, or if the port is taken, and it stops if the
API it started brings up a real email or SMS provider.

**What it leaves behind.** Each run makes new accounts and plates with the
run number in them (`hire.walk.<run>.car@example.test`, renter
`hire.walk.<run>.renter@example.test`), three live listings and three
completed bookings. On the first run it also creates the Ops account
`hire.walk.ops@example.test` (local only, password in the script, override
with `WALK_OPS_EMAIL`, `WALK_OPS_PHONE`, `WALK_OPS_PASSWORD`). Nothing is
seeded and nothing touches the dev server.

**What it does not prove.** It drives the API the way the portals do; it
never clicks a screen. The screens are the list below.

## 2. The screens, by hand

Use the accounts and bookings the command just made, so every screen has
data. Look at each at **375 px** (phone) and **1280 px** (laptop). On
every screen: no sideways scroll at 375, buttons at least 44 px tall,
nothing cut off, the right words for the type (truck, machine, car).

### Customer (`apps/customer`, :5173)

- [ ] `/` - the Hire block shows Cars, Trucks, Machinery with live counts.
- [ ] `/hire` - All vehicles, Cars, Trucks, Machinery switch; the walk's
      three listings show under the right one, and only there.
- [ ] `/cars/search`, `/trucks/search`, `/machinery/search` - filters for
      that type; a truck card says "Price by quote" when quote-first; a
      machine card has no seats.
- [ ] `/cars/:id`, `/trucks/:id`, `/machinery/:id` - photos, price, owner
      block says "listing(s)", not "car" for a truck or machine.
- [ ] `/cars/:id/book` (self-drive) asks for ID and licence;
      `/trucks/:id/request` asks for route, load and ID only;
      `/machinery/:id/book` asks for ID only.
- [ ] `/bookings/:id` - "Papers being checked - pay once cleared" before
      Ops clears; Pay after; paid and completed states read plainly.

### Merchant (`apps/merchant`, :5174)

- [ ] `/join` then `/onboarding` - sign-up email code; vehicle form reads
      "Add a truck" / "Add a machine"; a machine takes a serial number and
      has no transmission; at least 3 photos; Review blocks on an
      unverified email with the "Verify your email" card.
- [ ] `vehicles`, `vehicles/:vehicleId` - the truck shows per trip and
      "quote me first"; no seats on truck or machine.
- [ ] `bookings`, `bookings/:bookingId` - request, quote (truck), accept,
      pickup code entry, condition, return. **No commission percentage and
      no hirer deposit anywhere.**

### Ops (`apps/admin`, :5175)

- [ ] Sign in with the SMS code.
- [ ] `merchants/:merchantId` - owner checklist and documents, approve.
- [ ] `vehicles/:vehicleId` - checklist per type (truck and machine have
      more checks than a car), documents, approve, goes live.
- [ ] `renters`, `renters/:userId` - waiting count in the nav; clearing
      the ID (and licence for self-drive) unlocks the renter's Pay.
- [ ] `bookings/:bookingId` - the walk's bookings show paid and completed.

Write what you saw (pass, or the screen, width and what was wrong) in the
release notes or `docs/review/hire-proof.md`.
