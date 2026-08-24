/**
 * Placeholder logo mark — approximates the white badge + car silhouette
 * from the design file until the real asset is exported. Swap the SVG
 * for the real mark when it's available; the surrounding layout doesn't
 * need to change.
 */
export function LogoMark(): JSX.Element {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white">
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M3 17c0-1 .8-2 2-2h1.5l1.8-4.5c.3-.8 1-1.3 1.9-1.3h7.6c.9 0 1.6.5 1.9 1.3L21.5 15H23c1.2 0 2 1 2 2v2.5c0 .5-.4 1-1 1h-1.5a2.5 2.5 0 0 1-5 0h-6a2.5 2.5 0 0 1-5 0H4.5a1.5 1.5 0 0 1-1.5-1.5V17Z"
          fill="url(#cral-logo-gradient)"
        />
        <defs>
          <linearGradient id="cral-logo-gradient" x1="3" y1="9" x2="25" y2="20" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2563eb" />
            <stop offset="1" stopColor="#dc2626" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
