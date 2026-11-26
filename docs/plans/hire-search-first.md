# Hire, search first (design)

Status: **approved by the owner, 2026-11-26.** Not built. It replaces H4
of [`hire-that-works.md`](./hire-that-works.md) and reworks part of H3
(PR #110).

## Why

After seeing H3 locally the owner said: "make this like a search
interactive application, I don't want to read content, I immediately want
to hire." The three reading pages (`/cars`, `/trucks`, `/machinery`) sit
between the menu and the search, and the Cars / Trucks / Machinery switch
is a row of tabs on each page. A person who wants to hire should land on
results in one click.

## What the owner decided

- Cars, Trucks and Machinery sit **under "Hire"** in the top menu.
- **A dropdown, not tabs**, for the type on the search page.
- **"Hire" leads to all** vehicles; Cars to cars; Trucks to trucks;
  Machinery to machinery.
- Menu links go **straight to search**, never to a page of content.
- **"Buy and sell" comes before "Hire"**, in the menu and on the home page.
- The few lines kept for Google go **below the results**.

## The design

```
TOP MENU
  Buy and sell   Hire v   Drivers   Towing   Garage   Parts
                  ├ All vehicles  -> /hire
                  ├ Cars          -> /hire?type=cars
                  ├ Trucks        -> /hire?type=trucks
                  └ Machinery     -> /hire?type=machinery

/hire   ONE SEARCH PAGE
  [ Type: All v ] [ County v ] [ Dates ] [ More filters ]      131 found
  results, straight away
  ...
  below the results: 4-5 lines about hiring this type, short FAQ

HOME
  Buy and sell cars            (when its pages exist, see below)
  What do you want to hire?
  [ Type v ] [ County v ] [ Dates ]  [ Search ]
  then the other services, short
```

- **One search page** at `/hire`, built from H3's `HireListingLayout`,
  filters and cards. The `HireSwitch` tabs are replaced by a "Type"
  dropdown (All, Cars, Trucks, Machinery) using the existing
  `components/site/Dropdown.tsx`.
- **Filters follow the type.** All: county, dates, price, sort. Cars add
  gearbox, seats, driver. Trucks add truck type and payload. Machinery
  adds machine type. Changing type keeps county and dates and drops
  filters that no longer apply.
- **Cards keep reading by type**, as H3 built them, so a truck in the
  "All" list still reads like a truck.
- **Title and count follow the type**: "Vehicles on hire", "Cars on
  hire", "Trucks on hire", "Machinery on hire".
- **The reading pages go**: `CarsHome`, `TrucksHome`, `MachineryHome`.
  Redirects, keeping the query string: `/cars` and `/cars/search` to
  `/hire?type=cars`, the same for trucks and machinery. Detail and booking
  pages (`/cars/:id`, `/trucks/:id/request` and the rest) do not move, so
  links in emails and SMS already sent keep working.
- **Home opens with the hire search box.** Submitting goes to `/hire`
  with the choices filled in. The reading sections on home are cut to the
  short trust strip and the other services.
- **"Buy and sell" appears first** in the menu and on home when its pages
  ship (`buy-and-sell-cars.md`, PR CS3b). Until then the menu starts with
  Hire: no link to a page that does not exist.
- **The menu dropdown** opens on click or tap, closes on Escape and on
  outside click, works by keyboard, and is 44px per row on a phone.

## Approaches considered

- **Keep three pages, swap tabs for a dropdown.** Smallest change, but
  "Hire leads to all" has nowhere to go.
- **One page with a type dropdown (chosen).** One place to search, one set
  of code, and "all" is free because the catalog already returns every
  hire vehicle when no group is given.
- **Keep the reading pages and add a search box on top of each.** Still
  three pages to keep in step, and still content first.

## Not doing

- No change to the detail pages, the booking flow or the API beyond what
  the "All" list needs.
- No renter app shell, bottom tabs or signed-in home. That is the product
  review's finding F03 and its own piece of work.

## Left to the builder

- Whether "All" needs anything from the catalog it does not return today
  (a mixed list sorted by price compares per-day, per-trip and quote-first
  listings; say how that is handled, or sort by newest for "All").
- Sitemap and SEO titles for `/hire` and its three typed views; the old
  URLs leave the sitemap.
- The link walk and the 375px check, as in the other hire PRs.
- Update `docs/plans/hire-that-works.md` (H4 replaced) and
  `docs/decisions/customer-portal.md`.

## My calls, for the owner to check

One page instead of three; the old addresses redirect; the reading
sections on home are cut down; "Buy and sell" shows only once it has
pages; the "All" list may sort by newest rather than price.
