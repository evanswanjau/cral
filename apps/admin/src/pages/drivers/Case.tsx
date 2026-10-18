import { useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  decideDriver,
  decideDriverDocument,
  driverDocObjectUrl,
  fetchDriverCase,
  rateLine,
  type DriverCaseDocument,
  type DriverDocKind,
} from "../../lib/drivers-api.js";
import { usePageTitle } from "../../lib/use-page-title.js";
import { DRIVER_STATUS } from "./Queue.js";

/** One driver's case: three documents, then a decision. Built in RenterFile.tsx's idiom - no canvas for drivers. */
export function Case(): JSX.Element {
  const { driverId } = useParams<{ driverId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const key = ["admin", "drivers", driverId];
  const { data: d, isLoading, error } = useQuery({ queryKey: key, queryFn: () => fetchDriverCase(driverId!), enabled: !!driverId });
  usePageTitle(d ? d.full_name : "Driver");

  const [decision, setDecision] = useState<null | "request_changes" | "reject">(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const onDone = (updated: Awaited<ReturnType<typeof fetchDriverCase>>) => {
    qc.setQueryData(key, updated);
    void qc.invalidateQueries({ queryKey: ["admin", "drivers", "list"] });
    setErr(null);
  };
  const onFail = (e: unknown) => setErr(e instanceof Error ? e.message : "That didn't go through. Try again.");

  const docMut = useMutation({
    mutationFn: (v: { kind: DriverDocKind; decision: "accept" | "reject"; note?: string }) =>
      decideDriverDocument(driverId!, v.kind, v.decision, v.note),
    onSuccess: onDone,
    onError: onFail,
  });
  const decideMut = useMutation({
    mutationFn: (v: { action: "approve" | "request_changes" | "reject"; note?: string }) => decideDriver(driverId!, v.action, v.note),
    onSuccess: (u) => {
      onDone(u);
      setDecision(null);
      setNote("");
    },
    onError: onFail,
  });

  if (isLoading) return <div style={S.empty}>Loading…</div>;
  if (error || !d) return <div style={S.empty}>Couldn't load that driver.</div>;

  const s = DRIVER_STATUS[d.status];
  const allAccepted = d.documents.every((x) => x.state === "ok");
  const canApprove = allAccepted && d.merchant.approved && !d.licence_expired;

  return (
    <div>
      <button type="button" onClick={() => navigate("/drivers")} style={S.backBtn}>← All drivers</button>

      <div style={S.headRow}>
        <div>
          <h1 style={S.h1}>{d.full_name}</h1>
          <p style={S.lede}>
            {d.county} · {d.phone} · {rateLine(d.rates) || "No rate set"}
          </p>
        </div>
        <span style={{ ...S.badge, background: s.bg, borderColor: s.border, color: s.fg }}>{s.label}</span>
      </div>

      <div style={S.facts}>
        <Fact label="NATIONAL ID" value={d.national_id} />
        <Fact label="KRA PIN" value={d.kra_pin} />
        <Fact label="LICENCE" value={d.licence_number} />
        <Fact label="LICENCE EXPIRY" value={d.licence_expired ? `${d.licence_expiry} · EXPIRED` : d.licence_expiry} warn={d.licence_expired} />
        <Fact label="MERCHANT" value={d.merchant.name} link={`/merchants/${d.merchant.id}`} />
      </div>

      {!d.merchant.approved && (
        <div style={S.warn}>
          The merchant's account isn't approved yet, so this driver can't go live.{" "}
          <Link to={`/merchants/${d.merchant.id}`} style={{ color: "#0F23A8", fontWeight: 600 }}>Review the account</Link>
        </div>
      )}

      <div style={S.panel}>
        <div style={S.panelHead}>
          <span style={S.panelTitle}>Documents</span>
          <span style={S.mono}>{d.documents.filter((x) => x.state === "ok").length}/3 ACCEPTED</span>
        </div>
        {d.documents.map((doc) => (
          <DocRow
            key={doc.kind}
            driverId={d.id}
            doc={doc}
            busy={docMut.isPending}
            onAccept={() => docMut.mutate({ kind: doc.kind, decision: "accept" })}
            onReject={(n) => docMut.mutate({ kind: doc.kind, decision: "reject", note: n })}
          />
        ))}
        <div style={S.panelFoot}>Check the name and number on each scan match the details typed above.</div>
      </div>

      {err && <div style={{ ...S.warn, background: "#FDE7EA", borderColor: "#F7BDC5", color: "#A50E22" }}>{err}</div>}

      {d.status !== "live" && (
        <div style={{ ...S.panel, padding: 18, marginTop: 16 }}>
          {decision ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={S.panelTitle}>{decision === "reject" ? "Reject this driver" : "Ask the merchant for a change"}</div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What the merchant reads - quoted verbatim." style={S.textarea} />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" style={S.btn} onClick={() => { setDecision(null); setNote(""); }}>Cancel</button>
                <button
                  type="button"
                  disabled={!note.trim() || decideMut.isPending}
                  style={{ ...S.btn, background: "#D81E32", borderColor: "#D81E32", color: "#FFFFFF" }}
                  onClick={() => decideMut.mutate({ action: decision, note: note.trim() })}
                >
                  {decision === "reject" ? "Reject" : "Send"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                disabled={!canApprove || decideMut.isPending}
                title={canApprove ? undefined : "Needs the account approved, all three documents accepted and a licence in date."}
                style={{ ...S.btn, background: canApprove ? "#0B8A5B" : "#F1F3F6", borderColor: canApprove ? "#0B8A5B" : "#E4E7EC", color: canApprove ? "#FFFFFF" : "#9AA2B0" }}
                onClick={() => decideMut.mutate({ action: "approve" })}
              >
                Approve driver
              </button>
              <button type="button" style={S.btn} onClick={() => setDecision("request_changes")}>Request changes</button>
              <button type="button" style={{ ...S.btn, color: "#D81E32", borderColor: "#F7BDC5" }} onClick={() => setDecision("reject")}>Reject</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Fact({ label, value, warn, link }: { label: string; value: string; warn?: boolean; link?: string }): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={S.mono}>{label}</span>
      {link ? (
        <Link to={link} style={{ ...S.factValue, color: "#0F23A8", textDecoration: "none" }}>{value}</Link>
      ) : (
        <span style={{ ...S.factValue, color: warn ? "#A50E22" : "#1A1F2B" }}>{value}</span>
      )}
    </div>
  );
}

function DocRow({
  driverId,
  doc,
  busy,
  onAccept,
  onReject,
}: {
  driverId: string;
  doc: DriverCaseDocument;
  busy: boolean;
  onAccept: () => void;
  onReject: (note: string) => void;
}): JSX.Element {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const accepted = doc.state === "ok";
  const rejected = doc.state === "rejected";
  const missing = doc.state === "missing";
  const dot = accepted ? "#0B8A5B" : rejected ? "#D81E32" : missing ? "#E4E7EC" : "#C77400";
  const sub = doc.from_account
    ? accepted
      ? "The account's own document - accepted on the merchant file"
      : "The account's own document - decide it on the merchant file"
    : rejected && doc.review_note
      ? doc.review_note
      : missing
        ? "Not uploaded"
        : accepted
          ? "Accepted"
          : "Not yet reviewed";

  return (
    <div style={{ ...S.docRow, background: rejected ? "#FDE7EA" : "#FFFFFF" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: dot, flex: "none" }} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={S.panelTitle}>{doc.label}</div>
          <div style={{ font: "400 12px/1.4 'Instrument Sans',sans-serif", color: rejected ? "#D81E32" : accepted ? "#0B8A5B" : "#838C9B", marginTop: 2 }}>{sub}</div>
        </div>
        <button
          type="button"
          disabled={!doc.document_id}
          onClick={() => doc.document_id && driverDocObjectUrl(driverId, doc.document_id).then((u) => window.open(u, "_blank")).catch(() => {})}
          style={{ ...S.btn, opacity: doc.document_id ? 1 : 0.4 }}
        >
          Open scan
        </button>
        {!doc.from_account && (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              disabled={busy || missing}
              onClick={onAccept}
              style={{ ...S.btn, background: accepted ? "#0B8A5B" : "#FFFFFF", color: accepted ? "#FFFFFF" : "#0B8A5B", borderColor: accepted ? "#0B8A5B" : "#A8DEC7" }}
            >
              Accept
            </button>
            <button
              type="button"
              disabled={busy || missing}
              onClick={() => setRejecting((v) => !v)}
              style={{ ...S.btn, background: rejected ? "#D81E32" : "#FFFFFF", color: rejected ? "#FFFFFF" : "#D81E32", borderColor: rejected ? "#D81E32" : "#F7BDC5" }}
            >
              Reject
            </button>
          </div>
        )}
      </div>
      {rejecting && (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What the merchant reads - quoted verbatim." style={S.textarea} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" style={S.btn} onClick={() => { setRejecting(false); setNote(""); }}>Cancel</button>
            <button
              type="button"
              disabled={busy || !note.trim()}
              style={{ ...S.btn, background: "#D81E32", color: "#FFFFFF", borderColor: "#D81E32" }}
              onClick={() => { onReject(note.trim()); setRejecting(false); setNote(""); }}
            >
              Send rejection
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  backBtn: { height: 34, padding: "0 4px", background: "none", border: "none", font: "600 13px/1 'Instrument Sans',sans-serif", color: "#5A6373", cursor: "pointer", marginBottom: 10 },
  headRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 },
  h1: { margin: "0 0 4px", font: "600 clamp(23px,3vw,28px)/1.15 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", letterSpacing: "-.02em", color: "#1A1F2B" },
  lede: { margin: 0, font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" },
  badge: { display: "inline-flex", alignItems: "center", padding: "5px 11px", border: "1px solid", borderRadius: 999, font: "600 11px/1.4 'IBM Plex Mono',monospace", letterSpacing: ".05em", flex: "none" },
  facts: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,150px),1fr))", gap: 16, marginBottom: 18 },
  factValue: { font: "600 14px/1.3 'Instrument Sans',sans-serif", overflow: "hidden", textOverflow: "ellipsis" },
  mono: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#9AA2B0" },
  warn: { padding: "12px 14px", marginBottom: 16, background: "#FFF3DB", border: "1px solid #F5D9A3", borderRadius: "var(--r)", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#8A5200" },
  panel: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", overflow: "hidden" },
  panelHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "15px 18px", borderBottom: "1px solid #F1F3F6" },
  panelTitle: { font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B" },
  panelFoot: { padding: "12px 18px", font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
  docRow: { padding: "14px 18px", borderBottom: "1px solid #F1F3F6" },
  btn: { height: 32, padding: "0 12px", background: "#FFFFFF", color: "#0F23A8", border: "1px solid #E4E7EC", borderRadius: "var(--r-sm)", font: "600 12px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  textarea: { width: "100%", minHeight: 70, padding: 12, border: "1.5px solid #E4E7EC", borderRadius: "var(--r)", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#1A1F2B", background: "#FFFFFF", resize: "vertical" },
  empty: { padding: "28px 18px", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
} satisfies Record<string, CSSProperties>;
