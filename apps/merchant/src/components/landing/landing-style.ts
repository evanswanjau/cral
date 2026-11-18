/**
 * Shared look for the signed-out merchant pages (`/` and `/join/:type`).
 * Moved out of `pages/Landing.tsx` (UI4) so both pages share one sheet.
 * Colours are `packages/ui/src/tokens.ts` values; no new hex.
 */

export const C = {
  ink: "#0B0F1A",
  blue: "#0F23A8",
  blue700: "#0B1B85",
  blue50: "#EDEFFC",
  blue200: "#B6C0F4",
  red: "#D81E32",
  canvas: "#FAFBFC",
  n100: "#F1F3F6",
  n200: "#E4E7EC",
  n500: "#838C9B",
  n600: "#5A6373",
  n700: "#333B4A",
  verified: "#0B8A5B",
  whatsapp: "#25D366",
} as const;

export const DISPLAY = "Archivo,sans-serif";
export const SANS = "'Instrument Sans',sans-serif";
export const MONO = "'IBM Plex Mono',monospace";

export const IMG = (name: string): string => `/images/landing/${name}.webp`;

export function formatKes(amount: number): string {
  return `KES ${Math.round(amount).toLocaleString("en-KE")}`;
}

export const LANDING_CSS = `
.ml-root { background:${C.canvas}; color:${C.ink}; min-height:100vh; display:flex; flex-direction:column; overflow-x:hidden; }
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
.ml-text-link { font:600 14px/1 ${SANS}; color:#FFFFFF; text-decoration:none; display:inline-flex; align-items:center; gap:7px; min-height:44px; }
.ml-text-link:hover { color:${C.blue200}; }

.ml-btn { display:inline-flex; align-items:center; justify-content:center; gap:9px; height:46px; padding:0 20px; border-radius:10px; font:600 15px/1 ${SANS}; text-decoration:none; border:1px solid transparent; cursor:pointer; transition:background .12s, border-color .12s, transform .12s, box-shadow .12s; white-space:nowrap; }
.ml-btn:active { transform:translateY(1px); }
.ml-btn-sm { height:44px; padding:0 15px; font-size:14px; border-radius:8px; }
.ml-btn-primary { background:${C.blue}; color:#FFFFFF; box-shadow:0 6px 18px rgba(15,35,168,.28); }
.ml-btn-primary:hover { background:${C.blue700}; }
.ml-btn-white { background:#FFFFFF; color:${C.blue}; }
.ml-btn-white:hover { background:${C.blue50}; }
.ml-root a:focus-visible, .ml-root summary:focus-visible, .ml-root button:focus-visible, .ml-root input:focus-visible { outline:3px solid ${C.blue200}; outline-offset:2px; }

.ml-hero { position:relative; min-height:clamp(520px,80vh,720px); display:flex; align-items:center; overflow:hidden; background:${C.ink}; }
.ml-hero-img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:30% 60%; }
.ml-hero-shade { position:absolute; inset:0; background:linear-gradient(90deg,rgba(11,15,26,.96) 0%,rgba(11,15,26,.86) 38%,rgba(11,15,26,.45) 70%,rgba(11,15,26,.3) 100%), linear-gradient(0deg,rgba(11,15,26,.7) 0%,rgba(11,15,26,0) 40%); }
.ml-hero-content { position:relative; z-index:2; padding-top:clamp(40px,6vw,72px); padding-bottom:clamp(40px,6vw,72px); }
.ml-hero-split { display:grid; grid-template-columns:1fr 1fr; gap:clamp(28px,4vw,56px); align-items:center; }
.ml-eyebrow { display:flex; align-items:center; gap:10px; margin-bottom:20px; font:500 11px/1.4 ${MONO}; letter-spacing:.14em; color:#A7B0BE; }
.ml-eyebrow-rule { display:block; flex:none; width:24px; height:5px; background:${C.red}; transform:skewX(-14deg); }
.ml-hero h1 { margin:0 0 18px; max-width:14ch; font:700 clamp(36px,5.6vw,64px)/1.03 ${DISPLAY}; font-variation-settings:'wdth' 112; letter-spacing:-.03em; color:#FFFFFF; text-wrap:balance; }
.ml-hero-lede { margin:0 0 30px; max-width:520px; font:400 clamp(16px,1.8vw,19px)/1.55 ${SANS}; color:#C3CAD5; }
.ml-cta-row { display:flex; flex-wrap:wrap; gap:12px; }
.ml-chips { display:flex; flex-wrap:wrap; gap:10px; margin-top:30px; }
.ml-chip { display:inline-flex; align-items:center; gap:8px; padding:8px 13px; border-radius:999px; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.14); font:500 13px/1 ${SANS}; color:#E6EAF0; }

.ml-kicker { display:flex; align-items:center; gap:10px; margin-bottom:14px; font:500 11px/1 ${MONO}; letter-spacing:.12em; color:${C.n500}; }
.ml-kicker-dot { width:6px; height:6px; border-radius:999px; background:${C.red}; }
.ml-h2 { margin:0 0 14px; font:700 clamp(28px,3.8vw,42px)/1.08 ${DISPLAY}; font-variation-settings:'wdth' 108; letter-spacing:-.025em; color:${C.ink}; text-wrap:balance; }
.ml-sub { margin:0; max-width:620px; font:400 clamp(15px,1.6vw,17px)/1.6 ${SANS}; color:${C.n600}; }
.ml-head { margin-bottom:clamp(28px,4vw,44px); }

.ml-doors-label { margin-bottom:12px; font:500 11px/1 ${MONO}; letter-spacing:.12em; color:#A7B0BE; }
.ml-doors { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.ml-door { position:relative; display:flex; flex-direction:column; justify-content:flex-end; min-height:200px; padding:16px; border-radius:14px; overflow:hidden; background:${C.ink}; text-decoration:none; border:1px solid rgba(255,255,255,.12); transition:transform .18s, box-shadow .18s, border-color .18s; }
.ml-door:hover { transform:translateY(-3px); border-color:rgba(255,255,255,.3); box-shadow:0 18px 36px rgba(0,0,0,.35); }
.ml-door img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; transition:transform .5s; }
.ml-door:hover img { transform:scale(1.05); }
.ml-door-shade { position:absolute; inset:0; background:linear-gradient(0deg,rgba(11,15,26,.94) 0%,rgba(11,15,26,.5) 60%,rgba(11,15,26,.2) 100%); }
.ml-door-body { position:relative; display:block; }
.ml-door-icon { width:38px; height:38px; border-radius:10px; background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.2); display:grid; place-items:center; color:#FFFFFF; margin-bottom:10px; }
.ml-door-title { display:flex; align-items:center; justify-content:space-between; gap:8px; font:600 16px/1.25 ${SANS}; color:#FFFFFF; }
.ml-door-line { display:block; margin-top:5px; font:400 12.5px/1.45 ${SANS}; color:#B7BFCC; }

.ml-coming { background:#FFFFFF; border-bottom:1px solid ${C.n200}; }
.ml-coming-inner { display:flex; flex-wrap:wrap; align-items:center; gap:14px 24px; padding:22px 0; }
.ml-coming-list { display:flex; flex-wrap:wrap; gap:8px; }
.ml-coming-chip { display:inline-flex; align-items:center; gap:7px; padding:8px 12px; border-radius:999px; background:${C.n100}; border:1px dashed ${C.n200}; font:500 13.5px/1 ${SANS}; color:${C.n700}; }
.ml-coming-link { margin-left:auto; display:inline-flex; align-items:center; gap:8px; min-height:44px; font:600 14px/1 ${SANS}; color:${C.blue}; text-decoration:none; }
.ml-coming-link:hover { color:${C.blue700}; }

.ml-earn { display:grid; grid-template-columns:1fr 1.1fr; gap:clamp(28px,5vw,64px); align-items:center; }
.ml-calc { background:${C.ink}; border-radius:18px; padding:clamp(20px,3.4vw,36px); color:#FFFFFF; box-shadow:0 30px 60px rgba(11,15,26,.22); min-width:0; }
.ml-calc-tabs { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:18px; }
.ml-calc-tab { min-height:44px; padding:0 14px; border-radius:999px; border:1px solid #2A3346; background:transparent; color:#A7B0BE; font:600 13.5px/1 ${SANS}; cursor:pointer; }
.ml-calc-tab[aria-pressed="true"] { background:#FFFFFF; border-color:#FFFFFF; color:${C.ink}; }
.ml-label { display:block; margin-bottom:8px; font:600 10.5px/1 ${MONO}; letter-spacing:.09em; color:#8C97A8; }
.ml-input { width:100%; height:48px; padding:0 13px; border:1px solid #2A3346; border-radius:10px; background:#131A28; color:#FFFFFF; font:500 16px/1 ${SANS}; }
.ml-input:focus { outline:none; border-color:#5B6FE0; box-shadow:0 0 0 3px rgba(91,111,224,.3); }
.ml-range { width:100%; min-height:44px; accent-color:#5B6FE0; }
.ml-calc-out { margin-top:20px; padding-top:22px; border-top:1px solid #252B3A; }
.ml-calc-big { font:700 clamp(32px,4.6vw,48px)/1 ${DISPLAY}; font-variation-settings:'wdth' 110; letter-spacing:-.03em; overflow-wrap:anywhere; }
.ml-calc-note { margin:14px 0 0; font:400 12.5px/1.55 ${SANS}; color:#7C8697; }
.ml-earn-points { display:grid; gap:14px; margin:26px 0 0; padding:0; list-style:none; }
.ml-earn-points li { display:flex; gap:12px; align-items:flex-start; font:400 15px/1.5 ${SANS}; color:${C.n700}; }

.ml-steps { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }
.ml-steps-4 { grid-template-columns:repeat(4,1fr); }
.ml-step { background:#FFFFFF; border:1px solid ${C.n200}; border-radius:16px; padding:22px; }
.ml-step-n { display:inline-block; margin-bottom:14px; padding:6px 10px; border-radius:999px; background:${C.ink}; font:600 11px/1 ${MONO}; letter-spacing:.08em; color:#FFFFFF; }
.ml-step h3 { margin:0 0 8px; font:600 17px/1.3 ${SANS}; color:${C.ink}; }
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
.ml-faq summary { list-style:none; cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:16px; min-height:44px; padding:18px 20px; font:600 16px/1.4 ${SANS}; color:${C.ink}; border-radius:12px; }
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
.ml-footer-grid { display:grid; grid-template-columns:1.4fr 1fr 1fr 1fr; gap:32px; padding:48px 0 36px; }
.ml-footer h4 { margin:0 0 14px; font:500 11px/1 ${MONO}; letter-spacing:.12em; color:#5F6B7D; }
.ml-footer ul { list-style:none; margin:0; padding:0; display:grid; gap:4px; }
.ml-footer a { font:400 14px/1.4 ${SANS}; color:#C3CAD5; text-decoration:none; display:inline-flex; align-items:center; gap:8px; min-height:36px; }
.ml-footer a:hover { color:#FFFFFF; }
.ml-footer-base { border-top:1px solid #1D2637; padding:18px 0 90px; font:500 11px/1.6 ${MONO}; letter-spacing:.08em; color:#5F6B7D; }

.ml-fab { position:fixed; right:clamp(14px,2.4vw,28px); bottom:clamp(14px,2.4vw,28px); z-index:50; display:inline-flex; align-items:center; gap:10px; height:56px; padding:0 20px 0 16px; border-radius:999px; background:${C.whatsapp}; color:${C.ink}; font:600 15px/1 ${SANS}; text-decoration:none; box-shadow:0 12px 30px rgba(11,15,26,.28); transition:transform .15s, box-shadow .15s; }
.ml-fab:hover { transform:translateY(-2px); box-shadow:0 16px 36px rgba(11,15,26,.34); }

@media (max-width: 1020px) {
  .ml-why-grid, .ml-steps-4 { grid-template-columns:repeat(2,1fr); }
  .ml-earn, .ml-docs, .ml-hero-split { grid-template-columns:1fr; }
}
@media (max-width: 860px) {
  .ml-nav { display:none; }
  .ml-steps { grid-template-columns:1fr; }
  .ml-footer-grid { grid-template-columns:1fr 1fr; }
  .ml-coming-link { margin-left:0; }
}
@media (max-width: 600px) {
  .ml-why-grid, .ml-steps-4 { grid-template-columns:1fr; }
  .ml-doors { grid-template-columns:1fr; gap:8px; }
  .ml-door { min-height:0; padding:12px 14px; flex-direction:row; align-items:center; background:rgba(255,255,255,.06); }
  .ml-door img, .ml-door-shade, .ml-door-line { display:none; }
  .ml-door-body { display:flex; align-items:center; gap:12px; width:100%; }
  .ml-door-icon { margin:0; flex:none; }
  .ml-door-title { flex:1; }
  .ml-header-wa { display:none; }
  .ml-header-inner { gap:10px; }
  .ml-fab-label { display:none; }
  .ml-fab { width:56px; padding:0; justify-content:center; }
  .ml-hero-shade { background:linear-gradient(0deg,rgba(11,15,26,.97) 0%,rgba(11,15,26,.85) 55%,rgba(11,15,26,.55) 100%); }
  .ml-cta-row .ml-btn { flex:1 1 100%; }
  .ml-footer-grid { grid-template-columns:1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .ml-root * { transition:none !important; }
}
`;
