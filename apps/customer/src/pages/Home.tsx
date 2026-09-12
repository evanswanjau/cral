import { useRef, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "../lib/use-seo.js";
import { getCollections, type CatalogCollection } from "../lib/catalog-api.js";
import { VehicleCard, CARD_TINTS } from "../components/site/VehicleCard.js";

/**
 * The home page, reproduced from the "Cruz Ride Auto - Website" canvas
 * ("home" screen) with its own inline styles. Two deliberate departures
 * from the canvas copy, both per recorded product decisions:
 *
 *  - Deposit custody. The canvas says CRAL holds every deposit ("Nobody
 *    holds your deposit but us"). It does not - there is no payment rail.
 *    The deposit is agreed with the owner and settled at handover, and
 *    the copy here says so.
 *  - The M-Pesa pay step. No Daraja integration exists; the flow is
 *    request -> confirm, money settled with the owner.
 *
 * The collection rails are real data from GET /catalog/collections.
 */

const CATEGORY_TILES: Array<{ slug: string; label: string; note: string }> = [
  { slug: "sedan", label: "Sedans & small cars", note: "City runs and airport hops" },
  { slug: "suv", label: "SUV, 4x4 & pickup", note: "Potholes, game parks, weekends away" },
  { slug: "van", label: "Vans & minibuses", note: "Eight to fourteen people" },
  { slug: "truck", label: "Trucks & trailers", note: "Moves, deliveries, hardware runs" },
  { slug: "machinery", label: "Construction & machinery", note: "Sites, plant and equipment" },
];

const HERO_FACTS: Array<{ n: string; label: string }> = [
  { n: "5", label: "categories, from a Vitz to a tipper truck" },
  { n: "6", label: "documents read on every car, by a person" },
  { n: "KES 0", label: "booking fee. You pay the owner's rate, nothing on top" },
  { n: "1×", label: "licence and ID check, then reused on every hire you take" },
  { n: "Both sides", label: "photograph the car at pickup and return, on the record" },
];

const TRUST_COLS: Array<{ n: string; title: string; body: string }> = [
  {
    n: "01",
    title: "Read before it is listed",
    body: "Logbook, ID, licence, insurance, KRA PIN and tracker certificate, checked by a person for names and dates that agree.",
  },
  {
    n: "02",
    title: "Agreed up front",
    body: "The deposit is set on the listing and agreed before you book, so there is no argument about the number when you collect the car.",
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

const ROADMAP: Array<{ status: string; title: string; body: string }> = [
  {
    status: "LIVE",
    title: "Hire a car",
    body: "Any reviewed car, booked in minutes, with the licence and ID behind every hire already checked.",
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
      "Hire a car in Kenya with no booking fee. Every listing's documents are read by a person, every renter's ID and licence checked once.",
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
  const { data, isLoading, isError } = useQuery({
    queryKey: ["catalog", "collections"],
    queryFn: getCollections,
  });

  const rails = (data?.collections ?? []).filter((c) => c.vehicles.length > 0);

  return (
    <div>
      {/* ---- hero ---- */}
      <div
        style={{
          background: "#0B0F1A",
          padding:
            "clamp(30px,4.6vw,58px) clamp(16px,4vw,40px) clamp(26px,3.6vw,44px)",
          position: "relative",
          overflow: "hidden",
        }}
      >
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
            maxWidth: 1240,
            margin: "0 auto",
            position: "relative",
            display: "flex",
            gap: "clamp(22px,4vw,54px)",
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <div style={{ flex: "1 1 520px", minWidth: 300 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                padding: "6px 13px",
                background: "rgba(255,255,255,.07)",
                border: "1px solid #252B3A",
                borderRadius: 999,
                font: "500 11px/1.4 'IBM Plex Mono',monospace",
                letterSpacing: ".09em",
                color: "#A7B0BE",
                marginBottom: "clamp(16px,2.4vw,24px)",
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: "#4FD69E",
                  animation: "cruzPulse 2.4s ease-in-out infinite",
                }}
              />
              CRAL · CRUZ RIDE AUTO LIMITED
            </div>
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
              Everything cars in Kenya.
              <br />
              <span style={{ color: "#8C97A8" }}>We start with the keys.</span>
            </h1>
            <p
              style={{
                margin: "0 0 clamp(20px,3vw,30px)",
                font: "400 clamp(16px,1.9vw,20px)/1.5 'Instrument Sans',sans-serif",
                color: "#A7B0BE",
                maxWidth: 600,
              }}
            >
              CRAL is building the place Kenyans go for anything to do with a car. Hiring one is
              live today. Every car's papers are read by a person, and you never pay a booking
              fee. The rate and deposit are the owner's, agreed before you book.
            </p>

            <SearchBar />
          </div>
        </div>
      </div>

      {/* ---- hero facts strip ---- */}
      <div
        style={{
          background: "#FFFFFF",
          borderBottom: "1px solid #E4E7EC",
          padding: "clamp(20px,2.4vw,26px) clamp(16px,4vw,40px)",
        }}
      >
        <div
          style={{
            maxWidth: 1240,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
            gap: "clamp(14px,2vw,22px)",
          }}
        >
          {HERO_FACTS.map((f) => (
            <div key={f.label} style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <span
                style={{
                  font: "700 clamp(21px,2.3vw,27px)/1 Archivo,sans-serif",
                  fontVariationSettings: "'wdth' 108",
                  letterSpacing: "-.025em",
                  color: "#0B0F1A",
                }}
              >
                {f.n}
              </span>
              <span
                style={{
                  font: "400 12.5px/1.45 'Instrument Sans',sans-serif",
                  color: "#5A6373",
                }}
              >
                {f.label}
              </span>
            </div>
          ))}
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
            {CATEGORY_TILES.map((b) => (
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
                    }}
                  >
                    {b.note}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ---- deposit / protection band ---- */}
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
            The deposit is agreed with the owner, not held by us.
          </h2>
          <p
            style={{
              margin: "0 0 clamp(22px,3vw,32px)",
              font: "400 clamp(15px,1.7vw,17px)/1.55 'Instrument Sans',sans-serif",
              color: "#A7B0BE",
              maxWidth: 560,
            }}
          >
            Kenya's oldest car-hire fight is who keeps the money after a scratch. CRAL does not
            sit in the middle of the deposit - it is set on the listing, agreed before you book,
            and settled with the owner at pickup and return. What CRAL holds is the record: the
            read documents, the photos from both sides, and the booking, in one place either of
            you can open.
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

      {/* ---- the rest of CRAL ---- */}
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
              the owner says yes. You settle the rate and the deposit with the owner - CRAL never
              charges a booking fee.
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

function SearchBar(): JSX.Element {
  const navigate = useNavigate();
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
  const labelSpan = {
    display: "block",
    font: "600 10px/1 'IBM Plex Mono',monospace",
    letterSpacing: ".09em",
    color: "#838C9B",
    marginBottom: 7,
  } as const;
  const field = {
    width: "100%",
    height: 46,
    padding: "0 11px",
    border: "1px solid #CDD2DA",
    borderRadius: 8,
    color: "#0B0F1A",
    background: "#FFFFFF",
  } as const;
  return (
    <form
      onSubmit={submit}
      style={{
        background: "#FFFFFF",
        borderRadius: 12,
        padding: "clamp(11px,1.5vw,15px)",
        display: "flex",
        gap: "clamp(8px,1.3vw,11px)",
        flexWrap: "wrap",
        alignItems: "flex-end",
        boxShadow: "0 18px 44px rgba(0,0,0,.32)",
      }}
    >
      <label style={{ flex: "1 1 168px", minWidth: 140, display: "block" }}>
        <span style={labelSpan}>CITY OR COUNTY</span>
        <input
          name="county"
          placeholder="e.g. Nairobi"
          style={{
            ...field,
            font: "500 16px/1 'Instrument Sans',sans-serif",
          }}
        />
      </label>
      <label style={{ flex: "1 1 145px", minWidth: 130, display: "block" }}>
        <span style={labelSpan}>FROM</span>
        <input
          name="from"
          type="date"
          style={{ ...field, font: "500 15px/1 'IBM Plex Mono',monospace" }}
        />
      </label>
      <label style={{ flex: "1 1 145px", minWidth: 130, display: "block" }}>
        <span style={labelSpan}>UNTIL</span>
        <input
          name="to"
          type="date"
          style={{ ...field, font: "500 15px/1 'IBM Plex Mono',monospace" }}
        />
      </label>
      <button
        type="submit"
        style={{
          flex: "0 0 auto",
          height: 46,
          padding: "0 clamp(18px,2.6vw,26px)",
          background: "#0F23A8",
          color: "#FFFFFF",
          border: "none",
          borderRadius: 8,
          font: "600 16px/1 'Instrument Sans',sans-serif",
          cursor: "pointer",
        }}
      >
        Search cars
      </button>
    </form>
  );
}
