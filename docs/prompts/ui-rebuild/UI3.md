# UI3 - Drivers and towing sub-sites

Model: **Opus**. Size: M. Branch: `feature/ui3-drivers-towing`.
Needs UI2b merged.

> You are building PR UI3 of CRAL's Phase 2 UI rebuild. Read
> `docs/prompts/ui-rebuild/README.md` (rules and finish steps) first, then
> `docs/decisions/drivers.md` and `docs/decisions/services.md`.
>
> **Goal.** A visitor can look at drivers and at towing without signing
> in. `/drivers` becomes a sub-site landing with the list, a driver's
> profile is public, and only the request asks for an account. Towing
> moves to a public `/towing` whose form survives sign-in.
>
> **Read only:** proposal (`docs/plans/ui-services-proposal.md`) sections
> 1.1 rows D1-D4 and S1, 4.3 (Drivers and Towing columns), 6.1 row
> `/services/towing`, 6.4 (towing row); `lib/services.ts`;
> `components/subsite/*`; `pages/Drivers.tsx`, `DriverDetail`/
> `DriverBook.tsx`, `Towing.tsx`; in `Booking.tsx` only the phone-verify
> stage (around line 746); `routes.tsx`;
> `apps/api/src/modules/admin-service-requests/service.ts` around line 190.
>
> **Build.**
>
> 1. `/drivers`: `SubsiteHero` (county filter as the task), the existing
>    list, `HowItWorksSteps` 4, `PriceExplainer` (per day, hour or trip),
>    `FaqList` 4-5, `EarnBand` -> merchant `/`. Keep `Drivers.tsx` under
>    ~400 lines.
> 2. `/drivers/:id` outside `RequireAuth` (D1): `GET /catalog/drivers/:id`
>    is already public. The request button sends a signed-out visitor to
>    `/sign-in?next=` and back.
> 3. D4: extract `components/subsite/PhoneVerify.tsx` from `Booking.tsx`'s
>    verify stage (moving code out, so `Booking.tsx` shrinks) and run it
>    inline in `DriverBook.tsx` instead of linking to `/account`.
> 4. `pages/towing/TowingHome.tsx` at `/towing`, public: `SubsiteHero`
>    with the request form; `HowItWorksSteps` 3 (tell us where you are,
>    CRAL quotes, settled on the call); `PriceExplainer` (quoted per job);
>    `FaqList` 4-5; no `EarnBand` (CRAL dispatches). Signed out, the form
>    is kept in `sessionStorage` through sign-in and sent after. Show
>    CRAL's phone number for the urgent case (use the number the site
>    already shows). Signed in, "Your requests" below.
> 5. `/services/towing` -> `<Navigate to="/towing" replace />`, kept
>    forever (emailed links). API, the one allowed change:
>    `admin-service-requests/service.ts:190` "View request" link ->
>    `/towing`, built from the configured customer URL if the module has
>    one, and `routes/sitemap.ts` gains `/towing` (update its test).
> 6. Registry: drivers `href` `/drivers`, towing `href` `/towing`.
>
> **Don't touch:** cars, trucks, machinery pages, `Home.tsx`, the merchant
> app, payments, any other API file.
>
> **Acceptance.** Signed out: open `/drivers`, a driver, and `/towing`
> with no sign-in wall; fill the tow form, sign in, the request is sent
> with the same details; book a driver with inline phone verify. Old
> `/services/towing` lands on `/towing`. `scrollWidth <= 375` on all
> three. Link check reports nothing new.
>
> **Finish:** README "Finish" steps. Commit message:
> "Open drivers and towing to visitors as their own sub-sites".
