import { useRef, useState } from "react";
import { ImageSquare } from "@phosphor-icons/react/dist/ssr/ImageSquare";
import { O } from "./styles.js";
import { formatFileSize } from "../../lib/format.js";
import { revokePhotoPreview, setPhotoPreview } from "../../lib/photo-preview-cache.js";
import { usePhotoPreview } from "../../lib/use-photo-preview.js";
import { deleteDocument, uploadVehiclePhoto, type DraftPhoto } from "../../lib/onboarding-draft.js";
import { ApiClientError } from "../../lib/api.js";

/**
 * One filled photo slot. Split out so each tile can resolve its own preview
 * - after a reload the object URL is gone and the bytes have to come back
 * from the server, which is a per-photo async load.
 */
function PhotoTile({
  photo,
  index,
  onRemove,
}: {
  photo: DraftPhoto;
  index: number;
  onRemove: () => void;
}): JSX.Element {
  const preview = usePhotoPreview(photo.documentId);
  return (
    <div style={O.photoTileFilled}>
      {preview ? (
        <img src={preview} alt={photo.name} style={O.photoThumbImage} />
      ) : (
        <div style={O.photoThumbFallback}>
          <ImageSquare size={22} weight="fill" color="#CDD2DA" />
        </div>
      )}
      <div style={O.photoFileRow}>
        <span style={O.photoFileName} title={photo.name}>
          {photo.name} · {formatFileSize(photo.size)}
        </span>
        <button
          type="button"
          style={O.photoRemove}
          onClick={onRemove}
          aria-label={`Remove photo ${index + 1}`}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export const MAX_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ACCEPTED_LABEL = "JPG, PNG or WEBP";
const CAPTIONS = ["Front three-quarter", "Interior · dashboard", "Rear or side"];

/** The file that failed, plus whatever uploaded before it - never a bare "try again". */
function uploadErrorMessage(err: unknown, file: File, savedCount: number): string {
  const saved =
    savedCount > 0
      ? ` The ${savedCount === 1 ? "photo" : `${savedCount} photos`} before it uploaded fine.`
      : "";
  // The server's own message is the useful one: "too_many_photos" tells the
  // merchant to remove one, where "try again" sends them round a loop that
  // cannot succeed.
  if (err instanceof ApiClientError) return `${file.name}: ${err.message}${saved}`;
  return `Couldn't upload ${file.name}. Check your connection and try again.${saved}`;
}

/**
 * Real drag-and-drop / click-to-browse photo picker, capped at exactly
 * `MAX_PHOTOS`. Each accepted file uploads immediately via
 * POST /merchant/onboarding/documents (kind=vehicle_photo) - needs a real
 * server-side vehicle id, so this is disabled until the vehicle has been
 * created (see VehicleForm in steps/Vehicles.tsx).
 *
 * Previews come from the page-level blob-URL cache (photo-preview-cache.ts)
 * while the file is still in hand, and are re-fetched from the server on
 * demand afterwards, so a photo survives a reload (see usePhotoPreview).
 */
export function PhotoUpload({
  photos,
  onChange,
  vehicleId,
}: {
  photos: DraftPhoto[];
  onChange: (photos: DraftPhoto[]) => void;
  vehicleId: string | null;
}): JSX.Element {
  const [, forceUpdate] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // How many files are in flight - they fill the first empty slots, so only those show "uploading".
  const [uploadingCount, setUploadingCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  async function addFiles(fileList: FileList | File[]) {
    if (!vehicleId) {
      setError("Fill in the vehicle details above first.");
      return;
    }
    const files = Array.from(fileList);
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setError(`Only ${MAX_PHOTOS} photos are allowed during onboarding.`);
      return;
    }

    const toUpload: File[] = [];
    let rejectionMessage: string | null = null;

    for (const file of files) {
      if (toUpload.length >= room) {
        rejectionMessage = `Only ${MAX_PHOTOS} photos are allowed during onboarding - the rest weren't added.`;
        break;
      }
      if (!ACCEPTED_TYPES.includes(file.type)) {
        rejectionMessage = `${file.name} isn't a supported image type. Use ${ACCEPTED_LABEL}.`;
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        rejectionMessage = `${file.name} is ${formatFileSize(file.size)} - the limit is 2MB.`;
        continue;
      }
      toUpload.push(file);
    }

    setError(rejectionMessage);
    if (toUpload.length === 0) return;

    setUploadingCount(toUpload.length);
    // Accumulated outside the try: a file that uploaded before a later one
    // failed is already stored server-side, and dropping it here is how the
    // screen ends up showing fewer photos than the server will accept -
    // leaving the merchant retrying into `too_many_photos` with an
    // apparently empty grid.
    const uploaded: DraftPhoto[] = [];
    try {
      for (const file of toUpload) {
        try {
          const photo = await uploadVehiclePhoto(vehicleId, file);
          setPhotoPreview(photo.id, URL.createObjectURL(file));
          uploaded.push(photo);
          onChange([...photos, ...uploaded]);
          setUploadingCount((n) => Math.max(0, n - 1));
        } catch (err) {
          setError(uploadErrorMessage(err, file, uploaded.length));
          break;
        }
      }
    } finally {
      if (uploaded.length > 0) forceUpdate((n) => n + 1);
      setUploadingCount(0);
    }
  }

  async function removePhoto(photo: DraftPhoto) {
    revokePhotoPreview(photo.id);
    onChange(photos.filter((p) => p.id !== photo.id));
    setError(null);
    try {
      await deleteDocument(photo.documentId);
    } catch {
      // The photo is already gone from the local list; a failed server
      // delete just leaves an orphaned row, no user-visible consequence.
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Drop is handled on the grid, not the empty tile: a disabled button
          fires no drop event, so dropping a file before the vehicle exists
          used to do nothing at all rather than explain itself. */}
      <div
        style={O.photoGrid}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) void addFiles(e.dataTransfer.files);
        }}
      >
        {photos.map((photo, i) => (
          <PhotoTile
            key={photo.id}
            photo={photo}
            index={i}
            onRemove={() => void removePhoto(photo)}
          />
        ))}

        {Array.from({ length: MAX_PHOTOS - photos.length }).map((_, slot) => {
          const captionIndex = photos.length + slot;
          const slotUploading = slot < uploadingCount;
          return (
            <button
              key={`empty-${slot}`}
              type="button"
              disabled={uploadingCount > 0 || !vehicleId}
              style={{ ...O.photoTileEmpty, ...(dragOver ? O.photoTileEmptyActive : {}) }}
              onClick={() => inputRef.current?.click()}
            >
              <span style={O.photoTileAddLabel}>{slotUploading ? "UPLOADING…" : "+ ADD PHOTO"}</span>
              <span style={O.photoTileCaption}>{CAPTIONS[captionIndex] ?? "Any angle"}</span>
            </button>
          );
        })}
      </div>

      {error && <div style={O.fieldError}>{error}</div>}
    </div>
  );
}
