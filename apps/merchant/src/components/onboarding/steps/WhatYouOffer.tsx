import { useState, type CSSProperties } from "react";
import { netFromGross } from "@cral/types";
import { CheckSquare } from "@phosphor-icons/react/dist/ssr/CheckSquare";
import { Square } from "@phosphor-icons/react/dist/ssr/Square";
import { Gear } from "@phosphor-icons/react/dist/ssr/Gear";
import { Wrench } from "@phosphor-icons/react/dist/ssr/Wrench";
import { O } from "../styles.js";
import { PrimaryButton } from "../primitives.js";
import { whatsappLink } from "../../../lib/support.js";
import { COMING_SUPPLIERS, SUPPLIERS, type SupplierType } from "../../../lib/supplier-types.js";
import { SUPPLIER_ICONS } from "../../landing/SupplierDoors.js";
import { OFFER_ORDER, isPremisesOffer, type Offer } from "../../../lib/onboarding-offer.js";

/**
 * Onboarding step 1, "What do you offer?". Replaces the old Welcome step
 * and keeps its useful parts (free to list, about 10 minutes, ask us
 * first, an earnings example, what to have ready), now in the units of
 * what the merchant picks.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md sections 4.6 and 5.6.
 */

const OPTION_COPY: Record<Offer, { title: string; body: string }> = {
  cars: { title: "Cars and vans", body: "Self-drive or with your driver" },
  trucks: { title: "Trucks", body: "By trip, day, km or tonne, or quote each job" },
  machinery: { title: "Machinery", body: "Excavators, loaders, rollers and other plant" },
  drivers: { title: "Driving", body: "You, or drivers who work for you" },
  garage: { title: "Garage services", body: "Servicing and repairs at your own premises" },
  parts: { title: "Spare parts", body: "Parts from your own shop, delivered or fitted" },
};

const OFFER_ICONS = { ...SUPPLIER_ICONS, garage: Wrench, parts: Gear };

/** Not open to join yet (garages left this list in GS4, parts dealers in PT2). */
const STILL_COMING: readonly string[] = COMING_SUPPLIERS;

const ASK_URL = whatsappLink("Hi CRAL, a question about joining");

const fmt = (n: number): string => n.toLocaleString("en-KE");

export function WhatYouOffer({
  offers,
  locked,
  resuming,
  onChange,
  onContinue,
}: {
  offers: Offer[];
  /** Offers with a vehicle already added; they stay ticked. */
  locked: Set<Offer>;
  resuming: boolean;
  onChange: (offers: Offer[]) => void;
  onContinue: () => void;
}): JSX.Element {
  const [showError, setShowError] = useState(false);

  function toggle(o: Offer) {
    if (locked.has(o)) return;
    setShowError(false);
    onChange(offers.includes(o) ? offers.filter((x) => x !== o) : [...offers, o]);
  }

  function handleContinue() {
    if (offers.length === 0) {
      setShowError(true);
      return;
    }
    onContinue();
  }

  return (
    <div style={O.twoCol}>
      <div>
        <div style={O.stepEyebrow}>STEP 1 OF 5 · WHAT YOU OFFER</div>
        <h1 style={O.h1Step}>What will you offer on CRAL?</h1>
        <p style={O.stepLede}>Pick all that apply. You can add more later.</p>

        <div role="group" aria-label="What you offer" style={S.list}>
          {OFFER_ORDER.map((t) => {
            const on = offers.includes(t);
            const isLocked = locked.has(t);
            const Icon = OFFER_ICONS[t];
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                aria-disabled={isLocked || undefined}
                onClick={() => toggle(t)}
                style={{ ...S.option, ...(on ? S.optionOn : {}), cursor: isLocked ? "default" : "pointer" }}
              >
                <span style={S.mark}>
                  {on ? <CheckSquare size={22} weight="fill" color="#0F23A8" /> : <Square size={22} color="#A7AEBB" />}
                </span>
                <span style={S.icon}>
                  <Icon size={22} weight={on ? "fill" : "regular"} color={on ? "#0F23A8" : "#5A6373"} />
                </span>
                <span style={{ flex: "1 1 0%", minWidth: 0 }}>
                  <span style={S.title}>{OPTION_COPY[t].title}</span>
                  <span style={S.body}>{OPTION_COPY[t].body}</span>
                  {isLocked && <span style={S.lockNote}>ADDED IN STEP 3</span>}
                </span>
              </button>
            );
          })}
        </div>

        <div style={S.coming}>
          <div style={O.panelGroupLabel}>COMING TO CRAL</div>
          <p style={S.comingBody}>
            Not open to join yet. Each one appears here when it opens.
          </p>
          <div style={O.docPillRow}>
            {STILL_COMING.map((c) => (
              <span key={c} style={{ ...O.docPill, color: "#838C9B" }}>{c}</span>
            ))}
          </div>
        </div>

        {showError && <div style={O.fieldError}>Pick at least one to continue.</div>}

        <div style={{ ...O.actionsRow, marginTop: 20 }}>
          <PrimaryButton onClick={handleContinue}>
            <span>{resuming ? "Continue where you left off" : "Continue"}</span>
          </PrimaryButton>
          <a href={ASK_URL} target="_blank" rel="noopener noreferrer" style={O.secondaryBtn}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: "#0B8A5B" }} />
            Ask us first
          </a>
        </div>

        <div style={{ ...O.pillRow, marginTop: 20 }}>
          <span style={O.pill}>Free to join</span>
          <span style={O.pill}>No monthly fee</span>
          <span style={O.pill}>You set the rate</span>
          <span style={O.pill}>About 10 minutes</span>
        </div>
      </div>

      <div style={O.rightCol}>
        {(() => {
          const first = offers.find((o): o is SupplierType => !isPremisesOffer(o));
          return first || offers.length === 0 ? <EarningsExample offer={first ?? "cars"} /> : <GarageExample />;
        })()}
        <HaveReady offers={offers} />
      </div>
    </div>
  );
}

/** One worked example in the first picked offer's own unit, as take-home after CRAL's service fee. */
function EarningsExample({ offer }: { offer: SupplierType }): JSX.Element {
  const supplier = SUPPLIERS[offer];
  const unit = supplier.units[0];
  const gross = unit.exampleRate * unit.qtyDefault;
  const net = netFromGross(gross);
  const subject = offer === "drivers" ? "a driver" : `one ${supplier.estimatorSubject}`;
  return (
    <div style={O.darkCard}>
      <div style={O.darkEyebrow}>
        <span style={O.skewRuleDark} />
        <span style={O.darkEyebrowText}>WHAT {subject.toUpperCase()} CAN EARN</span>
      </div>
      <div style={O.kesBig}>
        <span style={O.kesPrefix}>KES</span>
        <span style={O.kesValue}>{fmt(net)}</span>
        <span style={O.kesSuffix}>a month, after CRAL&rsquo;s service fee</span>
      </div>
      <p style={O.darkBody}>
        At KES {fmt(unit.exampleRate)} a {unit.unit}, {unit.qtyDefault} {unit.plural} a month. You set
        the rate, and nothing is charged while you&rsquo;re not working. Our fees are set out in the
        merchant terms you accept before you submit.
      </p>
      <div style={O.darkChipRow}>
        <span style={O.darkChip}>M-PESA OR BANK PAYOUT</span>
        <span style={O.darkChip}>{offer === "drivers" ? "TEAMS WELCOME" : "FLEETS WELCOME"}</span>
      </div>
    </div>
  );
}

/**
 * Garage services alone: jobs are quoted one by one, so there is no honest
 * monthly figure to show. How it works instead.
 */
function GarageExample(): JSX.Element {
  return (
    <div style={O.darkCard}>
      <div style={O.darkEyebrow}>
        <span style={O.skewRuleDark} />
        <span style={O.darkEyebrowText}>HOW GARAGE JOBS AND PARTS ORDERS WORK</span>
      </div>
      <p style={O.darkBody}>
        Customers describe what their car needs, or the part they want for it, and you send an itemised price. They
        pay CRAL when they accept, so the money is there before you start or hand over the part. You&rsquo;re paid
        after they confirm the job is done or that it&rsquo;s the right part, after CRAL&rsquo;s service fee. Someone
        from CRAL visits your premises first.
      </p>
      <div style={O.darkChipRow}>
        <span style={O.darkChip}>M-PESA OR BANK PAYOUT</span>
        <span style={O.darkChip}>YOU SET THE PRICE</span>
      </div>
    </div>
  );
}

function HaveReady({ offers }: { offers: Offer[] }): JSX.Element {
  const vehicleOffers = offers.filter((o) => o !== "drivers" && !isPremisesOffer(o));
  const vehicleLabel =
    vehicleOffers.length === 1 && vehicleOffers[0] === "trucks"
      ? "FOR EACH TRUCK"
      : vehicleOffers.length === 1 && vehicleOffers[0] === "machinery"
        ? "FOR EACH MACHINE"
        : "FOR EACH VEHICLE";
  return (
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
        {offers.some(isPremisesOffer) && (
          <div>
            <div style={O.panelGroupLabel}>
              {offers.includes("garage") ? "FOR EACH GARAGE" : "FOR EACH PARTS SHOP"} · AFTER YOU SUBMIT
            </div>
            <div style={O.docPillRow}>
              <span style={O.docPill}>Address</span>
              <span style={O.docPill}>Opening hours</span>
              <span style={O.docPill}>2 or more photos</span>
            </div>
          </div>
        )}
        {(vehicleOffers.length > 0 || offers.length === 0) && (
          <div>
            <div style={O.panelGroupLabel}>{vehicleLabel}</div>
            <div style={O.docPillRow}>
              <span style={O.docPill}>Logbook</span>
              <span style={O.docPill}>Comprehensive insurance</span>
              <span style={O.docPill}>Tracker certificate</span>
            </div>
          </div>
        )}
        {offers.includes("drivers") && (
          <div>
            <div style={O.panelGroupLabel}>FOR EACH DRIVER · AFTER YOU SUBMIT</div>
            <div style={O.docPillRow}>
              <span style={O.docPill}>Driving licence</span>
              <span style={O.docPill}>National ID</span>
              <span style={O.docPill}>KRA PIN</span>
            </div>
          </div>
        )}
        <div style={O.panelNote}>
          We review every document before you go live. It&rsquo;s free, and it&rsquo;s why hirers
          trust what they book here.
        </div>
      </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  list: { display: "grid", gap: 10, marginTop: 20 },
  option: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    width: "100%",
    minHeight: 56,
    padding: "14px 16px",
    borderRadius: 10,
    border: "1.5px solid #CDD2DA",
    background: "#FFFFFF",
    textAlign: "left",
  },
  optionOn: { border: "1.5px solid #0F23A8", background: "#EDEFFC" },
  mark: { display: "flex", flex: "none", marginTop: 1 },
  icon: { display: "flex", flex: "none", marginTop: 1 },
  title: { display: "block", font: "600 15px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A" },
  body: { display: "block", font: "400 13px/1.4 'Instrument Sans',sans-serif", color: "#5A6373", marginTop: 2 },
  lockNote: {
    display: "block",
    marginTop: 6,
    font: "500 11px/1 'IBM Plex Mono',monospace",
    letterSpacing: ".07em",
    color: "#838C9B",
  },
  coming: { marginTop: 20, paddingTop: 16, borderTop: "1px solid #E4E7EC" },
  comingBody: { margin: "6px 0 10px", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" },
};
