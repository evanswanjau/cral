import { useMemo, useState } from "react";
import { COMMISSION_PERCENT, commissionOn } from "@cral/types";
import { useSeo } from "../lib/use-seo.js";
import { Section, SectionTitle, Body, Card } from "../components/site/marketing.js";

/**
 * "List your car" - C10 of docs/plans/customer-portal.md. Not pulled from
 * a canvas file: no design-canvas tab / project link was reachable this
 * session. Built the same way C9's marketing pages were - the confirmed
 * token system and the visual idiom Home.tsx already established (kicker +
 * skewed rule, Archivo wdth headlines, Instrument Sans body). Swap for the
 * canonical canvas copy once "Cruz Ride Auto - Website" (list screen) is
 * pulled.
 *
 * This page is pure explainer + a hand-off - listing a car is a real,
 * already-built feature, but entirely in `apps/merchant` (onboarding
 * wizard, the standalone Add-a-vehicle page). Nothing here talks to the
 * API; the calculator is arithmetic against a number the visitor types in,
 * and the CTA sends them to a *separate origin and a separate sign-in* -
 * the copy says so rather than implying one continuous session.
 */

// The rate and its arithmetic come from @cral/types, shared with the API
// and the merchant app. Money math that actually moves a booking still
// happens only server-side; this is a public estimate a visitor can
// sanity-check - but an estimate that disagrees with the real invoice is
// exactly what a local copy of the rate eventually produces.

const VEHICLE_CATEGORIES: Array<{ value: string; label: string; placeholderRate: number }> = [
  { value: "sedan", label: "Sedan / small car", placeholderRate: 4500 },
  { value: "suv", label: "SUV / 4x4 / pickup", placeholderRate: 8000 },
  { value: "van", label: "Van / minibus", placeholderRate: 9500 },
  { value: "truck", label: "Truck & trailers", placeholderRate: 12000 },
  { value: "machinery", label: "Construction & machinery", placeholderRate: 15000 },
];

const STEPS: Array<{ n: string; title: string; body: string }> = [
  {
    n: "01",
    title: "List the car",
    body: "Category, county, photos and your rate, in the merchant app - the same form CRAL's own listings go through. Takes about ten minutes.",
  },
  {
    n: "02",
    title: "A person reads the papers",
    body: "Logbook, comprehensive insurance and tracker certificate for the car, plus your own ID and KRA PIN - checked by a reviewer, not a script, before anything goes live.",
  },
  {
    n: "03",
    title: "Start earning",
    body: "Once it's approved the car is searchable on the site. Requests, payouts and the handover code all live in the merchant app from there.",
  },
];

const DOCS_READY: string[] = [
  "Logbook for the car",
  "Comprehensive insurance, current (not third-party only)",
  "Tracker certificate",
  "Your national ID",
  "Your KRA PIN",
];

function formatKes(amount: number): string {
  return `KES ${Math.round(amount).toLocaleString("en-KE")}`;
}

function EarningsCalculator(): JSX.Element {
  const [category, setCategory] = useState(VEHICLE_CATEGORIES[0]!.value);
  const [rate, setRate] = useState(String(VEHICLE_CATEGORIES[0]!.placeholderRate));
  const [daysPerMonth, setDaysPerMonth] = useState("12");

  const selected = VEHICLE_CATEGORIES.find((c) => c.value === category) ?? VEHICLE_CATEGORIES[0]!;
  const parsedRate = Number(rate);
  const parsedDays = Number(daysPerMonth);
  const validRate = Number.isFinite(parsedRate) && parsedRate > 0;
  const validDays = Number.isFinite(parsedDays) && parsedDays > 0;

  const { gross, commission, net } = useMemo(() => {
    if (!validRate || !validDays) return { gross: 0, commission: 0, net: 0 };
    const g = parsedRate * parsedDays;
    const c = commissionOn(g);
    return { gross: g, commission: c, net: g - c };
  }, [parsedRate, parsedDays, validRate, validDays]);

  const fieldLabel = {
    display: "block",
    font: "600 10px/1 'IBM Plex Mono',monospace",
    letterSpacing: ".09em",
    color: "#838C9B",
    marginBottom: 7,
  } as const;
  const fieldInput = {
    width: "100%",
    height: 46,
    padding: "0 11px",
    border: "1px solid #CDD2DA",
    borderRadius: 8,
    color: "#0B0F1A",
    background: "#FFFFFF",
    font: "500 15px/1 'Instrument Sans',sans-serif",
  } as const;

  return (
    <div
      style={{
        background: "#0B0F1A",
        borderRadius: 14,
        padding: "clamp(22px,3.2vw,36px)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -20,
          right: -40,
          width: 240,
          height: 14,
          background: "#D81E32",
          transform: "skewX(-14deg)",
          opacity: 0.45,
        }}
      />
      <div
        style={{
          font: "500 10px/1 'IBM Plex Mono',monospace",
          letterSpacing: ".11em",
          color: "#9AA2B0",
          marginBottom: 12,
        }}
      >
        ROUGH EARNINGS ESTIMATE
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <label style={{ display: "block" }}>
          <span style={fieldLabel}>CAR TYPE</span>
          <select
            value={category}
            onChange={(e) => {
              const next = VEHICLE_CATEGORIES.find((c) => c.value === e.target.value);
              setCategory(e.target.value);
              if (next) setRate(String(next.placeholderRate));
            }}
            style={{ ...fieldInput, appearance: "auto" }}
          >
            {VEHICLE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "block" }}>
          <span style={fieldLabel}>YOUR DAILY RATE (KES)</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            style={fieldInput}
          />
        </label>
        <label style={{ display: "block" }}>
          <span style={fieldLabel}>HIRE DAYS PER MONTH</span>
          <input
            type="number"
            min={0}
            max={31}
            inputMode="numeric"
            value={daysPerMonth}
            onChange={(e) => setDaysPerMonth(e.target.value)}
            style={fieldInput}
          />
        </label>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
          gap: "clamp(14px,2vw,22px)",
          paddingTop: 18,
          borderTop: "1px solid #252B3A",
        }}
      >
        {[
          { label: "Hirer pays (total)", value: gross, color: "#A7B0BE" },
          { label: `CRAL fee (${COMMISSION_PERCENT}%)`, value: -commission, color: "#A7B0BE" },
          { label: "You take home", value: net, color: "#FFFFFF", strong: true },
        ].map((row) => (
          <div key={row.label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ font: "400 12px/1.4 'Instrument Sans',sans-serif", color: "#7C8697" }}>
              {row.label}
            </span>
            <span
              style={{
                font: `${row.strong ? 700 : 500} clamp(19px,2.2vw,24px)/1 Archivo,sans-serif`,
                fontVariationSettings: "'wdth' 108",
                color: row.color,
              }}
            >
              {row.value < 0 ? "-" : ""}
              {formatKes(Math.abs(row.value))}
            </span>
          </div>
        ))}
      </div>
      <p style={{ margin: "18px 0 0", font: "400 12.5px/1.55 'Instrument Sans',sans-serif", color: "#7C8697" }}>
        A rough estimate off the rate and hire days you enter, not a quote - actual bookings depend
        on demand for your car, your county and your dates. {selected.label} owners on CRAL set
        their own rate; the {formatKes(selected.placeholderRate)}/day figure above is just a
        starting point.
      </p>
    </div>
  );
}

export function ListYourCar(): JSX.Element {
  useSeo({
    title: "List your car",
    description:
      "Put your car to work on the days you're not using it. List it on Cruz Ride Auto, pass a document review, and start taking hire requests.",
    path: "/list-your-car",
  });

  const merchantUrl = (import.meta.env.VITE_MERCHANT_APP_URL as string | undefined) ?? "http://localhost:5174";

  return (
    <div>
      {/* ---- hero ---- */}
      <div
        style={{
          background: "#0B0F1A",
          padding: "clamp(30px,4.6vw,54px) clamp(16px,4vw,40px) clamp(24px,3.4vw,40px)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -30,
            right: -60,
            width: "clamp(220px,32vw,420px)",
            height: 16,
            background: "#D81E32",
            transform: "skewX(-14deg)",
            opacity: 0.55,
            pointerEvents: "none",
          }}
        />
        <div style={{ maxWidth: 760, margin: "0 auto", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
            <span
              style={{
                display: "block",
                width: 18,
                height: 5,
                background: "#D81E32",
                transform: "skewX(-14deg)",
                flex: "none",
              }}
            />
            <span
              style={{
                font: "500 10px/1 'IBM Plex Mono',monospace",
                letterSpacing: ".12em",
                color: "#838C9B",
              }}
            >
              HAVE A CAR OF YOUR OWN?
            </span>
          </div>
          <h1
            style={{
              margin: "0 0 14px",
              font: "700 clamp(30px,4.6vw,48px)/1.08 Archivo,sans-serif",
              fontVariationSettings: "'wdth' 110",
              letterSpacing: "-.03em",
              color: "#FFFFFF",
            }}
          >
            Put it to work on the days you're not using it.
          </h1>
          <p
            style={{
              margin: "0 0 26px",
              font: "400 clamp(15px,1.7vw,17px)/1.55 'Instrument Sans',sans-serif",
              color: "#A7B0BE",
              maxWidth: 560,
            }}
          >
            List a car for hire on Cruz Ride Auto. You set the rate, a reviewer reads the papers
            before it goes live, and requests land in the merchant app you'll sign up for below.
          </p>
          <a
            href={`${merchantUrl}/create-account`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 46,
              padding: "0 22px",
              background: "#0F23A8",
              color: "#FFFFFF",
              borderRadius: 8,
              font: "600 15px/1 'Instrument Sans',sans-serif",
              textDecoration: "none",
            }}
          >
            Get started
          </a>
        </div>
      </div>

      {/* ---- earnings calculator ---- */}
      <Section>
        <SectionTitle>Roughly, what could it earn?</SectionTitle>
        <Body>
          Type in the rate you'd charge and how often you think it would go out. CRAL's fee is a
          flat 10% of what the hirer pays - there's no listing fee and nothing charged until a
          hire actually happens.
        </Body>
        <EarningsCalculator />
      </Section>

      {/* ---- three steps ---- */}
      <Section tint>
        <SectionTitle>How listing works</SectionTitle>
        <div style={{ display: "grid", gap: 12 }}>
          {STEPS.map((s) => (
            <Card key={s.n}>
              <div style={{ display: "flex", gap: 16 }}>
                <div
                  style={{
                    font: "700 22px/1 Archivo,sans-serif",
                    fontVariationSettings: "'wdth' 108",
                    color: "#D81E32",
                    flex: "none",
                    width: 40,
                  }}
                >
                  {s.n}
                </div>
                <div>
                  <div
                    style={{
                      font: "600 16px/1.35 'Instrument Sans',sans-serif",
                      color: "#0B0F1A",
                      marginBottom: 6,
                    }}
                  >
                    {s.title}
                  </div>
                  <p style={{ margin: 0, font: "400 14px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                    {s.body}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      {/* ---- have these ready ---- */}
      <Section>
        <SectionTitle>Have these ready</SectionTitle>
        <Body>
          The review moves faster if these are on hand before you start the form. A listing goes
          "PENDING REVIEW" until every one of them is checked - if a document is missing you can
          still start and add it later, but the car won't go live until the set is complete.
        </Body>
        <Card>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
            {DOCS_READY.map((doc) => (
              <li key={doc} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 18,
                    height: 18,
                    flex: "none",
                    borderRadius: 5,
                    border: "1px solid #CDD2DA",
                  }}
                />
                <span style={{ font: "400 14.5px/1.4 'Instrument Sans',sans-serif", color: "#333B4A" }}>
                  {doc}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <p style={{ margin: "10px 0 0", font: "400 13px/1.6 'Instrument Sans',sans-serif", color: "#7C8697" }}>
          Listing as a company? You'll also need a certificate of incorporation, the company's KRA
          PIN and a CR12.
        </p>
      </Section>

      {/* ---- closing hand-off ---- */}
      <Section>
        <div
          style={{
            background: "#EDEFFC",
            border: "1px solid #B6C0F4",
            borderRadius: 12,
            padding: "clamp(22px,3vw,32px)",
          }}
        >
          <h3
            style={{
              margin: "0 0 10px",
              font: "700 clamp(19px,2.2vw,24px)/1.18 Archivo,sans-serif",
              fontVariationSettings: "'wdth' 106",
              letterSpacing: "-.02em",
              color: "#0B1B85",
            }}
          >
            Ready to list it?
          </h3>
          <p style={{ margin: "0 0 18px", font: "400 14.5px/1.6 'Instrument Sans',sans-serif", color: "#333B4A" }}>
            Listing happens in the CRAL merchant app - a separate site from the one you're on now,
            so you'll create a new sign-in there even if you already have a Cruz Ride Auto account
            here.
          </p>
          <a
            href={`${merchantUrl}/create-account`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 44,
              padding: "0 19px",
              background: "#0F23A8",
              color: "#FFFFFF",
              borderRadius: 8,
              font: "600 14px/1 'Instrument Sans',sans-serif",
              textDecoration: "none",
            }}
          >
            Create a merchant account
          </a>
        </div>
      </Section>
    </div>
  );
}
