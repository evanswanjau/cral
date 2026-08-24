/**
 * The real CRAL logo (apps/merchant/public/logo.png) — black wordmark, so
 * it sits inside a white plate for contrast against the dark brand panel,
 * same as the "Merchant Portal" masthead badge in the design canvas.
 */
export function LogoMark(): JSX.Element {
  return (
    <div className="flex h-11 items-center rounded-lg bg-white px-2.5 py-1.5">
      <img src="/logo.png" alt="Cruz Ride Auto" className="h-full w-auto object-contain" />
    </div>
  );
}
