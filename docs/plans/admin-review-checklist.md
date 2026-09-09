# Admin review — two gates + a working checklist

> **BUILT 2026-09-09** (owner said "proceed" with the recommendations
> below). Steps A-C shipped in one pass: the side-nav trim, the two-gate
> split, the vehicle + merchant checklists, and the note pre-fill.
> Migration `20260909090000`. The **recommended starting set** from §B was
> seeded (~16 vehicle items, ~15 merchant items) — the rest of the menu
> stays here for when Settings → Review rules can add them. Open questions
> were resolved as proposed: an unapproved merchant blocks car approval;
> business approval is the merchant file only; `admin_reviewer` does both;
> "Reopen review" is a button.
>
> **Revised same day**: vehicle checklist items now hang under a
> `document` and render as an accordion on each document row (not one flat
> panel); passing all of a document's MUST-PASS items auto-accepts it; the
> "Automatic checks" panel was pulled from the case screen (the checks
> still run); `ins_psv` / `driver_ins` / `xdoc_plate` dropped, `ins_current`
> (manual insurance-expiry) added. Merchant file unchanged. Migration
> `20260909090000` edited in place. See CLAUDE.md for the full note.
>
> Original proposal below, kept as the design record.

---

> Proposal, owner to decide. Grew out of PR 3 feedback: the vehicle-review
> approve gate re-asks for the merchant's own documents on every car, and
> there is no structured checklist to work through or to build a rejection
> note from.

Three things here:

- **A.** Split "approve the merchant" from "approve the car" — two gates,
  not one. The merchant's documents are reviewed once; an approved
  merchant's new car only needs its *car* documents checked.
- **B.** A comprehensive review checklist (merchant set + car set) — the
  full menu for the owner to trim.
- **C.** The mechanic — how a checklist is stored, shown, gates the
  decision, and pre-fills the "request changes" / "reject" note.

Done already (this same round): the **YOUR QUEUE / DECIDED TODAY cards
under the nav are removed**, and the side nav now lists only built
screens (Vehicles, Merchants).

---

## A. Merchant approval vs. car approval — the two-gate model

### Where it stands

`merchants.approved_at` exists and nothing sets it. The vehicle approve
gate (`decideListing` → `approve`) currently requires **five** documents
`review_state = 'ok'`:

| set | kinds | really belongs to |
|---|---|---|
| car | `logbook`, `comprehensive_insurance`, `tracker_certificate` | the vehicle |
| account | `national_id`, `kra_pin` | the merchant |

Account docs already carry across a merchant's cars (their row has
`vehicle_id = null`), but a new merchant's **first** car still drags the
reviewer through `national_id` + `kra_pin`, and a *company* merchant's
`certificate_of_incorporation` / `company_kra_pin` / `cr12` aren't in the
gate at all today.

### Proposed

Two independent decisions, each with its own document set and its own
checklist:

| gate | who does it | document set | checklist | result |
|---|---|---|---|---|
| **Merchant approval** | once per merchant, on the **merchant file** | individual: `national_id`, `kra_pin` · company: `+ certificate_of_incorporation`, `company_kra_pin`, `cr12` | the **merchant checklist** (§B.1) | sets `merchants.approved_at`, `✓ VERIFIED` chip goes live, merchant is notified |
| **Car approval** | once per vehicle, on the **case screen** | `logbook`, `comprehensive_insurance`, `tracker_certificate` (+ conditional: `driving_licence` when chauffeured, `ntsa_inspection` when PSV — see §B.2) | the **car checklist** (§B.2) | `vehicles.status = live` |

**The car approve gate becomes:** every *car* document `ok`
**and** every *blocking* car checklist item passed **and**
`merchants.approved_at IS NOT NULL`.

- An **approved merchant's** new car: the case screen shows the account
  documents as read-only "Verified with the account · <date>" context —
  no Accept/Reject buttons, they don't count toward `outstanding` — and
  `can_approve` turns on as soon as the three car documents and the car
  checklist are clear.
- An **unapproved merchant's** car: the account documents show with a
  "The business isn't approved yet" note and a link to the merchant file;
  `can_approve` stays false with `outstanding` reporting
  `merchant_not_approved`. The reviewer can still accept the car documents
  and work the car checklist so the case is ready the moment the business
  clears.

**`platform_settings` splits accordingly** (PR 2's seam):

```
vehicle_review.required_document_kinds   → [logbook, comprehensive_insurance, tracker_certificate]
merchant_approval.required_document_kinds → { individual: [national_id, kra_pin],
                                             company:    [national_id, kra_pin,
                                                          certificate_of_incorporation,
                                                          company_kra_pin, cr12] }
```

### New backend (this becomes admin Phase-3 "Slice 2", brought forward)

- `GET /admin/merchants/{id}` (extend) — add the account/business
  documents with their `review_state`, and `can_approve` /
  `outstanding` for the merchant gate.
- `POST /admin/merchants/{id}/documents/{kind}/decision` — accept/reject
  an account document (mirror of the vehicle one; `Idempotency-Key`).
- `POST /admin/merchants/{id}/approve` — requires the account set `ok`
  and the merchant checklist blockers passed; sets `approved_at`, audits,
  notifies. `POST .../revoke` (or `/reopen`) for the reverse — sets
  `approved_at = null`, which already reopens vehicle review the way
  `reviewProfileChange` does.
- The vehicle case's `serializeCase` learns the split (account docs →
  context, gate reads `approved_at`).

Screens: the merchant file grows a "Business documents" panel + the
merchant checklist + an "Approve business" button; the case screen's
document list is relabelled and the account rows go read-only when
approved.

---

## B. The review checklist — full menu

Each item below is written as a **pass condition** (what "good" looks
like). My call on each: **[BLOCK]** = must pass before approve is
allowed · **[FLAG]** = recorded, doesn't block, feeds the note ·
**[AUTO]** = the system can check it, no human needed ·
**[DROP]** = suggest leaving out for now.

`when:` marks items that only apply in some cases.

### B.1 Merchant checklist (run once, at merchant approval)

**Identity — individual**

| # | Pass condition | Call |
|---|---|---|
| M1 | National ID uploaded, both sides, legible, corners in frame | **[BLOCK]** |
| M2 | Name on the National ID matches the account owner name entered | **[BLOCK]** |
| M3 | KRA PIN certificate name matches the National ID name | **[BLOCK]** |
| M4 | KRA PIN on the certificate matches the PIN entered, and the format is valid (`A########?`) | **[AUTO]** format, **[FLAG]** match |
| M5 | ID number is not already tied to another CRAL account | **[AUTO]** |
| M6 | Face on the ID is plausibly one person, not visibly tampered | **[FLAG]** |

**Identity — company** (`when: owner_type = company`)

| # | Pass condition | Call |
|---|---|---|
| M7 | Certificate of Incorporation uploaded, legible, shows a registration number | **[BLOCK]** |
| M8 | Company name on the certificate exactly matches the company name entered | **[BLOCK]** |
| M9 | Incorporation number on the certificate matches `company_cert_no` entered | **[BLOCK]** |
| M10 | Company KRA PIN certificate uploaded; PIN format valid (`P########?`); name matches the company name | **[AUTO]** format, **[BLOCK]** match |
| M11 | **CR12 is dated within the last 12 months** | **[BLOCK]** |
| M12 | The contact person on the account appears on the CR12 as a director/shareholder — or an authority letter / board resolution is attached | **[BLOCK]** |
| M13 | Company status is active / not struck off (from the CR12, or a registry check) | **[FLAG]** |
| M14 | Physical address on file is a real, specific business address | **[FLAG]** |

**Cross-document & risk (both)**

| # | Pass condition | Call |
|---|---|---|
| M15 | Every document names the **same** entity (ID ↔ KRA ↔ cert all agree) | **[BLOCK]** |
| M16 | No document shows signs of alteration (font/stamp/alignment mismatch, edited fields) | **[FLAG]** |
| M17 | Payout M-Pesa / bank name matches the account owner or company name | **[FLAG]** (becomes **[AUTO]** when spec §10's KES 1 name-lookup is built) |
| M18 | Contact phone is verified | **[AUTO]** (already gated at onboarding) |
| M19 | No prior CRAL account for this person/company was suspended or closed for cause | **[AUTO]** |
| M20 | Contact email is plausible (company domain, or a real personal address) | **[DROP]** — low signal |

### B.2 Car checklist (run per vehicle, at car approval)

**Logbook (NTSA copy of records / title)**

| # | Pass condition | Call |
|---|---|---|
| V1 | Logbook uploaded, all pages, legible | **[BLOCK]** |
| V2 | Registration on the logbook matches the plate entered | **[BLOCK]** |
| V3 | Registered owner on the logbook matches the merchant account name (individual) or the company / a named director — **or** a signed lease/management agreement + the registered owner's ID is attached | **[BLOCK]** |
| V4 | Make, model and year of manufacture on the logbook match what the merchant entered | **[FLAG]** |
| V5 | Engine number and chassis/VIN are present and legible | **[FLAG]** — fraud paper-trail |
| V6 | Body type / vehicle class on the logbook is consistent with the CRAL category chosen | **[FLAG]** |
| V7 | Seating capacity on the logbook is consistent with the seats entered | **[FLAG]** |
| V8 | No visible caveat / not flagged stolen on the logbook | **[FLAG]** (**[AUTO]** if an NTSA/registry check is ever wired) |

**Insurance**

| # | Pass condition | Call |
|---|---|---|
| V9 | Certificate is **comprehensive**, not third-party only | **[BLOCK]** |
| V10 | Cover is in date — start ≤ today ≤ end | **[AUTO]** (the `insurance_expiry` check already half-does this) |
| V11 | Registration on the insurance certificate matches the plate | **[BLOCK]** |
| V12 | Insured name matches the merchant / registered owner | **[FLAG]** |
| V13 | `when: chauffeured or category in (van, shuttle)` — a **PSV / commercial** endorsement is present | **[BLOCK]** |
| V14 | `when: self-drive` — the policy permits hire / "hire and reward" use | **[FLAG]** |
| V15 | Sum insured is plausible for the vehicle's value | **[DROP]** — hard to judge without a valuation feed |

**Tracker** (`when: daily_rate ≥ platform_settings tracker threshold`, currently KES 8,000)

| # | Pass condition | Call |
|---|---|---|
| V16 | Tracker certificate uploaded | **[BLOCK]** |
| V17 | Tracker provider is NTSA-licensed / on CRAL's recognised list | **[FLAG]** |
| V18 | The tracker certificate names this vehicle's registration | **[BLOCK]** |
| V19 | Tracker subscription is current (install / renewal date, not lapsed) | **[FLAG]** |

**Photos & listing quality**

| # | Pass condition | Call |
|---|---|---|
| V20 | At least three photos: ¾ front, interior, rear | **[AUTO]** (gated at submission) |
| V21 | The plate is visible in at least one photo and matches the plate entered | **[FLAG]** |
| V22 | Photos are of a real, specific vehicle — not stock / marketing renders | **[FLAG]** |
| V23 | No major visible damage that contradicts "available for hire" | **[FLAG]** |
| V24 | Odometer reading entered is plausible for the year (not 0, not absurd) | **[FLAG]** |
| V25 | Daily rate sits in a sane band for the category and year | **[FLAG]** advisory |
| V26 | County + pickup address are specific enough for a hirer to find | **[FLAG]** |
| V27 | The driver toggle (chauffeured / self-drive) is consistent with the insurance class checked in V13/V14 | **[FLAG]** |

**Cross-document consistency**

| # | Pass condition | Call |
|---|---|---|
| V28 | Registration is identical across logbook, insurance and tracker certificate | **[BLOCK]** |
| V29 | No other live CRAL listing carries this plate | **[AUTO]** (the duplicate-plate check) |
| V30 | Owner name is consistent across logbook and insurance | **[FLAG]** |

**Regulatory depth — optional**

| # | Pass condition | Call |
|---|---|---|
| V31 | `when: PSV / commercial` — a current NTSA annual inspection certificate is on file | **[DROP]** for launch, **add later** — needs a new document kind + merchant-side collection |
| V32 | `when: PSV` — county PSV licence / sticker | **[DROP]** — same |

### My recommended starting set

If you want a lean first cut: **all [BLOCK] items**, plus V21, V22, V23,
V27, M11, M12 as [FLAG]. That is ~10 merchant checks and ~14 car checks —
enough to be a real gate without turning every review into a 30-point
form. Everything marked [AUTO] the system fills in; the human only
touches [BLOCK]/[FLAG] rows that aren't already green.

---

## C. The mechanic

### Shape of a checklist item

Defined in data (seeded into `platform_settings` or a
`review_checklist_items` table, so Settings → Review rules edits them
later — same seam as PR 2):

```
{
  id:            "V3",
  scope:         "vehicle" | "merchant",
  group:         "Logbook",
  label:         "Registered owner matches the account",
  help:          "The name on the logbook is the merchant, their company, or a named director — or a signed management agreement + owner ID is attached.",
  severity:      "block" | "flag",
  applies_when:  null | "company" | "chauffeured" | "rate_over:800000" | "psv",
  auto:          false,                          // true → the system evaluates it, no human toggle
  reject_phrase: "The name on the logbook does not match your account or company registration. Upload a logbook in your name, or a signed management agreement plus the owner's ID.",
  changes_phrase:"Please confirm ownership: upload a logbook in your name, or a management agreement plus the owner's ID."
}
```

### Storage of a review's answers

One row per (case, item): `vehicle_review_checks` /
`merchant_review_checks` — `entity_id`, `item_id`, `result`
(`pass` / `flag` / `pending`), `note` (optional, reviewer's own words),
`checked_by`, `checked_at`. Persisted so a second reviewer sees what the
first checked, and so "Decided today" style reporting can show thoroughness.

### On screen

- The **car checklist** renders on the case screen, below "Automatic
  checks", grouped (Logbook / Insurance / Tracker / Photos /
  Consistency). Each row: the label + help, and — for non-`auto` rows —
  a **Pass / Flag** toggle and a small note field. `auto` rows show the
  computed result read-only (green tick / amber flag) and reuse the
  existing `lib/vehicle-checks.ts` outputs where they already exist.
- The **merchant checklist** renders the same way on the merchant file,
  next to the business-documents panel.
- A header count: "6 of 14 checked · 2 flagged".

### Feeding the decision

- **Approve & publish** is allowed only when every `severity: block` item
  that `applies` is `pass` (in addition to the document `ok` gate). A
  blocking item still `pending` disables the button with "Work the
  checklist first — N blockers outstanding".
- **Request changes** / **Reject** modal: the note textarea is
  **pre-filled** from the `changes_phrase` / `reject_phrase` of every
  item currently `flag`ged (or, for a blocker, still `pending`),
  concatenated as a bulleted list, plus any per-row notes the reviewer
  typed. The reviewer edits freely before sending — this replaces the
  fixed `REASON_TEMPLATES` with something built from what they actually
  found. The canned templates stay as a "common reasons" quick-add.
- The merchant already reads `reviewer_note` verbatim on their Vehicles
  screen, so nothing changes merchant-side.

### Audit

The approve/changes/reject `audit_log` row's `after` payload carries the
checklist snapshot (which items passed / flagged / were skipped), so a
decision is reconstructable later. Same transaction as the decision,
per the non-negotiable.

---

## D. Suggested build order

1. **Checklist data + storage + read** — seed the recommended set into
   `platform_settings`, add the `*_review_checks` tables, extend
   `GET /admin/vehicles/{id}` with `checklist` (items + this case's
   answers). No UI yet. `POST /admin/vehicles/{id}/checklist` to set one
   item's result.
2. **Car checklist on the case screen** — render it, wire the toggles,
   gate **Approve** on blockers, pre-fill the changes/reject note from
   flags. This is the highest-value half and stands alone.
3. **The two-gate split** — `merchant_approval.required_document_kinds`,
   the merchant-file business-documents panel + accept/reject +
   `POST /admin/merchants/{id}/approve`, the case screen's account-docs-
   go-read-only-when-approved behaviour. (This is admin Slice 2, minimal.)
4. **Merchant checklist** on the merchant file, same mechanic as step 2.

Steps 1–2 don't need the two-gate work and could ship first if you want
the checklist sooner than the merchant-approval flow.

---

## Open questions for the owner

1. **Which checklist items** from §B (the [DROP]s especially — NTSA
   inspection, PSV licence, sum-insured sanity)?
2. **Does an unapproved merchant block car approval outright**, or can a
   car be approved and go live for a not-yet-verified business? (Proposal:
   block — don't publish a car for an unverified merchant.)
3. **Can a reviewer approve the business from inside a car case**, or only
   from the merchant file? (Proposal: merchant file only — keeps the two
   decisions visibly separate, which is the whole point.)
4. **Who can do what** — is merchant approval `admin_reviewer`, or does it
   want `admin_super` / a dedicated `admin_compliance`? Car approval stays
   `admin_reviewer` + the `vehicles` queue.
5. **Revoking `approved_at`** — a button, or only ever a side effect of an
   approved profile-change / a suspension?
