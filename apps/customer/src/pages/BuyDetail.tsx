import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "../lib/use-seo.js";
import { useIsAuthenticated } from "../lib/auth.js";
import { ApiClientError } from "../lib/api.js";
import { Section, Card, Body, SectionTitle } from "../components/site/marketing.js";
import { VEHICLE_CATEGORY_LABEL, type VehicleCategory } from "../lib/vehicle-categories.js";
import {
  ACCIDENT_LABEL,
  IMPORT_LABEL,
  SERVICE_LABEL,
  enquire,
  getSale,
  kes,
  reportListing,
  salePhotoSrc,
  type BuyerEnquiry,
} from "../lib/sales-api.js";
import { Button, Field, Notice, inputStyle, textareaStyle } from "../components/sale/ui.js";

function Spec({ k, v }: { k: string; v: string }): JSX.Element {
  return (
    <div style={{ padding: "8px 0", borderTop: "1px solid #EEF0F3", display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ font: "400 13.5px/1.4 'Instrument Sans',sans-serif", color: "#5A6373" }}>{k}</span>
      <span style={{ font: "600 13.5px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A", textAlign: "right" }}>{v}</span>
    </div>
  );
}

/**
 * One car for sale (docs/plans/car-sales.md). The disclosures sit above
 * the description on purpose - "it is the reason buyers believe the rest
 * of the advert". No plate, no chassis number and no seller phone here:
 * the number arrives only when the seller chooses to share it.
 */
export function BuyDetail(): JSX.Element {
  const { ref = "" } = useParams();
  const location = useLocation();
  const signedIn = useIsAuthenticated();
  const { data: s, isLoading, error } = useQuery({ queryKey: ["sale", ref], queryFn: () => getSale(ref) });
  useSeo({
    title: s ? `${s.title} for sale - ${kes(s.asking_price)}` : "Car for sale",
    description: s ? `${s.title}, ${s.mileage_km.toLocaleString("en-KE")} km, ${s.county}. Logbook checked by CRAL.` : undefined,
    path: `/buy/${ref}`,
    ...(s
      ? {
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "Car",
            name: s.title,
            brand: s.make,
            model: s.model,
            vehicleModelDate: String(s.year),
            mileageFromOdometer: { "@type": "QuantitativeValue", value: s.mileage_km, unitCode: "KMT" },
            offers: { "@type": "Offer", price: Math.round(s.asking_price.amount / 100), priceCurrency: "KES" },
          },
        }
      : {}),
  });
  const [photo, setPhoto] = useState(0);
  const [message, setMessage] = useState("");
  const [viewing, setViewing] = useState("");
  const [sent, setSent] = useState<BuyerEnquiry | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("not_available");
  const [reportNote, setReportNote] = useState("");
  const [reported, setReported] = useState<string | null>(null);

  if (isLoading) return <Section><Body>Loading...</Body></Section>;
  if (error || !s) {
    return (
      <Section>
        <Body>That car isn't for sale any more. <Link to="/buy">See the cars that are</Link>.</Body>
      </Section>
    );
  }

  async function send() {
    setErr(null);
    if (message.trim().length < 5) {
      setErr("Write a short message to the seller.");
      return;
    }
    setSending(true);
    try {
      setSent(await enquire(ref, { message: message.trim(), ...(viewing.trim() ? { viewing_window: viewing.trim() } : {}) }));
    } catch (x) {
      setErr(x instanceof ApiClientError ? x.message : "Couldn't send that. Try again.");
    } finally {
      setSending(false);
    }
  }

  async function report() {
    try {
      await reportListing(ref, { reason, ...(reportNote.trim() ? { note: reportNote.trim() } : {}) });
      setReported("Thanks - our team will look at this listing.");
      setReporting(false);
    } catch (x) {
      setReported(x instanceof ApiClientError ? x.message : "Couldn't send that report.");
    }
  }

  const current = s.photos[photo];
  return (
    <div>
      <Section>
        <div style={{ margin: "0 0 10px" }}>
          <Link to="/buy" style={{ font: "500 13px/1 'Instrument Sans',sans-serif", color: "#0F23A8", textDecoration: "none" }}>← All cars for sale</Link>
        </div>
        <div style={{ aspectRatio: "4 / 3", background: "#F1F3F6", borderRadius: 12, overflow: "hidden" }}>
          {current && <img src={salePhotoSrc(current.url)} alt={`${s.title} - ${current.label}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", margin: "8px 0 18px" }}>
          {s.photos.map((p, i) => (
            <button
              key={p.slot}
              type="button"
              onClick={() => setPhoto(i)}
              title={p.label}
              style={{ flex: "none", width: 72, height: 54, padding: 0, borderRadius: 6, overflow: "hidden", cursor: "pointer", border: `2px solid ${i === photo ? "#0F23A8" : "transparent"}` }}
            >
              <img src={salePhotoSrc(p.url)} alt={p.label} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </button>
          ))}
        </div>

        <div style={{ font: "500 12px/1 'IBM Plex Mono',monospace", color: "#5A6373", marginBottom: 6 }}>{s.ref}</div>
        <h1 style={{ margin: "0 0 6px", font: "700 clamp(26px,3.6vw,36px)/1.15 Archivo,sans-serif", fontVariationSettings: "'wdth' 110", letterSpacing: "-.02em", color: "#0B0F1A" }}>
          {s.title}
        </h1>
        <div style={{ font: "700 24px/1.3 Archivo,sans-serif", color: "#0B0F1A" }}>
          {kes(s.asking_price)}
          {s.negotiable && <span style={{ font: "400 14px/1 'Instrument Sans',sans-serif", color: "#5A6373" }}> · negotiable</span>}
        </div>
        <Body>
          {s.viewing_area}, {s.county} · {s.seller.type === "private" ? `Private seller, ${s.seller.name}` : s.seller.name}
        </Body>
        {s.status === "under_offer" && <Notice tone="blue">This car is under offer. The seller may put it back on sale if the deal falls through.</Notice>}

        <Card>
          <SectionTitle>Checked by CRAL</SectionTitle>
          <Body>
            A person read the logbook against these photos - the name, the plate and the chassis number - before the advert went live.
            {s.checks.ntsa_search ? " The seller also gave us an NTSA official search." : ""}
            {s.checks.bank_clearance_letter ? " A bank clearance letter is on file." : ""}
          </Body>
          <Notice tone="amber">{s.safety_note}</Notice>
        </Card>

        <Card>
          <SectionTitle>What the seller declared</SectionTitle>
          <div style={{ font: "600 13.5px/1.4 'Instrument Sans',sans-serif", color: "#333B4A", marginBottom: 4 }}>Known faults</div>
          <Body>{s.disclosures.known_faults}</Body>
          <Spec k="Accident history" v={ACCIDENT_LABEL[s.disclosures.accident_history] ?? s.disclosures.accident_history} />
          {s.disclosures.accident_note && <Spec k="What happened" v={s.disclosures.accident_note} />}
          <Spec k="Bank on the logbook" v={s.disclosures.encumbered ? "Yes - still being paid off" : "No"} />
          <Spec k="Service history" v={SERVICE_LABEL[s.disclosures.service_history] ?? s.disclosures.service_history} />
        </Card>

        <Card>
          <SectionTitle>The car</SectionTitle>
          <Spec k="Type" v={VEHICLE_CATEGORY_LABEL[s.category as VehicleCategory] ?? s.category} />
          <Spec k="Year" v={String(s.year)} />
          <Spec k="Mileage" v={`${s.mileage_km.toLocaleString("en-KE")} km`} />
          {s.engine_cc && <Spec k="Engine" v={`${s.engine_cc.toLocaleString("en-KE")} cc`} />}
          <Spec k="Transmission" v={s.transmission} />
          <Spec k="Fuel" v={s.fuel} />
          {s.drive && <Spec k="Drive" v={s.drive.toUpperCase()} />}
          {s.colour && <Spec k="Colour" v={s.colour} />}
          <Spec k="Where it came from" v={IMPORT_LABEL[s.import_status] ?? s.import_status} />
          {s.description && <div style={{ marginTop: 12 }}><Body>{s.description}</Body></div>}
        </Card>

        <Card>
          <SectionTitle>Ask the seller</SectionTitle>
          {sent ? (
            <Notice tone="green">
              Sent. {sent.seller_phone ? `The seller's number is ${sent.seller_phone}.` : "You'll hear back by email and under Cars I asked about."}{" "}
              <Link to="/my-enquiries">Cars I asked about</Link>
            </Notice>
          ) : !signedIn ? (
            <Body>
              <Link to={`/sign-in?next=${encodeURIComponent(location.pathname)}`}>Sign in</Link> to ask about this car. The seller's number is shared
              only when they choose to.
            </Body>
          ) : s.status !== "live" ? (
            <Body>This car is under offer, so the seller isn't taking new enquiries.</Body>
          ) : (
            <>
              <Field label="Your message">
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} style={textareaStyle} placeholder="Is it still available? Can I view it this weekend?" />
              </Field>
              <Field label="When could you view it? (optional)">
                <input value={viewing} onChange={(e) => setViewing(e.target.value)} style={inputStyle} placeholder="Saturday morning" />
              </Field>
              {err && <Notice tone="red">{err}</Notice>}
              <Button onClick={() => void send()} disabled={sending}>{sending ? "Sending..." : "Send to the seller"}</Button>
            </>
          )}
        </Card>

        <div style={{ marginTop: 6 }}>
          {reported ? (
            <Body>{reported}</Body>
          ) : reporting ? (
            <Card>
              <Field label="What is wrong with this listing?">
                <select value={reason} onChange={(e) => setReason(e.target.value)} style={inputStyle}>
                  <option value="not_available">The car isn't available</option>
                  <option value="wrong_details">The details are wrong</option>
                  <option value="scam">The seller asked for money up front</option>
                  <option value="duplicate">It's listed twice</option>
                  <option value="other">Something else</option>
                </select>
              </Field>
              <Field label={reason === "other" ? "Tell us more" : "Tell us more (optional)"}>
                <textarea value={reportNote} onChange={(e) => setReportNote(e.target.value)} style={textareaStyle} />
              </Field>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="danger" onClick={() => void report()}>Report listing</Button>
                <Button variant="secondary" onClick={() => setReporting(false)}>Cancel</Button>
              </div>
            </Card>
          ) : signedIn ? (
            <button type="button" onClick={() => setReporting(true)} style={{ background: "none", border: "none", padding: 0, color: "#5A6373", font: "500 13px/1 'Instrument Sans',sans-serif", textDecoration: "underline", cursor: "pointer" }}>
              Report this listing
            </button>
          ) : null}
        </div>
      </Section>
    </div>
  );
}
