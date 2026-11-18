/**
 * A half-filled form kept in `sessionStorage` through the detour to
 * sign-in (UI3: the public towing form and a driver request). Storage can
 * be blocked (a private window) or come back empty; the form then simply
 * starts blank, so every read and write is a convenience, never a
 * requirement.
 */

export function readSessionDraft<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeSessionDraft(key: string, value: unknown): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Blocked storage: the visitor fills the form in again after sign-in.
  }
}

export function clearSessionDraft(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}
