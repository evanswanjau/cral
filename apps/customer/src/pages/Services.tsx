import { useNavigate } from "react-router-dom";
import { useSeo } from "../lib/use-seo.js";
import { VerticalPage, type VerticalDef } from "../components/site/VerticalPage.js";

/** `vertDefs.services` from `docs/brand/canvas/Cruz Ride Auto - Website.dc.html`, verbatim. */
const DEF: VerticalDef = {
  kicker: "SERVICE AND REPAIR",
  status: "OPENING SOON",
  title: "A garage that agrees the price before it lifts a spanner.",
  sub: "Book a vetted garage for a service, a diagnostic or a repair. The quote is written into CRAL before work starts, and nothing is added to it without you saying yes.",
  ask: "What does the car need?",
  askPlaceholder: "Full service and brake pads, X-Trail 2019",
  points: [
    {
      n: "01",
      title: "Quote first, work after",
      body: "Parts, labour and days, itemised in the booking. Anything found mid-job comes back as a second quote, not a bigger bill at the gate.",
    },
    {
      n: "02",
      title: "Garages are visited",
      body: "A person inspects a garage before it is listed, and the listing comes down when the work stops matching the quotes.",
    },
    {
      n: "03",
      title: "One service record per car",
      body: "Every job on a car CRAL knows is kept with it, which is exactly what a buyer asks for two years later.",
    },
  ],
};

export function Services(): JSX.Element {
  const navigate = useNavigate();
  useSeo({
    title: "Find services",
    description: "Book vetted garages and vehicle services on Cruz Ride Auto - opening soon.",
    path: "/services",
  });

  return (
    <div>
      {/* Towing/recovery (owner's call, 2026-09-23) is real today, unlike
          the garage/repair vertical below it - a plain banner rather than
          folding it into the "opening soon" VerticalPage shared template,
          which is deliberately built around a not-yet-real offering. */}
      <div
        style={{
          margin: "0 auto",
          maxWidth: 1140,
          padding: "16px clamp(16px,4vw,40px) 0",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
            background: "#FBF8F2",
            border: "1px solid #E7DFD0",
            borderRadius: 12,
            padding: "16px 20px",
          }}
        >
          <div>
            <div style={{ font: "600 15px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 3 }}>
              Broken down or been in an accident?
            </div>
            <p style={{ margin: 0, font: "400 13.5px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
              Towing and recovery is live - quoted per km, or worked out on the call.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/services/towing")}
            style={{
              height: 44,
              padding: "0 18px",
              background: "#0F23A8",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 8,
              font: "600 14px/1 'Instrument Sans',sans-serif",
              cursor: "pointer",
              flex: "none",
            }}
          >
            Request towing →
          </button>
        </div>
      </div>
      <VerticalPage def={DEF} onFindCar={() => navigate("/browse")} />
    </div>
  );
}
