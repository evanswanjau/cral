import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { formatMoney, type CatalogVehicleDetail } from "../../lib/catalog-api.js";
import { HIRING_UNIT_LABEL, quoteTotal, unitRate } from "../../lib/hiring-units.js";
import { earliestPickupDay, earliestReturnDay, formatHireDate, hireDays } from "../../lib/hire-dates.js";
import { routeFromParams, routeToParams } from "../../lib/truck-route.js";
import { TruckRouteFields, truckRouteProblem, type TruckRouteDraft } from "../site/TruckRouteFields.js";
import { fieldInput, fieldLabel } from "./field-styles.js";

/**
 * The right-hand panel on `/trucks/:id` (UI2a), extracted from
 * `CarDetail.tsx`'s date panel rather than growing it. The route comes
 * first: from, to and what the load is (`TruckRouteFields`, same
 * validation, `truckRouteProblem`), then the day. Only a per-day truck
 * asks for an UNTIL; a trip, km, tonne or quoted job is one day as far as
 * the request goes, and the owner's price covers the job.
 *
 * The button reads "Ask for a price" on a quoted truck (C4) and "Request
 * this truck" on a flat-priced one. It goes to `/trucks/:id/request` with
 * the dates and the route in the query (lib/truck-route.ts), where
 * Booking.tsx sends the request as before.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md section 5.4 (A).
 */
export function TruckRequestPanel({ car }: { car: CatalogVehicleDetail }): JSX.Element {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const minDay = earliestPickupDay();
  const isDayUnit = car.hiring_unit === "day";
  const [route, setRoute] = useState<TruckRouteDraft>(() => routeFromParams(params));
  const [day, setDay] = useState(() => {
    const q = params.get("from") ?? "";
    return q && q >= minDay ? q : "";
  });
  const [until, setUntil] = useState(() => {
    const q = params.get("to") ?? "";
    return isDayUnit && q && q >= day ? q : "";
  });
  const [problem, setProblem] = useState<string | null>(null);

  const to = isDayUnit ? until : day;
  const days = hireDays(day, to);
  const total = quoteTotal(car, days);
  const belowMinimum = isDayUnit && days > 0 && days < car.minimum_hire_days;
  const minReturn = earliestReturnDay(day, car.minimum_hire_days) || minDay;
  const guide = car.hiring_unit === "km" || car.hiring_unit === "tonne";

  const send = () => {
    const p =
      truckRouteProblem(route, car.payload_kg) ??
      (!day ? "Pick the day the truck collects the load." : null) ??
      (isDayUnit && !until ? "Pick the last day you need the truck." : null) ??
      (belowMinimum ? `This truck is hired for ${car.minimum_hire_days} days at a time.` : null);
    setProblem(p);
    if (p) return;
    const q = routeToParams(route, new URLSearchParams({ from: day, to }));
    navigate(`/trucks/${car.id}/request?${q}`);
  };

  return (
    <div
      style={{
        flex: "1 1 340px",
        minWidth: 0,
        maxWidth: 460,
        background: "#FFFFFF",
        border: "1.5px solid #0B0F1A",
        borderRadius: 12,
        padding: "clamp(18px,2.4vw,24px)",
        boxShadow: "0 14px 34px rgba(11,15,26,.08)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span
          style={{
            font: "700 clamp(24px,3vw,30px)/1 Archivo,sans-serif",
            fontVariationSettings: "'wdth' 108",
            color: "#0B0F1A",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {car.quoted && !guide ? "By quote" : formatMoney(unitRate(car))}
        </span>
        {!(car.quoted && !guide) && (
          <span style={{ font: "400 15px/1.4 'Instrument Sans',sans-serif", color: "#5A6373" }}>
            per {HIRING_UNIT_LABEL[car.hiring_unit]}
            {guide ? ", a guide" : ""}
          </span>
        )}
      </div>
      <p style={{ margin: "0 0 18px", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
        {car.quoted
          ? `${car.owner.display_name} sees the route and load, then sends one price. Nothing is charged until you accept it.`
          : `${car.owner.display_name} accepts or declines within twelve hours. You pay by M-Pesa once they accept.`}
        {car.minimum_charge ? ` They don't go out for less than ${formatMoney(car.minimum_charge)}.` : ""}
      </p>

      <div style={{ ...fieldLabel, marginBottom: 12, color: "#0B0F1A" }}>
        {car.quoted ? "ASK FOR A PRICE" : "REQUEST THIS TRUCK"}
      </div>
      <TruckRouteFields value={route} onChange={(r) => {
          setRoute(r);
          setProblem(null);
        }} payloadKg={car.payload_kg} />

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 140px", minWidth: 0 }}>
          <span style={fieldLabel}>{isDayUnit ? "FROM" : "DAY"}</span>
          <input
            type="date"
            value={day}
            min={minDay}
            onChange={(e) => {
              setDay(e.target.value);
              setProblem(null);
              const soonest = earliestReturnDay(e.target.value, car.minimum_hire_days);
              if (until && soonest && until < soonest) setUntil(soonest);
            }}
            style={fieldInput}
          />
        </label>
        {isDayUnit && (
          <label style={{ flex: "1 1 140px", minWidth: 0 }}>
            <span style={fieldLabel}>UNTIL</span>
            <input
              type="date"
              value={until}
              min={minReturn}
              onChange={(e) => {
                setUntil(e.target.value);
                setProblem(null);
              }}
              style={fieldInput}
            />
          </label>
        )}
      </div>

      {days > 0 && total !== null && !belowMinimum && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            padding: "13px 0",
            borderTop: "1px solid #F1F3F6",
            borderBottom: "1px solid #F1F3F6",
            marginBottom: 15,
            font: "400 13.5px/1.4 'Instrument Sans',sans-serif",
            color: "#5A6373",
          }}
        >
          <span>{isDayUnit ? `${days} day${days > 1 ? "s" : ""} × ${formatMoney(car.daily_rate)}` : "Flat trip rate"}</span>
          <span style={{ font: "700 15px/1.4 Archivo,sans-serif", color: "#0B0F1A" }}>
            {formatMoney({ amount: total, currency: car.daily_rate.currency })}
          </span>
        </div>
      )}

      {belowMinimum && !problem && (
        <p style={{ margin: "0 0 12px", font: "500 13px/1.5 'Instrument Sans',sans-serif", color: "#A50E22" }}>
          This truck is hired for {car.minimum_hire_days} days at a time. The earliest return for this day is{" "}
          {formatHireDate(minReturn)}.
        </p>
      )}
      {problem && (
        <p role="alert" style={{ margin: "0 0 12px", font: "500 13px/1.5 'Instrument Sans',sans-serif", color: "#A50E22" }}>
          {problem}
        </p>
      )}

      <button
        type="button"
        onClick={send}
        style={{
          width: "100%",
          height: 50,
          background: "#0F23A8",
          color: "#FFFFFF",
          border: "none",
          borderRadius: 8,
          font: "600 16px/1 'Instrument Sans',sans-serif",
          cursor: "pointer",
          marginBottom: 8,
        }}
      >
        {car.quoted ? "Ask for a price" : "Request this truck"}
      </button>
      <p style={{ margin: 0, font: "400 12.5px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" }}>
        Free to send. Nothing is charged until {car.quoted ? "you accept a price" : "the owner accepts"}.
      </p>
    </div>
  );
}
