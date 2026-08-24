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

/** National input ("733 376 061" or "0733376061") to the E.164 form the API expects. */
export function toE164(national: string): string {
  const digits = national.replace(/\D/g, "").replace(/^0+/, "");
  return `+254${digits}`;
}
