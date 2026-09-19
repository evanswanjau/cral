import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "../lib/use-seo.js";
import { getCollections, formatMoney, type CatalogCollection } from "../lib/catalog-api.js";
import { VehicleCard, CARD_TINTS } from "../components/site/VehicleCard.js";
import sedanPhoto from "../assets/category-tiles/sedan.jpg";
import suvPhoto from "../assets/category-tiles/suv.jpg";
import vanPhoto from "../assets/category-tiles/van.jpg";
import truckPhoto from "../assets/category-tiles/truck.jpg";
import heroXtrail from "../assets/hero/xtrail.jpg";
import heroDemio from "../assets/hero/demio.jpg";
import heroCx5 from "../assets/hero/cx5.jpg";
import heroLandCruiser from "../assets/hero/land-cruiser.jpg";
import heroMercedes from "../assets/hero/mercedes.jpg";

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

/** The canvas's fixed county list (its hero search bar's `<select>`). */
const KENYA_COUNTIES = ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Uasin Gishu", "Kiambu", "Machakos"];

/**
 * Photos: four of these five are real images pulled from the same canvas
 * bundle (`docs/brand/canvas/`'s source), not fabricated stock photography
 * found separately - the design tool embeds its own stock car photography
 * per body type (`saloon`/`suvLarge`/`van`/`cab`), keyed by the same
 * vertDefs-style resource ids the canvas's own `bodyPhoto()` uses. They're
 * decorative category illustrations, not tied to any specific listing -
 * same category as Airbnb's "browse by type" tiles, and meaningfully
 * different from the fabricated-badge precedent this codebase avoids
 * elsewhere: no factual claim is made about any particular vehicle or
 * account. `machinery` has no canvas photo at all (the design's own body
 * types never covered construction equipment) - flagged, not faked with an
 * unrelated stock image found elsewhere.
 */
const CATEGORY_TILES: Array<{ slug: string; label: string; note: string; photo: string | null }> = [
  { slug: "sedan", label: "Sedans & small cars", note: "City runs and airport hops", photo: sedanPhoto },
  { slug: "suv", label: "SUV, 4x4 & pickup", note: "Potholes, game parks, weekends away", photo: suvPhoto },
  { slug: "van", label: "Vans & minibuses", note: "Eight to fourteen people", photo: vanPhoto },
  { slug: "truck", label: "Trucks & trailers", note: "Moves, deliveries, hardware runs", photo: truckPhoto },
  { slug: "machinery", label: "Construction & machinery", note: "Sites, plant and equipment", photo: null },
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
    title: "Read before it is listed",
    body: "Logbook, ID, licence, insurance, KRA PIN and tracker certificate, checked by a person for names and dates that agree.",
  },
  {
    n: "02",
    title: "Paid only after a yes",
    body: "Nothing is due until the owner has accepted your dates. If the request lapses, you owe nothing at all.",
  },
  {
    n: "03",
    title: "Judged on evidence",
    body: "If something is damaged, a CRAL reviewer reads both sides and both sets of photos before anyone agrees what is owed.",
  },
  {
    n: "04",
    title: "Expiry is enforced",
    body: "When an insurance certificate or a licence lapses, the car comes off the site until the owner replaces it.",
  },
];

/**
 * `roadmap` exists in the canvas's own logic but is never rendered by its
 * markup - unused fixture data, same category as `CHECK_GLYPH` in the
 * admin console (kept, documented, not wired to anything). Real enough to
 * use (it's the design's own words, not invented here), so kept as bonus
 * content past where the canvas's home page actually ends - see the
 * section below for where that boundary is.
 */
const ROADMAP: Array<{ status: string; title: string; body: string }> = [
  {
    status: "LIVE",
    title: "Hire a car",
    body: "Any reviewed car in seven counties, booked in minutes, with the licence and ID behind every hire already checked.",
  },
  {
    status: "LIVE",
    title: "Cars by the month",
    body: "Long hires for families and companies, one invoice at the end of it, paperwork already filed.",
  },
  {
    status: "IN BUILD",
    title: "Service and repair",
    body: "Book a garage CRAL has vetted, with the quote agreed before anyone lifts a spanner.",
  },
  {
    status: "NEXT",
    title: "Buy and sell",
    body: "The same document review, pointed at a sale, so nobody ever buys a logbook that does not match the car.",
  },
  {
    status: "PLANNED",
    title: "Insurance and paperwork",
    body: "Renewals, transfers and the queue at NTSA, handled inside the account you already have.",
  },
];

function roadmapPill(status: string): { bg: string; border: string; fg: string } {
  if (status === "LIVE") return { bg: "#DDF3E9", border: "#A8DEC7", fg: "#076945" };
  if (status === "IN BUILD") return { bg: "#FFF3D6", border: "#F0D089", fg: "#8A5200" };
  return { bg: "#F1F3F6", border: "#E4E7EC", fg: "#5A6373" };
}

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
            See all in {collection.title}
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
              "linear-gradient(100deg, rgba(11,15,26,.93) 0%, rgba(11,15,26,.8) 32%, rgba(11,15,26,.5) 62%, rgba(11,15,26,.72) 100%)",
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

            <SearchBar city={city} />
            {/* City quick-picks, from the canvas's `cityCounts` - no count
                badge (unlike the canvas), because `county` is free text on
                a vehicle and a partial, sample-based number here would risk
                reading as wrong rather than as an honest estimate. */}
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 13 }}>
              {KENYA_COUNTIES.map((c) => {
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
            Or start from the shape of the car
          </h2>
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
                  display: "block",
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
                {b.photo ? (
                  // Real photo, no overlay chip - matches the canvas's own
                  // bodyTiles markup (a plain img, label lives below only).
                  <div style={{ height: 104, borderBottom: "1px solid #E4E7EC", background: "#E7EAEF" }}>
                    <img
                      src={b.photo}
                      alt={b.label}
                      loading="lazy"
                      style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      height: 104,
                      background:
                        "repeating-linear-gradient(135deg,#EEF0F3 0 10px,#E7EAEF 10px 20px)",
                      borderBottom: "1px solid #E4E7EC",
                      display: "flex",
                      alignItems: "flex-end",
                      padding: "9px 10px",
                    }}
                  >
                    <span
                      style={{
                        font: "500 9px/1.4 'IBM Plex Mono',monospace",
                        letterSpacing: ".09em",
                        color: "#7C8697",
                        background: "#FFFFFF",
                        padding: "4px 7px",
                        borderRadius: 4,
                      }}
                    >
                      {b.label.toUpperCase()}
                    </span>
                  </div>
                )}
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
            background: "#0B0F1A",
            borderRadius: 14,
            padding: "clamp(24px,3.6vw,44px)",
            position: "relative",
            overflow: "hidden",
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
              margin: "0 0 10px",
              font: "700 clamp(24px,3.2vw,36px)/1.08 Archivo,sans-serif",
              fontVariationSettings: "'wdth' 110",
              letterSpacing: "-.028em",
              color: "#FFFFFF",
              maxWidth: 660,
            }}
          >
            Nobody pays before the owner says yes.
          </h2>
          <p
            style={{
              margin: "0 0 clamp(22px,3vw,32px)",
              font: "400 clamp(15px,1.7vw,17px)/1.55 'Instrument Sans',sans-serif",
              color: "#A7B0BE",
              maxWidth: 560,
            }}
          >
            {/* Canvas headline verbatim; body reworded - the canvas's own
                copy here assumes the STK flow (see file header comment). */}
            The oldest fight in Kenyan car hire is money that moves before anything is agreed. On
            CRAL a request costs nothing and the owner has 24 hours to answer - you only settle
            the agreed rate once they say yes, and it doesn't change after that.
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
                    color: "#D81E32",
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
                    color: "#A7B0BE",
                  }}
                >
                  {t.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---- the rest of CRAL (bonus - past where the canvas's home page
              actually ends; see the ROADMAP constant's own comment) ---- */}
      <div style={{ padding: "0 clamp(16px,4vw,40px) clamp(24px,3.4vw,40px)" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto" }}>
          <div style={{ marginBottom: 16 }}>
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
                THE REST OF CRAL
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
              Hiring is the first door. It is not the last one.
            </h2>
            <p
              style={{
                margin: 0,
                font: "400 14.5px/1.5 'Instrument Sans',sans-serif",
                color: "#5A6373",
                maxWidth: 560,
              }}
            >
              The same read documents and the same booking record, pointed at the next thing your
              car is going to need.
            </p>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(215px,1fr))",
              gap: 1,
              background: "#E4E7EC",
              border: "1px solid #E4E7EC",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {ROADMAP.map((r) => {
              const pill = roadmapPill(r.status);
              return (
                <div
                  key={r.title}
                  style={{
                    background: "#FFFFFF",
                    padding: "19px 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 9,
                  }}
                >
                  <span
                    style={{
                      alignSelf: "flex-start",
                      padding: "4px 10px",
                      background: pill.bg,
                      border: `1px solid ${pill.border}`,
                      borderRadius: 999,
                      font: "600 10px/1.4 'IBM Plex Mono',monospace",
                      letterSpacing: ".07em",
                      color: pill.fg,
                    }}
                  >
                    {r.status}
                  </span>
                  <div
                    style={{
                      font: "600 15.5px/1.3 'Instrument Sans',sans-serif",
                      color: "#0B0F1A",
                    }}
                  >
                    {r.title}
                  </div>
                  <p
                    style={{
                      margin: 0,
                      font: "400 13.5px/1.55 'Instrument Sans',sans-serif",
                      color: "#5A6373",
                    }}
                  >
                    {r.body}
                  </p>
                </div>
              );
            })}
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
              Four steps, and you never pay a booking fee.
            </h3>
            <p
              style={{
                margin: "0 0 20px",
                font: "400 15px/1.6 'Instrument Sans',sans-serif",
                color: "#5A6373",
              }}
            >
              Search cars that are genuinely free on your dates, send a request, and collect once
              the owner says yes. You settle the rate directly with the owner - it doesn't change
              after you book, and CRAL never charges a booking fee.
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
              background: "#EDEFFC",
              border: "1px solid #B6C0F4",
              borderRadius: 12,
              padding: "clamp(22px,3vw,32px)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 18,
            }}
          >
            <div>
              <div
                style={{
                  font: "500 10px/1 'IBM Plex Mono',monospace",
                  letterSpacing: ".11em",
                  color: "#0F23A8",
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
                  color: "#0B1B85",
                }}
              >
                Put it to work on the days you are not using it.
              </h3>
            </div>
            <button
              type="button"
              onClick={() => navigate("/list-your-car")}
              style={{
                alignSelf: "flex-start",
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
              List your car
            </button>
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

/** Local (not UTC) calendar day - so "today" matches the renter's own clock. */
function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** COUNTY defaults to `city` when passed - the hero's city quick-picks set it. */
function SearchBar({ city }: { city?: string | undefined }): JSX.Element {
  const navigate = useNavigate();
  const [county, setCounty] = useState(city ?? KENYA_COUNTIES[0]!);
  const [fromDate, setFromDate] = useState("");
  const min = todayIso();

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
        <CountyDropdown value={county} onChange={setCounty} />
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

/**
 * A fixed list, not free text - the canvas's own hero uses KENYA_COUNTIES.
 * Browse's own filter stays free-text; that's a separate, already-shipped
 * screen, out of scope here. Built custom (not a native `<select>`) so it
 * can carry the same icon/hover/focus treatment as the other fields - a
 * native select can't be restyled past its own font and colors, which is
 * why it looked out of place next to the date fields.
 */
function CountyDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="cral-search-field" style={{ position: "relative" }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s7-7.58 7-13a7 7 0 1 0-14 0c0 5.42 7 13 7 13Z" />
        <circle cx="12" cy="9" r="2.5" />
      </svg>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="cral-county-toggle"
      >
        <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <span className="cral-search-label">COUNTY</span>
          <span className="cral-search-input" style={{ display: "block" }}>
            {value}
          </span>
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          style={{ flex: "none", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s ease" }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="cral-county-menu" role="listbox">
          {KENYA_COUNTIES.map((c) => {
            const selected = c === value;
            return (
              <button
                key={c}
                type="button"
                role="option"
                aria-selected={selected}
                className="cral-county-option"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
              >
                {c}
                {selected && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
