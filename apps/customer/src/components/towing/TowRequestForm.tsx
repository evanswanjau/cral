import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Phone } from "@phosphor-icons/react/dist/ssr/Phone";
import { ApiClientError } from "../../lib/api.js";
import { useIsAuthenticated } from "../../lib/auth.js";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_E164 } from "../../lib/support.js";
import { clearSessionDraft, readSessionDraft, writeSessionDraft } from "../../lib/session-draft.js";
import { REASON_LABEL, requestTow, type TowReason, type TowRequestInput } from "../../lib/towing-api.js";

/**
 * The tow request, in the towing hero (UI3). Public: anyone can fill it
 * in. `POST /services/towing` still needs an account, so a signed-out
 * visitor's form is kept in `sessionStorage`, they go through sign-in
 * (`?next=/towing`), and it is sent the moment they land back here,
 * signed in, with the same details (proposal 6.4, towing row). CRAL's
 * phone number sits under the form for the urgent case.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md section 4.3 (Towing column).
 */

const DRAFT_KEY = "cral.tow-request";

const inputStyle: CSSProperties = {
  width: "100%",
  height: 46,
  padding: "0 13px",
  border: "1px solid #CDD2DA",
  borderRadius: 8,
  font: "400 15px/1 'Instrument Sans',sans-serif",
  color: "#0B0F1A",
  background: "#FFFFFF",
  boxSizing: "border-box",
};

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ display: "block", marginBottom: 6, font: "600 12.5px/1.3 'Instrument Sans',sans-serif", color: "#333B4A" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

export function TowRequestForm(): JSX.Element {
  const isAuthenticated = useIsAuthenticated();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft] = useState(() => readSessionDraft<TowRequestInput>(DRAFT_KEY));

  const [reason, setReason] = useState<TowReason>(draft?.reason ?? "mechanical_breakdown");
  const [pickup, setPickup] = useState(draft?.pickup_location ?? "");
  const [destination, setDestination] = useState(draft?.destination_location ?? "");
  const [phone, setPhone] = useState(draft?.contact_phone ?? "");
  const [description, setDescription] = useState(draft?.description ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const resumed = useRef(false);

  async function send(input: TowRequestInput) {
    setError(null);
    setSubmitting(true);
    try {
      await requestTow(input);
      clearSessionDraft(DRAFT_KEY);
      setSentTo(input.contact_phone);
      setPickup("");
      setDestination("");
      setDescription("");
      await queryClient.invalidateQueries({ queryKey: ["service-requests", "mine"] });
    } catch (err) {
      clearSessionDraft(DRAFT_KEY);
      setError(err instanceof ApiClientError ? err.message : "Couldn't send that. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Back from sign-in with a kept form: send it, once.
  useEffect(() => {
    if (!isAuthenticated || !draft || resumed.current) return;
    resumed.current = true;
    void send(draft);
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!pickup.trim() || !phone.trim()) {
      setError("Say where the vehicle is and give a number we can reach you on.");
      return;
    }
    const input: TowRequestInput = {
      reason,
      pickup_location: pickup.trim(),
      destination_location: destination.trim() || null,
      contact_phone: phone.trim(),
      description: description.trim() || null,
    };
    if (!isAuthenticated) {
      writeSessionDraft(DRAFT_KEY, input);
      navigate(`/sign-in?next=${encodeURIComponent("/towing")}`);
      return;
    }
    void send(input);
  }

  return (
    <div style={{ background: "#FFFFFF", borderRadius: 12, padding: "18px 18px 16px", boxShadow: "0 12px 32px rgba(11,15,26,.28)" }}>
      <form onSubmit={onSubmit}>
        <fieldset style={{ border: "none", margin: "0 0 12px", padding: 0 }}>
          <legend style={{ marginBottom: 6, padding: 0, font: "600 12.5px/1.3 'Instrument Sans',sans-serif", color: "#333B4A" }}>
            What happened?
          </legend>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["mechanical_breakdown", "accident"] as const).map((r) => (
              <label
                key={r}
                style={{
                  flex: "1 1 130px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 46,
                  padding: "0 12px",
                  border: `1.5px solid ${reason === r ? "#0F23A8" : "#CDD2DA"}`,
                  borderRadius: 8,
                  cursor: "pointer",
                  background: reason === r ? "#EDEFFC" : "#FFFFFF",
                  boxSizing: "border-box",
                }}
              >
                <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} style={{ margin: 0 }} />
                <span style={{ font: "500 14px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>{REASON_LABEL[r]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="Where is the vehicle?">
          <input value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="e.g. Mombasa Road, near the Bunyala roundabout" style={inputStyle} />
        </Field>
        <Field label="Where should it go? (optional)">
          <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="A garage, your home, or leave blank" style={inputStyle} />
        </Field>
        <Field label="Best number to reach you on">
          <input type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0722 000 000" style={inputStyle} />
        </Field>
        <Field label="Anything else we should know? (optional)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            style={{ ...inputStyle, height: "auto", padding: "10px 13px", resize: "vertical" }}
          />
        </Field>

        {error && (
          <p role="alert" style={{ margin: "0 0 12px", font: "500 13px/1.5 'Instrument Sans',sans-serif", color: "#A50E22" }}>
            {error}
          </p>
        )}
        {sentTo && !error && (
          <p role="status" style={{ margin: "0 0 12px", font: "500 13.5px/1.5 'Instrument Sans',sans-serif", color: "#076945" }}>
            Request sent. CRAL will quote it and call you on {sentTo} shortly.
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: "100%",
            height: 48,
            background: "#0F23A8",
            color: "#FFFFFF",
            border: "none",
            borderRadius: 8,
            font: "600 15px/1 'Instrument Sans',sans-serif",
            cursor: submitting ? "default" : "pointer",
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? "Sending…" : isAuthenticated ? "Request a tow" : "Sign in to request a tow"}
        </button>
      </form>

      <a
        href={`tel:${SUPPORT_PHONE_E164}`}
        style={{
          marginTop: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
          minHeight: 44,
          padding: "8px 12px",
          background: "#F6F7F9",
          borderRadius: 8,
          textDecoration: "none",
          font: "400 13.5px/1.45 'Instrument Sans',sans-serif",
          color: "#333B4A",
        }}
      >
        <Phone size={18} weight="bold" color="#0F23A8" aria-hidden="true" style={{ flex: "none" }} />
        <span>
          Blocking a road or not safe where you are? Call CRAL on{" "}
          <strong style={{ font: "600 13.5px/1 'IBM Plex Mono',monospace", color: "#0B0F1A" }}>{SUPPORT_PHONE_DISPLAY}</strong>
        </span>
      </a>
    </div>
  );
}
