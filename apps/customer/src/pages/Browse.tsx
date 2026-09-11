import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { usePageTitle } from "../lib/use-page-title.js";
import { searchCatalog, type CatalogSearchParams } from "../lib/catalog-api.js";
import { VehicleCard, CARD_TINTS } from "../components/site/VehicleCard.js";
import { VEHICLE_CATEGORIES, type VehicleCategory } from "../lib/vehicle-categories.js";

/**
 * `/browse`, reproduced from the design's "browse" screen. Filters live in
 * the querystring - shareable, back-button-safe, and exactly what the
 * catalog's cursor pagination expects. "List" is the design's second view
 * mode; kept out for now (Cards only) to ship the filter rail and paging,
 * which are the load-bearing parts.
 */

const CITIES = ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret"];
const SORTS: Array<{ value: CatalogSearchParams["sort"]; label: string }> = [
  { value: "recommended", label: "Recommended" },
  { value: "price_asc", label: "Price, low to high" },
  { value: "price_desc", label: "Price, high to low" },
];

const labelStyle = {
  display: "block",
  font: "600 12px/1 'Instrument Sans',sans-serif",
  color: "#5A6373",
  marginBottom: 9,
} as const;

const chipStyle = (on: boolean) =>
  ({
    height: 32,
    padding: "0 12px",
    background: on ? "#0B0F1A" : "#FFFFFF",
    color: on ? "#FFFFFF" : "#333B4A",
    border: `1px solid ${on ? "#0B0F1A" : "#E4E7EC"}`,
    borderRadius: 999,
    font: "600 12px/1 'Instrument Sans',sans-serif",
    cursor: "pointer",
  }) as const;

export function Browse(): JSX.Element {
  usePageTitle("Find a car");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const county = params.get("county") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const category = params.get("category") ?? "";
  const seatsMin = params.get("seats_min") ?? "";
  const transmission = params.get("transmission") ?? "";
  const chauffeured = params.get("chauffeured") ?? "";
  const maxPrice = params.get("max_price") ?? "2400000"; // KES 24,000, the design's ceiling
  const sort = (params.get("sort") as CatalogSearchParams["sort"]) ?? "recommended";
  const cursor = params.get("cursor") ?? undefined;

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    // Any real filter change starts back at page one.
    if (!("cursor" in patch)) next.delete("cursor");
    setParams(next);
  };

  const clearFilters = () => setParams(new URLSearchParams());

  const query = useMemo<CatalogSearchParams>(() => {
    const q: CatalogSearchParams = { max_price: Number(maxPrice), sort, limit: 24 };
    if (county) q.county = county;
    if (from) q.from = from;
    if (to) q.to = to;
    if (category) q.category = category as VehicleCategory;
    if (seatsMin) q.seats_min = Number(seatsMin);
    if (transmission === "automatic" || transmission === "manual") q.transmission = transmission;
    if (chauffeured) q.chauffeured = chauffeured === "true";
    if (cursor) q.cursor = cursor;
    return q;
  }, [county, from, to, category, seatsMin, transmission, chauffeured, maxPrice, sort, cursor]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["catalog", "search", query],
    queryFn: () => searchCatalog(query),
  });

  const results = data?.data ?? [];
  const heading = county ? `cars in ${county}` : "cars";

  return (
    <div
      style={{
        padding: "clamp(18px,2.6vw,30px) clamp(14px,3vw,32px) clamp(40px,6vw,72px)",
      }}
    >
      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          display: "flex",
          gap: "clamp(16px,2.4vw,26px)",
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        {/* ---- filters ---- */}
        <div
          style={{
            flex: "0 0 254px",
            minWidth: 230,
            position: "sticky",
            top: 82,
            background: "#FFFFFF",
            border: "1px solid #E4E7EC",
            borderRadius: 12,
            padding: 18,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 18,
            }}
          >
            <span
              style={{
                font: "500 10px/1 'IBM Plex Mono',monospace",
                letterSpacing: ".11em",
                color: "#9AA2B0",
              }}
            >
              FILTERS
            </span>
            <button
              type="button"
              onClick={clearFilters}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                font: "600 12px/1 'Instrument Sans',sans-serif",
                color: "#0F23A8",
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          </div>

          <div style={{ display: "grid", gap: 18 }}>
            <label style={{ display: "block" }}>
              <span style={labelStyle}>City / county</span>
              <select
                value={county}
                onChange={(e) => set({ county: e.target.value })}
                style={{
                  width: "100%",
                  height: 42,
                  padding: "0 11px",
                  border: "1px solid #CDD2DA",
                  borderRadius: 8,
                  font: "400 14px/1 'Instrument Sans',sans-serif",
                  color: "#0B0F1A",
                  background: "#FFFFFF",
                }}
              >
                <option value="">Anywhere</option>
                {CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ flex: "1 1 96px", display: "block" }}>
                <span style={labelStyle}>From</span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => set({ from: e.target.value, to: to || undefined })}
                  style={{
                    width: "100%",
                    height: 42,
                    padding: "0 9px",
                    border: "1px solid #CDD2DA",
                    borderRadius: 8,
                    font: "500 13px/1 'IBM Plex Mono',monospace",
                    color: "#0B0F1A",
                    background: "#FFFFFF",
                  }}
                />
              </label>
              <label style={{ flex: "1 1 96px", display: "block" }}>
                <span style={labelStyle}>Until</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => set({ to: e.target.value, from: from || undefined })}
                  style={{
                    width: "100%",
                    height: 42,
                    padding: "0 9px",
                    border: "1px solid #CDD2DA",
                    borderRadius: 8,
                    font: "500 13px/1 'IBM Plex Mono',monospace",
                    color: "#0B0F1A",
                    background: "#FFFFFF",
                  }}
                />
              </label>
            </div>

            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  marginBottom: 9,
                }}
              >
                <span style={{ font: "600 12px/1 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                  Up to
                </span>
                <span style={{ font: "600 12px/1 'IBM Plex Mono',monospace", color: "#0B0F1A" }}>
                  KES {Math.round(Number(maxPrice) / 100).toLocaleString("en-KE")} / day
                </span>
              </div>
              <input
                type="range"
                min={2500}
                max={2400000}
                step={2500}
                value={maxPrice}
                onChange={(e) => set({ max_price: e.target.value })}
                style={{ width: "100%", accentColor: "#0F23A8" }}
              />
            </div>

            <div>
              <div style={{ font: "600 12px/1 'Instrument Sans',sans-serif", color: "#5A6373", marginBottom: 9 }}>
                Category
              </div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {VEHICLE_CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => set({ category: category === c.value ? undefined : c.value })}
                    style={chipStyle(category === c.value)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ font: "600 12px/1 'Instrument Sans',sans-serif", color: "#5A6373", marginBottom: 9 }}>
                Seats
              </div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {[
                  { label: "Any", value: "" },
                  { label: "7 and up", value: "7" },
                ].map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => set({ seats_min: s.value || undefined })}
                    style={chipStyle(seatsMin === s.value)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ font: "600 12px/1 'Instrument Sans',sans-serif", color: "#5A6373", marginBottom: 9 }}>
                Gearbox
              </div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {[
                  { label: "Any", value: "" },
                  { label: "Automatic", value: "automatic" },
                  { label: "Manual", value: "manual" },
                ].map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => set({ transmission: t.value || undefined })}
                    style={chipStyle(transmission === t.value)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ font: "600 12px/1 'Instrument Sans',sans-serif", color: "#5A6373", marginBottom: 9 }}>
                Driver
              </div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {[
                  { label: "Any", value: "" },
                  { label: "Self-drive", value: "false" },
                  { label: "With driver", value: "true" },
                ].map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => set({ chauffeured: c.value || undefined })}
                    style={chipStyle(chauffeured === c.value)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ---- results ---- */}
        <div style={{ flex: 1, minWidth: 300 }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 14,
              marginBottom: 16,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h1
                style={{
                  margin: "0 0 5px",
                  font: "700 clamp(22px,2.8vw,30px)/1.1 Archivo,sans-serif",
                  fontVariationSettings: "'wdth' 108",
                  letterSpacing: "-.025em",
                  color: "#0B0F1A",
                }}
              >
                {isLoading ? "Searching" : results.length} {heading}
              </h1>
              <p style={{ margin: 0, font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                All documents reviewed by CRAL before a car is listed.
              </p>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ font: "600 12px/1 'Instrument Sans',sans-serif", color: "#5A6373" }}>Sort</span>
              <select
                value={sort}
                onChange={(e) => set({ sort: e.target.value })}
                style={{
                  height: 40,
                  padding: "0 11px",
                  border: "1px solid #CDD2DA",
                  borderRadius: 8,
                  font: "400 14px/1 'Instrument Sans',sans-serif",
                  color: "#0B0F1A",
                  background: "#FFFFFF",
                }}
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isError && (
            <p style={{ font: "400 15px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
              We couldn't load the listings just now. Refresh in a moment.
            </p>
          )}

          {!isLoading && !isError && results.length === 0 && (
            <div
              style={{
                background: "#FFFFFF",
                border: "1px dashed #CDD2DA",
                borderRadius: 12,
                padding: "44px 24px",
                textAlign: "center",
              }}
            >
              <div style={{ font: "600 17px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 8 }}>
                Nothing matches all of that.
              </div>
              <p style={{ margin: "0 0 18px", font: "400 14px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                Try raising the price ceiling or dropping a filter.
              </p>
              <button
                type="button"
                onClick={clearFilters}
                style={{
                  height: 42,
                  padding: "0 18px",
                  background: "#0F23A8",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: 8,
                  font: "600 14px/1 'Instrument Sans',sans-serif",
                  cursor: "pointer",
                }}
              >
                Clear filters
              </button>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill,minmax(244px,1fr))",
              gap: 14,
            }}
          >
            {results.map((car, i) => (
              <VehicleCard
                key={car.id}
                car={car}
                tint={CARD_TINTS[i % CARD_TINTS.length] as string}
                onOpen={() => navigate(`/cars/${car.id}`)}
              />
            ))}
          </div>

          {data?.has_more && (
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 24 }}>
              <button
                type="button"
                onClick={() => set({ cursor: data.next_cursor ?? undefined })}
                style={{
                  height: 44,
                  padding: "0 22px",
                  background: "#FFFFFF",
                  color: "#0B0F1A",
                  border: "1px solid #E4E7EC",
                  borderRadius: 8,
                  font: "600 14px/1 'Instrument Sans',sans-serif",
                  cursor: "pointer",
                }}
              >
                Show more cars
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
