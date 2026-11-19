import { O } from "../styles.js";
import { BackButton, PrimaryButton } from "../primitives.js";

/**
 * Step 3 for a merchant who only offers garage services (Phase 4 GS1).
 * There's no vehicle to add here: premises are added from the portal at
 * `/premises/new`, which is where submitting lands them, the same way the
 * driving-only step works.
 *
 * Not from a canvas; built from tokens.ts and docs/decisions/garage.md.
 */
export function Premises({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }): JSX.Element {
  return (
    <div style={O.wDocuments}>
      <div style={O.stepEyebrow}>STEP 3 OF 5</div>
      <h1 style={O.h1Step}>Your premises</h1>
      <p style={{ ...O.stepLede, marginBottom: 20 }}>
        You add your garage or parts shop straight after you submit. It takes a few minutes, and you can add each branch on its own.
      </p>

      <div style={O.panel}>
        <div style={O.panelHead}>For each garage or parts shop</div>
        <div style={O.panelBody}>
          <div style={O.docPillRow}>
            <span style={O.docPill}>Name on site</span>
            <span style={O.docPill}>Address and county</span>
            <span style={O.docPill}>Opening hours</span>
            <span style={O.docPill}>Services you do</span>
            <span style={O.docPill}>2 or more photos</span>
          </div>
          <div style={O.panelNote}>
            Someone from CRAL visits each one before it can take requests. A garage or parts dealer with no premises does not get
            listed.
          </div>
        </div>
      </div>

      <p style={{ ...O.helper, margin: "14px 0 20px" }}>
        Have a vehicle to list as well? Go back to step 1 and pick it.
      </p>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <BackButton onClick={onBack}>← Back</BackButton>
        <PrimaryButton onClick={onContinue}>Continue to documents</PrimaryButton>
      </div>
    </div>
  );
}
