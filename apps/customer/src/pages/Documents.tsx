import { useRef, useState, type ChangeEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePageTitle } from "../lib/use-page-title.js";
import {
  getRenterDocuments,
  uploadRenterDocument,
  type RenterDocKind,
  type DocumentState,
} from "../lib/documents-api.js";

/**
 * `/documents` - upload the two identity documents a booking request
 * needs. Reachable from the booking flow's "documents_required" error and
 * from the account menu once accounts exist. Ops accepts these in the
 * admin renters queue (a later phase); this page only ever shows what is
 * actually true - "in review" until a human decides, never a fabricated
 * "verified".
 */

const LABELS: Record<RenterDocKind, { label: string; note: string }> = {
  national_id: { label: "National ID", note: "Both sides in one photo, or the clearer side." },
  driving_licence: { label: "Driving licence", note: "The card, not a learner's permit." },
};

function stateChip(state: DocumentState): { label: string; bg: string; fg: string; border: string } {
  switch (state) {
    case "ok":
      return { label: "ACCEPTED", bg: "#DDF3E9", fg: "#076945", border: "#A8DEC7" };
    case "rejected":
      return { label: "REJECTED", bg: "#FDE7EA", fg: "#A50E22", border: "#F7BDC5" };
    case "expiring":
      return { label: "EXPIRING", bg: "#FFF3DB", fg: "#8A5200", border: "#F5D9A3" };
    case "pending":
      return { label: "IN REVIEW", bg: "#E1F1FA", fg: "#075D93", border: "#A9D6EE" };
    default:
      return { label: "NOT UPLOADED", bg: "#F1F3F6", fg: "#5A6373", border: "#E4E7EC" };
  }
}

function DocRow({ kind }: { kind: RenterDocKind }): JSX.Element {
  const meta = LABELS[kind];
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({ queryKey: ["me", "documents"], queryFn: getRenterDocuments });
  const doc = data?.verification.documents.find((d) => d.kind === kind);
  const state = doc?.state ?? "missing";
  const chip = stateChip(state);

  const onPick = () => inputRef.current?.click();
  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      await uploadRenterDocument(kind, file);
      await queryClient.invalidateQueries({ queryKey: ["me", "documents"] });
    } catch {
      setError("That upload didn't go through. Try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "16px 18px",
        background: "#FFFFFF",
        border: "1px solid #E4E7EC",
        borderRadius: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: "1 1 220px" }}>
        <div style={{ font: "600 15px/1.35 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 3 }}>
          {meta.label}
        </div>
        <div style={{ font: "400 12.5px/1.45 'Instrument Sans',sans-serif", color: "#5A6373" }}>{meta.note}</div>
        {state === "rejected" && doc?.review_note && (
          <div style={{ marginTop: 6, font: "500 12.5px/1.45 'Instrument Sans',sans-serif", color: "#A50E22" }}>
            {doc.review_note}
          </div>
        )}
        {error && (
          <div style={{ marginTop: 6, font: "500 12.5px/1.45 'Instrument Sans',sans-serif", color: "#A50E22" }}>
            {error}
          </div>
        )}
      </div>
      <span
        style={{
          padding: "5px 11px",
          background: chip.bg,
          color: chip.fg,
          border: `1px solid ${chip.border}`,
          borderRadius: 999,
          font: "600 11px/1.4 'IBM Plex Mono',monospace",
          letterSpacing: ".05em",
          flex: "none",
        }}
      >
        {chip.label}
      </span>
      <button
        type="button"
        onClick={onPick}
        disabled={uploading}
        style={{
          flex: "none",
          height: 40,
          padding: "0 16px",
          background: state === "missing" ? "#0F23A8" : "#FFFFFF",
          color: state === "missing" ? "#FFFFFF" : "#0B0F1A",
          border: state === "missing" ? "none" : "1px solid #CDD2DA",
          borderRadius: 8,
          font: "600 13px/1 'Instrument Sans',sans-serif",
          cursor: uploading ? "default" : "pointer",
          opacity: uploading ? 0.6 : 1,
        }}
      >
        {uploading ? "Uploading…" : state === "missing" ? "Upload" : "Replace"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={onChange}
        style={{ display: "none" }}
      />
    </div>
  );
}

export function Documents(): JSX.Element {
  usePageTitle("Your documents");
  const { data } = useQuery({ queryKey: ["me", "documents"], queryFn: getRenterDocuments });
  const verified = data?.verification.verified ?? false;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "clamp(28px,4vw,44px) 20px clamp(50px,7vw,80px)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
        <span style={{ display: "block", width: 18, height: 5, background: "#D81E32", transform: "skewX(-14deg)" }} />
        <span style={{ font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".12em", color: "#838C9B" }}>
          YOUR ACCOUNT
        </span>
      </div>
      <h1
        style={{
          margin: "0 0 10px",
          font: "700 clamp(26px,3.4vw,34px)/1.12 Archivo,sans-serif",
          fontVariationSettings: "'wdth' 108",
          letterSpacing: "-.026em",
          color: "#0B0F1A",
        }}
      >
        Your documents
      </h1>
      <p style={{ margin: "0 0 26px", font: "400 15px/1.6 'Instrument Sans',sans-serif", color: "#5A6373", maxWidth: 520 }}>
        Once. Not every time you hire. Upload your ID and licence and CRAL reads them once - every
        request after this one goes out with them already attached.
        {verified && " Both are on file."}
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        <DocRow kind="national_id" />
        <DocRow kind="driving_licence" />
      </div>
    </div>
  );
}
