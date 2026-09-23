import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { Icon } from "@phosphor-icons/react";
import { Coins } from "@phosphor-icons/react/dist/ssr/Coins";
import { Key } from "@phosphor-icons/react/dist/ssr/Key";
import { Wallet } from "@phosphor-icons/react/dist/ssr/Wallet";
import { ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { Prohibit } from "@phosphor-icons/react/dist/ssr/Prohibit";
import { Tag } from "@phosphor-icons/react/dist/ssr/Tag";
import { WhatsappLogo } from "@phosphor-icons/react/dist/ssr/WhatsappLogo";
import { SUPPORT_PHONE_DISPLAY, whatsappLink } from "../lib/support.js";

export type BrandPanelVariant = "signin" | "register";

const COPY: Record<
  BrandPanelVariant,
  { eyebrow: string; h1: string; lede: string; proof: Array<{ icon: Icon; title: string; body: string }> }
> = {
  signin: {
    eyebrow: "WELCOME BACK",
    h1: "Your vehicles, your money, in one place.",
    lede: "Sign in to answer booking requests, see what each vehicle earns and follow every payout.",
    proof: [
      { icon: Coins, title: "See every shilling", body: "What each vehicle earned, what's clearing and what's already been paid." },
      { icon: Key, title: "Handovers you can trust", body: "Check the hirer's pickup code before the keys change hands." },
      { icon: Wallet, title: "Payouts to M-Pesa or bank", body: "A receipt and a statement for every payout run." },
    ],
  },
  register: {
    eyebrow: "LIST WITH CRAL",
    h1: "Start earning from your vehicle.",
    lede: "An email and a password is all it takes to begin. Your details, documents and first vehicle come next.",
    proof: [
      { icon: ShieldCheck, title: "Checked by a real person", body: "A CRAL reviewer reads every listing's papers before it goes live." },
      { icon: Prohibit, title: "No listing fee", body: "Nothing is charged while a vehicle sits idle. We only earn when you do." },
      { icon: Tag, title: "You set the rate", body: "Per day or per trip, and you choose which requests to accept." },
    ],
  },
};

/**
 * The dark panel beside every auth form. Started as a verbatim copy of the
 * design canvas ("Cruz Merchant Login.dc.html"); redesigned at the owner's
 * request (2026-09-23) with a photo backdrop, icons, per-page copy and a
 * WhatsApp help link. The type scale, 14° skewed rule and Archivo
 * 'wdth' 110 display axis are kept from the canvas.
 */
export function BrandPanel({ variant = "signin" }: { variant?: BrandPanelVariant }): JSX.Element {
  const copy = COPY[variant];
  return (
    <div style={S.panel}>
      <img src="/images/landing/auth.webp" alt="" style={S.photo} />
      <div style={S.shade} />

      <div style={S.masthead}>
        <Link to="/" aria-label="CRAL merchant home">
          <img src="/logo-white.png" alt="Cruz Ride Auto Limited" style={S.logo} />
        </Link>
        <span style={S.mastheadRule} />
        <span style={S.mastheadLabel}>MERCHANT PORTAL</span>
      </div>

      <div style={S.middle}>
        <div style={S.eyebrow}>
          <span style={S.eyebrowRule} />
          <span style={S.eyebrowText}>{copy.eyebrow}</span>
        </div>
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
      </div>

      <div style={S.footer}>
        <span style={S.footerLeft}>© 2026 CRAL · CRAL.CO.KE</span>
        <a href={whatsappLink("Hi CRAL - I need help with my merchant account")} target="_blank" rel="noreferrer" style={S.footerRight}>
          <WhatsappLogo size={16} weight="fill" color="#25D366" />
          Stuck? WhatsApp {SUPPORT_PHONE_DISPLAY}
        </a>
      </div>

      <div style={S.glow} />
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
    objectPosition: "60% 50%",
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
  logo: {
    height: "clamp(40px,7vw,50px)",
    width: "auto",
    display: "block",
  },
  mastheadRule: { width: 1, height: 22, background: "#2A3346" },
  mastheadLabel: {
    font: "500 11px/1 'IBM Plex Mono',monospace",
    letterSpacing: ".09em",
    color: "#A7B0BE",
  },

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
  eyebrowText: {
    font: "500 11px/1.4 'IBM Plex Mono',monospace",
    letterSpacing: ".14em",
    color: "#A7B0BE",
  },
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
  footerLeft: {
    font: "500 11px/1.6 'IBM Plex Mono',monospace",
    letterSpacing: ".08em",
    color: "#7C8697",
  },
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
