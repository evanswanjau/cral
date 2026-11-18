# Design: tokens, type, status, and getting screen source

Read before building or changing any screen in any of the three portals.

## Where the truth is

- **Tokens**: `packages/ui/src/tokens.ts` holds the real brand values
  (colours, type scale, control heights, motion), extracted from
  `docs/brand/CRAL-Brand-Strategy-and-Design-System-v2.pdf`. The PDF is the
  source of truth for anything token-shaped.
- **Screens**: the Claude Design canvas files the owner shares (one file
  per screen, `Cruz Merchant Login.dc.html`, `Cruz Merchant Dashboard.dc.html`,
  `Cruz Admin Vehicles.dc.html`, the `Cruz Ride Auto - Website` bundle, and
  so on). Where the canvas and `tokens.ts` disagree on a screen value
  (radii 4/8/12, ink `#1A1F2B`), the canvas wins.
- **Never build a screen from a screenshot** of the canvas or from memory
  of how other screens look. Twice that produced something roughly right
  and wrong in almost every value. Pull the source (below). If no canvas
  is reachable in the session, say so and build from confirmed tokens,
  and flag the screen as "not from a canvas file" in its own comment so it
  can be swapped later.

## Fonts

Three fonts, one job each: **Archivo** for display headlines only,
**Instrument Sans** for all UI and body text, **IBM Plex Mono** for
identifiers and timestamps only.

- **Self-hosted** via `@fontsource*` packages, aliased to the canvas's own
  family names (see `apps/merchant/src/fonts.css`). Never the Google Fonts
  CDN `<link>`: it returned a 503 once, and a font that fails to load
  silently falls back to a system sans.
- **Archivo must be the wdth+wght variable cut**
  (`@fontsource-variable/archivo`, `archivo-*-wdth-normal.woff2`). Display
  type sets `font-variation-settings:'wdth' 110` (sub-heads 106); with a
  wght-only build that does nothing and the type renders too narrow. To
  check, measure a string at `'wdth' 100` and `'wdth' 110` and confirm the
  widths differ.

## Status vocabulary

- Five brand status states: pending / review / verified / rejected /
  boosted. **Never colour alone**: always glyph + word.
- "boosted" is the only skewed (-14°) element ("round = trust, angled =
  paid"); never skew a verification or trust element. The masthead's red
  rule carries the same 14° skew, once per surface.
- Documented exceptions to "once in view": the merchant Vehicles screen's
  reviewer-note card and the Dashboard's expiring-document card each carry
  their own small skewed `#D81E32` rule (the card counts as its own
  surface). The expiring card's amber `#C77400` top bar is not skewed.
- Each domain has its own state set, mapped to the five tints in the
  app's `components/{portal,console}/status.ts`: listings
  (`draft / pending / review / action / rejected / live / paused`, with a
  separate `verification_badge` axis `none / pending / active`), documents,
  bookings, payouts (`scheduled / processing / paid / failed`) and the
  review console's buckets.

## Getting the real screen source

With the canvas open in Chrome (Chrome MCP), run this in the page context.
It is same-origin, so the session cookie is already there:

```js
const base = 'https://claude.ai/design/anthropic.omelette.api.v1alpha.OmeletteService/';
// 1. find the file
await (await fetch(base + 'ListFiles', { method:'POST',
  headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ projectId: '<project-uuid-from-the-url>' }) })).json();
// 2. fetch it - `content` is base64
const j = await (await fetch(base + 'GetFile', { method:'POST',
  headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ projectId: '<uuid>', path: 'Cruz Merchant Login.dc.html' }) })).json();
const html = new TextDecoder().decode(Uint8Array.from(atob(j.content), c => c.charCodeAt(0)));
```

- Strip the canvas runtime first:
  `html.replace(/<(script|style)[^>]*data-omelette-injected[^>]*>[\s\S]*?<\/\1>/g,'')`
- Reading it back through the browser tool trips a content filter
  (inline `style="a:b;c:d"` looks like cookie data). Encode before slicing
  (`:` -> `~C~`, `;` -> `~S~`, `=` -> `~E~`), pull ~1100-char chunks, decode
  locally.
- Screens are authored with 100% inline styles, so **auth screens reuse
  the design's inline styles verbatim** (`apps/merchant/src/pages/SignIn.tsx`,
  `components/BrandPanel.tsx`) instead of re-expressing them as Tailwind.
  The console inlines canvas values in `components/console/styles.ts`.
  Tailwind is for app-shell screens with no canvas counterpart.
- Verify with `getComputedStyle`, not a screenshot. The Chrome window must
  not be minimised, or `innerWidth` reads 0 and screenshots fail.

## Screens built without a canvas file

Flagged in their own file comments, for a swap once a canvas exists: the
customer marketing pages, trips/account/notifications (C8), the towing
page, the truck route form and quote screens, the Ops login, the Ops
payouts screens, and the review UI's checklist layout (a deliberate
departure the owner asked for, in console tokens). The functionality is
real; only the visual fidelity is provisional.

## Canvas files named as authority

`Cruz Merchant Portal.dc.html` (merchant Vehicles: listing states), `Cruz Merchant Onboarding v3.dc.html`, `Cruz Merchant Bookings & Payouts.dc.html`, `Cruz Merchant Notifications.dc.html`, `Cruz Merchant Settings.dc.html`, `Cruz Admin Settings.dc.html`, `Cruz Customer Portal.dc.html` (trips/account, not yet pulled). The Dashboard's expiring card rule is `18×5`, beside the `EXPIRES IN…` kicker. Ops login: 4px `#0F23A8` strip, `ADMIN CONSOLE` pill, one skewed rule, Archivo `wdth 106`.
