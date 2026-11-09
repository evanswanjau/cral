import { useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSeo } from "../lib/use-seo.js";
import { PageHero, Section, Card, Body } from "../components/site/marketing.js";
import { COUNTIES } from "../lib/kenya.js";
import { VEHICLE_CATEGORIES } from "../lib/vehicle-categories.js";
import { IMPORT_LABEL, browseSales, kes, salePhotoSrc, type BrowseFilters, type SaleSummary } from "../lib/sales-api.js";
import { Button, inputStyle } from "../components/sale/ui.js";

function SaleCard({ s }: { s: SaleSummary }): JSX.Element {
  return (
    <Link to={`/buy/${s.ref}`} style={{ textDecoration: "none", display: "block" }}>
      <div style={{ background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: 12, overflow: "hidden", height: "100%" }}>
        <div style={{ aspectRatio: "4 / 3", background: "#F1F3F6", position: "relative" }}>
          {s.cover_url && (
            <img src={salePhotoSrc(s.cover_url)} alt={s.title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          )}
          {s.status === "under_offer" && (
            <span style={{ position: "absolute", top: 10, left: 10, padding: "5px 9px", borderRadius: 999, background: "#0F23A8", color: "#FFFFFF", font: "600 11.5px/1 'Instrument Sans',sans-serif" }}>
              Under offer
            </span>
          )}
        </div>
        <div style={{ padding: "12px 14px 14px" }}>
          <div style={{ font: "600 15px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>{s.title}</div>
          <div style={{ font: "700 18px/1.3 Archivo,sans-serif", color: "#0B0F1A", margin: "4px 0" }}>
            {kes(s.asking_price)}
            {s.negotiable && <span style={{ font: "400 12px/1 'Instrument Sans',sans-serif", color: "#5A6373" }}> · negotiable</span>}
          </div>
          <div style={{ font: "400 12.5px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
            {s.mileage_km.toLocaleString("en-KE")} km · {s.transmission} · {IMPORT_LABEL[s.import_status] ?? s.import_status}
          </div>
          <div style={{ font: "400 12.5px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
            {s.county} · {s.seller.type === "private" ? "Private seller" : s.seller.name}
          </div>
          {(s.encumbered || s.accident_history !== "none") && (
            <div style={{ font: "500 12px/1.5 'Instrument Sans',sans-serif", color: "#8A5200", marginTop: 2 }}>
              {[s.encumbered ? "Bank on logbook" : null, s.accident_history !== "none" ? `${s.accident_history === "major" ? "Major" : "Minor"} accident declared` : null]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

/**
 * Buy a car (docs/plans/car-sales.md). Every car here had its logbook read
 * against the photos before it was listed. The canvas has no buy screens,
 * so this follows Browse.tsx's card grid in the marketing pages' tokens.
 */
export function Buy(): JSX.Element {
  useSeo({
    title: "Cars for sale",
    description: "Used and new cars for sale in Kenya. Every logbook read against the car before the advert goes live.",
    path: "/buy",
  });
  const [f, setF] = useState<BrowseFilters>({ sort: "newest" });
  const set = (k: keyof BrowseFilters) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value || undefined });

  const q = useInfiniteQuery({
    queryKey: ["sales", f],
    queryFn: ({ pageParam }) => browseSales({ ...f, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: "",
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : undefined),
  });
  const first = q.data?.pages[0];
  const cars = q.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div>
      <PageHero
        kicker="BUY A CAR"
        title="Cars whose papers a person has read."
        sub="Every logbook was checked against the car before the advert went live, and every seller stated the known faults. You deal with the seller directly - CRAL holds no money."
      />
      <Section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,150px),1fr))", gap: 10, marginBottom: 16 }}>
          <input value={f.q ?? ""} onChange={set("q")} placeholder="Search make or model" style={inputStyle} />
          <select value={f.make ?? ""} onChange={set("make")} style={inputStyle}>
            <option value="">Any make</option>
            {(first?.facets.makes ?? []).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <select value={f.category ?? ""} onChange={set("category")} style={inputStyle}>
            <option value="">Any type</option>
            {VEHICLE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <select value={f.county ?? ""} onChange={set("county")} style={inputStyle}>
            <option value="">Anywhere</option>
            {COUNTIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={f.max_price ?? ""} onChange={set("max_price")} style={inputStyle}>
            <option value="">Any price</option>
            {[500_000, 1_000_000, 1_500_000, 2_500_000, 4_000_000, 7_000_000].map((p) => (
              <option key={p} value={p}>Up to KES {p.toLocaleString("en-KE")}</option>
            ))}
          </select>
          <select value={f.sort} onChange={set("sort")} style={inputStyle}>
            <option value="newest">Newest first</option>
            <option value="price_asc">Cheapest first</option>
            <option value="price_desc">Dearest first</option>
          </select>
        </div>

        {q.isLoading && <Body>Loading cars...</Body>}
        {q.error && <Body>Couldn't load cars. Try again in a moment.</Body>}
        {first && (
          <Body>
            {first.total} {first.total === 1 ? "car" : "cars"} for sale.{" "}
            <Link to="/sell">Selling one?</Link>
          </Body>
        )}
        {first && cars.length === 0 && (
          <Card>
            <Body>Nothing matches yet. Try fewer filters, or check back soon.</Body>
          </Card>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,230px),1fr))", gap: 14 }}>
          {cars.map((s) => (
            <SaleCard key={s.ref} s={s} />
          ))}
        </div>
        {q.hasNextPage && (
          <div style={{ marginTop: 16 }}>
            <Button variant="secondary" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
              {q.isFetchingNextPage ? "Loading..." : "Show more"}
            </Button>
          </div>
        )}
      </Section>
    </div>
  );
}
