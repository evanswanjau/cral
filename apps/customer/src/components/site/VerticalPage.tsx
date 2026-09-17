import { useState } from "react";

/**
 * Shared template for the "opening soon" verticals (parts, services), from
 * `docs/brand/canvas/Cruz Ride Auto - Website.dc.html`'s `isVertical`
 * block and its `vertDefs` fixture - values inlined verbatim.
 *
 * The design's third vertical, `selling` ("buy and sell", status
 * "IN BUILD"), is not built here - not in scope, same footing as before.
 *
 * The canvas's "Tell me when it opens" card is client-state only in the
 * design (`submitNotify` just does `this.setState({ notifySent: true })`
 * - no request anywhere). Reproducing that as a real confirmation would be
 * exactly the fake "we'll get back to you" `Contact.tsx`'s own comment
 * already refuses to build. This uses a real `mailto:hello@cral.co.ke`
 * hand-off instead - same address, same channel.
 */

export interface VerticalPoint {
  n: string;
  title: string;
  body: string;
}

export interface VerticalDef {
  kicker: string;
  status: string;
  title: string;
  sub: string;
  ask: string;
  askPlaceholder: string;
  points: VerticalPoint[];
}

export function VerticalPage({ def, onFindCar }: { def: VerticalDef; onFindCar: () => void }): JSX.Element {
  const [note, setNote] = useState("");

  const mailHref = `mailto:hello@cral.co.ke?subject=${encodeURIComponent(
    `Tell me when ${def.kicker.toLowerCase()} opens`,
  )}&body=${encodeURIComponent(note ? `What I'm after: ${note}` : "")}`;

  return (
    <div>
      <div
        style={{
          background: "#0B0F1A",
          padding: "clamp(34px,5vw,64px) clamp(16px,4vw,40px) clamp(30px,4.4vw,52px)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            bottom: 18,
            right: -40,
            width: "clamp(170px,26vw,300px)",
            height: 13,
            background: "#D81E32",
            transform: "skewX(-14deg)",
            opacity: 0.45,
            pointerEvents: "none",
          }}
        />
        <div style={{ maxWidth: 1140, margin: "0 auto", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ display: "block", width: 24, height: 6, background: "#D81E32", transform: "skewX(-14deg)", flex: "none" }} />
            <span style={{ font: "500 11px/1 'IBM Plex Mono',monospace", letterSpacing: ".13em", color: "#8C97A8" }}>
              {def.kicker}
            </span>
            <span
              style={{
                padding: "4px 10px",
                background: "rgba(255,255,255,.07)",
                border: "1px solid #3A4252",
                borderRadius: 999,
                font: "600 10px/1.5 'IBM Plex Mono',monospace",
                letterSpacing: ".08em",
                color: "#C7CEDA",
              }}
            >
              {def.status}
            </span>
          </div>
          <h1
            style={{
              margin: "0 0 14px",
              font: "700 clamp(31px,5vw,56px)/1.04 Archivo,sans-serif",
              fontVariationSettings: "'wdth' 110",
              letterSpacing: "-.032em",
              color: "#FFFFFF",
              maxWidth: 820,
              textWrap: "balance",
            }}
          >
            {def.title}
          </h1>
          <p
            style={{
              margin: 0,
              font: "400 clamp(15px,1.8vw,19px)/1.55 'Instrument Sans',sans-serif",
              color: "#A7B0BE",
              maxWidth: 620,
              textWrap: "pretty",
            }}
          >
            {def.sub}
          </p>
        </div>
      </div>

      <div style={{ padding: "clamp(26px,4vw,48px) clamp(16px,4vw,40px)" }}>
        <div
          style={{
            maxWidth: 1140,
            margin: "0 auto",
            display: "flex",
            gap: "clamp(18px,2.8vw,32px)",
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 400px", minWidth: 290, display: "grid", gap: 12 }}>
            {def.points.map((p) => (
              <div
                key={p.n}
                style={{
                  display: "flex",
                  gap: 15,
                  alignItems: "flex-start",
                  background: "#FFFFFF",
                  border: "1px solid #E4E7EC",
                  borderRadius: 12,
                  padding: "18px 20px",
                }}
              >
                <span
                  style={{
                    flex: "none",
                    width: 38,
                    height: 38,
                    borderRadius: 8,
                    background: "#EDEFFC",
                    color: "#0F23A8",
                    font: "600 13px/38px 'IBM Plex Mono',monospace",
                    textAlign: "center",
                  }}
                >
                  {p.n}
                </span>
                <div style={{ flex: 1, minWidth: 170 }}>
                  <div style={{ font: "600 15.5px/1.35 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 5 }}>
                    {p.title}
                  </div>
                  <p style={{ margin: 0, font: "400 14px/1.6 'Instrument Sans',sans-serif", color: "#5A6373", textWrap: "pretty" }}>
                    {p.body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div style={{ flex: "0 1 336px", minWidth: 275, display: "grid", gap: 14 }}>
            <div
              style={{
                background: "#FFFFFF",
                border: "1.5px solid #0B0F1A",
                borderRadius: 12,
                padding: "clamp(18px,2.4vw,24px)",
                boxShadow: "0 14px 34px rgba(11,15,26,.07)",
              }}
            >
              <div style={{ font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".11em", color: "#9AA2B0", marginBottom: 12 }}>
                TELL ME WHEN IT OPENS
              </div>
              <div style={{ font: "600 16px/1.35 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 8 }}>
                {def.ask}
              </div>
              <p style={{ margin: "0 0 14px", font: "400 13px/1.55 'Instrument Sans',sans-serif", color: "#5A6373", textWrap: "pretty" }}>
                Say what you're after and email us - we'll get in touch the week it opens in your
                city.
              </p>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={def.askPlaceholder}
                style={{
                  width: "100%",
                  height: 46,
                  padding: "0 13px",
                  border: "1px solid #CDD2DA",
                  borderRadius: 8,
                  font: "400 14.5px/1 'Instrument Sans',sans-serif",
                  color: "#0B0F1A",
                  background: "#FFFFFF",
                  marginBottom: 10,
                }}
              />
              <a
                href={mailHref}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  height: 48,
                  background: "#0F23A8",
                  color: "#FFFFFF",
                  borderRadius: 8,
                  font: "600 15px/1 'Instrument Sans',sans-serif",
                  textDecoration: "none",
                  boxSizing: "border-box",
                }}
              >
                Email us
              </a>
            </div>
            <div style={{ background: "#FBF8F2", border: "1px solid #E7DFD0", borderRadius: 12, padding: "18px 20px" }}>
              <div style={{ font: "600 14px/1.35 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 7 }}>
                Hiring is live today
              </div>
              <p style={{ margin: "0 0 12px", font: "400 13px/1.55 'Instrument Sans',sans-serif", color: "#5A6373", textWrap: "pretty" }}>
                All of this runs on the account you get the first time you hire a car.
              </p>
              <button
                type="button"
                onClick={onFindCar}
                style={{
                  height: 40,
                  padding: "0 15px",
                  background: "#0F23A8",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: 8,
                  font: "600 13.5px/1 'Instrument Sans',sans-serif",
                  cursor: "pointer",
                }}
              >
                Find a car →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
