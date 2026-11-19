import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { endAssist, fetchAssistInfo, isAssistSession } from "../../lib/assist.js";
import { setSession } from "../../lib/auth.js";

/**
 * Assist sessions (Phase 3, PR AG3) on the onboarding page.
 *
 * For the agent: "You are filling this in for Jane Wanjiru", when it ends,
 * and Exit. For the owner: who is filling it in right now, with End agent
 * access, or who helped before. Built from the onboarding page's own
 * tokens (`styles.ts` values); no canvas has this banner.
 */
export function AssistBanner({ ownerName }: { ownerName: string }): JSX.Element | null {
  const assist = isAssistSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const info = useQuery({ queryKey: ["onboarding", "assist-info"], queryFn: fetchAssistInfo });

  async function exit() {
    setBusy(true);
    try {
      await endAssist();
    } catch {
      // Ended or expired already: leaving is still right.
    }
    setSession(null);
    navigate("/assist?ended=1", { replace: true });
  }

  async function endForOwner() {
    setBusy(true);
    try {
      await endAssist();
      await queryClient.invalidateQueries({ queryKey: ["onboarding", "assist-info"] });
    } finally {
      setBusy(false);
    }
  }

  if (assist) {
    const until = info.data?.assist?.expires_at;
    return (
      <div style={B.bar} role="status">
        <span style={B.dot} />
        <span style={{ flex: "1 1 240px" }}>
          You are filling this in for <strong>{ownerName || "the owner"}</strong>.
          {until && <> Your access ends at {timeOf(until)}.</>} The owner adds the payout details,
          accepts the terms and sends it for review.
        </span>
        <button type="button" style={B.btn} disabled={busy} onClick={() => void exit()}>
          {busy ? "Ending…" : "Exit"}
        </button>
      </div>
    );
  }

  const live = info.data?.assists.find((a) => a.active);
  if (live) {
    return (
      <div style={B.bar} role="status">
        <span style={B.dot} />
        <span style={{ flex: "1 1 240px" }}>
          <strong>{live.agent_name}</strong> from CRAL is filling this in with you. They can&rsquo;t send it
          for review or change your phone or payout details.
        </span>
        <button type="button" style={B.btn} disabled={busy} onClick={() => void endForOwner()}>
          {busy ? "Ending…" : "End agent access"}
        </button>
      </div>
    );
  }

  const past = info.data?.assists[0];
  if (past) {
    return (
      <div style={{ ...B.bar, ...B.quiet }}>
        {past.agent_name} from CRAL helped fill this in on {dayOf(past.started_at)}. Check it all before you
        send it for review.
      </div>
    );
  }
  return null;
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });
}

function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" });
}

const B = {
  bar: {
    display: "flex",
    alignItems: "center",
    gap: "10px 14px",
    flexWrap: "wrap",
    maxWidth: 1120,
    margin: "0 auto 20px",
    padding: "12px 16px",
    background: "#DCE1FA",
    border: "1px solid #B6C0F4",
    borderRadius: 8,
    font: "400 13px/1.5 'Instrument Sans',sans-serif",
    color: "#0B0F1A",
  },
  quiet: { background: "#F8F9FB", border: "1px solid #E4E7EC", color: "#5A6373" },
  dot: { width: 8, height: 8, borderRadius: 999, background: "#0F23A8", flex: "none" },
  btn: {
    height: 36,
    padding: "0 14px",
    background: "#FFFFFF",
    color: "#0B0F1A",
    border: "1px solid #B6C0F4",
    borderRadius: 6,
    font: "600 13px/1 'Instrument Sans',sans-serif",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
} satisfies Record<string, CSSProperties>;
