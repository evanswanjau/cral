import { CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { Headset } from "@phosphor-icons/react/dist/ssr/Headset";
import { WhatsappLogo } from "@phosphor-icons/react/dist/ssr/WhatsappLogo";
import type { SupplierFaq } from "../../lib/supplier-types.js";
import { whatsappLink } from "../../lib/support.js";
import { Kicker } from "./LandingShell.js";

/**
 * Question list for the signed-out merchant pages, ending in the one
 * in-page WhatsApp help link.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md section 4.6.
 */
export function LandingFaq({
  heading,
  items,
  waMessage,
}: {
  heading: string;
  items: SupplierFaq[];
  waMessage: string;
}): JSX.Element {
  return (
    <section id="faq" className="ml-section" style={{ paddingTop: 0 }}>
      <div className="ml-wrap" style={{ maxWidth: 860 }}>
        <div className="ml-head">
          <Kicker>QUESTIONS</Kicker>
          <h2 className="ml-h2">{heading}</h2>
        </div>
        <div className="ml-faq">
          {items.map((f) => (
            <details key={f.q}>
              <summary>
                {f.q}
                <CaretDown className="ml-faq-caret" size={18} weight="bold" />
              </summary>
              <p className="ml-faq-a">{f.a}</p>
            </details>
          ))}
        </div>
        <div className="ml-help">
          <div className="ml-help-text">
            <Headset size={28} weight="regular" style={{ flex: "none" }} />
            Still have a question? Our team replies on WhatsApp.
          </div>
          <a className="ml-btn ml-btn-primary ml-btn-sm" href={whatsappLink(waMessage)} target="_blank" rel="noreferrer">
            <WhatsappLogo size={20} weight="fill" />
            Chat with us
          </a>
        </div>
      </div>
    </section>
  );
}
