import { Link } from "react-router-dom";
import type { Icon } from "@phosphor-icons/react";
import { Car } from "@phosphor-icons/react/dist/ssr/Car";
import { Truck } from "@phosphor-icons/react/dist/ssr/Truck";
import { Tractor } from "@phosphor-icons/react/dist/ssr/Tractor";
import { SteeringWheel } from "@phosphor-icons/react/dist/ssr/SteeringWheel";
import { CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { SUPPLIERS, SUPPLIER_TYPES, type SupplierType } from "../../lib/supplier-types.js";
import { IMG } from "./landing-style.js";

export const SUPPLIER_ICONS: Record<SupplierType, Icon> = {
  cars: Car,
  trucks: Truck,
  machinery: Tractor,
  drivers: SteeringWheel,
};

/**
 * "What do you offer?": one door per supplier type, each to its
 * `/join/<type>` page. Photo cards 2x2 on desktop, plain rows at 375px.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md sections 4.6 and 5.5.
 */
export function SupplierDoors(): JSX.Element {
  return (
    <div id="suppliers">
      <div className="ml-doors-label">WHAT DO YOU OFFER?</div>
      <div className="ml-doors">
        {SUPPLIER_TYPES.map((t) => {
          const s = SUPPLIERS[t];
          const DoorIcon = SUPPLIER_ICONS[t];
          return (
            <Link key={t} to={`/join/${t}`} className="ml-door">
              <img src={IMG(s.doorPhoto)} alt="" loading="lazy" />
              <span className="ml-door-shade" />
              <span className="ml-door-body">
                <span className="ml-door-icon">
                  <DoorIcon size={21} weight="regular" />
                </span>
                <span style={{ display: "block", flex: 1, minWidth: 0 }}>
                  <span className="ml-door-title">
                    {s.label}
                    <CaretRight size={16} weight="bold" />
                  </span>
                  <span className="ml-door-line">{s.doorLine}</span>
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
