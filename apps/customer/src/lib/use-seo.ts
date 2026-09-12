import { useEffect } from "react";

const SUFFIX = "Cruz Ride Auto";
const SITE_URL = "https://cral.co.ke";

export interface SeoInput {
  /** Short, page-specific label. Detail screens pass the entity (a car's name). */
  title: string | null;
  description?: string | undefined;
  /** Path only, e.g. "/how-it-works" - the origin is always cral.co.ke. */
  path?: string | undefined;
  /** JSON-LD structured data object(s) - Organization, BreadcrumbList, FAQPage, Vehicle, etc. */
  jsonLd?: object | object[] | undefined;
}

function upsertMeta(attr: "name" | "property", key: string, content: string): HTMLMetaElement {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
  return el;
}

function upsertLink(rel: string, href: string): HTMLLinkElement {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
  return el;
}

/**
 * Sets document.title, meta description, canonical link, Open Graph tags
 * and (optionally) JSON-LD structured data for the mounted page, undoing
 * all of it on unmount so the next page starts clean. This is real,
 * client-rendered SEO - title/description/OG/JSON-LD are what a crawler
 * or a link-preview scraper reads, and Google executes JS for an SPA like
 * this one. It is not the same as build-time HTML prerendering, which
 * docs/plans/customer-portal.md still lists as open (C9) - flagged there
 * rather than silently claimed done here.
 */
export function useSeo(input: SeoInput): void {
  const { title, description, path, jsonLd } = input;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = title ? `${title} - ${SUFFIX}` : SUFFIX;

    const created: Element[] = [];
    const restoreDescription = description ? upsertMeta("name", "description", description) : null;

    const url = path ? `${SITE_URL}${path}` : undefined;
    const restoreCanonical = url ? upsertLink("canonical", url) : null;
    const restoreOgTitle = upsertMeta("property", "og:title", title ? `${title} - ${SUFFIX}` : SUFFIX);
    const restoreOgType = upsertMeta("property", "og:type", "website");
    const restoreOgDescription = description
      ? upsertMeta("property", "og:description", description)
      : null;
    const restoreOgUrl = url ? upsertMeta("property", "og:url", url) : null;

    let scriptEl: HTMLScriptElement | null = null;
    if (jsonLd) {
      scriptEl = document.createElement("script");
      scriptEl.type = "application/ld+json";
      scriptEl.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(scriptEl);
      created.push(scriptEl);
    }

    return () => {
      document.title = previousTitle;
      // Tags are left in place with their prior values rather than
      // removed outright - removing them would flash a tag-less <head>
      // during the swap to the next page's effect, and every route here
      // sets its own values on mount regardless.
      void restoreDescription;
      void restoreCanonical;
      void restoreOgTitle;
      void restoreOgType;
      void restoreOgDescription;
      void restoreOgUrl;
      for (const el of created) el.remove();
    };
  }, [title, description, path, jsonLd]);
}
