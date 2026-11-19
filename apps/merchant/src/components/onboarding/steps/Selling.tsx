import { O } from "../styles.js";
import { BackButton, PrimaryButton } from "../primitives.js";

/**
 * Step 3 for a merchant who only sells cars (Phase 6 CS1). There's no
 * vehicle to add here: each car is a sale listing added in the portal at
 * `/sales/new`, which is where submitting lands them, the same way the
 * premises step works.
 *
 * Not from a canvas; built from tokens.ts and docs/decisions/car-sales.md.
 */
export function Selling({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }): JSX.Element {
  return (
    <div style={O.wDocuments}>
      <div style={O.stepEyebrow}>STEP 3 OF 5</div>
      <h1 style={O.h1Step}>Cars for sale</h1>
      <p style={{ ...O.stepLede, marginBottom: 20 }}>
        You list each car straight after you submit. It takes a few minutes per car. Listing is free.
      </p>

      <div style={O.panel}>
        <div style={O.panelHead}>For each car</div>
        <div style={O.panelBody}>
          <div style={O.docPillRow}>
            <span style={O.docPill}>Make, model and year</span>
            <span style={O.docPill}>Mileage</span>
            <span style={O.docPill}>Asking price</span>
            <span style={O.docPill}>Logbook</span>
            <span style={O.docPill}>4 or more photos</span>
          </div>
          <div style={O.panelNote}>
            CRAL checks each listing against its logbook before buyers see it. You and the buyer agree the price and pay
            each other directly.
          </div>
        </div>
      </div>

      <p style={{ ...O.helper, margin: "14px 0 20px" }}>
        Have a vehicle to hire out as well? Go back to step 1 and pick it.
      </p>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <BackButton onClick={onBack}>← Back</BackButton>
        <PrimaryButton onClick={onContinue}>Continue to documents</PrimaryButton>
      </div>
    </div>
  );
}
