import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "../lib/use-seo.js";
import { PageHero, Section, Card, Body } from "../components/site/marketing.js";
import { ApiClientError } from "../lib/api.js";
import { createBooking } from "../lib/bookings-api.js";
import { formatMoney } from "../lib/catalog-api.js";
import { earliestPickupDay, hireDays } from "../lib/hire-dates.js";
import { driverQuote, getDriver, UNIT_WORD, type DriverUnit } from "../lib/drivers-api.js";

/**
 * Book a driver for your own car (docs/plans/drivers.md). Same footing as
 * Drivers.tsx - built from confirmed tokens, no canvas. The server prices
 * it and runs every gate (a verified phone, an ID on file, the driver free
 * on those dates); this page shows a quote and the server's answer.
 */

const NAIROBI = "+03:00";
const at = (day: string, time: string) => new Date(`${day}T${time}:00${NAIROBI}`).toISOString();

export function DriverBook(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: d, isLoading, error: loadError } = useQuery({
    queryKey: ["catalog", "driver", id],
    queryFn: () => getDriver(id!),
    enabled: !!id,
    retry: false,
  });
  useSeo({ title: d ? `Hire ${d.display_name}` : "Hire a driver", description: "Book a checked driver for your own car.", path: `/drivers/${id ?? ""}` });

  const offered = d ? (["day", "hour", "trip"] as const).filter((u) => d.rates[u]) : [];
  const [unit, setUnit] = useState<DriverUnit>("day");
  useEffect(() => {
    if (offered.length && !offered.includes(unit as (typeof offered)[number])) setUnit(offered[0]!);
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps

  const earliest = earliestPickupDay();
  const [from, setFrom] = useState(earliest);
  const [to, setTo] = useState(earliest);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("13:00");
  const [car, setCar] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  if (isLoading) return <Section><Body>Loading…</Body></Section>;
  if (loadError || !d) {
    return (
      <Section>
        <Card>
          <Body>That driver isn't taking bookings right now.</Body>
          <Link to="/drivers" style={{ color: "#0F23A8", fontWeight: 600 }}>See other drivers</Link>
        </Card>
      </Section>
    );
  }

  // Day: pickup 09:00 on the first day, back by 17:00 on the last - the same
  // instants a car hire uses. Hour and trip: one day, the times picked.
  const instants =
    unit === "day"
      ? { pickup_at: at(from, "09:00"), dropoff_at: at(to, "17:00") }
      : { pickup_at: at(from, start), dropoff_at: at(from, end) };
  const days = unit === "day" ? hireDays(from, to) : 1;
  const hours = Math.max(0, Math.ceil((Date.parse(instants.dropoff_at) - Date.parse(instants.pickup_at)) / 3_600_000));
  const quote = driverQuote(d, unit, days, hours);
  const timesBad = unit !== "day" && !(hours > 0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!car.trim()) {
      setError({ code: "hire_car_details_required", message: "Tell the driver what car they'll be driving." });
      return;
    }
    setSubmitting(true);
    try {
      const result = await createBooking({
        driver_id: d!.id,
        driver_unit: unit,
        hire_car_details: car.trim(),
        ...instants,
        ...(note.trim() ? { note_from_hirer: note.trim() } : {}),
      });
      navigate(`/bookings/${result.id}`);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? { code: err.code ?? "", message: err.message }
          : { code: "", message: "Couldn't send that. Try again." },
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHero kicker="HIRE A DRIVER" title={d.display_name} sub={`${d.county} · drives for ${d.merchant_name}. Checked by CRAL - licence, ID and KRA PIN.`} />
      <Section>
        <Card>
          <form onSubmit={onSubmit}>
            {offered.length > 1 && (
              <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                {offered.map((u) => (
                  <label
                    key={u}
                    style={{
                      flex: "1 1 120px",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "12px 14px",
                      border: `1.5px solid ${unit === u ? "#0F23A8" : "#CDD2DA"}`,
                      borderRadius: 10,
                      cursor: "pointer",
                      background: unit === u ? "#EDEFFC" : "#FFFFFF",
                    }}
                  >
                    <input type="radio" name="unit" checked={unit === u} onChange={() => setUnit(u)} style={{ margin: 0 }} />
                    <span style={{ font: "500 14px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>
                      Per {UNIT_WORD[u]} · {formatMoney(d.rates[u]!)}
                    </span>
                  </label>
                ))}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,160px),1fr))", gap: 12 }}>
              <Field label={unit === "day" ? "First day" : "Date"}>
                <input type="date" min={earliest} value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} style={input} />
              </Field>
              {unit === "day" ? (
                <Field label="Last day">
                  <input type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} style={input} />
                </Field>
              ) : (
                <>
                  <Field label="Start time">
                    <input type="time" value={start} onChange={(e) => setStart(e.target.value)} style={input} />
                  </Field>
                  <Field label={unit === "trip" ? "Back by" : "End time"}>
                    <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={input} />
                  </Field>
                </>
              )}
            </div>
            {timesBad && <p style={warn}>The end time has to be after the start time.</p>}

            <Field label="The car they'll drive">
              <input value={car} onChange={(e) => setCar(e.target.value)} maxLength={200} placeholder="e.g. White Toyota Fielder, KDA 123A, automatic" style={input} />
            </Field>
            <Field label="Where to, and anything else they should know (optional)">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} style={{ ...input, height: "auto", padding: "10px 13px", resize: "vertical" }} />
            </Field>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "12px 0", borderTop: "1px solid #F1F3F6", marginBottom: 12 }}>
              <span style={{ font: "500 13.5px/1.4 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                {unit === "day" ? `${days} day${days === 1 ? "" : "s"}` : unit === "hour" ? `${hours} hour${hours === 1 ? "" : "s"}` : "Flat trip rate"}
              </span>
              <span style={{ font: "700 17px/1 Archivo,sans-serif", color: "#0B0F1A" }}>
                {quote !== null ? formatMoney({ amount: quote, currency: "KES" }) : "-"}
              </span>
            </div>

            {error && (
              <p style={warn}>
                {error.message}{" "}
                {error.code === "documents_required" && <Link to="/documents" style={{ color: "#0F23A8" }}>Add your ID</Link>}
                {(error.code === "phone_required" || error.code === "phone_verification_required") && (
                  <Link to="/account" style={{ color: "#0F23A8" }}>Confirm your phone</Link>
                )}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || timesBad}
              style={{ width: "100%", height: 48, background: "#0F23A8", color: "#FFFFFF", border: "none", borderRadius: 10, font: "600 15px/1 'Instrument Sans',sans-serif", cursor: "pointer", opacity: submitting || timesBad ? 0.6 : 1 }}
            >
              {submitting ? "Sending…" : "Send request - pay nothing yet"}
            </button>
            <p style={{ margin: "10px 0 0", font: "400 12.5px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" }}>
              {d.merchant_name} has 12 hours to accept. You pay by M-Pesa once they do. Your own insurance needs to cover another driver.
            </p>
          </form>
        </Card>
      </Section>
    </div>
  );
}

const input: CSSProperties = {
  width: "100%",
  height: 46,
  padding: "0 13px",
  border: "1px solid #CDD2DA",
  borderRadius: 8,
  font: "400 14.5px/1 'Instrument Sans',sans-serif",
  color: "#0B0F1A",
  background: "#FFFFFF",
  boxSizing: "border-box",
};

const warn: CSSProperties = { margin: "0 0 14px", font: "500 13px/1.5 'Instrument Sans',sans-serif", color: "#A50E22" };

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ display: "block", marginBottom: 6, font: "600 12.5px/1.3 'Instrument Sans',sans-serif", color: "#333B4A" }}>{label}</span>
      {children}
    </label>
  );
}
