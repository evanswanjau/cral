/**
 * Object-URL cache for photo previews, keyed by `DraftPhoto.id` (which is
 * the server's document id).
 *
 * Module-level, not component state: a preview created while attaching a
 * vehicle's photos needs to still be visible later on the Review step,
 * after the vehicle form has long since unmounted.
 *
 * Object URLs never survive a reload, so on a fresh page load the cache
 * starts empty - the bytes are re-fetched from
 * `GET /merchant/onboarding/documents/:id` on demand (see `loadPhotoPreview`)
 * rather than showing a "reattach this" placeholder for a photo that is
 * in fact safely stored. The fetch is authenticated like every other
 * request; the storage bucket is never public and no token goes in a URL.
 */
import { apiBlob } from "./api.js";

const cache = new Map<string, string>();
/** In-flight fetches, so N components rendering the same photo cause one request. */
const inFlight = new Map<string, Promise<string | undefined>>();

export function setPhotoPreview(id: string, url: string): void {
  cache.set(id, url);
}

export function getPhotoPreview(id: string): string | undefined {
  return cache.get(id);
}

/**
 * Returns a displayable object URL for a stored document, fetching and
 * caching it on first call. Resolves to undefined if the file can't be
 * read back, so callers keep their existing placeholder behaviour.
 */
export function loadPhotoPreview(documentId: string): Promise<string | undefined> {
  const cached = cache.get(documentId);
  if (cached) return Promise.resolve(cached);

  const existing = inFlight.get(documentId);
  if (existing) return existing;

  const pending = apiBlob(`/merchant/onboarding/documents/${documentId}`)
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      cache.set(documentId, url);
      return url;
    })
    .catch(() => undefined)
    .finally(() => {
      inFlight.delete(documentId);
    });

  inFlight.set(documentId, pending);
  return pending;
}

export function revokePhotoPreview(id: string): void {
  const url = cache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    cache.delete(id);
  }
}
