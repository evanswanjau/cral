import type { CaseEvent } from "../../../lib/vehicles-api.js";
import { TONE_DOT } from "../status.js";
import { RS } from "./styles.js";

/** The case / file timeline - newest first. */
export function ActivityPanel({ events }: { events: CaseEvent[] }): JSX.Element {
  return (
    <section style={{ ...RS.panel, padding: 18 }}>
      <div style={{ ...RS.kicker, marginBottom: 16 }}>ACTIVITY</div>
      {events.length === 0 && <div style={RS.panelSub}>Nothing yet.</div>}
      {events.map((e, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "14px minmax(0,1fr)", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ width: 9, height: 9, borderRadius: 999, background: TONE_DOT[e.tone], marginTop: 5, flex: "none" }} />
            {i < events.length - 1 && <span style={{ flex: 1, width: 1, background: "#E4E7EC", minHeight: 8 }} />}
          </div>
          <div style={{ paddingBottom: 16 }}>
            <div style={{ font: "600 13px/1.35 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>{e.label}</div>
            {e.body && <div style={{ font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#5A6373", marginTop: 3, whiteSpace: "pre-wrap" }}>{e.body}</div>}
            <div style={{ font: "400 11px/1.3 'IBM Plex Mono',monospace", letterSpacing: ".03em", color: "#838C9B", marginTop: 5 }}>
              {new Date(e.occurred_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).toUpperCase()}
              {e.actor_name ? ` · ${e.actor_name}` : ""}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
