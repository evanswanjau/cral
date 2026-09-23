import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { netFromGross } from "@cral/types";
import { WhatsappLogo } from "@phosphor-icons/react/dist/ssr/WhatsappLogo";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { DeviceMobile } from "@phosphor-icons/react/dist/ssr/DeviceMobile";
import { MapPin } from "@phosphor-icons/react/dist/ssr/MapPin";
import { Car } from "@phosphor-icons/react/dist/ssr/Car";
import { Jeep } from "@phosphor-icons/react/dist/ssr/Jeep";
import { Van } from "@phosphor-icons/react/dist/ssr/Van";
import { Truck } from "@phosphor-icons/react/dist/ssr/Truck";
import { Tractor } from "@phosphor-icons/react/dist/ssr/Tractor";
import { NotePencil } from "@phosphor-icons/react/dist/ssr/NotePencil";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { Coins } from "@phosphor-icons/react/dist/ssr/Coins";
import { Tag } from "@phosphor-icons/react/dist/ssr/Tag";
import { Prohibit } from "@phosphor-icons/react/dist/ssr/Prohibit";
import { Key } from "@phosphor-icons/react/dist/ssr/Key";
import { Wallet } from "@phosphor-icons/react/dist/ssr/Wallet";
import { FileText } from "@phosphor-icons/react/dist/ssr/FileText";
import { CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { Headset } from "@phosphor-icons/react/dist/ssr/Headset";
import type { Icon } from "@phosphor-icons/react";
import { usePageTitle } from "../lib/use-page-title.js";
import { VEHICLE_CATEGORIES, type VehicleType } from "../lib/vehicle-categories.js";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_E164, whatsappLink } from "../lib/support.js";

/**
 * The merchant portal's signed-out front door at `/` (RequireAuth renders
 * it in place of the sign-in redirect for that exact path only).
 *
 * Not pulled from a canvas file - no design-canvas tab exists for a
 * merchant landing page. Built from confirmed tokens
 * (`packages/ui/src/tokens.ts`). Photos in `public/images/landing/` are
 * Unsplash placeholders (see CREDITS.txt there) - swap a file for real
 * photography by keeping its name.
 *
 * CRAL's commission percentage is never shown here: merchants see it only in
 * the merchant terms (owner's global rule, 2026-09-23). The estimator shows
 * take-home after the fee, not the fee rate.
 */

const C = {
  ink: "#0B0F1A",
  blue: "#0F23A8",
  blue700: "#0B1B85",
  blue50: "#EDEFFC",
  blue200: "#B6C0F4",
  red: "#D81E32",
  canvas: "#FAFBFC",
  n100: "#F1F3F6",
  n200: "#E4E7EC",
  n300: "#CDD2DA",
  n500: "#838C9B",
  n600: "#5A6373",
  n700: "#333B4A",
  verified: "#0B8A5B",
  whatsapp: "#25D366",
} as const;

const DISPLAY = "Archivo,sans-serif";
const SANS = "'Instrument Sans',sans-serif";
const MONO = "'IBM Plex Mono',monospace";

const IMG = (name: string) => `/images/landing/${name}.webp`;

const CATEGORY_META: Record<VehicleType, { icon: Icon; image: string; uses: string; exampleRate: number }> = {
  sedan: { icon: Car, image: "cat-sedan", uses: "Airport runs, weddings, business trips", exampleRate: 4500 },
  suv: { icon: Jeep, image: "cat-suv", uses: "Upcountry trips, safaris, rough roads", exampleRate: 8000 },
  van: { icon: Van, image: "cat-van", uses: "Group travel, school trips, tours", exampleRate: 9500 },
  truck: { icon: Truck, image: "cat-truck", uses: "Moving, deliveries, haulage", exampleRate: 12000 },
  machinery: { icon: Tractor, image: "cat-machinery", uses: "Site work, earthmoving, farming", exampleRate: 15000 },
};

const STEPS: Array<{ n: string; icon: Icon; image: string; title: string; body: string }> = [
  {
    n: "01",
    icon: NotePencil,
    image: "step-list",
    title: "List it from your phone",
    body: "Category, county, a few photos and your rate. About ten minutes, and your progress saves as you go.",
  },
  {
    n: "02",
    icon: MagnifyingGlass,
    image: "step-check",
    title: "A person checks the papers",
    body: "A CRAL reviewer reads your logbook, insurance and tracker certificate. Usually within two working days.",
  },
  {
    n: "03",
    icon: Coins,
    image: "step-earn",
    title: "Hand over the keys, get paid",
    body: "Accept a request, check the hirer's pickup code at handover, and your payout lands on M-Pesa or in your bank.",
  },
];

const WHY: Array<{ icon: Icon; title: string; body: string }> = [
  { icon: Tag, title: "You set the price", body: "Charge per day or per trip, and change your rate whenever you like." },
  { icon: Prohibit, title: "No listing fee", body: "Nothing is charged while a vehicle sits idle. CRAL only earns when you do." },
  { icon: Key, title: "A code at every pickup", body: "The hirer reads you a one-time code, so the keys only go to the person who booked." },
  { icon: Wallet, title: "Paid to M-Pesa or bank", body: "Weekly or monthly payouts, with a receipt and statement for every run." },
];

const DOCS_READY = [
  "Logbook for the vehicle",
  "Comprehensive insurance, current (not third-party only)",
  "Tracker certificate",
  "Your national ID",
  "Your KRA PIN",
];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "What does it cost to list?",
    a: "Nothing. There's no listing fee and nothing is charged while your vehicle sits idle. CRAL takes a service fee from each completed hire, and the exact fee is set out in the merchant terms you accept when you sign up.",
  },
  {
    q: "How long does the review take?",
    a: "Usually within two working days of submitting your documents. We tell you the moment your listing is live, or exactly what needs fixing if something is missing.",
  },
  {
    q: "How and when do I get paid?",
    a: "To M-Pesa or a bank account. M-Pesa payouts run every Monday or monthly on the 1st, whichever you pick. Bank payouts run monthly on the 1st. Every payout comes with a receipt and a statement.",
  },
  {
    q: "Can I offer my vehicle with a driver?",
    a: "Yes. Each vehicle can be self-drive or chauffeured, and you can switch it from the vehicle's settings at any time.",
  },
  {
    q: "Can I list trucks and machinery, not just cars?",
    a: "Yes. Sedans, SUVs, vans and minibuses, trucks and trailers, and construction machinery can all be listed. Transport is often priced per trip rather than per day.",
  },
  {
    q: "Do I need to be a registered company?",
    a: "No. Individuals and companies can both list. A company also provides its certificate of incorporation, company KRA PIN and CR12.",
  },
  {
    q: "What if the vehicle comes back damaged?",
    a: "Take condition photos at pickup. If something's wrong on return, you have 14 days to report it from the booking, and CRAL reviews every report.",
  },
];

function formatKes(amount: number): string {
  return `KES ${Math.round(amount).toLocaleString("en-KE")}`;
}

const CSS = `
.ml-root { background:${C.canvas}; color:${C.ink}; min-height:100vh; display:flex; flex-direction:column; }
.ml-root *, .ml-root *::before, .ml-root *::after { box-sizing:border-box; }
.ml-wrap { width:100%; max-width:1160px; margin:0 auto; padding:0 clamp(16px,4vw,40px); }
.ml-section { padding:clamp(48px,7vw,96px) 0; }
.ml-root [id] { scroll-margin-top:80px; }

.ml-header { position:sticky; top:0; z-index:40; background:rgba(11,15,26,.92); backdrop-filter:saturate(140%) blur(10px); -webkit-backdrop-filter:saturate(140%) blur(10px); border-bottom:1px solid rgba(255,255,255,.06); }
.ml-header-inner { display:flex; align-items:center; gap:18px; height:72px; }
.ml-nav { display:flex; gap:24px; margin-left:18px; }
.ml-nav a { font:500 14px/1 ${SANS}; color:#A7B0BE; text-decoration:none; transition:color .12s; }
.ml-nav a:hover { color:#FFFFFF; }
.ml-header-right { margin-left:auto; display:flex; align-items:center; gap:14px; }
.ml-text-link { font:600 14px/1 ${SANS}; color:#FFFFFF; text-decoration:none; display:inline-flex; align-items:center; gap:7px; }
.ml-text-link:hover { color:${C.blue200}; }

.ml-btn { display:inline-flex; align-items:center; justify-content:center; gap:9px; height:46px; padding:0 20px; border-radius:10px; font:600 15px/1 ${SANS}; text-decoration:none; border:1px solid transparent; cursor:pointer; transition:background .12s, border-color .12s, transform .12s, box-shadow .12s; white-space:nowrap; }
.ml-btn:active { transform:translateY(1px); }
.ml-btn-sm { height:38px; padding:0 15px; font-size:14px; border-radius:8px; }
.ml-btn-primary { background:${C.blue}; color:#FFFFFF; box-shadow:0 6px 18px rgba(15,35,168,.28); }
.ml-btn-primary:hover { background:${C.blue700}; }
.ml-btn-ghost { background:rgba(255,255,255,.06); color:#FFFFFF; border-color:rgba(255,255,255,.28); }
.ml-btn-ghost:hover { background:rgba(255,255,255,.14); border-color:rgba(255,255,255,.5); }
.ml-btn-white { background:#FFFFFF; color:${C.blue}; }
.ml-btn-white:hover { background:${C.blue50}; }
.ml-btn:focus-visible, .ml-cat:focus-visible, .ml-faq summary:focus-visible, .ml-fab:focus-visible { outline:3px solid ${C.blue200}; outline-offset:2px; }

.ml-hero { position:relative; min-height:clamp(560px,86vh,760px); display:flex; align-items:center; overflow:hidden; background:${C.ink}; }
.ml-hero-img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:30% 60%; transform:scaleX(-1); }
.ml-hero-shade { position:absolute; inset:0; background:linear-gradient(90deg,rgba(11,15,26,.96) 0%,rgba(11,15,26,.86) 38%,rgba(11,15,26,.35) 70%,rgba(11,15,26,.15) 100%), linear-gradient(0deg,rgba(11,15,26,.7) 0%,rgba(11,15,26,0) 40%); }
.ml-hero-content { position:relative; z-index:2; padding-top:clamp(40px,6vw,72px); padding-bottom:clamp(40px,6vw,72px); }
.ml-hero h1 { margin:0 0 18px; max-width:13ch; font:700 clamp(38px,6.2vw,68px)/1.02 ${DISPLAY}; font-variation-settings:'wdth' 112; letter-spacing:-.03em; color:#FFFFFF; text-wrap:balance; }
.ml-hero-lede { margin:0 0 30px; max-width:520px; font:400 clamp(16px,1.8vw,19px)/1.55 ${SANS}; color:#C3CAD5; }
.ml-cta-row { display:flex; flex-wrap:wrap; gap:12px; }
.ml-chips { display:flex; flex-wrap:wrap; gap:10px; margin-top:34px; }
.ml-chip { display:inline-flex; align-items:center; gap:8px; padding:8px 13px; border-radius:999px; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.14); font:500 13px/1 ${SANS}; color:#E6EAF0; }

.ml-stats { background:#FFFFFF; border-bottom:1px solid ${C.n200}; }
.ml-stats-grid { display:grid; grid-template-columns:repeat(4,1fr); }
.ml-stat { padding:26px 20px; border-left:1px solid ${C.n200}; }
.ml-stat:first-child { border-left:0; }
.ml-stat-num { font:700 clamp(24px,3vw,32px)/1 ${DISPLAY}; font-variation-settings:'wdth' 108; letter-spacing:-.02em; color:${C.ink}; }
.ml-stat-label { margin-top:8px; font:400 13.5px/1.4 ${SANS}; color:${C.n600}; }

.ml-kicker { display:flex; align-items:center; gap:10px; margin-bottom:14px; font:500 11px/1 ${MONO}; letter-spacing:.12em; color:${C.n500}; }
.ml-kicker-dot { width:6px; height:6px; border-radius:999px; background:${C.red}; }
.ml-h2 { margin:0 0 14px; font:700 clamp(28px,3.8vw,42px)/1.08 ${DISPLAY}; font-variation-settings:'wdth' 108; letter-spacing:-.025em; color:${C.ink}; text-wrap:balance; }
.ml-sub { margin:0; max-width:620px; font:400 clamp(15px,1.6vw,17px)/1.6 ${SANS}; color:${C.n600}; }
.ml-head { margin-bottom:clamp(28px,4vw,44px); }

.ml-cats { display:grid; grid-template-columns:repeat(5,1fr); gap:14px; }
.ml-cat { position:relative; display:block; text-align:left; border:0; padding:0; border-radius:14px; overflow:hidden; aspect-ratio:3/4; background:${C.ink}; cursor:pointer; box-shadow:0 1px 2px rgba(11,15,26,.06); transition:transform .18s, box-shadow .18s; }
.ml-cat:hover { transform:translateY(-4px); box-shadow:0 18px 36px rgba(11,15,26,.18); }
.ml-cat img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; transition:transform .5s; }
.ml-cat:hover img { transform:scale(1.05); }
.ml-cat-shade { position:absolute; inset:0; background:linear-gradient(0deg,rgba(11,15,26,.92) 0%,rgba(11,15,26,.35) 55%,rgba(11,15,26,.05) 100%); }
.ml-cat-body { position:absolute; left:0; right:0; bottom:0; padding:16px; }
.ml-cat-icon { width:38px; height:38px; border-radius:10px; background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.2); display:grid; place-items:center; color:#FFFFFF; margin-bottom:12px; }
.ml-cat-title { font:600 16px/1.25 ${SANS}; color:#FFFFFF; }
.ml-cat-uses { margin-top:5px; font:400 12.5px/1.45 ${SANS}; color:#B7BFCC; }
.ml-cat-go { margin-top:11px; display:inline-flex; align-items:center; gap:6px; font:600 12.5px/1 ${SANS}; color:${C.blue200}; }

.ml-earn { display:grid; grid-template-columns:1fr 1.1fr; gap:clamp(28px,5vw,64px); align-items:center; }
.ml-calc { background:${C.ink}; border-radius:18px; padding:clamp(22px,3.4vw,36px); color:#FFFFFF; box-shadow:0 30px 60px rgba(11,15,26,.22); }
.ml-calc-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.ml-label { display:block; margin-bottom:8px; font:600 10.5px/1 ${MONO}; letter-spacing:.09em; color:#8C97A8; }
.ml-input { width:100%; height:48px; padding:0 13px; border:1px solid #2A3346; border-radius:10px; background:#131A28; color:#FFFFFF; font:500 16px/1 ${SANS}; }
.ml-input:focus { outline:none; border-color:#5B6FE0; box-shadow:0 0 0 3px rgba(91,111,224,.3); }
.ml-range { width:100%; accent-color:#5B6FE0; }
.ml-calc-out { margin-top:24px; padding-top:22px; border-top:1px solid #252B3A; }
.ml-calc-big { font:700 clamp(34px,4.6vw,48px)/1 ${DISPLAY}; font-variation-settings:'wdth' 110; letter-spacing:-.03em; }
.ml-calc-note { margin:14px 0 0; font:400 12.5px/1.55 ${SANS}; color:#7C8697; }
.ml-earn-points { display:grid; gap:14px; margin:26px 0 30px; padding:0; list-style:none; }
.ml-earn-points li { display:flex; gap:12px; align-items:flex-start; font:400 15px/1.5 ${SANS}; color:${C.n700}; }

.ml-steps { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }
.ml-step { background:#FFFFFF; border:1px solid ${C.n200}; border-radius:16px; overflow:hidden; display:flex; flex-direction:column; }
.ml-step-img { position:relative; aspect-ratio:16/10; overflow:hidden; background:${C.n100}; }
.ml-step-img img { width:100%; height:100%; object-fit:cover; display:block; }
.ml-step-n { position:absolute; top:14px; left:14px; padding:6px 10px; border-radius:999px; background:rgba(11,15,26,.78); font:600 11px/1 ${MONO}; letter-spacing:.08em; color:#FFFFFF; }
.ml-step-body { padding:20px 22px 24px; }
.ml-step-icon { width:42px; height:42px; border-radius:12px; background:${C.blue50}; color:${C.blue}; display:grid; place-items:center; margin:-41px 0 14px; position:relative; border:3px solid #FFFFFF; box-sizing:content-box; }
.ml-step h3 { margin:0 0 8px; font:600 18px/1.3 ${SANS}; color:${C.ink}; }
.ml-step p { margin:0; font:400 14.5px/1.6 ${SANS}; color:${C.n600}; }

.ml-why { background:#FFFFFF; border-top:1px solid ${C.n200}; border-bottom:1px solid ${C.n200}; }
.ml-why-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:clamp(18px,3vw,32px); }
.ml-why-icon { width:48px; height:48px; border-radius:12px; background:${C.ink}; color:#FFFFFF; display:grid; place-items:center; margin-bottom:16px; }
.ml-why h3 { margin:0 0 8px; font:600 17px/1.3 ${SANS}; color:${C.ink}; }
.ml-why p { margin:0; font:400 14.5px/1.6 ${SANS}; color:${C.n600}; }

.ml-docs { display:grid; grid-template-columns:1fr 1fr; gap:clamp(24px,5vw,64px); align-items:start; }
.ml-doc-card { background:#FFFFFF; border:1px solid ${C.n200}; border-radius:16px; padding:clamp(18px,2.6vw,26px); }
.ml-doc-list { list-style:none; margin:0; padding:0; display:grid; gap:4px; }
.ml-doc-list li { display:flex; align-items:center; gap:12px; padding:11px 4px; border-bottom:1px solid ${C.n100}; font:500 15px/1.4 ${SANS}; color:${C.n700}; }
.ml-doc-list li:last-child { border-bottom:0; }
.ml-doc-icon { flex:none; width:34px; height:34px; border-radius:9px; background:${C.blue50}; color:${C.blue}; display:grid; place-items:center; }
.ml-doc-foot { margin:14px 0 0; font:400 13.5px/1.6 ${SANS}; color:${C.n500}; }

.ml-faq { display:grid; gap:10px; }
.ml-faq details { background:#FFFFFF; border:1px solid ${C.n200}; border-radius:12px; transition:border-color .12s, box-shadow .12s; }
.ml-faq details[open] { border-color:${C.blue200}; box-shadow:0 8px 24px rgba(15,35,168,.07); }
.ml-faq summary { list-style:none; cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:18px 20px; font:600 16px/1.4 ${SANS}; color:${C.ink}; border-radius:12px; }
.ml-faq summary::-webkit-details-marker { display:none; }
.ml-faq-caret { flex:none; color:${C.n500}; transition:transform .18s; }
.ml-faq details[open] .ml-faq-caret { transform:rotate(180deg); color:${C.blue}; }
.ml-faq-a { padding:0 20px 20px; margin:0; font:400 15px/1.65 ${SANS}; color:${C.n600}; }
.ml-help { margin-top:22px; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:16px; padding:20px 22px; border-radius:14px; background:${C.blue50}; border:1px solid ${C.blue200}; }
.ml-help-text { display:flex; align-items:center; gap:14px; font:500 15px/1.45 ${SANS}; color:${C.blue700}; }

.ml-final { position:relative; overflow:hidden; background:${C.blue}; }
.ml-final img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:.22; mix-blend-mode:luminosity; }
.ml-final-shade { position:absolute; inset:0; background:linear-gradient(100deg,rgba(15,35,168,.96) 20%,rgba(11,27,133,.8) 100%); }
.ml-final-inner { position:relative; z-index:2; padding:clamp(56px,8vw,100px) 0; text-align:center; }
.ml-final h2 { margin:0 auto 14px; max-width:18ch; font:700 clamp(30px,4.6vw,50px)/1.05 ${DISPLAY}; font-variation-settings:'wdth' 110; letter-spacing:-.03em; color:#FFFFFF; text-wrap:balance; }
.ml-final p { margin:0 auto 30px; max-width:520px; font:400 17px/1.55 ${SANS}; color:#D6DCF7; }
.ml-final .ml-cta-row { justify-content:center; }

.ml-footer { background:${C.ink}; color:#8C97A8; }
.ml-footer-grid { display:grid; grid-template-columns:1.4fr 1fr 1fr; gap:32px; padding:48px 0 36px; }
.ml-footer h4 { margin:0 0 14px; font:500 11px/1 ${MONO}; letter-spacing:.12em; color:#5F6B7D; }
.ml-footer ul { list-style:none; margin:0; padding:0; display:grid; gap:10px; }
.ml-footer a { font:400 14px/1.4 ${SANS}; color:#C3CAD5; text-decoration:none; display:inline-flex; align-items:center; gap:8px; }
.ml-footer a:hover { color:#FFFFFF; }
.ml-footer-base { border-top:1px solid #1D2637; padding:18px 0 90px; font:500 11px/1.6 ${MONO}; letter-spacing:.08em; color:#5F6B7D; }

.ml-fab { position:fixed; right:clamp(14px,2.4vw,28px); bottom:clamp(14px,2.4vw,28px); z-index:50; display:inline-flex; align-items:center; gap:10px; height:56px; padding:0 20px 0 16px; border-radius:999px; background:${C.whatsapp}; color:${C.ink}; font:600 15px/1 ${SANS}; text-decoration:none; box-shadow:0 12px 30px rgba(11,15,26,.28); transition:transform .15s, box-shadow .15s; }
.ml-fab:hover { transform:translateY(-2px); box-shadow:0 16px 36px rgba(11,15,26,.34); }

@media (max-width: 1020px) {
  .ml-cats { grid-template-columns:repeat(3,1fr); }
  .ml-why-grid { grid-template-columns:repeat(2,1fr); }
  .ml-earn, .ml-docs { grid-template-columns:1fr; }
}
@media (max-width: 860px) {
  .ml-nav { display:none; }
  .ml-steps { grid-template-columns:1fr; }
  .ml-stats-grid { grid-template-columns:repeat(2,1fr); }
  .ml-stat:nth-child(3) { border-left:0; }
  .ml-stat:nth-child(n+3) { border-top:1px solid ${C.n200}; }
  .ml-footer-grid { grid-template-columns:1fr 1fr; }
}
@media (max-width: 600px) {
  .ml-cats { grid-template-columns:repeat(2,1fr); }
  .ml-why-grid { grid-template-columns:1fr; }
  .ml-calc-grid { grid-template-columns:1fr; }
  .ml-header-wa { display:none; }
  .ml-fab-label { display:none; }
  .ml-fab { width:56px; padding:0; justify-content:center; }
  .ml-hero-shade { background:linear-gradient(0deg,rgba(11,15,26,.97) 0%,rgba(11,15,26,.82) 55%,rgba(11,15,26,.45) 100%); }
  .ml-cta-row .ml-btn { flex:1 1 100%; }
  .ml-footer-grid { grid-template-columns:1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .ml-root * { transition:none !important; }
}
`;

function Kicker({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="ml-kicker">
      <span className="ml-kicker-dot" />
      {children}
    </div>
  );
}

function WhatsAppButton({ message, label, className }: { message: string; label: string; className: string }): JSX.Element {
  return (
    <a className={className} href={whatsappLink(message)} target="_blank" rel="noreferrer">
      <WhatsappLogo size={20} weight="fill" />
      {label}
    </a>
  );
}

function Header(): JSX.Element {
  return (
    <header className="ml-header">
      <div className="ml-wrap ml-header-inner">
        <Link to="/" aria-label="CRAL merchant home">
          <img src="/logo-white.png" alt="Cruz Ride Auto Limited" style={{ display: "block", height: 44, width: "auto" }} />
        </Link>
        <nav className="ml-nav" aria-label="Page sections">
          <a href="#vehicles">What you can list</a>
          <a href="#earnings">Earnings</a>
          <a href="#how">How it works</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="ml-header-right">
          <a className="ml-text-link ml-header-wa" href={whatsappLink("Hi CRAL - I'd like to list a vehicle")} target="_blank" rel="noreferrer">
            <WhatsappLogo size={18} weight="fill" />
            Talk to us
          </a>
          <Link className="ml-text-link" to="/sign-in">
            Sign in
          </Link>
          <Link className="ml-btn ml-btn-primary ml-btn-sm" to="/create-account">
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero(): JSX.Element {
  return (
    <section className="ml-hero">
      <img className="ml-hero-img" src={IMG("hero")} alt="" />
      <div className="ml-hero-shade" />
      <div className="ml-wrap ml-hero-content">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <span style={{ display: "block", width: 24, height: 5, background: C.red, transform: "skewX(-14deg)" }} />
          <span style={{ font: `500 11px/1 ${MONO}`, letterSpacing: ".14em", color: "#A7B0BE" }}>
            FOR CAR, VAN, TRUCK AND MACHINERY OWNERS
          </span>
        </div>
        <h1>Your vehicle earns while you're not using it.</h1>
        <p className="ml-hero-lede">
          List it on CRAL, set your own rate and accept the hires that suit you. A real person checks
          every listing, and your earnings are paid to M-Pesa or your bank.
        </p>
        <div className="ml-cta-row">
          <Link className="ml-btn ml-btn-primary" to="/create-account">
            List your vehicle
            <ArrowRight size={18} weight="bold" />
          </Link>
          <WhatsAppButton
            className="ml-btn ml-btn-ghost"
            message="Hi CRAL - I have a question about listing my vehicle"
            label="Chat on WhatsApp"
          />
        </div>
        <div className="ml-chips">
          <span className="ml-chip">
            <ShieldCheck size={16} weight="bold" color="#57D69E" />
            Every listing checked by a person
          </span>
          <span className="ml-chip">
            <DeviceMobile size={16} weight="bold" />
            Payouts to M-Pesa or bank
          </span>
          <span className="ml-chip">
            <MapPin size={16} weight="bold" />
            List from any county
          </span>
        </div>
      </div>
    </section>
  );
}

function Stats(): JSX.Element {
  const stats = [
    { num: "KES 0", label: "to list, and nothing while it sits idle" },
    { num: "5", label: "vehicle types, from sedans to machinery" },
    { num: "47", label: "counties you can list from" },
    { num: "2 days", label: "usual time to get your listing reviewed" },
  ];
  return (
    <div className="ml-stats">
      <div className="ml-wrap ml-stats-grid">
        {stats.map((s) => (
          <div key={s.num} className="ml-stat">
            <div className="ml-stat-num">{s.num}</div>
            <div className="ml-stat-label">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Categories({ onPick }: { onPick: (t: VehicleType) => void }): JSX.Element {
  return (
    <section id="vehicles" className="ml-section">
      <div className="ml-wrap">
        <div className="ml-head">
          <Kicker>WHAT YOU CAN LIST</Kicker>
          <h2 className="ml-h2">One car or a whole fleet.</h2>
          <p className="ml-sub">
            Hirers on CRAL need everything from a sedan for a wedding to an excavator for a site. Pick
            yours to see what it could earn.
          </p>
        </div>
        <div className="ml-cats">
          {VEHICLE_CATEGORIES.map((c) => {
            const meta = CATEGORY_META[c.value];
            const CatIcon = meta.icon;
            return (
              <button key={c.value} type="button" className="ml-cat" onClick={() => onPick(c.value)}>
                <img src={IMG(meta.image)} alt="" loading="lazy" />
                <span className="ml-cat-shade" />
                <span className="ml-cat-body">
                  <span className="ml-cat-icon">
                    <CatIcon size={21} weight="regular" />
                  </span>
                  <span className="ml-cat-title" style={{ display: "block" }}>{c.label}</span>
                  <span className="ml-cat-uses" style={{ display: "block" }}>{meta.uses}</span>
                  <span className="ml-cat-go">
                    Estimate earnings <ArrowRight size={13} weight="bold" />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Earnings({
  category,
  setCategory,
}: {
  category: VehicleType;
  setCategory: (t: VehicleType) => void;
}): JSX.Element {
  const [rate, setRate] = useState(String(CATEGORY_META[category].exampleRate));
  const [days, setDays] = useState(12);
  const [lastCategory, setLastCategory] = useState(category);

  // Picking a card above resets the rate to that category's example figure.
  if (lastCategory !== category) {
    setLastCategory(category);
    setRate(String(CATEGORY_META[category].exampleRate));
  }

  const parsedRate = Number(rate);
  const valid = Number.isFinite(parsedRate) && parsedRate > 0;
  const { gross, net } = useMemo(() => {
    if (!valid) return { gross: 0, net: 0 };
    const g = parsedRate * days;
    return { gross: g, net: netFromGross(g) };
  }, [parsedRate, days, valid]);

  return (
    <section id="earnings" className="ml-section" style={{ paddingTop: 0 }}>
      <div className="ml-wrap ml-earn">
        <div>
          <Kicker>ROUGH EARNINGS ESTIMATE</Kicker>
          <h2 className="ml-h2">What could it take home?</h2>
          <p className="ml-sub">
            Enter the rate you'd charge and how often you think it would go out. The figure is what
            reaches you after CRAL's service fee.
          </p>
          <ul className="ml-earn-points">
            {[
              "No listing fee and no monthly subscription",
              "Nothing is charged on days the vehicle doesn't go out",
              "You decide which requests to accept",
            ].map((t) => (
              <li key={t}>
                <CheckCircle size={24} weight="fill" color={C.verified} style={{ flex: "none" }} />
                {t}
              </li>
            ))}
          </ul>
          <Link className="ml-btn ml-btn-primary" to="/create-account">
            Start earning
            <ArrowRight size={18} weight="bold" />
          </Link>
        </div>

        <div className="ml-calc">
          <div className="ml-calc-grid">
            <label>
              <span className="ml-label">VEHICLE TYPE</span>
              <select
                className="ml-input"
                value={category}
                onChange={(e) => setCategory(e.target.value as VehicleType)}
              >
                {VEHICLE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="ml-label">YOUR DAILY RATE (KES)</span>
              <input
                className="ml-input"
                type="number"
                min={0}
                inputMode="numeric"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </label>
          </div>
          <label style={{ display: "block", marginTop: 18 }}>
            <span className="ml-label" style={{ display: "flex", justifyContent: "space-between" }}>
              <span>HIRE DAYS A MONTH</span>
              <span style={{ color: "#FFFFFF" }}>{days}</span>
            </span>
            <input
              className="ml-range"
              type="range"
              min={1}
              max={30}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </label>
          <div className="ml-calc-out">
            <div className="ml-label">YOU TAKE HOME, A MONTH</div>
            <div className="ml-calc-big">{formatKes(net)}</div>
            <div style={{ marginTop: 10, font: `400 14px/1.4 ${SANS}`, color: "#A7B0BE" }}>
              Hirers pay {formatKes(gross)} over {days} {days === 1 ? "day" : "days"}
            </div>
            <p className="ml-calc-note">
              An estimate, not a quote. Real bookings depend on demand for your vehicle, your county
              and your dates. The {formatKes(CATEGORY_META[category].exampleRate)} rate is only an
              example; you set your own. Fees are set out in the merchant terms.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Steps(): JSX.Element {
  return (
    <section id="how" className="ml-section" style={{ paddingTop: 0 }}>
      <div className="ml-wrap">
        <div className="ml-head">
          <Kicker>HOW IT WORKS</Kicker>
          <h2 className="ml-h2">From sign-up to first payout in three steps.</h2>
        </div>
        <div className="ml-steps">
          {STEPS.map((s) => {
            const StepIcon = s.icon;
            return (
              <article key={s.n} className="ml-step">
                <div className="ml-step-img">
                  <img src={IMG(s.image)} alt="" loading="lazy" />
                  <span className="ml-step-n">STEP {s.n}</span>
                </div>
                <div className="ml-step-body">
                  <div className="ml-step-icon">
                    <StepIcon size={22} weight="regular" />
                  </div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Why(): JSX.Element {
  return (
    <section className="ml-section ml-why">
      <div className="ml-wrap">
        <div className="ml-head">
          <Kicker>WHY OWNERS LIST WITH CRAL</Kicker>
          <h2 className="ml-h2">Your vehicle, your rules.</h2>
        </div>
        <div className="ml-why-grid">
          {WHY.map((w) => {
            const WhyIcon = w.icon;
            return (
              <div key={w.title}>
                <div className="ml-why-icon">
                  <WhyIcon size={24} weight="regular" />
                </div>
                <h3>{w.title}</h3>
                <p>{w.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function DocsReady(): JSX.Element {
  return (
    <section className="ml-section">
      <div className="ml-wrap ml-docs">
        <div>
          <Kicker>BEFORE YOU START</Kicker>
          <h2 className="ml-h2">Have these ready.</h2>
          <p className="ml-sub" style={{ marginBottom: 22 }}>
            Your listing is reviewed faster when these are to hand. Photos from your phone are fine. If
            one is missing you can still start, but the vehicle won't go live until the set is
            complete.
          </p>
          <WhatsAppButton
            className="ml-btn ml-btn-primary"
            message="Hi CRAL - a question about the documents I need"
            label="Ask us about documents"
          />
        </div>
        <div className="ml-doc-card">
          <ul className="ml-doc-list">
            {DOCS_READY.map((d) => (
              <li key={d}>
                <span className="ml-doc-icon">
                  <FileText size={18} weight="regular" />
                </span>
                {d}
              </li>
            ))}
          </ul>
          <p className="ml-doc-foot">
            Listing as a company? You'll also need a certificate of incorporation, the company's KRA
            PIN and a CR12.
          </p>
        </div>
      </div>
    </section>
  );
}

function Faq(): JSX.Element {
  return (
    <section id="faq" className="ml-section" style={{ paddingTop: 0 }}>
      <div className="ml-wrap" style={{ maxWidth: 860 }}>
        <div className="ml-head">
          <Kicker>QUESTIONS</Kicker>
          <h2 className="ml-h2">Things owners ask us.</h2>
        </div>
        <div className="ml-faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>
                {f.q}
                <CaretDown className="ml-faq-caret" size={18} weight="bold" />
              </summary>
              <p className="ml-faq-a">{f.a}</p>
            </details>
          ))}
        </div>
        <div className="ml-help">
          <div className="ml-help-text">
            <Headset size={28} weight="regular" />
            Still have a question? Our team replies on WhatsApp.
          </div>
          <WhatsAppButton
            className="ml-btn ml-btn-primary ml-btn-sm"
            message="Hi CRAL - I have a question about listing"
            label="Chat with us"
          />
        </div>
      </div>
    </section>
  );
}

function FinalCta(): JSX.Element {
  return (
    <section className="ml-final">
      <img src={IMG("cta")} alt="" loading="lazy" />
      <div className="ml-final-shade" />
      <div className="ml-wrap ml-final-inner">
        <h2>Ready to put your vehicle to work?</h2>
        <p>Create your merchant account in a couple of minutes. Your first listing can be live within days.</p>
        <div className="ml-cta-row">
          <Link className="ml-btn ml-btn-white" to="/create-account">
            Create a merchant account
            <ArrowRight size={18} weight="bold" />
          </Link>
          <WhatsAppButton
            className="ml-btn ml-btn-ghost"
            message="Hi CRAL - I'd like help getting started"
            label="Get help on WhatsApp"
          />
        </div>
      </div>
    </section>
  );
}

function Footer(): JSX.Element {
  return (
    <footer className="ml-footer">
      <div className="ml-wrap">
        <div className="ml-footer-grid">
          <div>
            <img src="/logo-white.png" alt="Cruz Ride Auto Limited" style={{ display: "block", height: 48, width: "auto", marginBottom: 16 }} />
            <p style={{ margin: 0, maxWidth: 320, font: `400 14px/1.6 ${SANS}` }}>
              The merchant side of CRAL, Kenya's marketplace for hiring cars, vans, trucks and
              machinery.
            </p>
          </div>
          <div>
            <h4>MERCHANTS</h4>
            <ul>
              <li><Link to="/create-account">Create an account</Link></li>
              <li><Link to="/sign-in">Sign in</Link></li>
              <li><a href="#how">How it works</a></li>
              <li><a href="#faq">Questions</a></li>
            </ul>
          </div>
          <div>
            <h4>HELP</h4>
            <ul>
              <li>
                <a href={whatsappLink()} target="_blank" rel="noreferrer">
                  <WhatsappLogo size={16} weight="fill" /> WhatsApp {SUPPORT_PHONE_DISPLAY}
                </a>
              </li>
              <li>
                <a href={`tel:${SUPPORT_PHONE_E164}`}>Call {SUPPORT_PHONE_DISPLAY}</a>
              </li>
            </ul>
          </div>
        </div>
        <div className="ml-footer-base">© 2026 CRAL · CRUZ RIDE AUTO LIMITED · NAIROBI, KENYA</div>
      </div>
    </footer>
  );
}

export function Landing(): JSX.Element {
  usePageTitle("Earn with your car");
  const [category, setCategory] = useState<VehicleType>(VEHICLE_CATEGORIES[0].value);
  const earningsRef = useRef<HTMLDivElement>(null);

  function pickCategory(t: VehicleType) {
    setCategory(t);
    earningsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="ml-root">
      <style>{CSS}</style>
      <Header />
      <main>
        <Hero />
        <Stats />
        <Categories onPick={pickCategory} />
        <div ref={earningsRef} style={{ scrollMarginTop: 80 }}>
          <Earnings category={category} setCategory={setCategory} />
        </div>
        <Steps />
        <Why />
        <DocsReady />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
      <a
        className="ml-fab"
        href={whatsappLink("Hi CRAL - I'd like to list a vehicle")}
        target="_blank"
        rel="noreferrer"
        aria-label="Chat with CRAL on WhatsApp"
      >
        <WhatsappLogo size={28} weight="fill" />
        <span className="ml-fab-label">Chat with us</span>
      </a>
    </div>
  );
}
