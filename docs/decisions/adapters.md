# Adapters: email, SMS, storage

SMS, email and file storage sit behind interfaces in
`apps/api/src/adapters/{sms,email,storage}`, picked by `SMS_ADAPTER` /
`EMAIL_ADAPTER` / `STORAGE_ADAPTER`, so a provider swaps without touching
call sites. All three have real providers today; `console`/`local` are for
local dev and the test run only. Payment and disbursement adapters are in
`payments.md`. Credentials live in the gitignored `.env`; `.env.example`
carries the keys with empty secrets. A missing key for a selected real
adapter throws from its constructor at boot.

## Email

- **Prefer `ResendEmailAdapter` (`EMAIL_ADAPTER=resend`).** It sends over
  HTTPS, so a mail server's IP-reputation firewall never enters the
  picture. Raw SMTP to `mail.cral.co.ke` was unreachable from a cloud
  host's egress (TCP-connect timeouts on 587 and 465 while outside tools
  got a healthy SMTP conversation), and a cloud egress IP can change on
  redeploy, so an allowlist wouldn't stay fixed. Needs `RESEND_API_KEY` +
  `EMAIL_FROM`, and `cral.co.ke` verified as a sending domain in Resend.
- `SmtpEmailAdapter` (`EMAIL_ADAPTER=smtp`, nodemailer) talks to
  `noreply@cral.co.ke` on `mail.cral.co.ke:587` with STARTTLS:
  `SMTP_SECURE=false` and `requireTLS` does the upgrade. `secure: true` on
  587 hangs until timeout. The server verifies the connection at boot and
  warns (doesn't exit) on failure. `npm run smtp:check -w apps/api [addr]`
  authenticates, or sends one real test message.
- Any HTML email that includes user-typed text escapes it
  (`emailParagraph` does not; see `emailDispatch` in `services.md`).

## SMS

- **TextSMS** (`SMS_ADAPTER=textsms`): `adapters/sms/textsms-adapter.ts`,
  one HTTPS POST to `sms.textsms.co.ke/api/services/sendsms/`, no SDK.
  Needs `TEXTSMS_API_KEY` / `TEXTSMS_PARTNER_ID` / `TEXTSMS_SHORTCODE`.
  `npm run sms:check -w apps/api -- +2547XXXXXXXX` sends one real SMS.
- What SMS may be used for is an identity rule; see `identity-auth.md`.

## File storage

- **Backblaze B2** (`STORAGE_ADAPTER=b2`, `B2StorageAdapter`) over its
  S3-compatible API (`@aws-sdk/client-s3`, `forcePathStyle: true`). Needs
  `B2_BUCKET` / `B2_ENDPOINT` / `B2_REGION` / `B2_KEY_ID` /
  `B2_APPLICATION_KEY`.
- **The bucket stays private** (spec §22): nothing builds a public URL;
  reads go through `getObject` on an authenticated request or a
  short-lived presigned URL.
- **`LocalStorageAdapter` is dev-only**: it writes to the container's
  disk, which a redeploy wipes, and a `documents` row that outlives its
  bytes reads as a corrupt document. Deployed environments run `b2`.
- **The B2 master key doesn't work with the S3 API** (`403
  InvalidAccessKeyId`). Create a named Application Key scoped to the
  bucket: its ID is 25 characters, its secret 31.
- `npm run storage:migrate-b2 -w apps/api [-- --dry-run]` moves files into
  the bucket, driven off `documents` rows, never a directory walk (the
  local dir is mostly orphans from test runs and re-seeds). It reads each
  object back after upload, since a truncated write and a good one return
  the same `PutObject` response.
- Storage has `deleteObject`; replacing a document deletes the old bytes.

- Class names: `TextSmsAdapter`, `ResendEmailAdapter`, `SmtpEmailAdapter`, `B2StorageAdapter`, `LocalStorageAdapter`.
