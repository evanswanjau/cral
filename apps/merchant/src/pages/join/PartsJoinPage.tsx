import { Link } from "react-router-dom";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { MapPin } from "@phosphor-icons/react/dist/ssr/MapPin";
import { DeviceMobile } from "@phosphor-icons/react/dist/ssr/DeviceMobile";
import { ListChecks } from "@phosphor-icons/react/dist/ssr/ListChecks";
import { FileText } from "@phosphor-icons/react/dist/ssr/FileText";
import { usePageTitle } from "../../lib/use-page-title.js";
import { COST_FAQ, PAY_FAQ, type SupplierFaq } from "../../lib/supplier-types.js";
import { Eyebrow, FinalCta, Kicker, LandingShell, StepsSection } from "../../components/landing/LandingShell.js";
import { LandingFaq } from "../../components/landing/LandingFaq.js";
import { IMG } from "../../components/landing/landing-style.js";

/**
 * `/join/parts` (Phase 5 PT2): the supplier page for parts dealers, outside
 * RequireAuth, linked from the customer site's parts EarnBand and the
 * landing's "Now open" strip. It mirrors `GarageJoinPage` (no vehicle, no
 * per-day rate, so no estimator). The CTA is `/create-account?offer=parts`,
 * which pre-selects "Spare parts" in onboarding step 1.
 *
 * Copy holds to how parts work (docs/decisions/parts.md). Merchant
 * surface: no em dashes, never CRAL's fee rate (take-home "after CRAL's
 * service fee" only).
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md sections 4.6 and 5.5. Hero photo is an
 * Unsplash placeholder (public/images/landing/CREDITS.txt).
 */

const SIGN_UP = "/create-account?offer=parts";

const STEPS = [
  {
    title: "A driver asks for a part",
    body: "You see the part, the car (make, model, year, plate and chassis number), what the driver says and where it should go.",
  },
  {
    title: "You quote the part you have",
    body: "Say whether it is genuine, OEM or used, the price, and whether you deliver it or fit it at your premises. Delivery is its own priced line. Each quote shows what you keep after CRAL's service fee.",
  },
  {
    title: "The driver accepts and pays CRAL",
    body: "Get the part ready only once the payment has landed. You see the order in Jobs and orders.",
  },
  {
    title: "Mark it delivered or fitted, get paid",
    body: "Once the driver confirms it's the right part, or 72 hours after you mark it delivered or fitted, your take-home joins your next payout run.",
  },
];

const NEEDS = [
  "Your national ID",
  "Your KRA PIN",
  "The shop's name, address, county and opening hours",
  "Between 2 and 8 photos of the premises",
];

const FAQ: SupplierFaq[] = [
  COST_FAQ,
  {
    q: "Why does CRAL visit my shop?",
    a: "Drivers pay before the part reaches them, so someone from CRAL comes to your premises before you can quote. The visit is recorded with the date and who went.",
  },
  {
    q: "Which requests will I get?",
    a: "Parts requests from drivers in your county. Each one goes to up to 5 dealers, so a clear, honest price wins it.",
  },
  {
    q: "Do I have to deliver?",
    a: "No. Quote it as fitted at your premises, or as delivered with your own delivery price on the quote. CRAL does not send riders.",
  },
  {
    q: "Can I sell used parts?",
    a: "Yes. Say it is used on the quote. Genuine, OEM and used are all welcome, as long as the quote says which it is.",
  },
  {
    q: "What if the driver says it's the wrong part?",
    a: "They report it on the order before confirming, and the payment stays with CRAL while CRAL support speaks to you both. Support then pays you or refunds the driver.",
  },
  PAY_FAQ,
  {
    q: "I run a garage too. Can I do both?",
    a: "Yes. Tick garage services and spare parts when you sign up, then add each premises from your portal. Each one is visited and approved on its own.",
  },
];

export function PartsJoinPage(): JSX.Element {
  usePageTitle("Earn selling spare parts");
  return (
    <LandingShell
      signUpHref={SIGN_UP}
      waMessage="Hi CRAL - I'd like to join as a parts dealer"
      nav={[
        { href: "#how", label: "How it works" },
        { href: "#documents", label: "What you need" },
        { href: "#faq", label: "FAQ" },
      ]}
    >
      <section className="ml-hero">
        <img className="ml-hero-img" src={IMG("join-parts")} alt="" />
        <div className="ml-hero-shade" />
        <div className="ml-wrap ml-hero-content">
          <Eyebrow>FOR PARTS DEALERS</Eyebrow>
          <h1>Drivers send the chassis number. You send the price.</h1>
          <p className="ml-hero-lede">
            Get parts requests from drivers in your county, quote the part you have against their exact car, and get it
            ready once the driver has paid CRAL. You are paid to M-Pesa or your bank after every order.
          </p>
          <div className="ml-cta-row">
            <Link className="ml-btn ml-btn-primary" to={SIGN_UP}>
              Join as a parts dealer
              <ArrowRight size={18} weight="bold" />
            </Link>
          </div>
          <div className="ml-chips">
            <span className="ml-chip">
              <ListChecks size={16} weight="bold" />
              You set every price
            </span>
            <span className="ml-chip">
              <MapPin size={16} weight="bold" />
              Requests from your county
            </span>
            <span className="ml-chip">
              <DeviceMobile size={16} weight="bold" />
              Payouts to M-Pesa or bank
            </span>
          </div>
        </div>
      </section>
      <StepsSection kicker="HOW A PART ORDER WORKS" heading="Paid before it leaves the shelf, paid out when it fits." steps={STEPS} />
      <section id="documents" className="ml-section">
        <div className="ml-wrap ml-docs">
          <div>
            <Kicker>WHAT YOU NEED</Kicker>
            <h2 className="ml-h2">Have these ready.</h2>
            <p className="ml-sub">
              Sign up, then add your shop from the portal. Photos from your phone are fine. You can quote once your
              account is approved and someone from CRAL has visited.
            </p>
          </div>
          <div className="ml-doc-card">
            <ul className="ml-doc-list">
              {NEEDS.map((d) => (
                <li key={d}>
                  <span className="ml-doc-icon">
                    <FileText size={18} weight="regular" />
                  </span>
                  {d}
                </li>
              ))}
            </ul>
            <p className="ml-doc-foot">
              Signing up as a company? You'll also need a certificate of incorporation, the company's KRA PIN and a
              CR12.
            </p>
          </div>
        </div>
      </section>
      <LandingFaq heading="Things parts dealers ask us." items={FAQ} waMessage="Hi CRAL - I have a question about joining as a parts dealer" />
      <FinalCta heading="Ready to move stock off the shelf?" cta="Join as a parts dealer" href={SIGN_UP} />
    </LandingShell>
  );
}
