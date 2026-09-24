import { useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  decideRenterDocument,
  fetchRenterFile,
  renterDocObjectUrl,
  type RenterDocument,
  type RenterDocKind,
} from "../lib/renters-api.js";
import { usePageTitle } from "../lib/use-page-title.js";

const LABEL: Record<RenterDocKind, string> = {
  national_id: "National ID",
  driving_licence: "Driving licence",
};

export function RenterFile(): JSX.Element {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: r, isLoading, error } = useQuery({
    queryKey: ["admin", "renters", userId],
    queryFn: () => fetchRenterFile(userId!),
    enabled: !!userId,
  });

  usePageTitle(r ? r.name : "Renter");

  const docMut = useMutation({
    mutationFn: (v: { kind: RenterDocKind; decision: "accept" | "reject"; note?: string }) =>
      decideRenterDocument(userId!, v.kind, v.decision, v.note),
    onSuccess: (updated) => queryClient.setQueryData(["admin", "renters", userId], updated),
  });

  if (isLoading) return <div style={S.empty}>Loading…</div>;
  if (error || !r) return <div style={S.empty}>Couldn't load that renter.</div>;

  return (
    <div>
      <button type="button" onClick={() => navigate("/renters")} style={S.backBtn}>
        ← All renters
      </button>

      <div style={S.headRow}>
        <div>
          <h1 style={S.h1}>{r.name}</h1>
          <p style={S.lede}>{r.email}{r.phone ? ` · ${r.phone}` : ""}</p>
        </div>
        <span
          style={{
            ...S.badge,
            background: r.verified ? "#DDF3E9" : "#FFF3DB",
            borderColor: r.verified ? "#A8DEC7" : "#F5D9A3",
            color: r.verified ? "#076945" : "#8A5200",
          }}
        >
          {r.verified ? "VERIFIED" : "PENDING"}
        </span>
      </div>

      <div style={S.stats}>
        <Stat label="BOOKINGS" value={r.booking_count} />
        <Stat label="ON CRAL SINCE" value={new Date(r.member_since).toLocaleDateString("en-GB", { month: "short", year: "numeric" })} />
      </div>

      <div style={S.panel}>
        <div style={S.panelHead}>
          <span style={{ font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>Identity documents</span>
        </div>
        {r.documents.map((d) => (
          <DocRow
            key={d.kind}
            userId={userId!}
            line={d}
            busy={docMut.isPending}
            onAccept={() => docMut.mutate({ kind: d.kind, decision: "accept" })}
            onReject={(note) => docMut.mutate({ kind: d.kind, decision: "reject", note })}
          />
        ))}
        <div style={S.panelFoot}>
          A rejection emails the renter what you write here, verbatim - nothing else is sent to
          them yet (no in-app notifications for renters).
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }): JSX.Element {
  return (
    <div style={S.stat}>
      <div style={S.statLabel}>{label}</div>
      <div style={S.statValue}>{value}</div>
    </div>
  );
}

function DocRow({
  userId,
  line,
  busy,
  onAccept,
  onReject,
}: {
  userId: string;
  line: RenterDocument;
  busy: boolean;
  onAccept: () => void;
  onReject: (note: string) => void;
}): JSX.Element {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const accepted = line.state === "ok";
  const rejected = line.state === "rejected";
  const dot = accepted ? "#0B8A5B" : rejected ? "#D81E32" : line.state === "missing" ? "#E4E7EC" : "#C77400";

  return (
    <div style={{ ...S.docRow, background: rejected ? "#FDE7EA" : "#FFFFFF" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: dot, flex: "none" }} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>{LABEL[line.kind]}</div>
          <div style={{ font: "400 12px/1.4 'Instrument Sans',sans-serif", color: rejected ? "#D81E32" : accepted ? "#0B8A5B" : "#838C9B", marginTop: 2 }}>
            {rejected && line.review_note ? line.review_note : line.state === "missing" ? "Not uploaded" : accepted ? "Accepted" : "Not yet reviewed"}
          </div>
          {line.expires_at && (
            <div style={{ font: "500 11px/1.4 'IBM Plex Mono',monospace", color: "#838C9B", marginTop: 3 }}>
              EXPIRES {line.expires_at}
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={!line.document_id}
          onClick={() =>
            line.document_id &&
            renterDocObjectUrl(userId, line.document_id).then((u) => window.open(u, "_blank")).catch(() => {})
          }
          style={{ ...S.docBtn, opacity: line.document_id ? 1 : 0.4 }}
        >
          Open scan
        </button>
        <div style={{ display: "flex", gap: 6, flex: "none" }}>
          <button
            type="button"
            disabled={busy || line.state === "missing"}
            onClick={onAccept}
            style={{ ...S.docBtn, background: accepted ? "#0B8A5B" : "#FFFFFF", color: accepted ? "#FFFFFF" : "#0B8A5B", borderColor: accepted ? "#0B8A5B" : "#A8DEC7" }}
          >
            Accept
          </button>
          <button
            type="button"
            disabled={busy || line.state === "missing"}
            onClick={() => setRejecting((v) => !v)}
            style={{ ...S.docBtn, background: rejected ? "#D81E32" : "#FFFFFF", color: rejected ? "#FFFFFF" : "#D81E32", borderColor: rejected ? "#D81E32" : "#F7BDC5" }}
          >
            Reject
          </button>
        </div>
      </div>
      {rejecting && (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What the renter reads by email - quoted verbatim."
            style={S.docTextarea}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" style={S.docBtn} onClick={() => { setRejecting(false); setNote(""); }}>
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !note.trim()}
              style={{ ...S.docBtn, background: "#D81E32", color: "#fff", borderColor: "#D81E32" }}
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
  stats: { display: "flex", gap: 24, marginBottom: 20, flexWrap: "wrap" },
  stat: { display: "flex", flexDirection: "column", gap: 4 },
  statLabel: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#9AA2B0" },
  statValue: { font: "600 18px/1.2 Archivo,sans-serif", color: "#1A1F2B" },
  panel: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", overflow: "hidden" },
  panelHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "15px 18px", borderBottom: "1px solid #F1F3F6" },
  panelFoot: { padding: "12px 18px", background: "#FFFFFF", font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
  docRow: { padding: "14px 18px", borderBottom: "1px solid #F1F3F6" },
  docBtn: { height: 32, padding: "0 12px", background: "#FFFFFF", color: "#0F23A8", border: "1px solid #E4E7EC", borderRadius: "var(--r-sm)", font: "600 12px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  docTextarea: { width: "100%", minHeight: 70, padding: 12, border: "1.5px solid #E4E7EC", borderRadius: "var(--r)", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#1A1F2B", background: "#FFFFFF", resize: "vertical" },
  empty: { padding: "28px 18px", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
} satisfies Record<string, CSSProperties>;
