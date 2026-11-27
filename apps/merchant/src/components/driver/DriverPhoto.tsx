import { useEffect, useRef, useState, type ReactNode } from "react";
import { UserCircle } from "@phosphor-icons/react/dist/ssr/UserCircle";
import { P } from "../portal/styles.js";
import { DRIVER_PHOTO_ACCEPT, driverPhotoProblem, useDriverPhotoSrc } from "../../lib/drivers-api.js";

/**
 * The driver's photo in the merchant portal (DR2,
 * docs/plans/drivers-that-work.md). One optional picture, shown to hirers
 * on the driver's card and page. It is not a document and is not checked
 * by a reviewer, so nothing here calls it verified.
 *
 * Built from the portal's tokens - there is no canvas for drivers.
 */

function Frame({ size, radius, children }: { size: number; radius: number; children: ReactNode }): JSX.Element {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        flex: "none",
        overflow: "hidden",
        background: "#EDEFFC",
        color: "#0F23A8",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        font: `700 ${Math.round(size * 0.38)}px/1 Archivo,sans-serif`,
      }}
    >
      {children}
    </span>
  );
}

/** A local image (an object URL) or the first letter of the name. */
export function PhotoView({ src, name, size, radius = 999 }: { src: string | undefined; name: string; size: number; radius?: number }): JSX.Element {
  return (
    <Frame size={size} radius={radius}>
      {src ? (
        <img src={src} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <span aria-hidden="true">{name.trim().charAt(0).toUpperCase() || "?"}</span>
      )}
    </Frame>
  );
}

/** A stored driver's photo, fetched with the merchant's token. */
export function DriverAvatar({
  driverId,
  photoId,
  name,
  size,
  radius,
}: {
  driverId: string;
  photoId: string | null;
  name: string;
  size: number;
  radius?: number;
}): JSX.Element {
  const { data } = useDriverPhotoSrc(driverId, photoId);
  return <PhotoView src={photoId ? data : undefined} name={name} size={size} {...(radius !== undefined ? { radius } : {})} />;
}

/**
 * The photo tile, in the vehicle page's photo style (`P.photoMain` /
 * `P.photoAdd`): an "Add a photo" drop-in tile while empty, the picture
 * with a remove button once there is one, and "Change photo" under it.
 * `preview` is what to show now (an object URL); the parent decides
 * whether a pick uploads at once (the driver's page) or waits for the
 * driver to be saved (add a driver).
 */
export function PhotoTile({
  name,
  preview,
  hasPhoto,
  busy,
  onPick,
  onRemove,
  height = 260,
}: {
  name: string;
  preview: string | undefined;
  hasPhoto: boolean;
  busy: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
  height?: number;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const pick = () => inputRef.current?.click();

  return (
    <div style={{ width: "100%", maxWidth: 240 }}>
      <input
        ref={inputRef}
        type="file"
        accept={DRIVER_PHOTO_ACCEPT}
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const why = driverPhotoProblem(file);
          setProblem(why);
          if (!why) onPick(file);
        }}
      />
      {hasPhoto ? (
        <div style={{ ...P.photoMain, height }}>
          {preview ? (
            <img src={preview} alt={name || "Driver"} style={{ ...P.photoMainImg, objectPosition: "center 30%" }} />
          ) : (
            <UserCircle size={40} weight="fill" color="#CDD2DA" />
          )}
          {!busy && (
            <button type="button" aria-label="Remove photo" onClick={onRemove} style={P.photoRemove}>
              ✕
            </button>
          )}
        </div>
      ) : (
        <button type="button" style={{ ...P.photoAdd, height }} onClick={pick} disabled={busy}>
          <UserCircle size={40} weight="light" color="#9AA2B0" />
          <span style={P.photoAddLabel}>{busy ? "Uploading…" : "Add a photo"}</span>
          <span style={P.photoAddHint}>OPTIONAL · FACE AND SHOULDERS</span>
        </button>
      )}
      {hasPhoto && (
        <button
          type="button"
          onClick={pick}
          disabled={busy}
          style={{ marginTop: 8, padding: "6px 0", background: "none", border: "none", font: "600 13px/1 'Instrument Sans',sans-serif", color: "#0F23A8", cursor: "pointer" }}
        >
          {busy ? "Saving…" : "Change photo"}
        </button>
      )}
      {problem && <div style={{ marginTop: 6, font: "600 12.5px/1.4 'Instrument Sans',sans-serif", color: "#D81E32" }}>{problem}</div>}
    </div>
  );
}

/** An object URL for a picked File, revoked when the file changes or the component goes. */
export function useFilePreview(file: File | null): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!file) {
      setUrl(undefined);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}
