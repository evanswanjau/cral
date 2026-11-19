import { useEffect, useRef, useState } from "react";
import { Trash } from "@phosphor-icons/react/dist/ssr/Trash";
import { P } from "../portal/styles.js";
import {
  MAX_SALE_PHOTOS,
  MIN_SALE_PHOTOS,
  saleFileBlob,
  useDeleteSaleFile,
  useUploadSaleFile,
  type SaleListing,
} from "../../lib/sales-api.js";

/**
 * A sale listing's photos and logbook (Phase 6 CS1). Files come through the
 * API with bearer auth, so each is read as a blob URL. Not from a canvas;
 * built from tokens.ts and the premises photo card.
 */

type Flash = (msg: string, color: string) => void;

function Thumb({ listingId, fileId, alt }: { listingId: string; fileId: string; alt: string }): JSX.Element {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url: string | null = null;
    let live = true;
    saleFileBlob(listingId, fileId)
      .then((blob) => {
        if (!live) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [listingId, fileId]);
  const box = { width: "100%", aspectRatio: "4 / 3", borderRadius: 8, background: "#F1F3F6", objectFit: "cover" as const, display: "block" };
  if (src) return <img src={src} alt={alt} style={box} />;
  return (
    <div style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center", font: "400 12px/1.4 'Instrument Sans',sans-serif", color: "#838C9B" }}>
      {failed ? "Couldn't load" : "Loading…"}
    </div>
  );
}

const removeBtn = {
  position: "absolute" as const,
  top: 6,
  right: 6,
  width: 44,
  height: 44,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#FFFFFF",
  border: "1px solid #CDD2DA",
  borderRadius: 8,
  cursor: "pointer",
};

export function SaleFiles({ l, editable, flash }: { l: SaleListing; editable: boolean; flash: Flash }): JSX.Element {
  const photoRef = useRef<HTMLInputElement>(null);
  const logbookRef = useRef<HTMLInputElement>(null);
  const upload = useUploadSaleFile(l.id);
  const remove = useDeleteSaleFile(l.id);
  const fail = (err: unknown) => flash(err instanceof Error ? err.message : "Something went wrong. Try again.", "#FF8A8A");
  const full = l.photos.length >= MAX_SALE_PHOTOS;
  const name = `${l.make} ${l.model}`;

  function pick(kind: "photo" | "logbook") {
    return (e: { target: HTMLInputElement }) => {
      const file = e.target.files?.[0];
      if (file) {
        upload.mutate(
          { kind, file },
          { onSuccess: () => flash(kind === "photo" ? "Photo added." : "Logbook uploaded.", "#6FC8F0"), onError: fail },
        );
      }
      e.target.value = "";
    };
  }

  return (
    <>
      <div style={{ ...P.card, marginTop: 16, maxWidth: 820 }}>
        <div style={P.cardHead}>
          <span style={P.cardTitle}>Photos</span>
          <span style={{ ...P.cardHeadTag, color: l.photos.length >= MIN_SALE_PHOTOS ? "#5A6373" : "#8A5200" }}>
            {l.photos.length} OF {MAX_SALE_PHOTOS}
          </span>
        </div>
        <div style={{ padding: 18 }}>
          {l.photos.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12, marginBottom: 14 }}>
              {l.photos.map((p) => (
                <div key={p.id} style={{ position: "relative" }}>
                  <Thumb listingId={l.id} fileId={p.id} alt={`${name}: ${p.original_name}`} />
                  {editable && (
                    <button
                      type="button"
                      aria-label={`Remove ${p.original_name}`}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(p.id, { onSuccess: () => flash("Photo removed.", "#8C97A8"), onError: fail })}
                      style={removeBtn}
                    >
                      <Trash size={18} color="#A50E22" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={pick("photo")} />
          {editable && (
            <button
              type="button"
              style={{ ...P.actionBtn, minHeight: 44, color: "#0F23A8" }}
              disabled={upload.isPending || full}
              onClick={() => photoRef.current?.click()}
            >
              {upload.isPending ? "Uploading…" : full ? `${MAX_SALE_PHOTOS} photos is the most` : "Add a photo"}
            </button>
          )}
        </div>
        <div style={P.cardFoot}>
          At least {MIN_SALE_PHOTOS}: front, back, both sides and the inside help buyers most. CRAL checks they are of
          this car.
        </div>
      </div>

      <div style={{ ...P.card, marginTop: 16, maxWidth: 820 }}>
        <div style={P.cardHead}>
          <span style={P.cardTitle}>Logbook</span>
          <span style={{ ...P.cardHeadTag, color: l.logbook ? "#5A6373" : "#8A5200" }}>{l.logbook ? "UPLOADED" : "MISSING"}</span>
        </div>
        <div style={{ padding: 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ ...P.lede, margin: 0 }}>{l.logbook ? l.logbook.original_name : "Not uploaded yet."}</span>
          <input ref={logbookRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={pick("logbook")} />
          {editable && (
            <button
              type="button"
              style={{ ...P.actionBtn, minHeight: 44, color: "#0F23A8" }}
              disabled={upload.isPending}
              onClick={() => logbookRef.current?.click()}
            >
              {l.logbook ? "Replace logbook" : "Upload logbook"}
            </button>
          )}
        </div>
        <div style={P.cardFoot}>
          Buyers never see it. CRAL checks it is in your name or your company's, and that the plate and details match.
        </div>
      </div>
    </>
  );
}
