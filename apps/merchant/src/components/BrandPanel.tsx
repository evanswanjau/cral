import { LogoMark } from "./LogoMark.js";

const FEATURES = [
  {
    title: "Answer requests in one tap",
    description: "Hirers pay CRAL up front, so a request's money is already waiting on your yes.",
  },
  {
    title: "Payouts straight to M-Pesa",
    description: "Every Monday and Thursday, 24 hours after each vehicle comes back.",
  },
  {
    title: "One check per vehicle",
    description: "Your company papers are checked once. Each vehicle then needs only three documents.",
  },
];

/**
 * The dark marketing panel from the merchant app design — shared by every
 * auth screen. Built against the real CRAL Design System v2 brand doc:
 * Ink (#0B0F1A) surface, Archivo for the display headline, Instrument Sans
 * for body copy, IBM Plex Mono for the small-caps labels. The masthead's
 * red rule carries the brand's signature 14° skew — "one skewed red rule
 * per surface, never more than once in view."
 */
export function BrandPanel(): JSX.Element {
  return (
    <div className="hidden flex-col justify-between bg-ink p-12 text-white lg:flex">
      <div>
        <div className="flex items-center gap-3">
          <LogoMark />
          <span className="border-l border-white/10 pl-3 font-mono text-xs uppercase tracking-widest text-cruz-blue-200">
            Merchant Portal
          </span>
        </div>

        <div className="mt-24 max-w-md">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cruz-blue-200">
            <span className="h-[3px] w-6 -skew-x-[14deg] bg-cruz-red" />
            CRAL · Nairobi, Kenya
          </div>
          <h1 className="mt-4 font-display text-[42px] font-bold leading-[1.05] tracking-[-0.01em]">
            Your vehicles, your money, in one place.
          </h1>
          <p className="mt-4 text-white/70">
            Sign in to answer booking requests, track what each vehicle earns, and watch your payouts
            land on M-Pesa.
          </p>

          <ul className="mt-8 flex flex-col gap-4">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[11px] text-white/50">
                  ✓
                </span>
                <div>
                  <div className="font-semibold text-white">{feature.title}</div>
                  <div className="text-sm text-white/60">{feature.description}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex items-center justify-between font-mono text-xs uppercase tracking-widest text-white/40">
        <span>© 2026 CRAL · CRAL.CO.KE</span>
        <span>Stuck? Call 0733 376 061</span>
      </div>
    </div>
  );
}
