import { useState } from "react";
import { netFromGross } from "@cral/types";
import { SUPPLIERS, SUPPLIER_TYPES, unitAt, type SupplierType } from "../../lib/supplier-types.js";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { C, formatKes, SANS } from "./landing-style.js";
import { Kicker } from "./LandingShell.js";

/**
 * Rough monthly take-home for one supplier type, in that type's units.
 *
 * The figure is "after CRAL's service fee", computed by `netFromGross`
 * (which applies `COMMISSION_RATE` from `@cral/types`). The rate itself is
 * never printed: merchants see it only in the merchant terms (owner's
 * global rule, 2026-09-23).
 *
 * With `switchable`, a row of buttons picks the supplier type (the `/`
 * page); without it, the estimator is fixed to `type` (`/join/:type`).
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md section 4.6.
 */
export function Estimator({ type: initialType, switchable = false }: { type: SupplierType; switchable?: boolean }): JSX.Element {
  const [type, setType] = useState<SupplierType>(initialType);
  const supplier = SUPPLIERS[type];
  const [unitIndex, setUnitIndex] = useState(0);
  const unit = unitAt(supplier, unitIndex);
  const [rate, setRate] = useState(String(unit.exampleRate));
  const [qty, setQty] = useState(unit.qtyDefault);

  function pick(nextType: SupplierType, nextUnit: number) {
    const u = unitAt(SUPPLIERS[nextType], nextUnit);
    setType(nextType);
    setUnitIndex(nextUnit);
    setRate(String(u.exampleRate));
    setQty(u.qtyDefault);
  }

  const parsedRate = Number(rate);
  const valid = Number.isFinite(parsedRate) && parsedRate > 0;
  const gross = valid ? parsedRate * qty : 0;
  const net = netFromGross(gross);

  return (
    <div className="ml-calc">
      {switchable && (
        <div className="ml-calc-tabs" role="group" aria-label="What you offer">
          {SUPPLIER_TYPES.map((t) => (
            <button key={t} type="button" className="ml-calc-tab" aria-pressed={t === type} onClick={() => pick(t, 0)}>
              {SUPPLIERS[t].label}
            </button>
          ))}
        </div>
      )}
      {supplier.units.length > 1 && (
        <div className="ml-calc-tabs" role="group" aria-label="How you charge">
          {supplier.units.map((u, i) => (
            <button
              key={u.unit}
              type="button"
              className="ml-calc-tab"
              aria-pressed={u.unit === unit.unit}
              onClick={() => pick(type, i)}
            >
              Per {u.unit}
            </button>
          ))}
        </div>
      )}
      <label style={{ display: "block" }}>
        <span className="ml-label">YOUR RATE PER {unit.unit.toUpperCase()} (KES)</span>
        <input
          className="ml-input"
          type="number"
          min={0}
          inputMode="numeric"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
        />
      </label>
      <label style={{ display: "block", marginTop: 18 }}>
        <span className="ml-label" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{unit.qtyLabel}</span>
          <span style={{ color: "#FFFFFF" }}>{qty.toLocaleString("en-KE")}</span>
        </span>
        <input
          className="ml-range"
          type="range"
          min={unit.qtyMin}
          max={unit.qtyMax}
          step={unit.qtyStep}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
        />
      </label>
      <div className="ml-calc-out" aria-live="polite">
        <div className="ml-label">YOU TAKE HOME, A MONTH, AFTER CRAL'S SERVICE FEE</div>
        <div className="ml-calc-big">{formatKes(net)}</div>
        <div style={{ marginTop: 10, font: `400 14px/1.4 ${SANS}`, color: "#A7B0BE" }}>
          Hirers pay {formatKes(gross)} for {qty.toLocaleString("en-KE")} {qty === 1 ? unit.unit : unit.plural}
        </div>
        <p className="ml-calc-note">
          An estimate, not a quote. Real work depends on demand for your {supplier.estimatorSubject}, your
          county and your dates. The {formatKes(unit.exampleRate)} rate is only an example; you set your
          own. {unit.note ? `${unit.note} ` : ""}The service fee is set out in the merchant terms.
        </p>
      </div>
    </div>
  );
}

/** The "What could you take home?" section: points on the left, estimator on the right. */
export function EarningsSection({
  type,
  switchable = false,
  heading = "What could you take home?",
}: {
  type: SupplierType;
  switchable?: boolean;
  heading?: string;
}): JSX.Element {
  return (
    <section id="earnings" className="ml-section">
      <div className="ml-wrap ml-earn">
        <div>
          <Kicker>ROUGH EARNINGS ESTIMATE</Kicker>
          <h2 className="ml-h2">{heading}</h2>
          <p className="ml-sub">
            Enter the rate you'd charge and how much work you expect in a month. The figure is what
            reaches you after CRAL's service fee.
          </p>
          <ul className="ml-earn-points">
            {[
              "No sign-up fee and no monthly subscription",
              "Nothing is charged while you're not working",
              "You decide which requests to accept",
            ].map((t) => (
              <li key={t}>
                <CheckCircle size={24} weight="fill" color={C.verified} style={{ flex: "none" }} />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <Estimator type={type} switchable={switchable} />
      </div>
    </section>
  );
}
