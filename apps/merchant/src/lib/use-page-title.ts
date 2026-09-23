import { useEffect } from "react";

const SUFFIX = "CRAL";

/**
 * Sets `document.title` for the mounted page and restores the previous
 * title on unmount. Every title carries the "Merchant:" prefix so a browser
 * tab reads as the merchant sub-site ("Merchant: Bookings · CRAL"); detail
 * screens pass the entity ("KDL 442N").
 */
export function usePageTitle(label: string | null | undefined): void {
  useEffect(() => {
    const previous = document.title;
    document.title = label ? `Merchant: ${label} · ${SUFFIX}` : `Merchant · ${SUFFIX}`;
    return () => {
      document.title = previous;
    };
  }, [label]);
}
