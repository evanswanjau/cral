/**
 * ID prefixes from the platform API spec §2. Every table's primary key is a
 * prefixed ULID (26 chars after the prefix), never an auto-increment integer.
 */
export const ID_PREFIXES = {
  user: "usr",
  merchant: "mer",
  vehicle: "veh",
  document: "doc",
  booking: "bkg",
  handover: "hnd",
  payment: "pay",
  deposit: "dep",
  payoutRun: "pot",
  invoice: "inv",
  dispute: "dsp",
  review: "rev",
  file: "fil",
  campaign: "cmp",
  // Internal entities not named in spec §2's identifier list, but built on
  // the same convention. "passwordResetToken" reuses "prt" from the spec's
  // own §6 example payload ("token": "prt_8Kd…").
  auditLog: "aud",
  session: "ses",
  otpCode: "otp",
  passwordResetToken: "prt",
  twoFactorChallenge: "tfc",
  recoveryCode: "rcv",
} as const;

export type IdKind = keyof typeof ID_PREFIXES;

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** True if `value` is a well-formed `<prefix>_<ulid>` id, optionally for a specific kind. */
export function isPrefixedId(value: string, kind?: IdKind): boolean {
  const [prefix, ulid] = value.split("_");
  if (!prefix || !ulid) return false;
  if (kind && prefix !== ID_PREFIXES[kind]) return false;
  if (!kind && !Object.values(ID_PREFIXES).includes(prefix as (typeof ID_PREFIXES)[IdKind])) {
    return false;
  }
  return ULID_RE.test(ulid);
}
