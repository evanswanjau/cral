import { useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  completeServiceRequest,
  declineServiceRequest,
  fetchServiceRequestCase,
  quoteServiceRequest,
} from "../../lib/services-api.js";
import { usePageTitle } from "../../lib/use-page-title.js";

const REASON_LABEL: Record<string, string> = {
  mechanical_breakdown: "Mechanical breakdown",
  accident: "Accident",
};

const STATUS_LABEL: Record<string, string> = {
  requested: "Needs a quote",
  quoted: "Quoted - waiting on the renter",
  accepted: "Accepted - dispatch this",
  declined: "Declined",
  completed: "Completed",
  cancelled: "Cancelled by the renter",
};

function money(m: { amount: number; currency: string }): string {
  return `KES ${(m.amount / 100).toLocaleString("en-KE")}`;
}

export function Case(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: c, isLoading, error } = useQuery({
    queryKey: ["admin", "service-requests", id],
    queryFn: () => fetchServiceRequestCase(id!),
    enabled: !!id,
  });

  usePageTitle(c ? `${REASON_LABEL[c.reason] ?? c.reason} · ${c.pickup_location}` : "Service request");

  const [distanceKm, setDistanceKm] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  const setCase = (updated: typeof c) => queryClient.setQueryData(["admin", "service-requests", id], updated);

  const quoteMut = useMutation({
    mutationFn: () => {
      if ((distanceKm.trim() && !Number.isFinite(Number(distanceKm))) || (amount.trim() && !Number.isFinite(Number(amount)))) {
        return Promise.reject(new Error("Distance and amount must be numbers."));
      }
      return quoteServiceRequest(id!, {
        distance_km: distanceKm.trim() ? Number(distanceKm) : null,
        amount_cents: amount.trim() ? Math.round(Number(amount) * 100) : null,
        note: note.trim() || null,
      });
    },
    onSuccess: (updated) => {
      setCase(updated);
      setDistanceKm("");
      setAmount("");
      setNote("");
    },
  });

  const declineMut = useMutation({
    mutationFn: (reason: string) => declineServiceRequest(id!, reason),
    onSuccess: (updated) => {
      setCase(updated);
      setDeclining(false);
      setDeclineReason("");
    },
  });

  const completeMut = useMutation({
    mutationFn: () => completeServiceRequest(id!),
    onSuccess: setCase,
  });

  if (isLoading) return <div style={S.empty}>Loading…</div>;
  if (error || !c) return <div style={S.empty}>Couldn't load that request.</div>;

  const actionError = [quoteMut.error, declineMut.error, completeMut.error].find(Boolean);
  const canQuote = c.status === "requested" || c.status === "quoted";
  const canDecline = !["completed", "cancelled", "declined"].includes(c.status);
  const canComplete = c.status === "accepted";

  return (
    <div>
      <button type="button" onClick={() => navigate("/services")} style={S.backBtn}>
        ← All service requests
      </button>

      <div style={S.headRow}>
        <div>
          <h1 style={S.h1}>
            {REASON_LABEL[c.reason] ?? c.reason} · {c.pickup_location}
          </h1>
          <p style={S.lede}>{STATUS_LABEL[c.status] ?? c.status}</p>
        </div>
      </div>

      <div style={S.panel}>
        <div style={S.panelHead}>
          <span style={{ font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>The request</span>
        </div>
        <div style={{ padding: "16px 18px", display: "grid", gap: 10 }}>
          <Line label="Requester" value={`${c.requester_name ?? "Not given"} · ${c.requester_email}`} />
          <Line label="Contact number" value={c.contact_phone} />
          <Line label="Pickup" value={c.pickup_location} />
          <Line label="Destination" value={c.destination_location ?? "Not given"} />
          {c.description && <Line label="Notes" value={c.description} />}
        </div>
      </div>

      {c.status !== "requested" && (
        <div style={{ ...S.panel, marginTop: 16 }}>
          <div style={S.panelHead}>
            <span style={{ font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>Quote</span>
          </div>
          <div style={{ padding: "16px 18px", display: "grid", gap: 8 }}>
            <Line
              label="Amount"
              value={c.quoted_amount ? money(c.quoted_amount) : "Subject to discussion"}
            />
            {c.distance_km !== null && <Line label="Distance" value={`${c.distance_km} km`} />}
            {c.quote_note && <Line label="Note" value={c.quote_note} />}
          </div>
        </div>
      )}

      {canQuote && (
        <div style={{ ...S.panel, marginTop: 16 }}>
          <div style={S.panelHead}>
            <span style={{ font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>
              {c.status === "requested" ? "Send a quote" : "Revise the quote"}
            </span>
          </div>
          <div style={{ padding: "16px 18px", display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ flex: "1 1 140px" }}>
                <span style={S.fieldLabel}>Distance (km)</span>
                <input value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} style={S.input} placeholder="e.g. 40" />
              </label>
              <label style={{ flex: "1 1 140px" }}>
                <span style={S.fieldLabel}>Amount (KES, leave blank for "subject to discussion")</span>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} style={S.input} placeholder="e.g. 5000" />
              </label>
            </div>
            <label>
              <span style={S.fieldLabel}>Note to the renter (optional)</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} style={S.textarea} />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                disabled={quoteMut.isPending}
                onClick={() => quoteMut.mutate()}
                style={{ ...S.btn, background: "#0F23A8", color: "#FFFFFF", borderColor: "#0F23A8" }}
              >
                {c.status === "requested" ? "Send quote" : "Update quote"}
              </button>
            </div>
          </div>
        </div>
      )}

      {actionError && (
        <div role="alert" style={S.error}>
          {actionError instanceof Error ? actionError.message : "That didn't go through. Try again."}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        {canComplete && (
          <button
            type="button"
            disabled={completeMut.isPending}
            onClick={() => completeMut.mutate()}
            style={{ ...S.btn, background: "#0B8A5B", color: "#FFFFFF", borderColor: "#0B8A5B" }}
          >
            Mark complete
          </button>
        )}
        {canDecline && !declining && (
          <button type="button" onClick={() => setDeclining(true)} style={{ ...S.btn, color: "#D81E32", borderColor: "#F7BDC5" }}>
            Decline
          </button>
        )}
      </div>

      {declining && (
        <div style={{ ...S.panel, marginTop: 16 }}>
          <div style={{ padding: "16px 18px", display: "grid", gap: 8 }}>
            <span style={S.fieldLabel}>Why - the renter reads this verbatim</span>
            <textarea value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} style={S.textarea} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" style={S.btn} onClick={() => { setDeclining(false); setDeclineReason(""); }}>
                Cancel
              </button>
              <button
                type="button"
                disabled={declineMut.isPending || !declineReason.trim()}
                style={{ ...S.btn, background: "#D81E32", color: "#FFFFFF", borderColor: "#D81E32" }}
                onClick={() => declineMut.mutate(declineReason.trim())}
              >
                Send decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <div style={{ font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#9AA2B0", marginBottom: 3 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>{value}</div>
    </div>
  );
}

const S = {
  backBtn: { height: 34, padding: "0 4px", background: "none", border: "none", font: "600 13px/1 'Instrument Sans',sans-serif", color: "#5A6373", cursor: "pointer", marginBottom: 10 },
  headRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 },
  h1: { margin: "0 0 4px", font: "600 clamp(21px,2.8vw,26px)/1.2 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", letterSpacing: "-.02em", color: "#1A1F2B" },
  lede: { margin: 0, font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" },
  panel: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", overflow: "hidden" },
  panelHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "15px 18px", borderBottom: "1px solid #F1F3F6" },
  fieldLabel: { display: "block", marginBottom: 5, font: "600 11px/1.3 'Instrument Sans',sans-serif", color: "#5A6373" },
  input: { width: "100%", height: 40, padding: "0 12px", border: "1.5px solid #E4E7EC", borderRadius: "var(--r)", font: "400 14px/1 'Instrument Sans',sans-serif", color: "#1A1F2B", background: "#FFFFFF", boxSizing: "border-box" },
  textarea: { width: "100%", minHeight: 70, padding: 12, border: "1.5px solid #E4E7EC", borderRadius: "var(--r)", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#1A1F2B", background: "#FFFFFF", resize: "vertical", boxSizing: "border-box" },
  btn: { height: 40, padding: "0 16px", background: "#FFFFFF", color: "#1A1F2B", border: "1px solid #E4E7EC", borderRadius: "var(--r)", font: "600 13px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  error: { marginTop: 16, padding: "11px 14px", background: "#FDE7EA", border: "1px solid #F7BDC5", borderRadius: "var(--r)", font: "500 13px/1.5 'Instrument Sans',sans-serif", color: "#A50E22" },
  empty: { padding: "28px 18px", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
} satisfies Record<string, CSSProperties>;
