import { Link } from "react-router-dom";

/**
 * Public footer, reproduced from the "Cruz Ride Auto - Website" canvas.
 * The deposit-custody line from the canvas ("every deposit held by us")
 * is corrected here per the recorded product decision - the deposit is
 * agreed with the owner and settled at handover, not held by CRAL.
 */

const COLUMNS: Array<{ head: string; links: Array<[string, string]> }> = [
  {
    head: "HIRING A CAR",
    links: [
      ["Find a car", "/browse"],
      ["How it works", "/how-it-works"],
      ["How we protect you", "/how-we-protect-you"],
      ["Corporate hire", "/corporate"],
    ],
  },
  {
    head: "HELP",
    links: [
      ["Questions and answers", "/help"],
      ["Contact us", "/contact"],
      ["Terms & privacy", "/legal"],
    ],
  },
  {
    head: "CRAL",
    links: [
      ["About us", "/about"],
      ["List your car", "/list-your-car"],
    ],
  },
];

export function Footer(): JSX.Element {
  return (
    <div
      style={{
        background: "#0B0F1A",
        padding: "clamp(36px,5vw,60px) clamp(16px,4vw,40px) clamp(24px,3vw,34px)",
        marginTop: "auto",
      }}
    >
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            gap: "clamp(24px,4vw,60px)",
            flexWrap: "wrap",
            paddingBottom: "clamp(26px,3.4vw,38px)",
            borderBottom: "1px solid #252B3A",
          }}
        >
          <div style={{ flex: "1 1 260px", minWidth: 230 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
              <span
                style={{
                  display: "block",
                  width: 26,
                  height: 7,
                  background: "#D81E32",
                  transform: "skewX(-14deg)",
                }}
              />
              <span
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 3,
                }}
              >
                <span
                  style={{
                    font: "700 22px/1 Archivo,sans-serif",
                    fontVariationSettings: "'wdth' 112",
                    letterSpacing: "-.01em",
                    color: "#FFFFFF",
                  }}
                >
                  CRAL
                </span>
                <span
                  style={{
                    font: "500 8px/1 'IBM Plex Mono',monospace",
                    letterSpacing: ".11em",
                    color: "#5F6B7D",
                  }}
                >
                  CRUZ RIDE AUTO LIMITED
                </span>
              </span>
            </div>
            <p
              style={{
                margin: "0 0 16px",
                font: "400 14px/1.6 'Instrument Sans',sans-serif",
                color: "#8C97A8",
                maxWidth: 280,
              }}
            >
              Kenya's home for everything cars. We start with hire: every car's paperwork read by a
              person, and the licence and ID behind every booking checked once.
            </p>
            <div style={{ font: "500 14px/1.6 'IBM Plex Mono',monospace", color: "#A7B0BE" }}>
              +254 735 656066
              <br />
              hello@cral.co.ke
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.head} style={{ flex: "0 1 170px", minWidth: 140 }}>
              <div
                style={{
                  font: "500 10px/1 'IBM Plex Mono',monospace",
                  letterSpacing: ".11em",
                  color: "#5F6B7D",
                  marginBottom: 15,
                }}
              >
                {col.head}
              </div>
              <div style={{ display: "grid", gap: 10, justifyItems: "start" }}>
                {col.links.map(([label, to]) => (
                  <Link
                    key={to}
                    to={to}
                    style={{
                      font: "400 14px/1.4 'Instrument Sans',sans-serif",
                      color: "#A7B0BE",
                      textDecoration: "none",
                    }}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            paddingTop: 20,
            display: "flex",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              font: "400 12.5px/1.5 'Instrument Sans',sans-serif",
              color: "#5F6B7D",
            }}
          >
            © 2026 CRAL · Cruz Ride Auto Limited · Nairobi, Kenya
          </span>
          <span
            style={{
              font: "400 12.5px/1.5 'Instrument Sans',sans-serif",
              color: "#5F6B7D",
            }}
          >
            CRAL is a marketplace. Hire agreements are between renter and owner.
          </span>
        </div>
      </div>
    </div>
  );
}
