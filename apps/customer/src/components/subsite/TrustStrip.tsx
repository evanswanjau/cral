import { Link } from "react-router-dom";

/**
 * The four trust points, from the canvas `trustCols` (Website canvas):
 * same titles and numbering, bodies reworded so they hold for every live
 * service rather than cars only (proposal section 0 and 4.4). One "How
 * we protect you" link. Ink card as the canvas draws it, without the
 * canvas's decorative skewed bar: the sub-site hero already carries the
 * page's one skewed rule.
 */
const POINTS = [
  {
    n: "01",
    title: "Read before it is listed",
    body: "Logbook, ID, licence, insurance and KRA PIN, checked by a person for names and dates that agree before a car, truck, machine or driver appears here.",
  },
  {
    n: "02",
    title: "Paid only after a yes",
    body: "Nothing leaves your M-Pesa until the owner accepts your dates or you accept a price. If a request lapses, you have paid nothing at all.",
  },
  {
    n: "03",
    title: "Judged on evidence",
    body: "A claim goes to a reviewer who reads both sides and both sets of photos before any money moves.",
  },
  {
    n: "04",
    title: "Expiry is enforced",
    body: "When an insurance certificate or a licence lapses, the listing comes off the site until it is replaced.",
  },
];

export function TrustStrip(): JSX.Element {
  return (
    <section style={{ padding: "clamp(24px,3.6vw,44px) clamp(16px,4vw,40px)" }}>
      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          background: "#0B0F1A",
          borderRadius: 12,
          padding: "clamp(24px,3.6vw,44px)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
            gap: "clamp(18px,2.6vw,30px)",
          }}
        >
          {POINTS.map((t) => (
            <div key={t.n}>
              <div
                style={{
                  font: "500 10px/1 'IBM Plex Mono',monospace",
                  letterSpacing: ".11em",
                  color: "#D81E32",
                  marginBottom: 11,
                }}
              >
                {t.n}
              </div>
              <div
                style={{
                  font: "600 16px/1.3 Archivo,sans-serif",
                  fontVariationSettings: "'wdth' 106",
                  color: "#FFFFFF",
                  marginBottom: 8,
                }}
              >
                {t.title}
              </div>
              <p style={{ margin: 0, font: "400 14px/1.6 'Instrument Sans',sans-serif", color: "#A7B0BE" }}>{t.body}</p>
            </div>
          ))}
        </div>
        <Link
          to="/how-we-protect-you"
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: 44,
            marginTop: "clamp(16px,2.4vw,24px)",
            font: "600 14px/1 'Instrument Sans',sans-serif",
            color: "#FFFFFF",
            textDecoration: "underline",
            textUnderlineOffset: 4,
          }}
        >
          How we protect you
        </Link>
      </div>
    </section>
  );
}
