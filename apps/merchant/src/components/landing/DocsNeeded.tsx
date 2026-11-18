import { FileText } from "@phosphor-icons/react/dist/ssr/FileText";
import type { SupplierInfo } from "../../lib/supplier-types.js";
import { Kicker } from "./LandingShell.js";

/**
 * "Have these ready": the documents one supplier type needs before review.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md section 4.6.
 */
export function DocsNeeded({ supplier }: { supplier: SupplierInfo }): JSX.Element {
  return (
    <section id="documents" className="ml-section">
      <div className="ml-wrap ml-docs">
        <div>
          <Kicker>WHAT YOU NEED</Kicker>
          <h2 className="ml-h2">Have these ready.</h2>
          <p className="ml-sub">{supplier.docsIntro}</p>
        </div>
        <div className="ml-doc-card">
          <ul className="ml-doc-list">
            {supplier.docs.map((d) => (
              <li key={d}>
                <span className="ml-doc-icon">
                  <FileText size={18} weight="regular" />
                </span>
                {d}
              </li>
            ))}
          </ul>
          <p className="ml-doc-foot">{supplier.docsFoot}</p>
        </div>
      </div>
    </section>
  );
}
