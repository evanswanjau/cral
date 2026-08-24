/**
 * Shared HTML chrome for every transactional email the API sends.
 *
 * Brand values are pulled from `packages/ui/src/tokens.ts` (the real
 * source — see that file's header) rather than re-guessed here: ink,
 * cruzBlue, cruzRed, the neutral ramp, and the Instrument Sans stack.
 *
 * Loads Instrument Sans from Google Fonts via a <link> in <head>, same
 * family the app uses. This is the one place in the codebase that's
 * allowed to do that: `apps/merchant` self-hosts via `@fontsource*`
 * (see fonts.css) because a failed CDN request there silently falls back
 * to a system font and nobody notices the wrong typeface — but an email
 * can't bundle an npm package, and a client that drops the <link> just
 * falls back to `SANS` below, which is the correct behaviour for mail,
 * not a bug to work around. Gmail and Outlook strip <link> entirely and
 * render the fallback; Apple Mail and most others load Instrument Sans.
 *

 * Table-based layout, inline styles only, no CSS classes — the only way to
 * get consistent rendering across Outlook/Gmail/Apple Mail. Max width
 * 560px, single column. Two brand rules worth keeping straight here (per
 * the design doc, see tokens.ts header):
 *  - the 14° skewed red rule is the signature masthead mark — once per
 *    surface, and this counts as its own surface, so it appears once at
 *    the very top and nowhere else in the email.
 *  - status colour is never used alone; every colored line here is also a
 *    plain-language sentence, not a badge.
 */

const INK = "#0B0F1A";
const CRUZ_BLUE = "#0F23A8";
const CRUZ_RED = "#D81E32";
const PAPER = "#FBF8F2";
const NEUTRAL_50 = "#F8F9FB";
const NEUTRAL_200 = "#E4E7EC";
const NEUTRAL_500 = "#838C9B";
const NEUTRAL_600 = "#5A6373";

const SANS =
  "'Instrument Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";
const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap";

export interface EmailLayoutOptions {
  /** Shown by the client's inbox preview, hidden in the rendered body. */
  preheader: string;
  bodyHtml: string;
}

/** Wraps a content fragment in the shared masthead / card / footer chrome. */
export function emailLayout({ preheader, bodyHtml }: EmailLayoutOptions): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>CRAL</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="${GOOGLE_FONTS_HREF}" rel="stylesheet" />
    <!--[if mso]>
    <style>
      * { font-family: Arial, sans-serif !important; }
    </style>
    <![endif]-->
  </head>
  <body style="margin:0;padding:0;background:${NEUTRAL_50};font-family:${SANS};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${NEUTRAL_50};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid ${NEUTRAL_200};">
            <tr>
              <td style="background:${INK};padding:22px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font:700 17px/1 ${SANS};color:#FFFFFF;letter-spacing:-0.01em;">CRAL</td>
                    <td style="padding-left:12px;">
                      <div style="width:22px;height:3px;background:${CRUZ_RED};transform:skewX(-14deg);"></div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px 8px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 32px;">
                <div style="height:1px;background:${NEUTRAL_200};margin-bottom:20px;"></div>
                <p style="margin:0 0 6px;font:400 12px/1.6 ${SANS};color:${NEUTRAL_500};">
                  © 2026 CRAL · cral.co.ke · Stuck? Call 0733 376 061
                </p>
                <p style="margin:0;font:400 12px/1.6 ${SANS};color:${NEUTRAL_500};">
                  This is an automated message from CRAL's merchant portal.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function emailHeading(text: string): string {
  return `<h1 style="margin:0 0 16px;font:600 22px/1.3 ${SANS};color:${INK};letter-spacing:-0.01em;">${escapeHtml(text)}</h1>`;
}

export function emailParagraph(text: string): string {
  return `<p style="margin:0 0 16px;font:400 15px/1.6 ${SANS};color:${INK};">${text}</p>`;
}

export function emailMuted(text: string): string {
  return `<p style="margin:0 0 16px;font:400 13px/1.6 ${SANS};color:${NEUTRAL_600};">${text}</p>`;
}

/** The large, spaced-out six-digit code display used by every OTP email. */
export function emailCode(code: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
    <tr>
      <td style="background:${PAPER};border:1px solid ${NEUTRAL_200};border-radius:10px;padding:16px 24px;">
        <span style="font:600 30px/1 ${MONO};color:${INK};letter-spacing:0.28em;">${escapeHtml(code)}</span>
      </td>
    </tr>
  </table>`;
}

export function emailButton(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;">
    <tr>
      <td style="background:${CRUZ_BLUE};border-radius:10px;">
        <a href="${escapeHtmlAttr(href)}" style="display:inline-block;padding:13px 26px;font:600 15px/1 ${SANS};color:#FFFFFF;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`;
}

/**
 * A single flagged fact — used for "N recovery codes remain" and similar
 * lines that need a beat of visual weight without reaching for a status
 * colour (this isn't one of the five verification states from tokens.ts).
 */
export function emailNotice(text: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;width:100%;">
    <tr>
      <td style="background:${PAPER};border-left:3px solid ${CRUZ_BLUE};border-radius:6px;padding:12px 16px;font:400 14px/1.6 ${SANS};color:${INK};">${text}</td>
    </tr>
  </table>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtmlAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
