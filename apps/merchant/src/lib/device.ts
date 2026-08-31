/** Stable per-browser device id, sent with logins so sessions are distinguishable (spec §5). */
export function deviceId(): string {
  const KEY = "cral_merchant_device_id";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = `dev_${crypto.randomUUID()}`;
    window.localStorage.setItem(KEY, id);
  }
  return id;
}

/**
 * Any way someone might type a Kenyan mobile number into a field that
 * already shows "+254" — "733 376 061", "0733376061", "254733376061",
 * "+254733376061" — to the E.164 form the API expects. The server's
 * normalizePhone is the real validator; this just does its best.
 */
export function toE164(national: string): string {
  const subscriber = national.replace(/\D/g, "").replace(/^(?:254|0)/, "");
  return `+254${subscriber}`;
}
