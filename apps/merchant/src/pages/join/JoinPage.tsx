import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { DeviceMobile } from "@phosphor-icons/react/dist/ssr/DeviceMobile";
import { Tag } from "@phosphor-icons/react/dist/ssr/Tag";
import { usePageTitle } from "../../lib/use-page-title.js";
import { isSupplierType, SUPPLIERS, type SupplierInfo } from "../../lib/supplier-types.js";
import { Eyebrow, FinalCta, LandingShell, StepsSection } from "../../components/landing/LandingShell.js";
import { EarningsSection } from "../../components/landing/Estimator.js";
import { DocsNeeded } from "../../components/landing/DocsNeeded.js";
import { LandingFaq } from "../../components/landing/LandingFaq.js";
import { IMG } from "../../components/landing/landing-style.js";

/**
 * A supplier page at `/join/:type` (cars, trucks, machinery, drivers),
 * outside RequireAuth. Own photo and headline, an estimator in that
 * type's units, what you need, how requests work, FAQ, and a CTA to
 * `/create-account?offer=<type>`. An unknown type goes to `/`.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md sections 4.6 and 5.5. Content lives
 * in `lib/supplier-types.ts`.
 */
export function JoinPage(): JSX.Element {
  const { type } = useParams();
  if (!isSupplierType(type)) return <Navigate to="/" replace />;
  return <SupplierPage key={type} supplier={SUPPLIERS[type]} />;
}

function SupplierPage({ supplier }: { supplier: SupplierInfo }): JSX.Element {
  usePageTitle(supplier.pageTitle);
  const signUp = `/create-account?offer=${supplier.type}`;
  const priceChip = supplier.units.map((u) => `per ${u.unit}`).join(", ");
  return (
    <LandingShell
      signUpHref={signUp}
      waMessage={`Hi CRAL - I'd like to join as a supplier: ${supplier.label.toLowerCase()}`}
      nav={[
        { href: "#earnings", label: "Earnings" },
        { href: "#how", label: "How it works" },
        { href: "#documents", label: "What you need" },
        { href: "#faq", label: "FAQ" },
      ]}
    >
      <section className="ml-hero">
        <img className="ml-hero-img" src={IMG(supplier.photo)} alt="" />
        <div className="ml-hero-shade" />
        <div className="ml-wrap ml-hero-content">
          <Eyebrow>{supplier.kicker}</Eyebrow>
          <h1>{supplier.headline}</h1>
          <p className="ml-hero-lede">{supplier.lede}</p>
          <div className="ml-cta-row">
            <Link className="ml-btn ml-btn-primary" to={signUp}>
              {supplier.cta}
              <ArrowRight size={18} weight="bold" />
            </Link>
          </div>
          <div className="ml-chips">
            <span className="ml-chip">
              <ShieldCheck size={16} weight="bold" color="#57D69E" />
              Checked by a person
            </span>
            <span className="ml-chip">
              <Tag size={16} weight="bold" />
              Charge {priceChip}
            </span>
            <span className="ml-chip">
              <DeviceMobile size={16} weight="bold" />
              Payouts to M-Pesa or bank
            </span>
          </div>
        </div>
      </section>
      <EarningsSection type={supplier.type} />
      <StepsSection kicker="HOW REQUESTS WORK" heading={supplier.requestsHeading} steps={supplier.requests} />
      <DocsNeeded supplier={supplier} />
      <LandingFaq
        heading="Things suppliers ask us."
        items={supplier.faq}
        waMessage={`Hi CRAL - I have a question about joining: ${supplier.label.toLowerCase()}`}
      />
      <FinalCta heading={supplier.finalHeading} cta={supplier.cta} href={signUp} />
    </LandingShell>
  );
}
