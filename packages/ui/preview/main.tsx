import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Button, PlatedReference, StatusBadge, type StatusTone } from "../src/index.js";

const tones: { tone: StatusTone; label: string }[] = [
  { tone: "pending", label: "Pending review" },
  { tone: "review", label: "Under review" },
  { tone: "verified", label: "Verified" },
  { tone: "rejected", label: "Rejected" },
  { tone: "boosted", label: "Boosted" },
];

function Preview() {
  return (
    <div style={{ fontFamily: '"Instrument Sans", sans-serif', padding: 32, display: "grid", gap: 32, maxWidth: 640 }}>
      <h1 style={{ fontFamily: '"Archivo", sans-serif' }}>@cral/ui — component preview</h1>

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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Button variant="primary">Approve listing</Button>
          <Button variant="secondary">Request documents</Button>
          <Button variant="ghost">View audit trail</Button>
          <Button variant="danger">Reject</Button>
          <Button variant="boost">★ Boost listing</Button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
          <Button size="lg">Book now</Button>
          <Button size="md">Book now</Button>
          <Button size="sm">Book</Button>
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
