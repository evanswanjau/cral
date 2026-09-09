/** Stable per-browser device id, sent with admin logins so sessions are distinguishable (spec §8). */
export function deviceId(): string {
  const KEY = "cral_admin_device_id";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = `adm_${crypto.randomUUID()}`;
    window.localStorage.setItem(KEY, id);
  }
  return id;
}
