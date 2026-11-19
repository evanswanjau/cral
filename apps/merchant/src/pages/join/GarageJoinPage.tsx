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
 * `/join/garages` (Phase 4 GS4): the supplier page for garages, outside
 * RequireAuth, linked from the customer site's garage EarnBand and the
 * landing's "Now open" strip. It follows `JoinPage` (UI4's `/join/:type`)
 * with the same shell, hero, steps, "what you need" and FAQ, but is its
 * own page: a garage has no vehicle, no per-day rate and so no estimator.
 * The CTA is `/create-account?offer=garage`, which pre-selects "Garage
 * services" in onboarding step 1.
 *
 * Copy holds to how garage jobs work (docs/decisions/garage.md). Merchant
 * surface: no em dashes, never CRAL's fee rate (take-home "after CRAL's
 * service fee" only).
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md sections 4.6 and 5.5. Hero photo is an
 * Unsplash placeholder (public/images/landing/CREDITS.txt).
 */

const SIGN_UP = "/create-account?offer=garage";

const STEPS = [
  {
    title: "A driver asks for a price",
    body: "You see the car (make, model, year, plate and chassis number), the kind of work and what the driver says is wrong.",
  },
  {
    title: "You send an itemised quote",
    body: "Parts, labour and anything else, line by line, and how many days the work takes. Each quote shows what you keep after CRAL's service fee.",
  },
  {
    title: "The driver accepts and pays CRAL",
    body: "Start only once the payment has landed. Found more to do? Send a second quote; nothing is added without the driver's yes.",
  },
  {
    title: "Mark the car ready, get paid",
    body: "Once the driver confirms the job, or 72 hours after you mark it ready, your take-home joins your next payout run.",
  },
];

const NEEDS = [
  "Your national ID",
  "Your KRA PIN",
  "The garage's name, address, county and opening hours",
  "Between 2 and 8 photos of the premises",
  "The work you do: servicing, diagnostics, mechanical, bodywork, tyres, electrical or air conditioning",
];

const FAQ: SupplierFaq[] = [
  COST_FAQ,
  {
    q: "Why does CRAL visit my garage?",
    a: "Drivers are told every garage on CRAL has been visited, so someone from CRAL comes to your premises before you can quote. The visit is recorded with the date and who went. Nothing is shown to drivers that a visit didn't back.",
  },
  {
    q: "Which requests will I get?",
    a: "Requests from drivers in your county for the work you said you do. Each one goes to up to 5 garages, so a clear, honest price is what wins it.",
  },
  {
    q: "What if I find more work once the car is in?",
    a: "Send a second quote from the job page, line by line. The driver accepts and pays it, or you finish the work first agreed. Nothing is added to a bill without a yes.",
  },
  {
    q: "What if the driver says something is wrong?",
    a: "They raise it on the job before confirming, and the payment stays with CRAL while CRAL support speaks to you both. Support then pays you or refunds the driver.",
  },
  PAY_FAQ,
  {
    q: "Can I add more than one branch?",
    a: "Yes. Add each premises from your portal. Each one is visited and approved on its own.",
  },
];

export function GarageJoinPage(): JSX.Element {
  usePageTitle("Earn with your garage");
  return (
    <LandingShell
      signUpHref={SIGN_UP}
      waMessage="Hi CRAL - I'd like to join as a garage"
      nav={[
        { href: "#how", label: "How it works" },
        { href: "#documents", label: "What you need" },
        { href: "#faq", label: "FAQ" },
      ]}
    >
      <section className="ml-hero">
        <img className="ml-hero-img" src={IMG("join-garages")} alt="" />
        <div className="ml-hero-shade" />
        <div className="ml-wrap ml-hero-content">
          <Eyebrow>FOR GARAGES AND WORKSHOPS</Eyebrow>
          <h1>Drivers ask for a price. You send it line by line.</h1>
          <p className="ml-hero-lede">
            Get service and repair requests from drivers in your county, quote each job your way, and start once
            the driver has paid CRAL. You are paid to M-Pesa or your bank after every job.
          </p>
          <div className="ml-cta-row">
            <Link className="ml-btn ml-btn-primary" to={SIGN_UP}>
              Join as a garage
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
      <StepsSection kicker="HOW A GARAGE JOB WORKS" heading="Paid before you start, paid out when it's done." steps={STEPS} />
      <section id="documents" className="ml-section">
        <div className="ml-wrap ml-docs">
          <div>
            <Kicker>WHAT YOU NEED</Kicker>
            <h2 className="ml-h2">Have these ready.</h2>
            <p className="ml-sub">
              Sign up, then add your premises from the portal. Photos from your phone are fine. Your garage can quote
              once your account is approved and someone from CRAL has visited.
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
      <LandingFaq heading="Things garages ask us." items={FAQ} waMessage="Hi CRAL - I have a question about joining as a garage" />
      <FinalCta heading="Ready to fill your bays?" cta="Join as a garage" href={SIGN_UP} />
    </LandingShell>
  );
}
