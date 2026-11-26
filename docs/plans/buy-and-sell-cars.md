# Buy and sell cars - the buyer side (design)

Status: **design approved by the owner, 2026-11-26.** Nothing here is
built. Build prompt: [`docs/prompts/buy-and-sell-cars.md`](../prompts/buy-and-sell-cars.md). This is roadmap Phase 6, PR
CS3, split into three. Current rules for what already exists are in
[`docs/decisions/car-sales.md`](../decisions/car-sales.md); that file wins
on anything about listings and the Ops review.

## Why

A merchant can already list a car for sale and Ops already checks each
listing before it goes live (CS1, CS2). Nobody can see those cars. This
adds the half a buyer uses: find a car, look at it properly, and arrange
to see it in person.

In Kenya nobody buys a used car on a website. The buyer calls, goes to see
the car with a mechanic, checks the logbook with NTSA, haggles, pays by
bank and transfers ownership on the NTSA portal. So the honest next step
after "I want this one" is **a viewing**, and that is what the site
arranges.

## Goals

- A **"Buy and sell cars"** section on the home page, placed **before**
  Hire (owner).
- A page listing every car for sale, with filters.
- A car page with everything the seller declared.
- **Request a viewing**: the buyer asks, the seller confirms a time and
  place, and only then do they get each other's phone number.
- A **"Sell your car"** button on these pages that goes to the merchant
  portal's selling sign-up (owner).
- **CRAL earns on every sale** (owner, 2026-11-26): a fixed success fee,
  invoiced to the seller when the car is sold and paid by M-Pesa. This
  replaces the 2026-11-19 "no commission on a sale" decision.
- Ops can see every viewing request and which sellers are not answering.
- **100 cars for sale, with photos**, in the local database and in
  `cral_dev` (owner).

## Not doing

- The price of the car never passes through CRAL: no deposit, no escrow.
  Buyer and seller pay each other. Only the success fee is paid to CRAL.
- No "Buy now", "Reserve" or "Confirm purchase" button.
- No CRAL agent at viewings, no inspection, no transfer paperwork. The
  owner looked at an agent-assisted sale and chose the invoice only
  (2026-11-26).
- No chat thread between buyer and seller.
- No private sellers outside the merchant account check.
- No listing fees or boosts (CS4).

## Would make it a failure even if it works

- A badge or sentence that says "verified" or "inspected". Ops compared
  the listing with the logbook by eye. The page may say exactly that:
  "CRAL checked this listing against the logbook before it went live."
- A seller's phone number readable by someone who has not had a viewing
  confirmed.
- Anything that suggests paying to hold a car.

## Approaches considered

- **A. Enquiry only.** "I'm interested" plus a message; the seller replies
  with a number and CRAL steps out. Smallest, but CRAL adds nothing and
  never learns what happened.
- **B. Viewing request (chosen by the owner).** Matches what people really
  do, keeps numbers private until both sides agree, gives Ops something to
  watch, moves no money.
- **C. CRAL-assisted sale.** Inspection, hosted viewings, transfer, a fee.
  Needs people on the ground. B leaves room for it later.

## What the buyer sees

```
HOME
  [ Buy and sell cars ]          <- new, above Hire
  [ Hire: cars | trucks | machinery ]

/buy   BUY AND SELL CARS                      [ Sell your car ]
  filters: make, price band, year, county, gearbox, body
  Toyota Fielder 2015 · KES 1,450,000 · negotiable · Nairobi · 98,000 km

/buy/:id   ONE CAR
  photos · price · specs
  Declared by the seller: import status, accident history, known faults
  "A bank has a claim on this logbook"        (only when true)
  CRAL checked this listing against the logbook before it went live.
  [ Request a viewing ]        Report this listing
  Before you buy: do an NTSA search · bring a mechanic ·
                  never pay to hold a car · transfer on the NTSA portal

REQUEST A VIEWING
  preferred day · morning / afternoon / evening · optional message

/viewings   MY VIEWINGS
  Waiting for the seller
  Confirmed: Sat 5 Dec, 10:00, Karen · seller Jane W. · 07xx xxx xxx
```

## How a viewing works

1. The buyer must be signed in with a verified phone. One open request per
   buyer per car. At most 5 requests an hour.
2. Several buyers may request the same car. There is no "reserved" state.
3. The seller sees the buyer's first name, preferred day and message. No
   phone number yet.
4. The seller **confirms** with a date, time and place (it may differ from
   what the buyer asked for) or **declines** with a short reason.
5. On confirm, the buyer sees the seller's name and phone, and the seller
   sees the buyer's name and phone. Not before.
6. Either side can cancel a confirmed viewing; the other is told.
7. A request the seller has not answered in 7 days lapses. When a listing
   is sold, withdrawn or taken down, its open requests close and those
   buyers are told.
States: `requested -> confirmed | declined | cancelled | lapsed`, and
`confirmed -> cancelled | done` (`done` is set by the day passing; nobody
has to click it).

## From viewing to sold, and the fee

```
viewing day passes
  -> next day CRAL asks both sides, in the app and by email
       buyer:   Did you buy it?   yes / still deciding / no
       seller:  Did you sell it?  yes, to this buyer / still available
  -> either says yes  =>  sale recorded, listing SOLD, fee invoiced
  -> seller pays the invoice by M-Pesa from the portal
```

1. **Either "yes" records the sale.** A seller cannot avoid the fee by
   clicking "withdrawn": the buyer's answer counts.
2. **The two disagree** (buyer says bought, seller says no): the listing is
   held and the case goes to Ops, who call both and decide. Ops can record
   the sale or dismiss the claim, with a note.
3. **The seller's own "Mark as sold" switch stays.** It asks "who bought
   it?": one of the buyers who viewed, or "someone else". Both raise the
   invoice.
4. **The fee is a fixed shilling amount by price band** of the asking
   price, set by Ops in settings. Never shown as a percentage. The seller
   pays, never the buyer. The amount is frozen on the invoice when it is
   raised, so a later change in settings does not rewrite it.
5. **The seller agrees to the fee before listing**: it is in the merchant
   terms and shown on the listing form with the amount for that car's
   price ("When this car sells, CRAL's fee is KES x").
6. **Invoice:** due in 7 days. Paid by M-Pesa prompt from the portal
   (the existing payment rail). Reminders on day 3 and day 7.
7. **Unpaid after 7 days:** the seller cannot submit a new car for sale
   and their other sale listings are hidden from buyers until it is paid.
   Hire listings are not touched. Ops can waive an invoice with a reason.
8. **A buyer who says "still deciding"** is asked once more after 7 days,
   then left alone.

Ops gets a Sales money view: invoices raised, paid, overdue and waived,
and the disputes waiting for a decision.

Both sides are told in the app and by email at each step, through the
existing notifications. A new request and a confirmation are worth an SMS
if the person has SMS switched on.

## What each side gets

- **Customer app:** home section; `/buy`; `/buy/:id`; the request form;
  `/viewings` with a link in the account menu; the "Report this listing"
  button (its API exists from CS2); "Sell your car" button to the merchant
  portal. A "Buy and sell" entry in the top menu, placed first.
- **Merchant portal:** on a sale listing, its viewing requests with
  confirm / decline / cancel; a count of waiting requests on the "Cars for
  sale" list and nav item.
- **Ops console:** under Sales, a read-only list of viewing requests with
  the listing, both parties and the state, and a filter for requests
  waiting more than 24 hours. Ops does not confirm or decline for anyone.
  Report handling is already built.

## The 100 cars

A seed script, `npm run seed:sales -w apps/api`, following the same rules
and the same photo source the owner picks for the hire seed
(`docs/plans/hire-that-works.md`):

- 100 **live** listings, plus about 10 in other states (draft, waiting for
  review, changes asked, sold) so the merchant and Ops screens are not
  empty.
- About 10 approved seeded sellers, individuals and dealers.
- Makes and models that actually sell in Kenya, prices from about KES
  450,000 to 9,000,000, mileages and years that fit the price, at least 8
  counties, a mix of locally used and foreign used, some negotiable, a few
  with a bank claim declared.
- At least 4 real photos per car, matching the make and body, stored
  through the storage adapter; a placeholder logbook file per listing.
- About 15 viewing requests in mixed states from seeded buyers.
- Safety: refuses production; seeded people share one email domain and
  have no real or verified phone; plates are unique and plainly fake;
  re-runnable without duplicates; `--clear` removes only what it made.
- Local first. On the dev server only when the owner says so.

## Build order

Each is one fresh session and leaves `develop` working. They come **after
the Hire section** (`hire-that-works.md`, PR H2), because both change the
home page and the top menu.

| PR | What | Size |
|----|------|------|
| CS3a | Seed script and 100 cars, run locally | M |
| CS3b | Home section, `/buy`, `/buy/:id`, report button, "Sell your car", sitemap and SEO | M |
| CS3c | Viewing requests: API, buyer screens, merchant screens, Ops list, notifications | L |
| CS3d | After-viewing questions, sale record, "who bought it?", Ops disputes | M |
| CS3e | Success fee: price bands in settings, invoice, M-Pesa payment, reminders, the unpaid lock, Ops money view, fee shown on the listing form and in the merchant terms | L |

CS4 (listing fees and boosts) stays as planned, after these.

## Left to the builder

- Table and ID prefix for viewing requests (a new prefix in
  `packages/types/src/ids.ts`), with every state change a conditional
  update and an audit row in the same transaction, as the listings do.
- Contracts first: extend `openapi/customer-sales.yaml`,
  `merchant-sales.yaml` and `admin-sales.yaml`. Public reads return only
  `live` listings and never the logbook or the plate's owner.
- How public photos are served: copy what the hire catalog does.
- Cursor paging and sort (newest, price up, price down).
- Which notification category the new messages use.
- The invoice table. None exists today (`inv_` is reserved in
  `packages/types/src/ids.ts` and unused). Shape it so CS4's listing fees
  and boosts can use the same table. Paying it goes through
  `applySettlement`, with an `Idempotency-Key`, like every money POST.
- The fee bands ship as a setting with **placeholder amounts clearly
  marked as not agreed**; the owner sets the real ones with the client
  before production. With no bands set, no invoice is raised.
- `docs/decisions/car-sales.md` must be updated in CS3e: "no commission on
  a sale" is replaced, and the sale-page copy changes from "CRAL takes no
  commission" wherever it says so.
- Where "Sell your car" lands in the merchant app
  (`apps/customer/src/lib/merchant-app.ts` already builds those links);
  it should arrive with "Cars for sale" already picked.
- Screens are built from `packages/ui/src/tokens.ts` and the existing
  `components/subsite/` pieces; no canvas file has these screens.

## My calls, for the owner to check

These were proposed, not asked: sign-in and a verified phone to request a
viewing; numbers swapped only on confirm; several buyers per car; the
7-day lapse; Ops watches but never acts on a viewing; 10 extra non-live
listings and 15 viewing requests in the seed; building after the Hire
section. On the fee: the buyer's "yes" counts; fixed amounts by price
band; the seller pays; due in 7 days; an unpaid invoice blocks new sale
listings and hides the seller's other sale listings but leaves hire
alone; Ops can waive.

**Still needed from the owner, before production, not before building:**
the fee amounts for each price band.
