import { useState, type CSSProperties } from "react";
import { CodeInput } from "@cral/ui";
import { confirmAssist, startAssist, type AgentMerchant } from "../../lib/agents-api.js";
import { ApiClientError } from "../../lib/api.js";
import { A } from "./ui.js";

/**
 * "Fill in onboarding" (Phase 3, PR AG3): text the owner a code, the owner
 * reads it out, and the merchant portal opens in a new tab with a 1-hour
 * assist session. The agent can fill in details, vehicles and documents;
 * the owner still sets the payout, accepts the terms and submits.
 *
 * Not from a canvas file - see `./ui.tsx`.
 */
export function AssistPanel({ m, onClose }: { m: AgentMerchant; onClose: () => void }): JSX.Element {
  const [challenge, setChallenge] = useState<{ id: string; to: string } | null>(null);
  const [code, setCode] = useState("");
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const send = () =>
    run(async () => {
      const res = await startAssist(m.id);
      setChallenge({ id: res.challenge_id, to: res.masked_destination });
      setCode("");
    });

  const confirm = () =>
    run(async () => {
      if (!challenge) return;
      const res = await confirmAssist(m.id, challenge.id, code);
      setPortalUrl(res.portal_url);
    });

  return (
    <div style={P.wrap}>
      {portalUrl ? (
        <>
          <p style={P.text}>
            Code accepted. Open onboarding to fill it in with {m.name ?? "the owner"}. Your access ends in an hour, and
            the owner can end it sooner.
          </p>
          <div style={P.row}>
            <a href={portalUrl} target="_blank" rel="noopener noreferrer" style={A.primaryBtn} onClick={onClose}>
              Open onboarding
            </a>
            <button type="button" style={A.secondaryBtn} onClick={onClose}>
              Close
            </button>
          </div>
        </>
      ) : challenge ? (
        <>
          <p style={P.text}>
            We texted a code to the owner&rsquo;s phone ({challenge.to}). Ask them to read it to you. Only take it from
            them in person.
          </p>
          <form
            style={P.row}
            onSubmit={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            <CodeInput label="Owner's code" value={code} onChange={setCode} autoFocus />
            <button type="submit" style={A.primaryBtn} disabled={busy || code.length !== 6}>
              {busy ? "Checking…" : "Start"}
            </button>
            <button type="button" style={A.secondaryBtn} disabled={busy} onClick={() => void send()}>
              Send a new code
            </button>
          </form>
        </>
      ) : (
        <>
          <p style={P.text}>
            Fill in details, vehicles and documents with the owner beside you. We&rsquo;ll text them a code to read
            out to you; that&rsquo;s their consent. They still add the payout details, accept the terms and send it
            for review themselves.
          </p>
          <div style={P.row}>
            <button type="button" style={A.primaryBtn} disabled={busy} onClick={() => void send()}>
              {busy ? "Sending…" : "Text the owner a code"}
            </button>
            <button type="button" style={A.secondaryBtn} onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      )}
      {error && <p style={A.errorText}>{error}</p>}
    </div>
  );
}

const P = {
  wrap: { flexBasis: "100%", padding: "12px 14px", background: "#FAFBFC", border: "1px solid #E4E7EC", borderRadius: "var(--r)" },
  text: { margin: "0 0 10px", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#333B4A" },
  row: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
} satisfies Record<string, CSSProperties>;
