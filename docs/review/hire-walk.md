# Hire walk - before every release

Two halves: a command that runs the eleven walks through the API (nine
for cars, trucks and machines, two for drivers), and a short list of
screens to look at by hand. Plans: H7 of
[`docs/plans/hire-that-works.md`](../plans/hire-that-works.md), and DR5
of [`docs/plans/drivers-that-work.md`](../plans/drivers-that-work.md) for
the driver walks.

## 1. The command

Needs Postgres and Redis up (`docker compose -f infra/docker-compose.yml
up -d`) and the local database migrated (`npm run migrate`). Then:

```bash
npm run walk:hire            # add -- --verbose to see every call and the API output
```

It prints one line per walk and ends with `11 of 11 passed.`:

```
PASS car     merchant sign up, onboard, submit  (suv)
PASS car     ops      approve owner, review, go live  (24 checks)
PASS car     customer find, book, pay, hand over, return  (H-… CB-… completed)
...                                              (same for truck and machine)
PASS driver  only     I only drive, Ops, search by dates, hour rate, pay, driver's code, return  (CB-… 4 h, code from the driver's SMS, completed)
PASS car     + driver car and owner's driver, Ops, book, pay, job SMS, hand over, return  (CB-… car + driver, job SMS, completed)
```

A failure names the step and the API's answer, for example
`step: merchant: submit` / `api: 422 {"error":{"code":"email_not_verified",…}}`,
and the command exits 1. Later walks for the same type are skipped. Each
driver walk is one line: a failure names its step the same way.

**What each walk does**

| Job | Car (SUV, self-drive) | Truck (flatbed 10 t, with driver) | Machine (excavator, serial number, with operator) |
|---|---|---|---|
| Merchant | sign up, email code, owner details, phone code, vehicle, 3 photos, 2 owner + 3 vehicle documents, insurance expiry, terms, submit | same, plus truck type and payload | same, with `registration_kind: serial` and `machine_type` |
| Ops | sign in with the SMS code, owner checklist and documents, approve owner, every vehicle check, 3 documents, approve listing (must be `live`) | same | same |
| Customer | listing opens; it shows on its page (`group=cars`, county); request; owner accepts; pay is refused (`papers_not_cleared`) until Ops clears the ID and licence; pay; console M-Pesa callback; pickup with the emailed code; return; booking `completed` | per trip, "quote me first"; request with route and load; confirm before quote refused (`quote_required`); quote KES 35,000; renter accepts; pay; handover | per day; owner accepts; pay; handover |

**The two driver walks**

| Walk | What it does |
|---|---|
| Driver only (the renter's own car) | Merchant signs up, chooses "I only drive" (`drivers_only`), uploads the owner's ID and KRA PIN and submits with no car; adds a driver (hour and day rates, Nakuru) with licence, ID and KRA PIN and a photo, and submits it. Ops opens the driver's case, approves the owner, accepts the 3 documents and approves the driver (`live`). A second renter, with only a national ID on file, finds the driver in `GET /catalog/drivers` by county, hour rate and the 4 hours wanted (card has a photo); requests by the hour with `hire_car_details`; the owner accepts; pay is refused (`papers_not_cleared`) until Ops clears the ID (no licence needed); pays on the console rail. The driver's "job paid" SMS must reach the driver's phone with the ref and a 4-digit code; the renter enters that code (`POST /bookings/:id/driver-code`) and the booking goes `active` with no owner login. The owner takes the return; booking `completed`. |
| Car with the owner's own driver | Merchant signs up with a self-drive RAV4 (as the car walk) and adds a driver of their own (day rate). Ops approves owner and car (as the car walk), then the driver. The car's page offers that driver (`GET /catalog/vehicles/:id/drivers` -> `source: owner`); the same renter books car + driver by the day, one booking (not linked); owner accepts; pays. The driver's SMS must name the ref and carry **no** code; the owner runs the pickup (code emailed to the renter) and the return; booking `completed`. |

**Why it is safe.** The command never uses an API that is already
running. It starts its own copy of `apps/api` on port 4100 (`WALK_PORT`
to change it) with the email, SMS, payment and disbursement adapters set
to `console` and storage set to `local`, with its queue workers on (the
driver's SMS goes out from one), on Redis database 7 so no other
API's workers pick up its messages. Before it starts, it clears the
sign-up and code rate-limit counters in that database 7 only (sign-up
allows 10 an hour and each run signs up seven accounts), so it can run
back to back. It reads the email and SMS codes from
that copy's output, and only from lines the console adapters print - the
driver's code too, from the console SMS to the driver's phone. It
refuses to start if the database or Redis is not on this machine, if
`NODE_ENV` is production, or if the port is taken, and it stops if the
API it started brings up a real email or SMS provider.

**What it leaves behind.** Each run makes new accounts and plates with the
run number in them (`hire.walk.<run>.car@example.test`, renter
`hire.walk.<run>.renter@example.test`, driver renter
`hire.walk.<run>.driver.renter@example.test`, owners
`hire.walk.<run>.drivers@example.test` and
`hire.walk.<run>.withdriver@example.test`), four live listings, two live
drivers (`Juma Walk<run> 4` and `5`) and five completed bookings. Driver
phones are `+2547<run>45` / `55`, only ever texted through the console
adapter. On the first run it also creates the Ops account
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
