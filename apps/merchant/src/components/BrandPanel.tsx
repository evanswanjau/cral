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
 * auth screen (sign in now; create account / forgot password reuse it
 * once built). Colors are visually matched from the design file pending
 * exact exported values (see packages/ui/src/tokens.ts).
 */
export function BrandPanel(): JSX.Element {
  return (
    <div className="hidden flex-col justify-between bg-[#0a0f1f] p-12 text-white lg:flex">
      <div>
        <div className="flex items-center gap-3">
          <LogoMark />
          <div className="leading-tight">
            <div className="text-sm font-semibold">CRUZ RIDE AUTO</div>
            <div className="text-[10px] text-slate-500">LIMITED</div>
          </div>
          <span className="ml-2 border-l border-slate-700 pl-3 font-mono text-xs uppercase tracking-widest text-slate-400">
            Merchant Portal
          </span>
        </div>

        <div className="mt-24 max-w-md">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-slate-400">
            <span className="h-0.5 w-6 bg-red-600" />
            CRAL · Nairobi, Kenya
          </div>
          <h1 className="mt-4 text-4xl font-bold leading-tight">
            Your vehicles, your money, in one place.
          </h1>
          <p className="mt-4 text-slate-300">
            Sign in to answer booking requests, track what each vehicle earns, and watch your payouts
            land on M-Pesa.
          </p>

          <ul className="mt-8 flex flex-col gap-4">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  ✓
                </span>
                <div>
                  <div className="font-semibold text-white">{feature.title}</div>
                  <div className="text-sm text-slate-400">{feature.description}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex items-center justify-between font-mono text-xs uppercase tracking-widest text-slate-500">
        <span>© 2026 CRAL · CRAL.CO.KE</span>
        <span>Stuck? Call 0733 376 061</span>
      </div>
    </div>
  );
}
