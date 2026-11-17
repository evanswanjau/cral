import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "../lib/use-seo.js";
import { merchantLandingUrl } from "../lib/merchant-app.js";
import { earliestPickupDay } from "../lib/hire-dates.js";
import { getCollections, getCounties, formatMoney, type CatalogCollection } from "../lib/catalog-api.js";
import { VehicleCard, CARD_TINTS } from "../components/site/VehicleCard.js";
import { Dropdown, PIN_ICON } from "../components/site/Dropdown.js";
import { COUNTIES } from "../lib/kenya.js";
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
 * Service modes supported on the CRAL multi-service platform.
 */
type ServiceMode = "hire" | "trucks" | "driver" | "towing" | "service" | "parts" | "sales";

interface ServiceTab {
  id: ServiceMode;
  label: string;
  badge?: string;
  icon: JSX.Element;
  tagline: string;
}

const SERVICE_TABS: ServiceTab[] = [
  {
    id: "hire",
    label: "Car Rental",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="10" width="20" height="9" rx="2" />
        <path d="M5 10l2-5h10l2 5M6 19v2M18 19v2" />
        <circle cx="7.5" cy="14.5" r="1.5" />
        <circle cx="16.5" cy="14.5" r="1.5" />
      </svg>
    ),
    tagline: "Sedans, SUVs and vans from verified Kenyan hosts",
  },
  {
    id: "trucks",
    label: "Haulage & Trucks",
    badge: "QUOTES",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="1" y="4" width="14" height="12" rx="1" />
        <path d="M15 9h4l3 3v4h-7V9zM5 18v2M18 18v2" />
        <circle cx="5" cy="16" r="2" />
        <circle cx="18" cy="16" r="2" />
      </svg>
    ),
    tagline: "Tippers, canters, trailers and plant with per-km and per-tonne rates",
  },
  {
    id: "driver",
    label: "Hire a Driver",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="7" r="4" />
        <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
      </svg>
    ),
    tagline: "Vetted professional drivers with verified NTSA licences",
  },
  {
    id: "towing",
    label: "24/7 Towing SOS",
    badge: "24/7",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
    tagline: "Fast emergency breakdown and accident flatbed recovery",
  },
  {
    id: "service",
    label: "Garage & Repairs",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
    tagline: "Inspected physical workshop premises with guaranteed itemised quotes",
  },
  {
    id: "parts",
    label: "Spare Parts",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
    tagline: "Genuine and OEM replacement parts quoted against your chassis / VIN",
  },
  {
    id: "sales",
    label: "Buy a Car",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    ),
    tagline: "Verified vehicles with encumbrance and bank caveats checked",
  },
];

const HERO_COUNTY_CHIPS = 7;
const HERO_PHOTOS = [heroXtrail, heroMercedes, heroCx5, heroLandCruiser, heroDemio];

const TRUST_COLS = [
  {
    n: "01",
    title: "Paperwork verified first",
    body: "Real compliance officers check logbooks, NTSA licences, tracker certificates, and workshop premises before anything is listed.",
  },
  {
    n: "02",
    title: "Zero money risk",
    body: "You pay only once an owner accepts your dates, and maintenance/parts funds are held securely in escrow until you confirm delivery.",
  },
  {
    n: "03",
    title: "Evidence-backed protection",
    body: "Handover photos, GPS timestamps, and binding quotes ensure fair, evidence-based dispute arbitration with no hidden fees.",
  },
];

const CATEGORY_TILES = [
  { slug: "sedan", label: "Sedans & small cars", note: "City runs, daily commutes and airport hops", photo: sedanPhoto },
  { slug: "suv", label: "SUV, 4x4 & pickup", note: "Upcountry trips, game parks and safari cruisers", photo: suvPhoto },
  { slug: "van", label: "Vans & minibuses", note: "8 to 14-seater passenger transport and tours", photo: vanPhoto },
  { slug: "truck", label: "Trucks & trailers", note: "Tipper trucks, canters, flatbeds and haulage", photo: truckPhoto },
  { slug: "machinery", label: "Construction & plant", note: "Excavators, backhoes, rollers and machinery", photo: machineryPhoto },
];

const TRUCK_SHOWCASE = [
  { type: "Canter / 3-5t", desc: "Hardware, food distribution & urban deliveries", price: "From KES 8,000 / trip" },
  { type: "Tipper / 14-20t", desc: "Sand, ballast, quarry stone & excavation", price: "From KES 14,000 / trip" },
  { type: "Flatbed / Low-loader", desc: "Containers, machinery & oversized transport", price: "Quoted per km / tonne" },
  { type: "Prime Mover 28-32t", desc: "Long-haul freight, transit & cross-county logistics", price: "Corridor quote on route" },
];

function Rail({ collection }: { collection: CatalogCollection }): JSX.Element {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => {
    ref.current?.scrollBy({ left: dir * 560, behavior: "smooth" });
  };

  return (
    <div style={{ padding: "clamp(16px,2.5vw,26px) 0" }}>
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
                font: "500 10.5px/1 'IBM Plex Mono',monospace",
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
              font: "700 clamp(22px,2.8vw,32px)/1.1 Archivo,sans-serif",
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
            See all in {collection.title} →
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
      "CRAL is Kenya's complete automotive ecosystem: passenger vehicle hire, commercial haulage trucks, vetted professional drivers, 24/7 roadside towing, inspected garage repairs, and chassis-matched spare parts.",
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
  const [activeMode, setActiveMode] = useState<ServiceMode>("hire");
  const [city, setCity] = useState<string | undefined>(undefined);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["catalog", "collections"],
    queryFn: getCollections,
  });

  const { data: countyData } = useQuery({
    queryKey: ["catalog", "counties"],
    queryFn: getCounties,
  });
  const counties = (countyData?.counties ?? []).map((c) => c.county);
  const rails = (data?.collections ?? []).filter((c) => c.vehicles.length > 0);

  const uniqueVehicles = new Map(rails.flatMap((c) => c.vehicles).map((v) => [v.id, v]));
  const minPriceByCategory = new Map<string, { amount: number; currency: string }>();
  for (const v of uniqueVehicles.values()) {
    const cur = minPriceByCategory.get(v.category);
    if (!cur || v.daily_rate.amount < cur.amount) minPriceByCategory.set(v.category, v.daily_rate);
  }

  return (
    <div>
      {/* ===================== HERO SECTION ===================== */}
      <div
        style={{
          background: "#0B0F1A",
          minHeight: "clamp(640px, 92vh, 880px)",
          padding: "clamp(74px,8vw,110px) 0 clamp(36px,5vw,60px)",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        {/* Background photo crossfade */}
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

        {/* Ambient Dark Gradient Layer */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(100deg, rgba(11,15,26,.97) 0%, rgba(11,15,26,.88) 38%, rgba(11,15,26,.55) 70%, rgba(11,15,26,.82) 100%)",
            pointerEvents: "none",
          }}
        />

        {/* Accent Red Slices */}
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

        {/* Main Hero Container */}
        <div
          style={{
            width: "100%",
            maxWidth: 1320,
            margin: "0 auto",
            padding: "0 clamp(16px,4vw,40px)",
            position: "relative",
            boxSizing: "border-box",
          }}
        >
          {/* Eyebrow & Headline */}
          <div style={{ maxWidth: 880, marginBottom: "clamp(22px,3vw,34px)" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span
                style={{
                  display: "block",
                  width: 16,
                  height: 4,
                  background: "#D81E32",
                  transform: "skewX(-14deg)",
                }}
              />
              <span
                style={{
                  font: "600 11px/1 'IBM Plex Mono',monospace",
                  letterSpacing: ".14em",
                  color: "#B6C0F4",
                  textTransform: "uppercase",
                }}
              >
                Kenya&apos;s Verified Automotive Marketplace
              </span>
            </div>

            <h1
              style={{
                margin: "0 0 16px",
                font: "700 clamp(36px,5.8vw,68px)/1.02 Archivo,sans-serif",
                fontVariationSettings: "'wdth' 112",
                letterSpacing: "-.035em",
                color: "#FFFFFF",
              }}
            >
              Everything your vehicle needs. All in one place.
            </h1>

            <p
              style={{
                margin: 0,
                font: "400 clamp(15.5px,1.8vw,19px)/1.55 'Instrument Sans',sans-serif",
                color: "#C3CAD5",
                maxWidth: 720,
              }}
            >
              Hire passenger cars, contract heavy haulage trucks, book vetted drivers, dispatch 24/7 towing, service at inspected garages, or source genuine spare parts. Every provider verified by CRAL.
            </p>
          </div>

          {/* ================= MULTI-SERVICE CONSOLE ================= */}
          <div style={{ maxWidth: 1040 }}>
            {/* Service Mode Tabs */}
            <div
              className="cral-rail"
              style={{
                display: "flex",
                gap: 6,
                overflowX: "auto",
                paddingBottom: 10,
                marginBottom: 2,
              }}
            >
              {SERVICE_TABS.map((tab) => {
                const active = activeMode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveMode(tab.id)}
                    style={{
                      flex: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      height: 40,
                      padding: "0 14px",
                      borderRadius: "999px",
                      background: active ? "#FFFFFF" : "rgba(255,255,255,.07)",
                      color: active ? "#0B0F1A" : "#DCE1FA",
                      border: active ? "1px solid #FFFFFF" : "1px solid rgba(255,255,255,.16)",
                      cursor: "pointer",
                      font: `${active ? 600 : 500} 13.5px/1 'Instrument Sans',sans-serif`,
                      transition: "all .15s ease",
                      boxShadow: active ? "0 4px 14px rgba(0,0,0,.25)" : "none",
                    }}
                  >
                    <span style={{ display: "flex", color: active ? "#0F23A8" : "#B6C0F4" }}>
                      {tab.icon}
                    </span>
                    <span>{tab.label}</span>
                    {tab.badge && (
                      <span
                        style={{
                          fontSize: 9,
                          fontFamily: "'IBM Plex Mono',monospace",
                          fontWeight: 700,
                          padding: "2px 5px",
                          borderRadius: 4,
                          background: active ? "#D81E32" : "rgba(216,30,50,.35)",
                          color: "#FFFFFF",
                          letterSpacing: ".06em",
                        }}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Dynamic Console Input Box */}
            <div
              style={{
                background: "#FFFFFF",
                borderRadius: 18,
                boxShadow: "0 24px 64px rgba(0,0,0,.45)",
                overflow: "hidden",
                border: "1px solid #E4E7EC",
              }}
            >
              {activeMode === "hire" && (
                <HireConsole city={city} counties={counties} onSelectCity={setCity} />
              )}
              {activeMode === "trucks" && <TrucksConsole counties={counties} />}
              {activeMode === "driver" && <DriversConsole counties={counties} />}
              {activeMode === "towing" && <TowingConsole counties={counties} />}
              {activeMode === "service" && <GarageConsole counties={counties} />}
              {activeMode === "parts" && <PartsConsole />}
              {activeMode === "sales" && <SalesConsole counties={counties} />}
            </div>

            {/* Active Mode Subtext & Quick Link */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
                marginTop: 12,
                padding: "0 6px",
              }}
            >
              <span style={{ font: "400 13px/1.4 'Instrument Sans',sans-serif", color: "#A7B0BE" }}>
                {SERVICE_TABS.find((t) => t.id === activeMode)?.tagline}
              </span>
              {activeMode === "hire" && counties.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ font: "500 11.5px/1 'IBM Plex Mono',monospace", color: "#7A8494" }}>
                    POPULAR:
                  </span>
                  {counties.slice(0, HERO_COUNTY_CHIPS).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCity(c)}
                      style={{
                        background: city === c ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.06)",
                        border: `1px solid ${city === c ? "#9AA6B8" : "rgba(255,255,255,.12)"}`,
                        borderRadius: 999,
                        color: "#E2E7EE",
                        fontSize: 12,
                        padding: "3px 9px",
                        cursor: "pointer",
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===================== SERVICES SHOWCASE GRID ===================== */}
      <div style={{ padding: "clamp(36px,5vw,60px) clamp(16px,4vw,40px) 0" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto" }}>
          <div style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
              <span
                style={{
                  display: "block",
                  width: 18,
                  height: 5,
                  background: "#D81E32",
                  transform: "skewX(-14deg)",
                }}
              />
              <span
                style={{
                  font: "600 11px/1 'IBM Plex Mono',monospace",
                  letterSpacing: ".12em",
                  color: "#838C9B",
                }}
              >
                THE CRAL ECOSYSTEM
              </span>
            </div>
            <h2
              style={{
                margin: "0 0 6px",
                font: "700 clamp(24px,3.2vw,36px)/1.1 Archivo,sans-serif",
                fontVariationSettings: "'wdth' 108",
                letterSpacing: "-.025em",
                color: "#0B0F1A",
              }}
            >
              Every automotive need, covered under one roof
            </h2>
            <p style={{ margin: 0, font: "400 15px/1.5 'Instrument Sans',sans-serif", color: "#5A6373", maxWidth: 620 }}>
              Whether you need to move people, transport heavy freight, repair your engine, or buy replacement parts, CRAL brings trust and verification to Kenya&apos;s roads.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            {/* Service 1: Passenger Vehicle Rental */}
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E4E7EC",
                borderRadius: 14,
                padding: "24px 22px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                position: "relative",
              }}
            >
              <div>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 10,
                    background: "#EDEFFC",
                    color: "#0F23A8",
                    display: "grid",
                    placeItems: "center",
                    marginBottom: 16,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="10" width="20" height="9" rx="2" />
                    <path d="M5 10l2-5h10l2 5M6 19v2M18 19v2" />
                    <circle cx="7.5" cy="14.5" r="1.5" />
                    <circle cx="16.5" cy="14.5" r="1.5" />
                  </svg>
                </div>
                <h3 style={{ margin: "0 0 8px", font: "700 19px/1.2 Archivo,sans-serif", color: "#0B0F1A" }}>
                  Passenger Car Hire
                </h3>
                <p style={{ margin: 0, font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                  City runarounds, executive saloons, rough-road SUVs and family vans. 4-digit pickup handover OTP and zero cancellation fees before acceptance.
                </p>
              </div>
              <div style={{ marginTop: 20 }}>
                <Link
                  to="/browse"
                  style={{
                    font: "600 13.5px/1 'Instrument Sans',sans-serif",
                    color: "#0F23A8",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  Browse available cars →
                </Link>
              </div>
            </div>

            {/* Service 2: Commercial Haulage & Heavy Plant */}
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E4E7EC",
                borderRadius: 14,
                padding: "24px 22px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 10,
                    background: "#FCEEEF",
                    color: "#D81E32",
                    display: "grid",
                    placeItems: "center",
                    marginBottom: 16,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="1" y="4" width="14" height="12" rx="1" />
                    <path d="M15 9h4l3 3v4h-7V9zM5 18v2M18 18v2" />
                    <circle cx="5" cy="16" r="2" />
                    <circle cx="18" cy="16" r="2" />
                  </svg>
                </div>
                <h3 style={{ margin: "0 0 8px", font: "700 19px/1.2 Archivo,sans-serif", color: "#0B0F1A" }}>
                  Commercial Haulage & Plant
                </h3>
                <p style={{ margin: 0, font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                  Canters, tippers, flatbeds, low loaders and construction machinery. Priced per km, per tonne or flat route quotes. Verified tonnage capacity.
                </p>
              </div>
              <div style={{ marginTop: 20 }}>
                <Link
                  to="/browse?category=truck"
                  style={{
                    font: "600 13.5px/1 'Instrument Sans',sans-serif",
                    color: "#0F23A8",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  View commercial trucks →
                </Link>
              </div>
            </div>

            {/* Service 3: Professional Drivers */}
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E4E7EC",
                borderRadius: 14,
                padding: "24px 22px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 10,
                    background: "#EDEFFC",
                    color: "#0F23A8",
                    display: "grid",
                    placeItems: "center",
                    marginBottom: 16,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="7" r="4" />
                    <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
                  </svg>
                </div>
                <h3 style={{ margin: "0 0 8px", font: "700 19px/1.2 Archivo,sans-serif", color: "#0B0F1A" }}>
                  Vetted Professional Drivers
                </h3>
                <p style={{ margin: 0, font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                  Hire an accredited driver for your personal car or book a chauffeured vehicle. NTSA licences, national ID and background vetted by CRAL.
                </p>
              </div>
              <div style={{ marginTop: 20 }}>
                <Link
                  to="/drivers"
                  style={{
                    font: "600 13.5px/1 'Instrument Sans',sans-serif",
                    color: "#0F23A8",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  Explore driver roster →
                </Link>
              </div>
            </div>

            {/* Service 4: 24/7 Roadside Towing */}
            <div
              style={{
                background: "#0B0F1A",
                color: "#FFFFFF",
                borderRadius: 14,
                padding: "24px 22px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: -15,
                  right: -25,
                  width: 140,
                  height: 10,
                  background: "#D81E32",
                  transform: "skewX(-14deg)",
                  opacity: 0.6,
                }}
              />
              <div>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 10,
                    background: "rgba(216,30,50,.2)",
                    color: "#D81E32",
                    display: "grid",
                    placeItems: "center",
                    marginBottom: 16,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                  <h3 style={{ margin: 0, font: "700 19px/1.2 Archivo,sans-serif", color: "#FFFFFF" }}>
                    24/7 Roadside Towing
                  </h3>
                  <span style={{ font: "700 9px/1 'IBM Plex Mono',monospace", background: "#D81E32", color: "#fff", padding: "3px 6px", borderRadius: 4 }}>
                    HOTLINE
                  </span>
                </div>
                <p style={{ margin: 0, font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#C3CAD5" }}>
                  Stuck on the road? Immediate flatbed recovery and breakdown winching dispatched across all 47 counties.
                </p>
              </div>
              <div style={{ marginTop: 20 }}>
                <Link
                  to="/services/towing"
                  style={{
                    font: "600 13.5px/1 'Instrument Sans',sans-serif",
                    color: "#FFFFFF",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  Call dispatch or book online →
                </Link>
              </div>
            </div>

            {/* Service 5: Inspected Garage Services */}
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E4E7EC",
                borderRadius: 14,
                padding: "24px 22px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 10,
                    background: "#EDEFFC",
                    color: "#0F23A8",
                    display: "grid",
                    placeItems: "center",
                    marginBottom: 16,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                  </svg>
                </div>
                <h3 style={{ margin: "0 0 8px", font: "700 19px/1.2 Archivo,sans-serif", color: "#0B0F1A" }}>
                  Inspected Garage Services
                </h3>
                <p style={{ margin: 0, font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                  Every workshop premises physically visited. Request competitive itemised quotes for routine service, diagnostics and bodywork. Escrow protected.
                </p>
              </div>
              <div style={{ marginTop: 20 }}>
                <Link
                  to="/services"
                  style={{
                    font: "600 13.5px/1 'Instrument Sans',sans-serif",
                    color: "#0F23A8",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  Request a garage quote →
                </Link>
              </div>
            </div>

            {/* Service 6: Genuine Spare Parts */}
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E4E7EC",
                borderRadius: 14,
                padding: "24px 22px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 10,
                    background: "#EDEFFC",
                    color: "#0F23A8",
                    display: "grid",
                    placeItems: "center",
                    marginBottom: 16,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </div>
                <h3 style={{ margin: "0 0 8px", font: "700 19px/1.2 Archivo,sans-serif", color: "#0B0F1A" }}>
                  Chassis-Matched Spare Parts
                </h3>
                <p style={{ margin: 0, font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                  Dealers quote genuine, OEM and quality replacement parts matched to your chassis number. Payment released only when the part is in your hands.
                </p>
              </div>
              <div style={{ marginTop: 20 }}>
                <Link
                  to="/parts"
                  style={{
                    font: "600 13.5px/1 'Instrument Sans',sans-serif",
                    color: "#0F23A8",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  Order parts by chassis →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===================== PASSENGER RAILS ===================== */}
      {isLoading && <RailsMessage>Loading verified vehicles…</RailsMessage>}
      {isError && (
        <RailsMessage>
          We couldn&apos;t load the listings right now. Refresh in a moment.
        </RailsMessage>
      )}
      {!isLoading && !isError && rails.length === 0 && (
        <RailsMessage>
          Listings are being added across counties. Check back shortly.
        </RailsMessage>
      )}
      {rails.map((c) => (
        <Rail key={c.key} collection={c} />
      ))}

      {/* ===================== COMMERCIAL TRUCKS SPOTLIGHT ===================== */}
      <div style={{ padding: "clamp(24px,3.6vw,44px) clamp(16px,4vw,40px)" }}>
        <div
          style={{
            maxWidth: 1240,
            margin: "0 auto",
            background: "#0B0F1A",
            borderRadius: 16,
            padding: "clamp(28px,4vw,48px)",
            color: "#FFFFFF",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -24,
              right: -50,
              width: 300,
              height: 16,
              background: "#D81E32",
              transform: "skewX(-14deg)",
              opacity: 0.5,
            }}
          />

          <div style={{ maxWidth: 780, marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ width: 14, height: 4, background: "#D81E32", transform: "skewX(-14deg)" }} />
              <span style={{ font: "600 10.5px/1 'IBM Plex Mono',monospace", letterSpacing: ".14em", color: "#B6C0F4" }}>
                COMMERCIAL LOGISTICS
              </span>
            </div>
            <h2
              style={{
                margin: "0 0 10px",
                font: "700 clamp(26px,3.6vw,40px)/1.06 Archivo,sans-serif",
                fontVariationSettings: "'wdth' 108",
                letterSpacing: "-.025em",
                color: "#FFFFFF",
              }}
            >
              Need heavy haulage, moving or construction plant?
            </h2>
            <p style={{ margin: 0, font: "400 15.5px/1.55 'Instrument Sans',sans-serif", color: "#C3CAD5" }}>
              From 3-tonne canters for local distribution to 20-tonne tippers and 32-tonne prime movers, CRAL connects you directly with verified truck owners. Transparent route quotes—fuel, cargo weight and driver fees agreed upfront.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 14,
              marginBottom: 28,
            }}
          >
            {TRUCK_SHOWCASE.map((t) => (
              <div
                key={t.type}
                style={{
                  background: "rgba(255,255,255,.05)",
                  border: "1px solid rgba(255,255,255,.12)",
                  borderRadius: 12,
                  padding: "18px 16px",
                }}
              >
                <div style={{ font: "600 16px/1.2 Archivo,sans-serif", color: "#FFFFFF", marginBottom: 6 }}>
                  {t.type}
                </div>
                <div style={{ font: "400 13px/1.45 'Instrument Sans',sans-serif", color: "#9EABC0", marginBottom: 12 }}>
                  {t.desc}
                </div>
                <div style={{ font: "600 11.5px/1 'IBM Plex Mono',monospace", color: "#B6C0F4" }}>
                  {t.price}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => navigate("/browse?category=truck")}
              style={{
                height: 44,
                padding: "0 22px",
                background: "#0F23A8",
                color: "#FFFFFF",
                border: "none",
                borderRadius: 8,
                font: "600 14.5px/1 'Instrument Sans',sans-serif",
                cursor: "pointer",
              }}
            >
              Browse commercial trucks & plant
            </button>
            <a
              href={`${merchantLandingUrl()}#trucks`}
              style={{
                font: "600 14px/1 'Instrument Sans',sans-serif",
                color: "#FFFFFF",
                textDecoration: "underline",
                textUnderlineOffset: 4,
              }}
            >
              List your commercial truck or fleet →
            </a>
          </div>
        </div>
      </div>

      {/* ===================== CATEGORY TILES ===================== */}
      <div style={{ padding: "clamp(24px,3.6vw,42px) clamp(16px,4vw,40px) clamp(14px,2.2vw,22px)" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto" }}>
          <h2
            style={{
              margin: "0 0 6px",
              font: "700 clamp(22px,2.8vw,32px)/1.1 Archivo,sans-serif",
              fontVariationSettings: "'wdth' 108",
              letterSpacing: "-.026em",
              color: "#0B0F1A",
            }}
          >
            Explore vehicles by category
          </h2>
          <p
            style={{
              margin: "0 0 18px",
              font: "400 14.5px/1.5 'Instrument Sans',sans-serif",
              color: "#5A6373",
              maxWidth: 560,
            }}
          >
            Five verified categories. Select one to see what is currently stationed and available near you.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
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
                  <div style={{ flex: "none", height: 140, position: "relative", borderBottom: "1px solid #E4E7EC", background: "#E7EAEF" }}>
                    <img
                      src={b.photo}
                      alt={b.label}
                      loading="lazy"
                      style={{ display: "block", position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                  <div style={{ padding: "14px 15px 15px" }}>
                    <div style={{ font: "600 15px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 5 }}>
                      {b.label}
                    </div>
                    <div style={{ font: "400 12.5px/1.45 'Instrument Sans',sans-serif", color: "#5A6373", marginBottom: minPrice ? 10 : 0 }}>
                      {b.note}
                    </div>
                    {minPrice && (
                      <div style={{ font: "600 11px/1 'IBM Plex Mono',monospace", letterSpacing: ".06em", color: "#0F23A8" }}>
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

      {/* ===================== TRUST & VERIFICATION BAND ===================== */}
      <div style={{ padding: "clamp(24px,3.6vw,44px) clamp(16px,4vw,40px)" }}>
        <div
          style={{
            maxWidth: 1240,
            margin: "0 auto",
            minHeight: "clamp(420px,46vw,540px)",
            borderRadius: 14,
            padding: "clamp(26px,4vw,48px)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
            backgroundImage: `linear-gradient(90deg, rgba(11,15,26,.97) 0%, rgba(11,15,26,.8) 55%, rgba(11,15,26,.4) 100%), url(${trustDriverPhoto})`,
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
              margin: "0 0 10px",
              font: "700 clamp(26px,3.4vw,40px)/1.08 Archivo,sans-serif",
              fontVariationSettings: "'wdth' 110",
              letterSpacing: "-.028em",
              color: "#FFFFFF",
              maxWidth: 680,
            }}
          >
            Real paperwork. Real people. No hidden fees.
          </h2>

          <p
            style={{
              margin: "0 0 clamp(22px,3vw,34px)",
              font: "400 clamp(15px,1.7vw,17.5px)/1.55 'Instrument Sans',sans-serif",
              color: "#C7CED8",
              maxWidth: 600,
            }}
          >
            Mobility and vehicle services in Kenya often go wrong when money changes hands without verified documentation. On CRAL, every logbook, NTSA licence, tracker certificate, and workshop is checked before it can transact.
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
                    font: "600 11px/1 'IBM Plex Mono',monospace",
                    letterSpacing: ".11em",
                    color: "#F7BDC5",
                    marginBottom: 10,
                  }}
                >
                  {t.n}
                </div>
                <div
                  style={{
                    font: "600 16.5px/1.3 Archivo,sans-serif",
                    fontVariationSettings: "'wdth' 106",
                    color: "#FFFFFF",
                    marginBottom: 8,
                  }}
                >
                  {t.title}
                </div>
                <p style={{ margin: 0, font: "400 14px/1.6 'Instrument Sans',sans-serif", color: "#C7CED8" }}>
                  {t.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===================== CLOSING CTAS ===================== */}
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
              flex: "1 1 540px",
              minWidth: 300,
              background: "#FFFFFF",
              border: "1px solid #E4E7EC",
              borderRadius: 14,
              padding: "clamp(24px,3.2vw,36px)",
            }}
          >
            <div style={{ font: "600 10.5px/1 'IBM Plex Mono',monospace", letterSpacing: ".11em", color: "#9AA2B0", marginBottom: 12 }}>
              CLEAR PROCESS
            </div>
            <h3
              style={{
                margin: "0 0 10px",
                font: "700 clamp(20px,2.4vw,28px)/1.15 Archivo,sans-serif",
                fontVariationSettings: "'wdth' 106",
                letterSpacing: "-.02em",
                color: "#0B0F1A",
              }}
            >
              Transparent quotes. Zero hidden booking markups.
            </h3>
            <p style={{ margin: "0 0 20px", font: "400 15px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
              Whether renting a saloon, moving 14 tonnes of cargo, booking a driver or servicing your car: send a request, get verified quotes, and transact with complete peace of mind.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => navigate("/how-it-works")}
                style={{
                  height: 44,
                  padding: "0 20px",
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
                  padding: "0 20px",
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
              flex: "1 1 340px",
              minWidth: 280,
              position: "relative",
              border: "1px solid #B6C0F4",
              borderRadius: 14,
              padding: "clamp(24px,3.2vw,36px)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 18,
              overflow: "hidden",
              backgroundImage: `linear-gradient(180deg, rgba(11,27,133,.45) 0%, rgba(11,27,133,.85) 100%), url(${keyHandoffPhoto})`,
              backgroundSize: "cover",
              backgroundPosition: "center 30%",
            }}
          >
            <div>
              <div style={{ font: "600 10.5px/1 'IBM Plex Mono',monospace", letterSpacing: ".11em", color: "#DCE1FA", marginBottom: 12 }}>
                BECOME A MERCHANT PARTNER
              </div>
              <h3
                style={{
                  margin: 0,
                  font: "700 clamp(20px,2.4vw,26px)/1.18 Archivo,sans-serif",
                  fontVariationSettings: "'wdth' 106",
                  letterSpacing: "-.02em",
                  color: "#FFFFFF",
                }}
              >
                Own a car, truck, driver agency, garage or parts shop?
              </h3>
            </div>
            <a
              href={merchantLandingUrl()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                alignSelf: "flex-start",
                height: 44,
                padding: "0 22px",
                background: "#FFFFFF",
                color: "#0F23A8",
                border: "none",
                borderRadius: 8,
                font: "600 14px/1 'Instrument Sans',sans-serif",
                textDecoration: "none",
                boxShadow: "0 4px 14px rgba(0,0,0,.15)",
              }}
            >
              Explore Merchant Portal →
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
      <p style={{ margin: 0, font: "400 15px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
        {children}
      </p>
    </div>
  );
}

/* =========================================================================
 * SUB-CONSOLES FOR EACH SERVICE MODE
 * ========================================================================= */

/** Mode 1: Car Rental */
function HireConsole({
  city,
  counties,
  onSelectCity,
}: {
  city?: string | undefined;
  counties: string[];
  onSelectCity: (c: string) => void;
}): JSX.Element {
  const navigate = useNavigate();
  const [county, setCounty] = useState<string>(city ?? "");
  const [fromDate, setFromDate] = useState("");
  const min = earliestPickupDay();

  useEffect(() => {
    if (city) setCounty(city);
  }, [city]);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["county", "from", "to", "category"] as const) {
      const v = form.get(key);
      if (typeof v === "string" && v) params.set(key, v);
    }
    navigate(`/browse${params.toString() ? `?${params}` : ""}`);
  };

  return (
    <form onSubmit={submit} className="cral-search" style={{ width: "100%" }}>
      <input type="hidden" name="county" value={county} />
      <Dropdown
        variant="field"
        label="COUNTY"
        icon={PIN_ICON}
        value={county}
        placeholder="Any county"
        disabled={counties.length === 0}
        options={counties.map((c) => ({ value: c, label: c }))}
        onChange={(val) => {
          setCounty(val);
          onSelectCity(val);
        }}
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
      <label className="cral-search-field">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="cral-search-label">UNTIL</span>
          <input name="to" type="date" min={fromDate || min} className="cral-search-input" />
        </span>
      </label>
      <label className="cral-search-field" style={{ borderRight: "none" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="10" width="20" height="9" rx="2" />
          <path d="M5 10l2-5h10l2 5" />
        </svg>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="cral-search-label">VEHICLE TYPE</span>
          <select name="category" className="cral-search-input" style={{ cursor: "pointer" }}>
            <option value="">All Categories</option>
            <option value="sedan">Sedan / Small Cars</option>
            <option value="suv">SUV / 4x4 / Pickup</option>
            <option value="van">Van / Minibus</option>
          </select>
        </span>
      </label>
      <button type="submit" className="cral-search-submit">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        Search Cars
      </button>
    </form>
  );
}

/** Mode 2: Haulage & Commercial Trucks */
function TrucksConsole({ counties }: { counties: string[] }): JSX.Element {
  const navigate = useNavigate();
  const [fromCounty, setFromCounty] = useState("Nairobi");
  const [toCounty, setToCounty] = useState("");

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const params = new URLSearchParams();
    params.set("category", "truck");
    if (fromCounty) params.set("county", fromCounty);
    navigate(`/browse?${params.toString()}`);
  };

  const countyOptions = (counties.length > 0 ? counties : COUNTIES).map((c) => ({ value: c, label: c }));

  return (
    <form onSubmit={submit} className="cral-search" style={{ width: "100%" }}>
      <Dropdown
        variant="field"
        label="FROM (COUNTY)"
        icon={PIN_ICON}
        value={fromCounty}
        placeholder="Pickup county"
        options={countyOptions}
        onChange={setFromCounty}
      />
      <Dropdown
        variant="field"
        label="TO (DESTINATION)"
        icon={PIN_ICON}
        value={toCounty}
        placeholder="Destination county"
        options={countyOptions}
        onChange={setToCounty}
      />
      <label className="cral-search-field">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="cral-search-label">CARGO TYPE</span>
          <input
            type="text"
            placeholder="e.g. Building materials, 10t"
            className="cral-search-input"
          />
        </span>
      </label>
      <label className="cral-search-field" style={{ borderRight: "none" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="cral-search-label">DATE NEEDED</span>
          <input type="date" min={earliestPickupDay()} className="cral-search-input" />
        </span>
      </label>
      <button type="submit" className="cral-search-submit" style={{ background: "#0F23A8" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        Get Truck Quotes
      </button>
    </form>
  );
}

/** Mode 3: Professional Drivers */
function DriversConsole({ counties }: { counties: string[] }): JSX.Element {
  const navigate = useNavigate();
  const [county, setCounty] = useState("Nairobi");
  const countyOptions = (counties.length > 0 ? counties : COUNTIES).map((c) => ({ value: c, label: c }));

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    navigate(`/drivers?county=${encodeURIComponent(county)}`);
  };

  return (
    <form onSubmit={submit} className="cral-search" style={{ width: "100%" }}>
      <Dropdown
        variant="field"
        label="LOCATION"
        icon={PIN_ICON}
        value={county}
        placeholder="County"
        options={countyOptions}
        onChange={setCounty}
      />
      <label className="cral-search-field">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="7" r="4" />
          <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
        </svg>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="cral-search-label">ASSIGNMENT TYPE</span>
          <select className="cral-search-input" style={{ cursor: "pointer" }}>
            <option value="own_car">Drive my own car (Daily gig)</option>
            <option value="chauffeur">Chauffeured car + driver package</option>
            <option value="long_distance">Long distance / Upcountry trip</option>
          </select>
        </span>
      </label>
      <label className="cral-search-field" style={{ borderRight: "none" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="cral-search-label">START DATE</span>
          <input type="date" min={earliestPickupDay()} className="cral-search-input" />
        </span>
      </label>
      <button type="submit" className="cral-search-submit">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        Find Vetted Drivers
      </button>
    </form>
  );
}

/** Mode 4: 24/7 Roadside Towing SOS */
function TowingConsole({ counties }: { counties: string[] }): JSX.Element {
  const navigate = useNavigate();
  const [county, setCounty] = useState("Nairobi");
  const countyOptions = (counties.length > 0 ? counties : COUNTIES).map((c) => ({ value: c, label: c }));

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    navigate(`/services/towing?county=${encodeURIComponent(county)}`);
  };

  return (
    <form onSubmit={submit} className="cral-search" style={{ width: "100%" }}>
      <Dropdown
        variant="field"
        label="BREAKDOWN LOCATION"
        icon={PIN_ICON}
        value={county}
        placeholder="County"
        options={countyOptions}
        onChange={setCounty}
      />
      <label className="cral-search-field">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D81E32" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="cral-search-label" style={{ color: "#D81E32" }}>EMERGENCY ISSUE</span>
          <select className="cral-search-input" style={{ cursor: "pointer" }}>
            <option value="mechanical">Mechanical Breakdown (Won&apos;t start)</option>
            <option value="accident">Accident / Off-road Recovery</option>
            <option value="flat">Flat Tyre / Battery / Fuel</option>
            <option value="heavy">Heavy Truck / Bus Recovery</option>
          </select>
        </span>
      </label>
      <label className="cral-search-field" style={{ borderRight: "none" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="cral-search-label">LANDMARK OR HIGHWAY</span>
          <input type="text" placeholder="e.g. Waiyaki Way near ABC" className="cral-search-input" />
        </span>
      </label>
      <button type="submit" className="cral-search-submit" style={{ background: "#D81E32" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
        Dispatch Towing
      </button>
    </form>
  );
}

/** Mode 5: Garage Services & Maintenance */
function GarageConsole({ counties }: { counties: string[] }): JSX.Element {
  const navigate = useNavigate();
  const [county, setCounty] = useState("Nairobi");
  const countyOptions = (counties.length > 0 ? counties : COUNTIES).map((c) => ({ value: c, label: c }));

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    navigate(`/services?county=${encodeURIComponent(county)}`);
  };

  return (
    <form onSubmit={submit} className="cral-search" style={{ width: "100%" }}>
      <Dropdown
        variant="field"
        label="GARAGE LOCATION"
        icon={PIN_ICON}
        value={county}
        placeholder="County"
        options={countyOptions}
        onChange={setCounty}
      />
      <label className="cral-search-field">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="10" width="20" height="9" rx="2" />
        </svg>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="cral-search-label">VEHICLE MAKE & MODEL</span>
          <input type="text" placeholder="e.g. Toyota Prado, Mazda CX-5" className="cral-search-input" />
        </span>
      </label>
      <label className="cral-search-field" style={{ borderRight: "none" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="cral-search-label">SERVICE NEEDED</span>
          <select className="cral-search-input" style={{ cursor: "pointer" }}>
            <option value="routine">Routine Oil & Filter Service</option>
            <option value="brakes">Brakes & Suspension Overhaul</option>
            <option value="diagnostics">Computer Engine Diagnostics</option>
            <option value="bodywork">Bodywork, Denting & Spray</option>
            <option value="ac">AC Refill & Electricals</option>
          </select>
        </span>
      </label>
      <button type="submit" className="cral-search-submit">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        Find Inspected Garages
      </button>
    </form>
  );
}

/** Mode 6: Spare Parts Quoted Against Chassis */
function PartsConsole(): JSX.Element {
  const navigate = useNavigate();

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    navigate("/parts");
  };

  return (
    <form onSubmit={submit} className="cral-search" style={{ width: "100%" }}>
      <label className="cral-search-field" style={{ flex: "1.2 1 200px" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <line x1="7" y1="8" x2="17" y2="8" />
          <line x1="7" y1="12" x2="17" y2="12" />
        </svg>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="cral-search-label">CHASSIS (VIN) OR PLATE NUMBER</span>
          <input type="text" placeholder="e.g. KDL 442N or NZE141-xxxx" className="cral-search-input" />
        </span>
      </label>
      <label className="cral-search-field" style={{ flex: "1.5 1 240px", borderRight: "none" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4" />
        </svg>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="cral-search-label">PART YOU NEED</span>
          <input type="text" placeholder="e.g. Front shock absorbers, alternator" className="cral-search-input" />
        </span>
      </label>
      <button type="submit" className="cral-search-submit">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        Request Dealer Quotes
      </button>
    </form>
  );
}

/** Mode 7: Verified Car Sales */
function SalesConsole({ counties }: { counties: string[] }): JSX.Element {
  const navigate = useNavigate();
  const [county, setCounty] = useState("");
  const countyOptions = [{ value: "", label: "Any County" }, ...(counties.length > 0 ? counties : COUNTIES).map((c) => ({ value: c, label: c }))];

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    navigate("/browse?intent=sale");
  };

  return (
    <form onSubmit={submit} className="cral-search" style={{ width: "100%" }}>
      <label className="cral-search-field">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="cral-search-label">PRICE BUDGET</span>
          <select className="cral-search-input" style={{ cursor: "pointer" }}>
            <option value="">Any Budget</option>
            <option value="under_1m">Under KES 1,000,000</option>
            <option value="1m_2.5m">KES 1M - 2.5M</option>
            <option value="2.5m_5m">KES 2.5M - 5M</option>
            <option value="above_5m">Above KES 5,000,000</option>
          </select>
        </span>
      </label>
      <label className="cral-search-field">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="10" width="20" height="9" rx="2" />
        </svg>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="cral-search-label">BODY TYPE</span>
          <select className="cral-search-input" style={{ cursor: "pointer" }}>
            <option value="">All Body Types</option>
            <option value="sedan">Sedan / Saloon</option>
            <option value="suv">SUV / 4WD</option>
            <option value="pickup">Double Cab / Pickup</option>
            <option value="van">Van / Commercial</option>
          </select>
        </span>
      </label>
      <Dropdown
        variant="field"
        label="VIEWING LOCATION"
        icon={PIN_ICON}
        value={county}
        placeholder="Any County"
        options={countyOptions}
        onChange={setCounty}
      />
      <button type="submit" className="cral-search-submit">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        Explore Cars For Sale
      </button>
    </form>
  );
}
