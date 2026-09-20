import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "../lib/use-seo.js";
import { merchantLandingUrl } from "../lib/merchant-app.js";
import { earliestPickupDay } from "../lib/hire-dates.js";
import { getCollections, getCounties, formatMoney, type CatalogCollection } from "../lib/catalog-api.js";
import { VehicleCard, CARD_TINTS } from "../components/site/VehicleCard.js";
import { Dropdown, PIN_ICON } from "../components/site/Dropdown.js";
import sedanPhoto from "../assets/category-tiles/sedan.jpg";
import suvPhoto from "../assets/category-tiles/suv.jpg";
import vanPhoto from "../assets/category-tiles/van.jpg";
import truckPhoto from "../assets/category-tiles/truck.jpg";
import machineryPhoto from "../assets/category-tiles/machinery.jpg";
import heroXtrail from "../assets/hero/xtrail.jpg";
import heroDemio from "../assets/hero/demio.jpg";
import heroCx5 from "../assets/hero/cx5.jpg";
import heroLandCruiser from "../assets/hero/land-cruiser.jpg";
import heroMercedes from "../assets/hero/mercedes.jpg";
import trustDriverPhoto from "../assets/trust-driver.jpg";
import keyHandoffPhoto from "../assets/keyhandoff.jpg";

/**
 * The home page, rebuilt against the real canvas source pulled 2026-09-17
 * (`docs/brand/canvas/Cruz Ride Auto - Website.dc.html`, its "home" page
 * state) - the earlier version of this file predated that pull and, despite
 * its own header comment, was not actually checked against it (its facts
 * strip and hero copy don't exist anywhere in the real source - see
 * CLAUDE.md's "a plan document is not evidence" rule, which applies just as
 * much to an earlier session's confident file comment).
 *
 * Deliberate departures from the canvas copy, per recorded product
 * decisions:
 *
 *  - Deposit visibility. The deposit is never surfaced to the renter on
 *    this page (or anywhere in the marketing/help copy) - mirrors the
 *    merchant portal's "deposit never shown" rule. It still exists and is
 *    enforced server-side; the client just never mentions it.
 *  - The rate is fixed once agreed. Copy states plainly that the rate is
 *    agreed before booking and does not change afterwards.
 *  - The M-Pesa pay step. No Daraja integration exists; the flow is
 *    request -> confirm, money settled with the owner. The canvas's trust
 *    band assumes the STK flow is live ("the M-Pesa prompt only appears
 *    once they have accepted") - that clause is dropped/reworded below,
 *    same departure the file already documented before this pass.
 *  - The canvas's body-type tiles are a 7-way fixture taxonomy (Saloon,
 *    Hatchback, SUV, Large SUV, Double cab, Van, Executive) with no
 *    backing in our schema - `vehicles.category` is the real, fixed
 *    5-slug set (CLAUDE.md's vehicle-model-changes note). Kept as 5 real
 *    categories rather than fabricating the canvas's 7; each tile's price
 *    tag is a real `FROM <min> / DAY` computed from whatever's already
 *    loaded in the rails below, shown only when the data supports it.
 *  - The "selling" door/hero-mode (buy and sell, canvas status "NEXT") has
 *    no page to open - same as the AccountMenu's inert "Sell a car" row.
 *
 * The collection rails are real data from GET /catalog/collections.
 */

/**
 * Counties come from `GET /catalog/counties` - only the ones that have a
 * live listing, busiest first. The canvas's hero hard-codes seven, which
 * meant five of the seven quick-picks led to an empty results page.
 * `HERO_COUNTY_CHIPS` caps the quick-pick row; the dropdown lists them
 * all.
 */
const HERO_COUNTY_CHIPS = 7;

/**
 * Photos: the canvas's own body-type stock photography was replaced
 * 2026-09-20 (owner's call) - those images were plainly foreign cars (a
 * BMW M4, a US-market Expedition, a VW camper) and read as stock, not as
 * what anyone actually hires in Kenya. These five are freely-licensed
 * photos of the vehicles this market really runs, pulled from Wikimedia
 * Commons, same sourcing standard the hero photos already follow:
 *
 *  - sedan     Toyota Corolla Fielder Hybrid (CC0)
 *  - suv       Toyota Land Cruiser Prado 150 (CC0)
 *  - van       Toyota HiAce high-roof 14-seater (public domain)
 *  - truck     Isuzu Forward FRR cab and chassis (CC BY-SA 4.0)
 *  - machinery tracked excavator on a site (public domain)
 *
 * Each is cropped to 720x460, the tile's own ratio, so the photo fills
 * the tile edge to edge - full bleed, right up to the card's top corners.
 * An earlier pass letterboxed them (whole photo, blurred bands top and
 * bottom) to avoid cropping any vehicle; the bands read as dead space
 * above the car, which is exactly what the tile must not have. Where a
 * photo is taller than the tile the crop is biased slightly downward, so
 * what gets cut is sky rather than wheels.
 *
 * They're decorative category illustrations, not tied to any specific
 * listing - same category as Airbnb's "browse by type" tiles, and
 * meaningfully different from the fabricated-badge precedent this codebase
 * avoids elsewhere: no factual claim is made about any particular vehicle
 * or account. The two CC BY-SA images need an attribution credit before
 * this ships - same open flag the trust-band photo below carries.
 */
const CATEGORY_TILES: Array<{ slug: string; label: string; note: string; photo: string }> = [
  { slug: "sedan", label: "Sedans & small cars", note: "City runs and airport hops", photo: sedanPhoto },
  { slug: "suv", label: "SUV, 4x4 & pickup", note: "Potholes, game parks, weekends away", photo: suvPhoto },
  { slug: "van", label: "Vans & minibuses", note: "Eight to fourteen people", photo: vanPhoto },
  { slug: "truck", label: "Trucks & trailers", note: "Moves, deliveries, hardware runs", photo: truckPhoto },
  { slug: "machinery", label: "Construction & machinery", note: "Sites, plant and equipment", photo: machineryPhoto },
];

/**
 * Hero background crossfade. The canvas's own hero has a photo carousel
 * (`cralHeroFade`, 36s loop, staggered) behind resource ids that turned out
 * not to be in any canvas bundle available this session - see the
 * conversation this was built from. X-Trail and Demio are real,
 * freely-licensed (CC BY-SA) photos pulled from Wikimedia Commons; CX-5,
 * the Land Cruiser lineup and the Mercedes were supplied directly by the
 * owner (the Mercedes shot is evidently taken in a Kenyan car yard). Not
 * the canvas's own photography, but real cars, not fabricated ones.
 */
const HERO_PHOTOS = [heroXtrail, heroMercedes, heroCx5, heroLandCruiser, heroDemio];

/**
 * From the canvas's `trustCols` fixture, verbatim except item [1] - the
 * canvas's "Nothing leaves your M-Pesa until the owner has accepted your
 * dates" describes the STK flow, which isn't live (see file header). Kept
 * the same title and shape, reworded the body to what's actually true
 * today: nothing is *owed*, because settlement is still owner-direct.
 */
const TRUST_COLS: Array<{ n: string; title: string; body: string }> = [
  {
    n: "01",
    title: "Checked before it goes live",
    body: "A real person checks every car's details and paperwork before it is listed.",
  },
  {
    n: "02",
    title: "Paid only after a yes",
    body: "You don't pay anything until the owner accepts your dates. If they don't reply in time, you pay nothing.",
  },
  {
    n: "03",
    title: "Decided with evidence",
    body: "If something gets damaged, a CRAL reviewer looks at photos from both sides before deciding who pays.",
  },
];


function Rail({ collection }: { collection: CatalogCollection }): JSX.Element {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => {
    ref.current?.scrollBy({ left: dir * 560, behavior: "smooth" });
  };
  return (
    <div style={{ padding: "clamp(14px,2.2vw,22px) 0" }}>
      <div
        style={{
          maxWidth: 1320,
          margin: "0 auto",
          padding: "0 clamp(16px,4vw,40px)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 15,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 320px", minWidth: 240 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
            <span
              style={{
                display: "block",
                width: 18,
                height: 5,
                background: "#D81E32",
                transform: "skewX(-14deg)",
                flex: "none",
              }}
            />
            <span
              style={{
                font: "500 10px/1 'IBM Plex Mono',monospace",
                letterSpacing: ".12em",
                color: "#838C9B",
              }}
            >
              {collection.kicker}
            </span>
          </div>
          <h2
            style={{
              margin: "0 0 5px",
              font: "700 clamp(21px,2.8vw,30px)/1.1 Archivo,sans-serif",
              fontVariationSettings: "'wdth' 108",
              letterSpacing: "-.026em",
              color: "#0B0F1A",
            }}
          >
            {collection.title}
          </h2>
          <p
            style={{
              margin: 0,
              font: "400 14.5px/1.5 'Instrument Sans',sans-serif",
              color: "#5A6373",
              maxWidth: 520,
            }}
          >
            {collection.sub}
          </p>
        </div>
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8 }}>
          {([-1, 1] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              aria-label={dir === -1 ? "Scroll left" : "Scroll right"}
              onClick={() => scroll(dir)}
              style={{
                width: 38,
                height: 38,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#FFFFFF",
                color: "#333B4A",
                border: "1px solid #E4E7EC",
                borderRadius: 8,
                font: "500 16px/1 'Instrument Sans',sans-serif",
                cursor: "pointer",
              }}
            >
              {dir === -1 ? "←" : "→"}
            </button>
          ))}
        </div>
      </div>
      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 clamp(16px,4vw,40px)" }}>
        <div
          ref={ref}
          className="cral-rail"
          style={{ display: "flex", gap: 14, overflowX: "auto", padding: "2px 0 8px" }}
        >
          {collection.vehicles.map((car, i) => (
            <VehicleCard
              key={car.id}
              car={car}
              tint={CARD_TINTS[i % CARD_TINTS.length] as string}
              onOpen={() => navigate(`/cars/${car.id}`)}
              width={262}
            />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4 }}>
          <button
            type="button"
            onClick={() => navigate(`/browse?collection=${collection.key}`)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              font: "600 13.5px/1.4 'Instrument Sans',sans-serif",
              color: "#0F23A8",
              cursor: "pointer",
              borderBottom: "1px solid rgba(15,35,168,.3)",
            }}
          >
            See all
          </button>
        </div>
      </div>
    </div>
  );
}

export function Home(): JSX.Element {
  useSeo({
    title: null,
    description:
      "CRAL is Kenya's one-stop shop for all your vehicle-based needs - hire, parts and services, all in one place. Every listing's paperwork is verified by our team.",
    path: "/",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Cruz Ride Auto Limited",
      alternateName: "CRAL",
      url: "https://cral.co.ke",
      email: "hello@cral.co.ke",
      telephone: "+254735656066",
      address: { "@type": "PostalAddress", addressLocality: "Nairobi", addressCountry: "KE" },
    },
  });
  const navigate = useNavigate();
  const [city, setCity] = useState<string | undefined>(undefined);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["catalog", "collections"],
    queryFn: getCollections,
  });
  // Only counties that have something live in them - see HERO_COUNTY_CHIPS.
  const { data: countyData } = useQuery({
    queryKey: ["catalog", "counties"],
    queryFn: getCounties,
  });
  const counties = (countyData?.counties ?? []).map((c) => c.county);

  const rails = (data?.collections ?? []).filter((c) => c.vehicles.length > 0);

  // A real (if partial - only whatever's already loaded for the rails
  // below) minimum price per category, for the "FROM <price> / DAY" tag
  // on the body-type tiles. `category` is the fixed 5-slug enum, so this
  // grouping is exact - unlike a free-text `county` match, which is why
  // the hero's city quick-picks below carry no count.
  const uniqueVehicles = new Map(rails.flatMap((c) => c.vehicles).map((v) => [v.id, v]));
  const minPriceByCategory = new Map<string, { amount: number; currency: string }>();
  for (const v of uniqueVehicles.values()) {
    const cur = minPriceByCategory.get(v.category);
    if (!cur || v.daily_rate.amount < cur.amount) minPriceByCategory.set(v.category, v.daily_rate);
  }


  return (
    <div>
      {/* ---- hero ---- */}
      <div
        style={{
          background: "#0B0F1A",
          minHeight: "100vh",
          padding: "clamp(30px,4.6vw,58px) 0 clamp(26px,3.6vw,44px)",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        {HERO_PHOTOS.map((photo, i) => (
          <div
            key={photo}
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url(${photo})`,
              backgroundSize: "cover",
              backgroundPosition: "center right",
              backgroundRepeat: "no-repeat",
              animation: `cralHeroFade ${HERO_PHOTOS.length * 9}s linear infinite`,
              animationDelay: `${-i * 9}s`,
              opacity: 0,
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              // True black, not the brand ink (#0B0F1A reads blue over a photo).
              "linear-gradient(100deg, rgba(0,0,0,.93) 0%, rgba(0,0,0,.8) 32%, rgba(0,0,0,.5) 62%, rgba(0,0,0,.72) 100%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: -30,
            right: -60,
            width: "clamp(220px,32vw,420px)",
            height: 16,
            background: "#D81E32",
            transform: "skewX(-14deg)",
            opacity: 0.55,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -24,
            left: -50,
            width: "clamp(160px,22vw,280px)",
            height: 12,
            background: "#D81E32",
            transform: "skewX(-14deg)",
            opacity: 0.22,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            width: "100%",
            maxWidth: 1320,
            margin: "0 auto",
            padding: "0 clamp(16px,4vw,40px)",
            position: "relative",
            display: "flex",
            gap: "clamp(22px,4vw,54px)",
            flexWrap: "wrap",
            alignItems: "flex-start",
            boxSizing: "border-box",
          }}
        >
          <div style={{ flex: "1 1 520px", minWidth: 300 }}>
            <h1
              style={{
                margin: "0 0 16px",
                font: "700 clamp(36px,6.2vw,72px)/.98 Archivo,sans-serif",
                fontVariationSettings: "'wdth' 112",
                letterSpacing: "-.037em",
                color: "#FFFFFF",
                maxWidth: 840,
              }}
            >
              Kenya's one-stop shop for cars.
            </h1>
            <p
              style={{
                margin: "0 0 clamp(32px,4.5vw,48px)",
                font: "400 clamp(16px,1.9vw,20px)/1.5 'Instrument Sans',sans-serif",
                color: "#A7B0BE",
                maxWidth: 840,
              }}
            >
              One account for everything your car needs: hire one today, order the right part,
              book a garage that quotes first, or sell the car you are done with. Every car's
              papers are read by a person before it is listed, and you pay nothing until an owner
              says yes.
            </p>

            <SearchBar city={city} counties={counties} />
            {/* City quick-picks - the busiest counties that actually have a
                live listing. No count badge (unlike the canvas's own
                `cityCounts`): the number is real now, but a count next to a
                place name reads as "cars available on your dates", which it
                is not. The row is empty until the query lands rather than
                showing places that might have nothing. */}
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 13 }}>
              {counties.slice(0, HERO_COUNTY_CHIPS).map((c) => {
                const on = city === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCity(c)}
                    style={{
                      height: 32,
                      padding: "0 12px",
                      background: on ? "rgba(255,255,255,.09)" : "transparent",
                      border: `1px solid ${on ? "#5F6B7D" : "#252B3A"}`,
                      borderRadius: 999,
                      cursor: "pointer",
                      font: `${on ? 600 : 500} 13px/1 'Instrument Sans',sans-serif`,
                      color: on ? "#FFFFFF" : "#C7CED8",
                    }}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ---- collection rails ---- */}
      {isLoading && <RailsMessage>Loading cars…</RailsMessage>}
      {isError && (
        <RailsMessage>
          We couldn't load the listings just now. Refresh in a moment.
        </RailsMessage>
      )}
      {!isLoading && !isError && rails.length === 0 && (
        <RailsMessage>
          Listings are being added. Check back soon - or list your own car.
        </RailsMessage>
      )}
      {rails.map((c) => (
        <Rail key={c.key} collection={c} />
      ))}

      {/* ---- category tiles ---- */}
      <div
        style={{
          padding:
            "clamp(24px,3.6vw,42px) clamp(16px,4vw,40px) clamp(14px,2.2vw,22px)",
        }}
      >
        <div style={{ maxWidth: 1240, margin: "0 auto" }}>
          <h2
            style={{
              margin: "0 0 15px",
              font: "700 clamp(21px,2.8vw,30px)/1.1 Archivo,sans-serif",
              fontVariationSettings: "'wdth' 108",
              letterSpacing: "-.026em",
              color: "#0B0F1A",
            }}
          >
            Browse by car type
          </h2>
          <p
            style={{
              margin: "0 0 15px",
              font: "400 14.5px/1.5 'Instrument Sans',sans-serif",
              color: "#5A6373",
              maxWidth: 560,
            }}
          >
            Five categories, from a saloon for the school run to a lorry or an
            excavator. Pick one to see what is available near you.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(158px,1fr))",
              gap: 12,
            }}
          >
            {CATEGORY_TILES.map((b) => {
              const minPrice = minPriceByCategory.get(b.slug);
              return (
              <button
                key={b.slug}
                type="button"
                onClick={() => navigate(`/browse?category=${b.slug}`)}
                style={{
                  // A column, not `display: block`. The grid stretches every
                  // tile to the tallest one's height, and Chrome centres a
                  // button's content in the leftover space - which showed as
                  // card background above the photo and below the price on
                  // every tile except the tallest. A flex column pins the
                  // photo to the top edge.
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "stretch",
                  width: "100%",
                  textAlign: "left",
                  padding: 0,
                  background: "#FFFFFF",
                  border: "1px solid #E4E7EC",
                  borderRadius: 12,
                  overflow: "hidden",
                  cursor: "pointer",
                }}
              >
                {/* A plain img, no overlay chip - the label lives below it. */}
                <div style={{ flex: "none", height: 150, position: "relative", borderBottom: "1px solid #E4E7EC", background: "#E7EAEF" }}>
                  <img
                    src={b.photo}
                    alt={b.label}
                    loading="lazy"
                    style={{ display: "block", position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </div>
                <div style={{ padding: "14px 15px 15px" }}>
                  <div
                    style={{
                      font: "600 15px/1.3 'Instrument Sans',sans-serif",
                      color: "#0B0F1A",
                      marginBottom: 5,
                    }}
                  >
                    {b.label}
                  </div>
                  <div
                    style={{
                      font: "400 12.5px/1.45 'Instrument Sans',sans-serif",
                      color: "#5A6373",
                      marginBottom: minPrice ? 11 : 0,
                    }}
                  >
                    {b.note}
                  </div>
                  {minPrice && (
                    <div
                      style={{
                        font: "500 11px/1 'IBM Plex Mono',monospace",
                        letterSpacing: ".06em",
                        color: "#0F23A8",
                      }}
                    >
                      FROM {formatMoney(minPrice)} / DAY
                    </div>
                  )}
                </div>
              </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---- verification / trust band ---- */}
      <div style={{ padding: "clamp(24px,3.6vw,44px) clamp(16px,4vw,40px)" }}>
        <div
          style={{
            maxWidth: 1240,
            margin: "0 auto",
            minHeight: "clamp(420px,48vw,560px)",
            borderRadius: 14,
            padding: "clamp(24px,3.6vw,44px)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
            // A real photo, not a design-canvas element - the owner asked for
            // one showing a happy renter behind the wheel, as the card's own
            // background. Sourced directly by the owner (Freepik-family CDN);
            // flagged in case that image's free-tier licence needs an
            // attribution credit before this ships.
            backgroundImage: `linear-gradient(90deg, rgba(11,15,26,.96) 0%, rgba(11,15,26,.75) 55%, rgba(11,15,26,.35) 100%), url(${trustDriverPhoto})`,
            backgroundSize: "cover",
            backgroundPosition: "center right",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -20,
              right: -40,
              width: 260,
              height: 14,
              background: "#D81E32",
              transform: "skewX(-14deg)",
              opacity: 0.45,
            }}
          />
          <h2
            style={{
              margin: "clamp(16px,3vw,32px) 0 10px",
              font: "700 clamp(24px,3.2vw,36px)/1.08 Archivo,sans-serif",
              fontVariationSettings: "'wdth' 110",
              letterSpacing: "-.028em",
              color: "#FFFFFF",
              maxWidth: 660,
            }}
          >
            You don't pay until the owner says yes.
          </h2>
          <p
            style={{
              margin: "0 0 clamp(22px,3vw,32px)",
              font: "400 clamp(15px,1.7vw,17px)/1.55 'Instrument Sans',sans-serif",
              color: "#C7CED8",
              maxWidth: 560,
            }}
          >
            {/* Canvas headline verbatim; body reworded - the canvas's own
                copy here assumes the STK flow (see file header comment). */}
            Car hire in Kenya often goes wrong when money changes hands too early. On CRAL, sending
            a request is free. The owner has twelve hours to reply, and you only pay once they say
            yes - at a price that never changes after that.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
              gap: "clamp(18px,2.6vw,30px)",
            }}
          >
            {TRUST_COLS.map((t) => (
              <div key={t.n}>
                <div
                  style={{
                    font: "500 10px/1 'IBM Plex Mono',monospace",
                    letterSpacing: ".11em",
                    color: "#F28FA0",
                    marginBottom: 11,
                  }}
                >
                  {t.n}
                </div>
                <div
                  style={{
                    font: "600 16px/1.3 Archivo,sans-serif",
                    fontVariationSettings: "'wdth' 106",
                    color: "#FFFFFF",
                    marginBottom: 8,
                  }}
                >
                  {t.title}
                </div>
                <p
                  style={{
                    margin: 0,
                    font: "400 14px/1.6 'Instrument Sans',sans-serif",
                    color: "#C7CED8",
                  }}
                >
                  {t.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>


      {/* ---- closing CTAs ---- */}
      <div style={{ padding: "0 clamp(16px,4vw,40px) clamp(34px,5vw,60px)" }}>
        <div
          style={{
            maxWidth: 1240,
            margin: "0 auto",
            display: "flex",
            gap: "clamp(16px,2.4vw,24px)",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              flex: "1 1 560px",
              minWidth: 300,
              background: "#FFFFFF",
              border: "1px solid #E4E7EC",
              borderRadius: 12,
              padding: "clamp(22px,3vw,32px)",
            }}
          >
            <div
              style={{
                font: "500 10px/1 'IBM Plex Mono',monospace",
                letterSpacing: ".11em",
                color: "#9AA2B0",
                marginBottom: 14,
              }}
            >
              YOUR NEXT HIRE, START TO FINISH
            </div>
            <h3
              style={{
                margin: "0 0 10px",
                font: "700 clamp(20px,2.4vw,26px)/1.15 Archivo,sans-serif",
                fontVariationSettings: "'wdth' 106",
                letterSpacing: "-.02em",
                color: "#0B0F1A",
              }}
            >
              Three simple steps. No hidden booking fee.
            </h3>
            <p
              style={{
                margin: "0 0 20px",
                font: "400 15px/1.6 'Instrument Sans',sans-serif",
                color: "#5A6373",
              }}
            >
              Search for cars that are actually free on your dates. Send a request. Once the owner
              says yes, go and collect the car - the price never changes, and CRAL never adds a
              booking fee on top.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => navigate("/how-it-works")}
                style={{
                  height: 44,
                  padding: "0 19px",
                  background: "#0F23A8",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: 8,
                  font: "600 14px/1 'Instrument Sans',sans-serif",
                  cursor: "pointer",
                }}
              >
                See how it works
              </button>
              <button
                type="button"
                onClick={() => navigate("/how-we-protect-you")}
                style={{
                  height: 44,
                  padding: "0 19px",
                  background: "#FFFFFF",
                  color: "#0F23A8",
                  border: "1px solid #B6C0F4",
                  borderRadius: 8,
                  font: "600 14px/1 'Instrument Sans',sans-serif",
                  cursor: "pointer",
                }}
              >
                How we protect you
              </button>
            </div>
          </div>
          <div
            style={{
              flex: "1 1 300px",
              minWidth: 280,
              position: "relative",
              border: "1px solid #B6C0F4",
              borderRadius: 12,
              padding: "clamp(22px,3vw,32px)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 18,
              overflow: "hidden",
              backgroundImage: `linear-gradient(180deg, rgba(11,27,133,.42) 0%, rgba(11,27,133,.82) 100%), url(${keyHandoffPhoto})`,
              backgroundSize: "cover",
              backgroundPosition: "center 30%",
            }}
          >
            <div>
              <div
                style={{
                  font: "500 10px/1 'IBM Plex Mono',monospace",
                  letterSpacing: ".11em",
                  color: "#DCE1FA",
                  marginBottom: 14,
                }}
              >
                HAVE A CAR OF YOUR OWN?
              </div>
              <h3
                style={{
                  margin: 0,
                  font: "700 clamp(19px,2.2vw,24px)/1.18 Archivo,sans-serif",
                  fontVariationSettings: "'wdth' 106",
                  letterSpacing: "-.02em",
                  color: "#FFFFFF",
                }}
              >
                Put it to work on the days you are not using it.
              </h3>
            </div>
            <a
              href={merchantLandingUrl()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                alignSelf: "flex-start",
                height: 44,
                padding: "0 19px",
                background: "#FFFFFF",
                color: "#0F23A8",
                border: "none",
                borderRadius: 8,
                font: "600 14px/1 'Instrument Sans',sans-serif",
                textDecoration: "none",
              }}
            >
              List your car
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function RailsMessage({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "40px clamp(16px,4vw,40px)" }}>
      <p
        style={{
          margin: 0,
          font: "400 15px/1.6 'Instrument Sans',sans-serif",
          color: "#5A6373",
        }}
      >
        {children}
      </p>
    </div>
  );
}

/**
 * COUNTY defaults to `city` when passed - the hero's city quick-picks set
 * it. `counties` is whatever has a live listing; until it arrives (or if
 * nothing is listed anywhere) the field reads "Any county" and the search
 * simply goes to /browse unfiltered, rather than pre-filling a county
 * that may have nothing in it.
 */
function SearchBar({
  city,
  counties,
}: {
  city?: string | undefined;
  counties: string[];
}): JSX.Element {
  const navigate = useNavigate();
  const [county, setCounty] = useState<string>(city ?? "");
  const [fromDate, setFromDate] = useState("");
  // Nairobi's clock, not the browser's, and never today once six in the
  // evening has passed - cars are back with their owner by then.
  const min = earliestPickupDay();

  useEffect(() => {
    if (city) setCounty(city);
  }, [city]);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["county", "from", "to"] as const) {
      const v = form.get(key);
      if (typeof v === "string" && v) params.set(key, v);
    }
    navigate(`/browse${params.toString() ? `?${params}` : ""}`);
  };

  return (
    <div>
      <div className="cral-search-kicker">Hire a car</div>
      <form onSubmit={submit} className="cral-search" style={{ maxWidth: 900 }}>
        <input type="hidden" name="county" value={county} />
        <Dropdown
          variant="field"
          label="COUNTY"
          icon={PIN_ICON}
          value={county}
          placeholder="Any county"
          disabled={counties.length === 0}
          options={counties.map((c) => ({ value: c, label: c }))}
          onChange={setCounty}
        />
        <label className="cral-search-field">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="cral-search-label">FROM</span>
            <input
              name="from"
              type="date"
              min={min}
              className="cral-search-input"
              onChange={(e) => setFromDate(e.target.value)}
            />
          </span>
        </label>
        <label className="cral-search-field" style={{ borderRight: "none" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="cral-search-label">UNTIL</span>
            <input name="to" type="date" min={fromDate || min} className="cral-search-input" />
          </span>
        </label>
        <button type="submit" className="cral-search-submit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          Search cars
        </button>
      </form>
    </div>
  );
}
