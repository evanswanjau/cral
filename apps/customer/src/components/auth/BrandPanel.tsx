import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { Icon } from "@phosphor-icons/react";
import { ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { IdentificationCard } from "@phosphor-icons/react/dist/ssr/IdentificationCard";
import { Receipt } from "@phosphor-icons/react/dist/ssr/Receipt";
import { DeviceMobile } from "@phosphor-icons/react/dist/ssr/DeviceMobile";
import { Key } from "@phosphor-icons/react/dist/ssr/Key";
import { WhatsappLogo } from "@phosphor-icons/react/dist/ssr/WhatsappLogo";
import photo from "../../assets/keyhandoff.jpg";
import logoWhite from "../../assets/cral-white-logo.png";
import { getCatalogVehicle, formatMoney, photoSrc } from "../../lib/catalog-api.js";
import { formatHireDate, hireDays } from "../../lib/hire-dates.js";
import { HIRING_UNIT_LABEL, quoteTotal, unitRate } from "../../lib/hiring-units.js";
import { SUPPORT_PHONE_DISPLAY, whatsappLink } from "../../lib/support.js";
import { bookingFromNext } from "./next.js";

export type BrandPanelVariant = "signin" | "register" | "recover";

const COPY: Record<
  BrandPanelVariant,
  { eyebrow: string; h1: string; lede: string; proof: Array<{ icon: Icon; title: string; body: string }> }
> = {
  signin: {
    eyebrow: "WELCOME BACK",
    h1: "Your hires, all in one place.",
    lede: "Sign in to request a car, pay by M-Pesa and follow every trip from pickup to return.",
    proof: [
      { icon: IdentificationCard, title: "Documents read once", body: "Your licence and ID are checked by CRAL, then reused on every hire." },
      { icon: DeviceMobile, title: "Pay by M-Pesa", body: "The prompt only comes once the owner has accepted your dates." },
      { icon: Receipt, title: "Every trip on record", body: "Bookings, payments and receipts sit in one place you can open any time." },
    ],
  },
  register: {
    eyebrow: "HIRE WITH CRAL",
    h1: "Hire a car you can trust.",
    lede: "An account takes a minute. Your licence and ID are only asked for when you first book.",
    proof: [
      { icon: ShieldCheck, title: "Checked by a real person", body: "A CRAL reviewer reads every listing's papers before it goes live." },
      { icon: IdentificationCard, title: "Documents read once", body: "Your licence and ID are checked by CRAL, then reused on every hire." },
      { icon: Key, title: "A pickup code only you get", body: "It's emailed to you and read out at handover, so the keys go to the right person." },
    ],
  },
  recover: {
    eyebrow: "ACCOUNT HELP",
    h1: "Back on the road in a minute.",
    lede: "We'll email you a link to choose a new password. Your bookings and documents stay exactly as they are.",
    proof: [
      { icon: ShieldCheck, title: "The link is yours alone", body: "It works once, expires in 30 minutes, and signs out every device the account was open on." },
      { icon: IdentificationCard, title: "Nothing to re-upload", body: "Your licence and ID stay on file with CRAL." },
    ],
  },
};

/**
 * The dark panel beside every customer auth form. Same layout, type scale,
 * 14° rule and Archivo 'wdth' 110 display as the merchant portal's
 * `BrandPanel` (owner's call, 2026-09-24: the two sign-ins should look like
 * one product), with the key-handover photo and renter copy.
 *
 * **When `next` points at a booking, the pitch gives way to the car being
 * hired** - make, dates and the total - so signing in reads as a step of
 * that hire rather than an interruption that lost it. It is built from
 * `next` alone, which is what makes it survive a reload or an email link.
 */
export function BrandPanel({ variant, next }: { variant: BrandPanelVariant; next: string }): JSX.Element {
  const copy = COPY[variant];
  const booking = variant === "recover" ? null : bookingFromNext(next);
  return (
    <div style={S.panel}>
      <img src={photo} alt="" style={S.photo} />
      <div style={S.shade} />

      <div style={S.masthead}>
        <Link to="/" aria-label="CRAL home">
          <img src={logoWhite} alt="Cruz Ride Auto Limited" style={S.logo} />
        </Link>
        <span style={S.mastheadRule} />
        <span style={S.mastheadLabel}>CAR HIRE</span>
      </div>

      <div style={S.middle}>
        <div style={S.eyebrow}>
          <span style={S.eyebrowRule} />
          <span style={S.eyebrowText}>{booking ? "YOUR HIRE" : copy.eyebrow}</span>
        </div>
        {booking ? (
          <HoldingForYou booking={booking} fallback={copy} />
        ) : (
          <Pitch copy={copy} />
        )}
      </div>

      <div style={S.footer}>
        <span style={S.footerLeft}>© 2026 CRAL · CRAL.CO.KE</span>
        <a href={whatsappLink("Hi CRAL - I need help with my account")} target="_blank" rel="noreferrer" style={S.footerRight}>
          <WhatsappLogo size={16} weight="fill" color="#25D366" />
          Stuck? WhatsApp {SUPPORT_PHONE_DISPLAY}
        </a>
      </div>

      <div style={S.glow} />
    </div>
  );
}

function Pitch({ copy }: { copy: (typeof COPY)[BrandPanelVariant] }): JSX.Element {
  return (
    <>
      <h1 style={S.h1}>{copy.h1}</h1>
      <p style={S.lede}>{copy.lede}</p>
      <div style={S.proofList}>
        {copy.proof.map((p) => {
          const ProofIcon = p.icon;
          return (
            <div key={p.title} style={S.proofRow}>
              <span style={S.proofIcon}>
                <ProofIcon size={20} weight="regular" />
              </span>
              <div>
                <div style={S.proofTitle}>{p.title}</div>
                <div style={S.proofBody}>{p.body}</div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function HoldingForYou({
  booking,
  fallback,
}: {
  booking: { vehicleId: string; from: string; to: string };
  fallback: (typeof COPY)[BrandPanelVariant];
}): JSX.Element {
  const { data: car, isError } = useQuery({
    queryKey: ["catalog", "vehicle", booking.vehicleId],
    queryFn: () => getCatalogVehicle(booking.vehicleId),
    retry: false,
  });
  // A listing that has gone (or a mangled link) falls back to the pitch
  // rather than holding an empty card.
  if (isError) return <Pitch copy={fallback} />;
  if (!car) return <div style={{ height: 220 }} />;

  const days = hireDays(booking.from, booking.to);
  const total = quoteTotal(car, days);
  const rate = unitRate(car);
  const name = `${car.make} ${car.model} ${car.year}`;

  return (
    <>
      <h1 style={S.h1}>Pick up where you left off.</h1>
      <p style={S.lede}>Finish here and you land straight back on this car, with these dates already filled in.</p>
      <div style={S.car}>
        <div style={S.carPhoto}>
          {car.photo_urls[0] ? (
            <img src={photoSrc(car.photo_urls[0])} alt={name} style={S.carImg} />
          ) : (
            <span style={S.carPlaceholder}>PHOTO · {name}</span>
          )}
        </div>
        <div style={{ padding: "14px 16px 16px" }}>
          <div style={S.carName}>{name}</div>
          <div style={S.carMeta}>
            {car.registration} · {car.county ?? "Location on request"}
          </div>
          <div style={S.carRows}>
            <Row label={`${formatHireDate(booking.from)} - ${formatHireDate(booking.to)}`} value={`${days} day${days > 1 ? "s" : ""}`} />
            <Row label="Rate" value={`${formatMoney(rate)} / ${HIRING_UNIT_LABEL[car.hiring_unit]}`} />
            {total !== null && (
              <Row bold label="Total" value={formatMoney({ amount: total, currency: rate.currency })} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }): JSX.Element {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
      <span style={{ font: `${bold ? 600 : 400} 13px/1.4 'Instrument Sans',sans-serif`, color: bold ? "#F2F5F9" : "#A7B0BE" }}>
        {label}
      </span>
      <span
        style={{
          font: bold ? "700 15px/1.4 Archivo,sans-serif" : "500 13px/1.4 'Instrument Sans',sans-serif",
          fontVariationSettings: bold ? "'wdth' 106" : undefined,
          color: "#F2F5F9",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  panel: {
    background: "#0B0F1A",
    padding: "clamp(20px,3.4vw,48px) clamp(20px,4vw,56px)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    gap: "clamp(22px,3.4vw,40px)",
    position: "relative",
    overflow: "hidden",
  },
  photo: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "50% 50%",
    zIndex: 0,
  },
  shade: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(180deg,rgba(11,15,26,.82) 0%,rgba(11,15,26,.9) 45%,rgba(11,15,26,.97) 100%)",
    zIndex: 1,
  },
  masthead: { display: "flex", alignItems: "center", gap: 14, position: "relative", zIndex: 2 },
  logo: { height: "clamp(40px,7vw,50px)", width: "auto", display: "block" },
  mastheadRule: { width: 1, height: 22, background: "#2A3346" },
  mastheadLabel: { font: "500 11px/1 'IBM Plex Mono',monospace", letterSpacing: ".09em", color: "#A7B0BE" },

  middle: { position: "relative", zIndex: 2, maxWidth: 520 },
  eyebrow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 18 },
  eyebrowRule: {
    display: "block",
    width: 24,
    height: 5,
    background: "#D81E32",
    transform: "skewX(-14deg)",
    flex: "none",
  },
  eyebrowText: { font: "500 11px/1.4 'IBM Plex Mono',monospace", letterSpacing: ".14em", color: "#A7B0BE" },
  h1: {
    margin: "0 0 16px",
    font: "700 clamp(30px,4.4vw,46px)/1.05 Archivo,sans-serif",
    fontVariationSettings: "'wdth' 110",
    letterSpacing: "-.028em",
    color: "#FFFFFF",
    textWrap: "balance",
  } as CSSProperties,
  lede: {
    margin: "0 0 28px",
    font: "400 clamp(14px,1.4vw,16px)/1.6 'Instrument Sans',sans-serif",
    color: "#C3CAD5",
    maxWidth: "46ch",
    textWrap: "pretty",
  } as CSSProperties,

  proofList: { display: "grid", gap: 16 },
  proofRow: { display: "flex", alignItems: "flex-start", gap: 14 },
  proofIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: "rgba(255,255,255,.08)",
    border: "1px solid rgba(255,255,255,.14)",
    color: "#FFFFFF",
    display: "grid",
    placeItems: "center",
    flex: "none",
  },
  proofTitle: { font: "600 14.5px/1.35 'Instrument Sans',sans-serif", color: "#F2F5F9" },
  proofBody: {
    font: "400 13px/1.5 'Instrument Sans',sans-serif",
    color: "#A7B0BE",
    marginTop: 3,
    maxWidth: "44ch",
    textWrap: "pretty",
  } as CSSProperties,

  car: {
    maxWidth: 400,
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.14)",
    borderRadius: 12,
    overflow: "hidden",
  },
  carPhoto: {
    height: 150,
    background: "rgba(255,255,255,.05)",
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  carImg: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center 75%",
  },
  carPlaceholder: {
    font: "500 10px/1.4 'IBM Plex Mono',monospace",
    letterSpacing: ".09em",
    color: "#7C8697",
    textAlign: "center",
    padding: "0 12px",
  },
  carName: { font: "600 15px/1.35 'Instrument Sans',sans-serif", color: "#FFFFFF", marginBottom: 4 },
  carMeta: { font: "500 12px/1.4 'IBM Plex Mono',monospace", color: "#A7B0BE", marginBottom: 14 },
  carRows: { display: "grid", gap: 9, paddingTop: 13, borderTop: "1px solid rgba(255,255,255,.1)" },

  footer: {
    position: "relative",
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    paddingTop: 22,
    borderTop: "1px solid rgba(255,255,255,.1)",
  },
  footerLeft: { font: "500 11px/1.6 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#7C8697" },
  footerRight: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    font: "500 13px/1.5 'Instrument Sans',sans-serif",
    color: "#E6EAF0",
    textDecoration: "none",
  },

  glow: {
    position: "absolute",
    right: -120,
    bottom: -140,
    width: 420,
    height: 420,
    borderRadius: 999,
    background: "radial-gradient(circle,rgba(15,35,168,.42),rgba(11,15,26,0) 68%)",
    zIndex: 1,
  },
};
