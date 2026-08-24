import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Button, PlatedReference, StatusBadge, type StatusTone } from "../src/index.js";

const tones: { tone: StatusTone; label: string }[] = [
  { tone: "pending", label: "Draft" },
  { tone: "review", label: "Under review" },
  { tone: "success", label: "Live" },
  { tone: "warning", label: "Expiring" },
  { tone: "danger", label: "Rejected" },
];

function Preview() {
  return (
    <div style={{ fontFamily: "sans-serif", padding: 32, display: "grid", gap: 32, maxWidth: 640 }}>
      <h1>@cral/ui — component preview</h1>

      <section>
        <h2>Status badges (five states)</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tones.map((t) => (
            <StatusBadge key={t.tone} tone={t.tone} label={t.label} />
          ))}
        </div>
      </section>

      <section>
        <h2>Plated references</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <PlatedReference value="BK-2301" />
          <PlatedReference value="DS-118" />
          <PlatedReference value="INV-2026-0114" />
          <PlatedReference value="PR-2026-33" />
        </div>
      </section>

      <section>
        <h2>Buttons</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="primary">Primary action</Button>
          <Button variant="secondary">Secondary action</Button>
        </div>
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
