# Canvas source: `Cruz Ride Auto - Website.dc.html`

Pulled from a bundled canvas export the owner supplied on 2026-09-17
(`CRAL - Cruz Ride Auto (standalone).html`, ~6.5MB, not itself committed -
it bundles fonts, images and the whole design-tool runtime inline). This
file is the one thing inside it that matters: the actual canvas source,
reconstructed from the bundle's `__bundler/template` script block (a
JSON-encoded string).

**Correction, same session:** this was first extracted and committed under
the name `Cruz Public Site Pages.dc.html`, on the assumption that it was
the marketing-pages file CLAUDE.md's customer-portal notes had been
waiting on. That was wrong, caught by checking the file itself rather than
trusting the first read - see CLAUDE.md's own "a plan document is not
evidence" rule, which applies just as much to a first guess about a
design file's identity. The real picture:

- **This file is `Cruz Ride Auto - Website`** - the file CLAUDE.md's
  Design-tokens section already names as the canvas for home/browse/
  detail/booking/auth/list/the verticals. Confirmed by its own content:
  `state.page` switches between exactly those pages, and there is no
  marketing-page copy anywhere in it.
- **`Cruz Public Site Pages.dc.html` is a *separate* file this one
  imports** (`<dc-import name="Cruz Public Site Pages" page="{{subPage}}">`
  for the `pages` state - `works`/`verify`/`corporate`/`about`/`help`/
  `contact`/`legal`) and is listed in the bundle's own
  `__bundler/ext_resources` block as an external dependency, the same way
  the car photos and the logo are - **not embedded**. The bundle only
  ships the file that was open when it was exported. **The seven
  marketing pages are still not pulled** - C9's flag stands exactly as it
  was.

## What's actually in this file

Driven by one component's `state.page`:

- `home` - hero, search, collection rails, facts strip
- `browse` - filter rail, Cards/List, sort, result count
- `detail` - gallery, spec grid, owner card, quote panel
- `booking` - six stages: review, waiting, pay, stk (STK push), done, plus an
  inline account/sign-up stage
- `auth` - sign-in/sign-up tabs, **includes a phone-OTP tab
  (`authByPhone`/`authAtOtp`) that contradicts the 2026-08-24 "SMS is only
  ever a 2FA challenge" decision** - reproduce this screen without that
  tab, the same call the merchant portal made on its own auth screens.
- `list` - the "list your car" 3-stage onboarding form
- `vertical` - **three** verticals: `parts`, `services`, and `selling`
  (only `parts`/`services` are built in `apps/customer` today). Each is
  driven by one shared template off a `kicker`/`title`/`sub`/`status`/
  `points`/`ask`/`askPh` data shape - see `vertDefs` in the logic block.
  The "Tell me when it opens" card's `submitNotify` is **client-state
  only in the design** (`this.setState({ notifySent: true })`, no
  request anywhere) - reproducing that as a real UI would be the same
  fake-success shape `Contact.tsx`'s own comment already refuses
  ("a form with no backend behind it... is a fake 'we'll get back to
  you'"). Built instead as a real `mailto:hello@cral.co.ke` hand-off,
  the same channel Contact already uses.
- Masthead + account dropdown (signed-in/signed-out, merchant vs renter
  framing, a "docs due" indicator) - `apps/customer` never has a merchant
  signed in, so only the renter branch is reproduced; see
  `components/site/AccountMenu.tsx`'s own comment for the two rows
  handled as flag-not-fabricate.
- `pages` (the marketing pages) - **empty in this file**, just the
  `<dc-import>` above. Not usable for C9.

## How it was reconstructed

The design tool authors every screen as plain HTML with 100% inline
styles. The bundle wraps that in a `<script type="__bundler/template">`
tag whose text content is a JSON string (so it round-trips through
`JSON.parse`) containing the full `<html>` document, which itself embeds
the component's logic in a `<script data-dc-script>` tag inside `<x-dc>`.

Extraction, in order:

1. Find the `__bundler/template` script block in the bundle.
2. `JSON.parse()` its text content to get the real HTML document (handles
   the `\"`/`\n` escaping).
3. That document *is* this file - saved as-is, markup and logic both
   intact under `<x-dc>`.

No `ListFiles`/`GetFile` API call was needed this time because the owner
supplied the bundle directly rather than a live canvas link - the
extraction is the same idea as the `ListFiles`/`GetFile` flow in
CLAUDE.md's "Getting the real screen source" section, just against a
static bundle instead of the live API. That flow (or a fresh bundle
export of `Cruz Public Site Pages` specifically) is still what's needed
to unblock C9's marketing-page copy.

## Using it

Read the inline `style="..."` attributes for exact `clamp()`, hex and
`font-variation-settings` values - same rule as every other canvas file
CLAUDE.md documents. The `sc-if value="{{flag}}"` blocks mark each
page/stage's markup boundary; grep for `page === '<name>'` in the
`<script data-dc-script>` block to find where a page's derived-props logic
lives.

Verify against `getComputedStyle` once built, not by eyeballing this file
rendered - it's still just a read of the source, not a screenshot, but
CLAUDE.md's rule against trusting a screenshot for the *result* still
applies.
