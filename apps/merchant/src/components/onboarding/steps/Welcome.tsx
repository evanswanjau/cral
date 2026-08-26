import { O } from "../styles.js";
import { PrimaryButton } from "../primitives.js";

const STEPS = [
  { title: "Your details, once", body: "Individual or registered company. Fill it in once and it covers every vehicle you ever add." },
  { title: "Papers in one place", body: "Photos from your phone are fine. Your progress saves as you go, so you can stop and come back." },
  { title: "Approved, then earning", body: "We review your documents, usually within two working days. We let you know the moment your listing is live and taking bookings." },
];

const ASK_URL =
  "https://wa.me/254733376061?text=Hi%20CRAL%20-%20a%20question%20about%20listing";

export function Welcome({ onStart, resuming }: { onStart: () => void; resuming?: boolean }): JSX.Element {
  return (
    <div style={O.twoCol}>
      <div>
        <div style={O.eyebrow}>
          <span style={O.skewRule} />
          <span style={O.eyebrowText}>ONE VEHICLE OR A WHOLE FLEET</span>
        </div>
        <h1 style={O.h1Display}>
          Put your
          <br />
          vehicles to work.
        </h1>
        <p style={O.lede}>
          Weddings, upcountry trips, site visits, safaris - Kenyans book vehicles every day and there
          are never enough. List yours on CRAL, set your own rate and the money lands in your
          designated account after every completed trip.
        </p>

        <div style={O.pillRow}>
          <span style={O.pill}>Free to list</span>
          <span style={O.pill}>No monthly fee</span>
          <span style={O.pill}>You set the rate</span>
          <span style={O.pill}>About 10 minutes</span>
        </div>

        <div style={O.numberedList}>
          {STEPS.map((s, i) => (
            <div key={s.title} style={O.numberedCard}>
              <span style={O.numberedDigit}>{i + 1}</span>
              <div>
                <div style={O.numberedTitle}>{s.title}</div>
                <div style={O.numberedBody}>{s.body}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={O.actionsRow}>
          <PrimaryButton onClick={onStart}>
            <span>{resuming ? "Continue where you left off" : "Start listing"}</span>
          </PrimaryButton>
          <a href={ASK_URL} target="_blank" rel="noopener noreferrer" style={O.secondaryBtn}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: "#0B8A5B" }} />
            Ask us first
          </a>
        </div>
      </div>

      <div style={O.rightCol}>
        <div style={O.darkCard}>
          <div style={O.darkEyebrow}>
            <span style={O.skewRuleDark} />
            <span style={O.darkEyebrowText}>WHAT ONE VEHICLE CAN EARN</span>
          </div>
          <div style={O.kesBig}>
            <span style={O.kesPrefix}>KES</span>
            <span style={O.kesValue}>68,000</span>
            <span style={O.kesSuffix}>a month from one vehicle</span>
          </div>
          <p style={O.darkBody}>
            An SUV at KES 8,500 a day, booked eight days a month. You set the rate and nothing is
            charged while the vehicle sits idle. Our fees are set out in the merchant terms you
            accept before you submit.
          </p>
          <div style={O.darkChipRow}>
            <span style={O.darkChip}>M-PESA PAYOUT</span>
            <span style={O.darkChip}>DEPOSIT HELD</span>
            <span style={O.darkChip}>FLEETS WELCOME</span>
          </div>
        </div>

        <div style={O.panel}>
          <div style={O.panelHead}>Have these ready</div>
          <div style={O.panelBody}>
            <div>
              <div style={O.panelGroupLabel}>FROM YOU · ONCE</div>
              <div style={O.docPillRow}>
                <span style={O.docPill}>National ID</span>
                <span style={O.docPill}>KRA PIN certificate</span>
              </div>
            </div>
            <div>
              <div style={O.panelGroupLabel}>FOR EACH VEHICLE</div>
              <div style={O.docPillRow}>
                <span style={O.docPill}>Logbook</span>
                <span style={O.docPill}>Comprehensive insurance</span>
                <span style={O.docPill}>Tracker certificate</span>
              </div>
            </div>
            <div style={O.panelNote}>
              We review every document before a listing goes live - free and the reason hirers trust
              what they book here.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
