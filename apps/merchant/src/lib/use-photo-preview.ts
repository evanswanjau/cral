import { useEffect, useState } from "react";
import { getPhotoPreview, loadPhotoPreview } from "./photo-preview-cache.js";

/**
 * A displayable object URL for a stored photo, or undefined while it loads
 * (or if it can't be read back).
 *
 * Returns the cached blob synchronously when there is one - the photo was
 * picked in this page session - and otherwise fetches the bytes from the
 * API once. That second path is what makes photos survive a reload:
 * object URLs die with the page, but the file is still on the server.
 */
export function usePhotoPreview(documentId: string | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() =>
    documentId ? getPhotoPreview(documentId) : undefined,
  );

  useEffect(() => {
    if (!documentId) {
      setUrl(undefined);
      return;
    }
    const cached = getPhotoPreview(documentId);
    if (cached) {
      setUrl(cached);
      return;
    }
    let active = true;
    void loadPhotoPreview(documentId).then((loaded) => {
      if (active) setUrl(loaded);
    });
    return () => {
      active = false;
    };
  }, [documentId]);

  return url;
}
