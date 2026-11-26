import { Link, useSearchParams } from "react-router-dom";
import { Car } from "@phosphor-icons/react/dist/ssr/Car";
import { Truck } from "@phosphor-icons/react/dist/ssr/Truck";
import { Tractor } from "@phosphor-icons/react/dist/ssr/Tractor";
import type { Icon } from "@phosphor-icons/react";
import { color, font } from "@cral/ui";
import type { HireGroup } from "../../lib/vehicle-categories.js";
import { switchHref } from "./hire-params.js";

/**
 * The Cars / Trucks / Machinery switch at the top of every hire listing
 * page (PR H3). Links, not tabs: each is its own URL, so the back button
 * and a shared link land where they should. Full-width segments on a
 * phone, a compact row on a desktop; every segment is 44px tall. The
 * current one is marked by weight, an ink fill and `aria-current`, never
 * by colour alone.
 *
 * Not from a canvas; built from tokens.ts and the H3 wireframes in
 * docs/plans/hire-that-works.md ("The three listing pages").
 */

const ITEMS: Array<{ group: HireGroup; label: string; icon: Icon }> = [
  { group: "cars", label: "Cars", icon: Car },
  { group: "trucks", label: "Trucks", icon: Truck },
  { group: "machinery", label: "Machinery", icon: Tractor },
];

export function HireSwitch({ current }: { current: HireGroup }): JSX.Element {
  const [params] = useSearchParams();
  return (
    <nav aria-label="What to hire" className="cral-hire-switch">
      {ITEMS.map(({ group, label, icon: IconC }) => {
        const on = group === current;
        return (
          <Link
            key={group}
            to={on ? `?${params}` : switchHref(group, current, params)}
            aria-current={on ? "page" : undefined}
            style={{
              flex: "1 1 0",
              minWidth: 0,
              height: 44,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              padding: "0 clamp(8px,2vw,16px)",
              borderRadius: 8,
              background: on ? color.ink : "transparent",
              color: on ? "#FFFFFF" : color.neutral[600],
              font: `${on ? 600 : 500} 14px/1 ${font.sans}`,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            <IconC size={18} weight={on ? "fill" : "regular"} aria-hidden="true" style={{ flex: "none" }} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
