import { O } from "../styles.js";
import { BackButton, PrimaryButton } from "../primitives.js";

/**
 * Step 3 for a merchant who only offers driving. There's no vehicle to
 * add here: drivers (the merchant included) are added from the portal at
 * `/drivers/new`, which is where submitting lands them.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md section 4.6.
 */
export function Drivers({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }): JSX.Element {
  return (
    <div style={O.wDocuments}>
      <div style={O.stepEyebrow}>STEP 3 OF 5</div>
      <h1 style={O.h1Step}>Your drivers</h1>
      <p style={{ ...O.stepLede, marginBottom: 20 }}>
        You add yourself, or the drivers who work for you, straight after you submit. It takes a few
        minutes per driver, and you can add more at any time.
      </p>

      <div style={O.panel}>
        <div style={O.panelHead}>Each driver needs</div>
        <div style={O.panelBody}>
          <div style={O.docPillRow}>
            <span style={O.docPill}>Driving licence, current</span>
            <span style={O.docPill}>National ID</span>
            <span style={O.docPill}>KRA PIN</span>
          </div>
          <div style={O.panelNote}>
            Hirers see a driver&rsquo;s name, never the ID, KRA PIN, licence number or phone. We check
            every driver&rsquo;s papers before they can be booked.
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
