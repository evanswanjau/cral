import { useEffect } from "react";

const SUFFIX = "Cruz Ride Auto";

/**
 * Sets `document.title` for the mounted page and restores the previous
 * title on unmount. Every page component calls this with a short,
 * page-specific label; detail screens pass the entity (a car's name).
 * Once the marketing pages are prerendered, the prerender step reads the
 * title the same way.
 */
export function usePageTitle(label: string | null | undefined): void {
  useEffect(() => {
    const previous = document.title;
    document.title = label ? `${label} - ${SUFFIX}` : SUFFIX;
    return () => {
      document.title = previous;
    };
  }, [label]);
}
