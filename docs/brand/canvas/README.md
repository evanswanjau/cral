# Canvas source: `Cruz Public Site Pages.dc.html`

Pulled from a bundled canvas export the owner supplied on 2026-09-17
(`CRAL - Cruz Ride Auto (standalone).html`, ~6.5MB, not itself committed -
it bundles fonts, images and the whole design-tool runtime inline). This
file is the one thing inside it that matters: the actual
`Cruz Public Site Pages.dc.html` design source, reconstructed from the
bundle's `__bundler/template` script block (a JSON-encoded string) plus
its embedded `x-dc` logic component.

**This is the file CLAUDE.md's customer-portal notes have been waiting
on.** C9 (marketing pages), C10 (list your car) and part of C8 were all
built from `packages/ui/src/tokens.ts` and `Home.tsx`'s established idiom
because no canvas tab was reachable in those sessions - each said so in
its own file comment, flagged for a swap once this file turned up.

## What's in it

Everything the design's public site covers, driven by one component's
`state.page`:

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
- `pages` - the seven marketing pages (`works`, `verify`, `corporate`,
  `about`, `help`, `contact`, `legal`) - copy lives in the markup, not the
  logic; there is **no real Terms/Privacy text anywhere in this file**,
  just nav labels. `/legal` still needs real drafting before launch.
- `vertical` - **three** verticals: `parts`, `services`, and `selling`
  (only `parts`/`services` are built in `apps/customer` today)
- Masthead + account dropdown (signed-in/signed-out, merchant vs renter
  framing, a "docs due" indicator)

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
static bundle instead of the live API.

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
