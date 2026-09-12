import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "../lib/use-seo.js";
import { getCatalogVehicle, photoSrc, formatMoney } from "../lib/catalog-api.js";
import { useIsAuthenticated } from "../lib/auth.js";

/**
 * `/cars/:id`, reproduced from the design's "detail" screen. Two things
 * are deliberately honest rather than matching the canvas literally:
 *
 *  - "What CRAL checked" lists only the three per-vehicle documents a
 *    reviewer actually decided on - no semantic claim ("ownership
 *    verified") beyond that, since there is no OCR in this product.
 *  - Reviews render only if `owner_rating` is non-null. Nothing writes a
 *    hirer's rating of a merchant yet, so an empty, honest state is what
 *    ships rather than a fabricated one.
 */

const TINT = "#EEF0F3";

export function CarDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isAuthed = useIsAuthenticated();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

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
      ? `${carName} in ${car.county ?? "Kenya"} - ${formatMoney(car.daily_rate)} / day. Documents read, no booking fee.`
      : undefined,
    path: id ? `/cars/${id}` : undefined,
    // AggregateRating only when a real rating exists (car.owner_rating) -
    // emitting it over nothing is structured-data spam, the same
    // fabrication the id_verified badge was removed for.
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
            price: (car.daily_rate.amount / 100).toString(),
            priceCurrency: car.daily_rate.currency,
            availability: "https://schema.org/InStock",
          },
          ...(car.owner_rating
            ? {
                aggregateRating: {
                  "@type": "AggregateRating",
                  ratingValue: car.owner_rating.average,
                  reviewCount: car.owner_rating.count,
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
          onClick={() => navigate("/browse")}
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

  const name = `${car.make} ${car.model} ${car.year}`;
  const specs: Array<{ k: string; v: string }> = [
    { k: "CATEGORY", v: car.category },
    { k: "TRANSMISSION", v: car.transmission === "manual" ? "Manual" : "Automatic" },
    { k: "FUEL", v: car.fuel },
    { k: "SEATS", v: String(car.seats) },
    { k: "DRIVER", v: car.chauffeured ? "Comes with driver" : "Self-drive" },
    { k: "MIN. HIRE", v: `${car.minimum_hire_days} day${car.minimum_hire_days > 1 ? "s" : ""}` },
  ];

  const days =
    from && to
      ? Math.max(1, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000))
      : 0;
  const total = days > 0 ? car.daily_rate.amount * days : 0;

  const requestDates = () => {
    if (!from || !to) return;
    const next = `/book/${car.id}?from=${from}&to=${to}`;
    navigate(isAuthed ? next : `/sign-in?next=${encodeURIComponent(next)}`);
  };

  return (
    <div style={{ padding: "clamp(16px,2.4vw,26px) clamp(14px,3vw,32px) clamp(40px,6vw,72px)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <button
          type="button"
          onClick={() => navigate("/browse")}
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
          ← All cars{car.county ? ` in ${car.county}` : ""}
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
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
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
                      background: "#F1F3F6",
                      border: "1px solid #E4E7EC",
                      borderRadius: 8,
                      overflow: "hidden",
                    }}
                  >
                    <img src={photoSrc(url)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
              <span style={{ font: "500 14px/1.4 'IBM Plex Mono',monospace", color: "#5A6373" }}>
                {car.registration}
              </span>
              {car.owner_rating && (
                <>
                  <span style={{ width: 4, height: 4, borderRadius: 999, background: "#CDD2DA" }} />
                  <span style={{ font: "500 14px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>
                    ★ {car.owner_rating.average} · {car.owner_rating.count} review
                    {car.owner_rating.count === 1 ? "" : "s"}
                  </span>
                </>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(128px,1fr))",
                gap: 1,
                background: "#E4E7EC",
                border: "1px solid #E4E7EC",
                borderRadius: 12,
                overflow: "hidden",
                marginBottom: "clamp(20px,2.8vw,28px)",
              }}
            >
              {specs.map((s) => (
                <div key={s.k} style={{ background: "#FFFFFF", padding: "15px 16px" }}>
                  <div
                    style={{
                      font: "500 10px/1 'IBM Plex Mono',monospace",
                      letterSpacing: ".09em",
                      color: "#9AA2B0",
                      marginBottom: 7,
                    }}
                  >
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
                What CRAL checked on this car
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
                <a href="/how-we-protect-you" style={{ color: "#0F23A8" }}>
                  What verification does and does not cover →
                </a>
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
                  <div style={{ font: "400 13px/1.4 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                    {car.owner.listed_count} car{car.owner.listed_count === 1 ? "" : "s"} listed
                  </div>
                </div>
              </div>
            </div>

            <div style={{ background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: 12, padding: "clamp(18px,2.4vw,24px)" }}>
              <div style={{ font: "600 17px/1.3 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", color: "#0B0F1A", marginBottom: 6 }}>
                From people who hired it
              </div>
              <p style={{ margin: "0 0 4px", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" }}>
                Only renters who completed a hire can leave one.
              </p>
              {!car.owner_rating && (
                <p style={{ margin: "12px 0 0", font: "400 14px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                  No reviews yet.
                </p>
              )}
            </div>
          </div>

          {/* ---- quote panel ---- */}
          <div
            style={{
              flex: "0 0 348px",
              minWidth: 290,
              position: "sticky",
              top: 82,
              background: "#FFFFFF",
              border: "1.5px solid #0B0F1A",
              borderRadius: 12,
              padding: "clamp(18px,2.4vw,24px)",
              boxShadow: "0 14px 34px rgba(11,15,26,.08)",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
              <span
                style={{
                  font: "700 clamp(26px,3.2vw,32px)/1 Archivo,sans-serif",
                  fontVariationSettings: "'wdth' 108",
                  color: "#0B0F1A",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatMoney(car.daily_rate)}
              </span>
              <span style={{ font: "400 15px/1.4 'Instrument Sans',sans-serif", color: "#5A6373" }}>per day</span>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <label style={{ flex: "1 1 130px", display: "block" }}>
                <span
                  style={{
                    display: "block",
                    font: "600 11px/1 'IBM Plex Mono',monospace",
                    letterSpacing: ".08em",
                    color: "#838C9B",
                    marginBottom: 7,
                  }}
                >
                  FROM
                </span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  style={{
                    width: "100%",
                    height: 44,
                    padding: "0 11px",
                    border: "1px solid #CDD2DA",
                    borderRadius: 8,
                    font: "500 14px/1 'IBM Plex Mono',monospace",
                    color: "#0B0F1A",
                    background: "#FFFFFF",
                  }}
                />
              </label>
              <label style={{ flex: "1 1 130px", display: "block" }}>
                <span
                  style={{
                    display: "block",
                    font: "600 11px/1 'IBM Plex Mono',monospace",
                    letterSpacing: ".08em",
                    color: "#838C9B",
                    marginBottom: 7,
                  }}
                >
                  UNTIL
                </span>
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                  style={{
                    width: "100%",
                    height: 44,
                    padding: "0 11px",
                    border: "1px solid #CDD2DA",
                    borderRadius: 8,
                    font: "500 14px/1 'IBM Plex Mono',monospace",
                    color: "#0B0F1A",
                    background: "#FFFFFF",
                  }}
                />
              </label>
            </div>

            {days > 0 && (
              <div
                style={{
                  display: "grid",
                  gap: 9,
                  padding: "15px 0",
                  borderTop: "1px solid #F1F3F6",
                  borderBottom: "1px solid #F1F3F6",
                  marginBottom: 15,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ font: "400 13.5px/1.4 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                    {days} day{days > 1 ? "s" : ""} × {formatMoney(car.daily_rate)}
                  </span>
                  <span style={{ font: "500 13.5px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>
                    {formatMoney({ amount: total, currency: car.daily_rate.currency })}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ font: "400 13.5px/1.4 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                    CRAL booking fee
                  </span>
                  <span style={{ font: "500 13.5px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>KES 0</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ font: "600 14px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>Total</span>
                  <span
                    style={{
                      font: "700 15px/1.4 Archivo,sans-serif",
                      fontVariationSettings: "'wdth' 106",
                      color: "#0B0F1A",
                    }}
                  >
                    {formatMoney({ amount: total, currency: car.daily_rate.currency })}
                  </span>
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={!from || !to}
              onClick={requestDates}
              style={{
                width: "100%",
                height: 50,
                background: from && to ? "#0F23A8" : "#CDD2DA",
                color: "#FFFFFF",
                border: "none",
                borderRadius: 8,
                font: "600 16px/1 'Instrument Sans',sans-serif",
                cursor: from && to ? "pointer" : "not-allowed",
                marginBottom: 11,
              }}
            >
              Request these dates
            </button>
            <p style={{ margin: 0, font: "400 12.5px/1.55 'Instrument Sans',sans-serif", color: "#5A6373", textAlign: "center" }}>
              No money moves yet. The owner has twelve hours to accept.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
