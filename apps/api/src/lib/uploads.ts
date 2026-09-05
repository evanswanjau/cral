import multer from "multer";
import { ApiError } from "@cral/types";

/**
 * One upload policy for every multipart route (onboarding documents,
 * vehicle documents, handover photos).
 *
 * Two things were wrong before this existed. There was no allowlist at all
 * — only a size limit — so any file type was accepted. And the
 * *client-supplied* `mimetype` was stored on the document row and later
 * replayed verbatim as the `Content-Type` of
 * `GET /merchant/onboarding/documents/:id`, which serves `inline`. An
 * `evil.html` uploaded as `text/html` therefore executed as script on the
 * API's own origin.
 *
 * So the declared type is checked against an allowlist, and then the bytes
 * are checked against the declared type — a header is a claim, not
 * evidence. Everything here is the boring, well-known set a merchant
 * actually uploads: a photo of a logbook or a PDF of an insurance
 * certificate.
 */

/** matches Documents.tsx's MAX_DOC_BYTES */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ALLOWED_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type AllowedUploadMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

function isAllowedMimeType(value: string): value is AllowedUploadMimeType {
  return (ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(value);
}

/**
 * Leading bytes that must be present for each accepted type. Enough to
 * catch a mislabelled or disguised file; deliberately not a full format
 * parser.
 */
const MAGIC_BYTES: Record<AllowedUploadMimeType, readonly number[][]> = {
  // SOI marker
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  // "RIFF" .... "WEBP" — the four size bytes at offset 4 are skipped below
  "image/webp": [[0x52, 0x49, 0x46, 0x46]],
  // "%PDF-"
  "application/pdf": [[0x25, 0x50, 0x44, 0x46, 0x2d]],
};

function startsWith(buffer: Buffer, signature: readonly number[], offset = 0): boolean {
  if (buffer.length < offset + signature.length) return false;
  return signature.every((byte, i) => buffer[offset + i] === byte);
}

/**
 * Throws unless `buffer` really is the type it claims to be. Call this in
 * the route, after multer has the bytes — `fileFilter` only ever sees the
 * headers, never the content.
 */
export function assertDeclaredTypeMatchesBytes(buffer: Buffer, mimetype: string): void {
  const reject = (): never => {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "file_content_mismatch",
      message: "That file isn't the type it claims to be. Upload a JPEG, PNG, WebP or PDF.",
      field: "file",
    });
  };

  if (!isAllowedMimeType(mimetype)) reject();

  const signatures = MAGIC_BYTES[mimetype as AllowedUploadMimeType];
  const matches = signatures.some((signature) => startsWith(buffer, signature));
  if (!matches) reject();

  // RIFF alone is also AVI/WAV; the format tag four bytes past the size
  // field is what makes it a WebP.
  if (mimetype === "image/webp" && !startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)) reject();
}

/**
 * The shared multer instance. `fileFilter` rejects on the declared type so
 * an obviously-wrong upload never gets buffered; the byte check above is
 * the one that actually decides.
 */
export function createUpload(): multer.Multer {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES },
    fileFilter: (_req, file, cb) => {
      if (!isAllowedMimeType(file.mimetype)) {
        cb(
          new ApiError({
            status: 415,
            type: "validation_error",
            code: "unsupported_file_type",
            message: "Upload a JPEG, PNG, WebP or PDF.",
            field: "file",
          }),
        );
        return;
      }
      cb(null, true);
    },
  });
}

/**
 * How a stored document may be handed back to the browser.
 *
 * Images and PDFs are the only things that can be stored, and both are safe
 * to render in place — which the merchant portal relies on to show a
 * logbook photo. Anything else (a row predating the allowlist) is forced to
 * download rather than render, so a legacy `text/html` row can't execute.
 * Paired with `X-Content-Type-Options: nosniff` at the call site, so a
 * browser can't sniff its way past the declared type either.
 */
export function safeDisposition(contentType: string): "inline" | "attachment" {
  return isAllowedMimeType(contentType) ? "inline" : "attachment";
}

/**
 * The Content-Type to actually send. A stored type outside the allowlist is
 * downgraded to a generic binary blob rather than echoed back.
 */
export function safeContentType(contentType: string): string {
  return isAllowedMimeType(contentType) ? contentType : "application/octet-stream";
}
