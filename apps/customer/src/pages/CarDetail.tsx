import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "../lib/use-seo.js";
import { getCatalogVehicle, photoSrc, formatMoney } from "../lib/catalog-api.js";
import { PlateBadge } from "../components/site/PlateBadge.js";
import { Rating, Stars } from "../components/site/Rating.js";
import { SpecIcon, type SpecIconName } from "../components/site/SpecIcon.js";
import { crewNote, formatPayload, isCarCategory, listingBase, specLine, truckTypeLabel, vehicleNoun, VEHICLE_CATEGORY_LABEL } from "../lib/vehicle-categories.js";
import { HIRING_UNIT_LABEL, unitRate } from "../lib/hiring-units.js";
import { CarRequestPanel } from "../components/cars/CarRequestPanel.js";
import { TruckRequestPanel } from "../components/subsite/TruckRequestPanel.js";

/**
 * `/cars/:id`, reproduced from the design's "detail" screen. Two things
 * are deliberately honest rather than matching the canvas literally:
 *
 *  - "What CRAL checked" lists only the three per-vehicle documents a
 *    reviewer actually decided on - no semantic claim ("ownership
 *    verified") beyond that, since there is no OCR in this product.
 *  - Two scores, each labelled with what it counts. `rating`/`reviews`
 *    are this car's own, from bookings on this vehicle - that is what
 *    "From people who hired it" claims. `owner_rating` is the owner's
 *    whole account. The masthead shows the car's, or falls back to the
 *    owner's with the word "owner" carrying the scope: most listings
 *    have no reviews of their own for a long while, and a bare "Not
 *    rated yet" above an owner card reading "5.0 · 3 reviews" reads as
 *    the page contradicting itself.
 */

const TINT = "#EEF0F3";

export function CarDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  /**
   * Back goes to the search the renter actually ran, not a bare `/browse`
   * - Browse hands its whole querystring over in router state when it
   * opens a car. A car opened from a shared link or a new tab carries no
   * state, so that case falls back to the unfiltered search rather than
   * `history.back()`, which would leave the site.
   */
  // `/trucks/:id` (UI2a) and `/machinery/:id` (UI2b) render this page too.
  const path = location.pathname;
  const base = path.startsWith("/trucks/") ? "/trucks" : path.startsWith("/machinery/") ? "/machinery" : "/cars";
  // Back to the `/hire` list it was opened from (PR H4), or that type's list.
  const state = location.state as { hireSearch?: string } | null;
  const backTo =
    state?.hireSearch !== undefined
      ? `/hire${state.hireSearch ? `?${state.hireSearch}` : ""}`
      : `/hire?type=${base.slice(1)}`;
  const navigate = useNavigate();
  const { data: car, isLoading, isError } = useQuery({
    queryKey: ["catalog", "vehicle", id],
    queryFn: () => getCatalogVehicle(id!),
    enabled: !!id,
    retry: false,
  });

  const carName = car ? `${car.make} ${car.model} ${car.year}` : null;
  useSeo({
    title: carName,
    description: car
      ? `${carName} in ${car.county ?? "Kenya"} - ${formatMoney(unitRate(car))} / ${HIRING_UNIT_LABEL[car.hiring_unit]}. Documents read, no booking fee.`
      : undefined,
    path: id ? `${base}/${id}` : undefined,
    // AggregateRating only when this CAR has a real rating. Deliberately
    // `car.rating`, not `car.owner_rating`: the enclosing type is
    // `Vehicle`, so reporting the owner's whole-account reviewCount here
    // would tell a search engine this car has reviews it does not have.
    // Emitting it over nothing at all is the same fabrication the
    // id_verified badge was removed for.
    jsonLd: car
      ? {
          "@context": "https://schema.org",
          "@type": "Vehicle",
          name: carName,
          brand: car.make,
          model: car.model,
          vehicleModelDate: car.year,
          offers: {
            "@type": "Offer",
            price: (unitRate(car).amount / 100).toString(),
            priceCurrency: unitRate(car).currency,
            availability: "https://schema.org/InStock",
          },
          ...(car.rating
            ? {
                aggregateRating: {
                  "@type": "AggregateRating",
                  ratingValue: car.rating.average,
                  reviewCount: car.rating.count,
                },
              }
            : {}),
        }
      : undefined,
  });

  if (isLoading) {
    return (
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 24px" }}>
        <p style={{ font: "400 15px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>Loading…</p>
      </div>
    );
  }

  if (isError || !car) {
    return (
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "clamp(60px,10vw,120px) 24px" }}>
        <h1
          style={{
            margin: "0 0 12px",
            font: "700 clamp(24px,3vw,32px)/1.15 Archivo,sans-serif",
            fontVariationSettings: "'wdth' 108",
            color: "#0B0F1A",
          }}
        >
          That listing isn't available.
        </h1>
        <p style={{ margin: "0 0 24px", font: "400 15px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
          It may have been paused, or the link is out of date.
        </p>
        <button
          type="button"
          onClick={() => navigate(backTo)}
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
          Back to search
        </button>
      </div>
    );
  }

  // A truck lives at `/trucks/:id`, machinery at `/machinery/:id` (UI2a,
  // UI2b). Kept forever: old links and the sitemap said `/cars/:id`.
  const isTruck = car.category === "truck";
  const isCar = isCarCategory(car.category);
  if (listingBase(car.category) !== base) return <Navigate to={`${listingBase(car.category)}/${car.id}${location.search}`} replace />;

  const name = `${car.make} ${car.model} ${car.year}`;
  // The icon reinforces the overline, never replaces it - every cell
  // still reads as "FUEL / Petrol" with the glyph stripped out.
  const specs: Array<{ k: string; v: string; icon: SpecIconName }> = [
    // The stored value is a slug ("sedan"); the cell was rendering it
    // raw, lowercase, mid-sentence. Same label map Browse's filter uses.
    { k: "CATEGORY", v: VEHICLE_CATEGORY_LABEL[car.category] ?? car.category, icon: "category" },
    ...(car.category === "truck"
      ? [
          { k: "TRUCK TYPE", v: truckTypeLabel(car.truck_type) || "Not given", icon: "category" as SpecIconName },
          { k: "CARRIES UP TO", v: formatPayload(car.payload_kg) || "Not given", icon: "category" as SpecIconName },
        ]
      : []),
    { k: "TRANSMISSION", v: car.transmission === "manual" ? "Manual" : "Automatic", icon: "transmission" },
    { k: "FUEL", v: car.fuel, icon: "fuel" },
    // Seats and "Self-drive" are how a car is picked, not a truck or machinery (UI2a, UI2b).
    ...(isCar ? [{ k: "SEATS", v: String(car.seats), icon: "seats" as SpecIconName }] : []),
    ...(!isCar && !car.chauffeured
      ? []
      : [{ k: "DRIVER", v: car.chauffeured ? "Comes with driver" : "Self-drive", icon: "driver" as SpecIconName }]),
    car.hiring_unit === "day"
      ? { k: "MIN. HIRE", v: `${car.minimum_hire_days} day${car.minimum_hire_days > 1 ? "s" : ""}`, icon: "hire" }
      : { k: "PRICED", v: car.quoted ? "By quote" : `Per ${HIRING_UNIT_LABEL[car.hiring_unit]}`, icon: "hire" },
  ];

  return (
    <div style={{ padding: "clamp(16px,2.4vw,26px) clamp(14px,3vw,32px) clamp(40px,6vw,72px)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <button
          type="button"
          onClick={() => navigate(backTo)}
          style={{
            height: 34,
            padding: "0 12px 0 8px",
            background: "none",
            border: "none",
            font: "600 13px/1 'Instrument Sans',sans-serif",
            color: "#5A6373",
            cursor: "pointer",
            marginBottom: 14,
          }}
        >
          ← All {isTruck ? "trucks" : isCar ? "cars" : "machinery"}{car.county ? ` in ${car.county}` : ""}
        </button>

        <div style={{ display: "flex", gap: "clamp(18px,2.6vw,30px)", alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* ---- left column ---- */}
          <div style={{ flex: "1 1 500px", minWidth: 300 }}>
            <div
              style={{
                background: TINT,
                border: "1px solid #E4E7EC",
                borderRadius: 12,
                height: "clamp(220px,30vw,340px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                marginBottom: 10,
                overflow: "hidden",
              }}
            >
              {car.photo_urls[0] ? (
                <img
                  src={photoSrc(car.photo_urls[0])}
                  alt={name}
                  style={{
                    display: "block",
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "center 75%",
                  }}
                />
              ) : (
                <span
                  style={{
                    font: "500 12px/1.5 'IBM Plex Mono',monospace",
                    letterSpacing: ".1em",
                    color: "#9AA2B0",
                    textAlign: "center",
                    padding: "0 20px",
                  }}
                >
                  MAIN PHOTO · {name}
                </span>
              )}
              {car.verified && (
                <span
                  style={{
                    position: "absolute",
                    top: 14,
                    left: 14,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "6px 13px",
                    background: "#DDF3E9",
                    border: "1px solid #A8DEC7",
                    borderRadius: 999,
                    font: "600 12px/1.4 'Instrument Sans',sans-serif",
                    color: "#076945",
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: "#0B8A5B" }} />
                  Verified
                </span>
              )}
            </div>

            {car.photo_urls.length > 1 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4,1fr)",
                  gap: 10,
                  marginBottom: "clamp(22px,3vw,30px)",
                }}
              >
                {car.photo_urls.slice(1, 5).map((url) => (
                  <div
                    key={url}
                    style={{
                      height: 74,
                      position: "relative",
                      background: "#F1F3F6",
                      border: "1px solid #E4E7EC",
                      borderRadius: 8,
                      overflow: "hidden",
                    }}
                  >
                    <img
                      src={photoSrc(url)}
                      alt=""
                      style={{
                        display: "block",
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        objectPosition: "center 75%",
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            <h1
              style={{
                margin: "0 0 8px",
                font: "700 clamp(26px,3.4vw,38px)/1.08 Archivo,sans-serif",
                fontVariationSettings: "'wdth' 108",
                letterSpacing: "-.028em",
                color: "#0B0F1A",
              }}
            >
              {name}
            </h1>
            <div
              style={{
                display: "flex",
                gap: 14,
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: "clamp(20px,2.8vw,28px)",
              }}
            >
              <PlateBadge value={car.registration} />
              {/*
               * The canvas's `{{car.spec}}` line. Composed from the same
               * three fields, in the same order and wording, as
               * `VehicleCard` - a renter who clicks a card should not
               * find the car described differently on the next screen.
               */}
              <span style={{ font: "400 14px/1.4 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                {[specLine(car), crewNote(car)].filter(Boolean).join(" · ")}
              </span>
              <span style={{ width: 4, height: 4, borderRadius: 999, background: "#CDD2DA" }} />
              {/*
               * This car's own score where it has one. Most listings
               * won't for a long while - a car needs its own completed,
               * rated hire - so rather than a bare "Not rated yet" above
               * an owner card reading "5.0 · 3 reviews" (which reads as
               * the page contradicting itself), it falls back to the
               * owner's score with the word "owner" carrying the scope.
               * Two figures that say what they count, never one figure
               * disagreeing with itself.
               */}
              {car.rating ? (
                <Rating rating={car.rating} />
              ) : (
                <Rating rating={car.owner_rating} noun="owner review" />
              )}
            </div>

            {/* Layout lives in `.cral-spec-grid` (src/index.css) - the
                three-up/two-up column count needs a media query, which an
                inline style cannot express. */}
            <div className="cral-spec-grid" style={{ marginBottom: "clamp(20px,2.8vw,28px)" }}>
              {specs.map((s) => (
                <div
                  key={s.k}
                  style={{
                    background: "#FFFFFF",
                    padding: "18px 14px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                      font: "500 10px/1 'IBM Plex Mono',monospace",
                      letterSpacing: ".09em",
                      color: "#9AA2B0",
                      marginBottom: 9,
                    }}
                  >
                    <SpecIcon name={s.icon} color="#9AA2B0" />
                    {s.k}
                  </div>
                  <div style={{ font: "600 14px/1.35 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>{s.v}</div>
                </div>
              ))}
            </div>

            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E4E7EC",
                borderRadius: 12,
                padding: "clamp(18px,2.4vw,24px)",
                marginBottom: "clamp(16px,2.2vw,22px)",
              }}
            >
              <div
                style={{
                  font: "600 17px/1.3 Archivo,sans-serif",
                  fontVariationSettings: "'wdth' 106",
                  color: "#0B0F1A",
                  marginBottom: 14,
                }}
              >
                What CRAL checked on this {vehicleNoun(car.category)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 9 }}>
                {car.documents_cleared.map((d) => (
                  <div
                    key={d.kind}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "11px 13px",
                      background: "#F8F9FB",
                      borderRadius: 8,
                    }}
                  >
                    <span
                      style={{
                        flex: "none",
                        width: 16,
                        height: 16,
                        borderRadius: 999,
                        background: d.cleared ? "#DDF3E9" : "#F1F3F6",
                        color: d.cleared ? "#076945" : "#9AA2B0",
                        font: "700 10px/16px 'Instrument Sans',sans-serif",
                        textAlign: "center",
                      }}
                    >
                      {d.cleared ? "✓" : "…"}
                    </span>
                    <span style={{ flex: 1, font: "500 13px/1.4 'Instrument Sans',sans-serif", color: "#333B4A" }}>
                      {d.label}
                    </span>
                    <span style={{ font: "500 10px/1 'IBM Plex Mono',monospace", color: "#838C9B" }}>
                      {d.cleared ? "CLEARED" : "IN REVIEW"}
                    </span>
                  </div>
                ))}
              </div>
              <p style={{ margin: "14px 0 0", font: "400 13px/1.55 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                A cleared document set is not a mechanical inspection.{" "}
                <Link to="/how-we-protect-you" style={{ color: "#0F23A8" }}>
                  What verification does and does not cover →
                </Link>
              </p>
            </div>

            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E4E7EC",
                borderRadius: 12,
                padding: "clamp(18px,2.4vw,24px)",
                marginBottom: "clamp(16px,2.2vw,22px)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 14,
                  alignItems: "center",
                  marginBottom: 14,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ font: "600 17px/1.3 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", color: "#0B0F1A" }}>
                  The owner
                </span>
                <span
                  style={{
                    font: "500 11px/1 'IBM Plex Mono',monospace",
                    letterSpacing: ".08em",
                    color: "#838C9B",
                  }}
                >
                  ON CRAL SINCE{" "}
                  {new Date(car.owner.since).toLocaleDateString("en-GB", { month: "short", year: "numeric" }).toUpperCase()}
                </span>
              </div>
              <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                <span
                  style={{
                    flex: "none",
                    width: 46,
                    height: 46,
                    borderRadius: 999,
                    background: "#EDEFFC",
                    color: "#0F23A8",
                    font: "600 16px/46px Archivo,sans-serif",
                    textAlign: "center",
                  }}
                >
                  {car.owner.display_name.slice(0, 2).toUpperCase()}
                </span>
                <div style={{ flex: 1, minWidth: 190 }}>
                  <div style={{ font: "600 15px/1.35 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 3 }}>
                    {car.owner.display_name}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                      font: "400 13px/1.4 'Instrument Sans',sans-serif",
                      color: "#5A6373",
                    }}
                  >
                    <span>
                      {car.owner.listed_count} listing{car.owner.listed_count === 1 ? "" : "s"}
                    </span>
                    <span style={{ width: 4, height: 4, borderRadius: 999, background: "#CDD2DA" }} />
                    {/* The owner's score across every car they list - a
                        wider set than the masthead's, which is this car
                        alone. Labelled so the two aren't read as one
                        number disagreeing with itself. */}
                    <Rating rating={car.owner_rating} size={13} empty="No owner reviews yet" />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: 12, padding: "clamp(18px,2.4vw,24px)" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 14,
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: 6,
                }}
              >
                <span style={{ font: "600 17px/1.3 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", color: "#0B0F1A" }}>
                  From people who hired it
                </span>
                {/* Only when this car has its own - otherwise the header
                    would repeat the owner's score under a heading that
                    isn't about the owner. */}
                {car.rating && <Rating rating={car.rating} size={13} />}
              </div>
              <p style={{ margin: "0 0 4px", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" }}>
                Only renters who completed a hire can leave one.
              </p>
              {car.reviews.length === 0 ? (
                <p style={{ margin: "12px 0 0", font: "400 14px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                  No reviews for this {vehicleNoun(car.category)} yet.
                  {car.owner_rating
                    ? ` Its owner is rated ${car.owner_rating.average.toFixed(1)} from ${
                        car.owner_rating.count
                      } hire${car.owner_rating.count === 1 ? "" : "s"} of their other listings.`
                    : ""}
                </p>
              ) : (
                <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                  {car.reviews.map((r) => (
                    <div key={r.id} style={{ padding: "15px 16px", background: "#F8F9FB", borderRadius: 8 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          marginBottom: 8,
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        <span style={{ font: "600 14px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>
                          {r.who}
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <Stars stars={r.stars} />
                          <span style={{ font: "500 12px/1.4 'IBM Plex Mono',monospace", color: "#838C9B" }}>
                            {new Date(r.when)
                              .toLocaleDateString("en-GB", { month: "short", year: "numeric" })
                              .toUpperCase()}
                          </span>
                        </span>
                      </div>
                      {r.text && (
                        <p style={{ margin: 0, font: "400 14px/1.6 'Instrument Sans',sans-serif", color: "#333B4A" }}>
                          {r.text}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {/* The list is capped at ten; the count above is whole-set,
                  so the two are allowed to disagree and the copy says so. */}
              {car.rating && car.rating.count > car.reviews.length && (
                <p style={{ margin: "12px 0 0", font: "400 12.5px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" }}>
                  Showing the {car.reviews.length} most recent of {car.rating.count}.
                </p>
              )}
            </div>
          </div>

          {isTruck ? <TruckRequestPanel car={car} /> : <CarRequestPanel car={car} />}
        </div>
      </div>
    </div>
  );
}
