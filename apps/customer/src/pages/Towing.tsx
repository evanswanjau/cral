import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useSeo } from "../lib/use-seo.js";
import { PageHero, Section, Card, Body } from "../components/site/marketing.js";
import { apiGet, apiPost, ApiClientError } from "../lib/api.js";

/**
 * Towing/recovery, the first offering under "Services" (owner's call,
 * 2026-09-23). Not pulled from a canvas file - no towing screen exists in
 * any design bundle - so this is built in the same confirmed-token idiom
 * as the seven marketing pages (see marketing.tsx's own header comment),
 * not a canvas reproduction.
 *
 * v1 is lead-capture only: filing this creates a `service_requests` row
 * that a human quotes by hand ("per km or subject to discussion" has no
 * fixed price to compute). There is no payment step here at all.
 */

interface Money {
  amount: number;
  currency: string;
}

interface ServiceRequest {
  id: string;
  reason: "mechanical_breakdown" | "accident";
  pickup_location: string;
  destination_location: string | null;
  status: "requested" | "quoted" | "accepted" | "declined" | "completed" | "cancelled";
  quoted_amount: Money | null;
  quote_note: string | null;
  decline_reason: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<ServiceRequest["status"], string> = {
  requested: "Waiting on a quote",
  quoted: "Quoted - awaiting your OK",
  accepted: "Accepted - we'll call you",
  declined: "Declined",
  completed: "Completed",
  cancelled: "Cancelled",
};

function money(m: Money): string {
  return `KES ${(m.amount / 100).toLocaleString("en-KE")}`;
}

export function Towing(): JSX.Element {
  useSeo({
    title: "Towing and recovery",
    description: "Request a tow after a breakdown or accident. Quoted per km, or subject to discussion.",
    path: "/services/towing",
  });

  const [reason, setReason] = useState<"mechanical_breakdown" | "accident">("mechanical_breakdown");
  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justFiled, setJustFiled] = useState<ServiceRequest | null>(null);
  const [requests, setRequests] = useState<ServiceRequest[] | null>(null);

  async function loadRequests() {
    try {
      const page = await apiGet<{ data: ServiceRequest[] }>("/me/service-requests");
      setRequests(page.data);
    } catch {
      setRequests([]);
    }
  }

  useEffect(() => {
    void loadRequests();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!pickup.trim() || !phone.trim()) {
      setError("Pickup location and a contact number are both required.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await apiPost<ServiceRequest>("/services/towing", {
        reason,
        pickup_location: pickup.trim(),
        destination_location: destination.trim() || null,
        contact_phone: phone.trim(),
        description: description.trim() || null,
      });
      setJustFiled(created);
      setPickup("");
      setDestination("");
      setDescription("");
      await loadRequests();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't send that. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onAccept(id: string) {
    try {
      await apiPost(`/me/service-requests/${id}/accept`);
      await loadRequests();
    } catch {
      // Left as-is - the list still shows the true state on next load.
    }
  }

  return (
    <div>
      <PageHero
        kicker="TOWING AND RECOVERY"
        title="A tow, arranged straight from your account."
        sub="Tell us where you are and what happened. We'll quote it - per km, or worked out on the call - before anything is dispatched."
      />
      <Section>
        <Card>
          <form onSubmit={onSubmit}>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              {(["mechanical_breakdown", "accident"] as const).map((r) => (
                <label
                  key={r}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "12px 14px",
                    border: `1.5px solid ${reason === r ? "#0F23A8" : "#CDD2DA"}`,
                    borderRadius: 10,
                    cursor: "pointer",
                    background: reason === r ? "#EDEFFC" : "#FFFFFF",
                  }}
                >
                  <input
                    type="radio"
                    name="reason"
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    style={{ margin: 0 }}
                  />
                  <span style={{ font: "500 14px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>
                    {r === "mechanical_breakdown" ? "Mechanical breakdown" : "Accident"}
                  </span>
                </label>
              ))}
            </div>

            <Field label="Where is the vehicle?">
              <input
                value={pickup}
                onChange={(e) => setPickup(e.target.value)}
                placeholder="e.g. Mombasa Road, near the Bunyala roundabout"
                style={inputStyle}
              />
            </Field>
            <Field label="Where should it go? (optional)">
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="A garage, your home, or leave blank"
                style={inputStyle}
              />
            </Field>
            <Field label="Best number to reach you on">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+254 7xx xxx xxx"
                style={inputStyle}
              />
            </Field>
            <Field label="Anything else we should know? (optional)">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                style={{ ...inputStyle, height: "auto", padding: "10px 13px", resize: "vertical" }}
              />
            </Field>

            {error && (
              <p style={{ margin: "0 0 14px", font: "500 13px/1.5 'Instrument Sans',sans-serif", color: "#A50E22" }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                height: 48,
                padding: "0 22px",
                background: submitting ? "#7C88CF" : "#0F23A8",
                color: "#FFFFFF",
                border: "none",
                borderRadius: 8,
                font: "600 15px/1 'Instrument Sans',sans-serif",
                cursor: submitting ? "default" : "pointer",
              }}
            >
              {submitting ? "Sending..." : "Request a tow"}
            </button>
          </form>

          {justFiled && (
            <p style={{ margin: "16px 0 0", font: "500 13.5px/1.5 'Instrument Sans',sans-serif", color: "#076945" }}>
              Request sent. We'll quote it and be in touch on {phone || "the number you gave us"} shortly.
            </p>
          )}
        </Card>
      </Section>

      {requests !== null && requests.length > 0 && (
        <Section tint>
          <Body>Your service requests</Body>
          {requests.map((r) => (
            <Card key={r.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ font: "600 14px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>
                    {r.reason === "mechanical_breakdown" ? "Mechanical breakdown" : "Accident"} · {r.pickup_location}
                  </div>
                  <div style={{ font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                    {STATUS_LABEL[r.status]}
                    {r.status === "quoted" &&
                      (r.quoted_amount ? ` - ${money(r.quoted_amount)}` : " - subject to discussion")}
                    {r.quote_note ? ` · ${r.quote_note}` : ""}
                    {r.decline_reason ? ` · ${r.decline_reason}` : ""}
                  </div>
                </div>
                {r.status === "quoted" && (
                  <button
                    type="button"
                    onClick={() => onAccept(r.id)}
                    style={{
                      height: 36,
                      padding: "0 14px",
                      background: "#0F23A8",
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: 8,
                      font: "600 13px/1 'Instrument Sans',sans-serif",
                      cursor: "pointer",
                    }}
                  >
                    Accept quote
                  </button>
                )}
              </div>
            </Card>
          ))}
        </Section>
      )}
    </div>
  );
}

const inputStyle: CSSProperties = {
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

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span
        style={{
          display: "block",
          marginBottom: 6,
          font: "600 12.5px/1.3 'Instrument Sans',sans-serif",
          color: "#333B4A",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
