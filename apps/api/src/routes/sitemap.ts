import { Router } from "express";
import { baseCatalogQuery } from "../modules/catalog/service.js";

export const sitemapRouter = Router();

/**
 * `GET /sitemap.xml` - real URLs, not a static file. The static marketing
 * routes plus every currently live, publicly-visible listing, using the
 * same `baseCatalogQuery()` the catalog itself reads from - a second copy
 * of the two-gate predicate here is how a paused listing ends up
 * advertised to Google after it comes off the site.
 *
 * `CUSTOMER_SITE_URL` lets staging point at its own host; production
 * defaults to the real one. Mapped at the edge so `https://cral.co.ke/
 * sitemap.xml` (what robots.txt advertises) reaches this route rather
 * than 404ing on the static customer app - see DEPLOY.md.
 */

const SITE_URL = process.env.CUSTOMER_SITE_URL ?? "https://cral.co.ke";

const STATIC_PATHS: Array<{ path: string; changefreq: string; priority: string }> = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/browse", changefreq: "hourly", priority: "0.9" },
  { path: "/how-it-works", changefreq: "monthly", priority: "0.5" },
  { path: "/how-we-protect-you", changefreq: "monthly", priority: "0.5" },
  { path: "/corporate", changefreq: "monthly", priority: "0.3" },
  { path: "/about", changefreq: "monthly", priority: "0.3" },
  { path: "/help", changefreq: "monthly", priority: "0.4" },
  { path: "/contact", changefreq: "monthly", priority: "0.3" },
  { path: "/legal", changefreq: "monthly", priority: "0.2" },
  { path: "/list-your-car", changefreq: "monthly", priority: "0.5" },
];

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

sitemapRouter.get("/sitemap.xml", async (_req, res) => {
  const vehicles = (await baseCatalogQuery().select("v.id", "v.updated_at")) as Array<{
    id: string;
    updated_at: Date;
  }>;

  const urls = [
    ...STATIC_PATHS.map(
      (p) =>
        `<url><loc>${xmlEscape(SITE_URL + p.path)}</loc><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`,
    ),
    ...vehicles.map(
      (v) =>
        `<url><loc>${xmlEscape(`${SITE_URL}/cars/${v.id}`)}</loc><lastmod>${v.updated_at.toISOString().slice(0, 10)}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`,
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;

  res.setHeader("Content-Type", "application/xml");
  // A few minutes of edge/browser cache - listings change, but not by the
  // second, and this route has no auth to make caching a leak risk.
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).send(xml);
});
