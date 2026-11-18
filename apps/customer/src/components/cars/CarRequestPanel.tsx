import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatMoney, type CatalogVehicleDetail } from "../../lib/catalog-api.js";
import { earliestPickupDay, earliestReturnDay, formatHireDate, hireDays } from "../../lib/hire-dates.js";
import { HIRING_UNIT_LABEL, quoteTotal, unitRate } from "../../lib/hiring-units.js";
import { driverQuote, driversForCar, rateLine } from "../../lib/drivers-api.js";

/**
 * The date panel on `/cars/:id` - FROM, UNTIL, the total, the driver
 * add-on and "Request these dates". Moved unchanged out of
 * `CarDetail.tsx` in UI2a, so a truck can show `TruckRequestPanel` in the
 * same place without the page growing.
 */
export function CarRequestPanel({ car }: { car: CatalogVehicleDetail }): JSX.Element {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Seeded from the search the renter already did, so the dates they
  // picked on the home page are still here when they open a car.
  const minDay = earliestPickupDay();
  const [from, setFrom] = useState(() => {
    const q = params.get("from") ?? "";
    return q && q >= minDay ? q : "";
  });
  const [to, setTo] = useState(() => {
    const qFrom = params.get("from") ?? "";
    const qTo = params.get("to") ?? "";
    return qTo && qFrom >= minDay && qTo >= qFrom ? qTo : "";
  });

  // A self-drive car offers a driver (owner's call, 2026-10-19): the
  // owner's own drivers first, other owners' only when they have none.
  const { data: carDrivers } = useQuery({
    queryKey: ["catalog", "vehicle-drivers", car.id],
    queryFn: () => driversForCar(car.id),
    retry: false,
  });
  const [driverId, setDriverId] = useState(() => params.get("driver") ?? "");

  // Inclusive Nairobi days - the 19th to the 19th is one day, the 19th to
  // the 20th is two. Same function the booking page and the server use.
  const days = hireDays(from, to);
  // Day and trip totals are both knowable from dates alone (see
  // lib/hiring-units.ts#quoteTotal); the server still computes the real one.
  const isDayUnit = car.hiring_unit === "day";
  const carTotal = quoteTotal(car, days);
  const driver = carDrivers?.data.find((d) => d.id === driverId) ?? null;
  // Priced on the car's own unit, so both count the same span.
  // Nobody has a per-km driver rate; on a quoted truck the owner prices the driver into the quote (PR T3).
  const driverTotal =
    driver && car.hiring_unit !== "km" && car.hiring_unit !== "tonne" ? driverQuote(driver, car.hiring_unit, days, 0) : null;
  const total = carTotal === null ? null : driver ? (driverTotal === null ? null : carTotal + driverTotal) : carTotal;
  const driverIsSeparate = carDrivers?.source === "other_owners";
  // The minimum is enforced *here*, where the dates are picked, not left
  // to the booking POST: a renter used to sign up, verify a phone, upload
  // two documents and only then be told the pair was never bookable.
  // Only a day listing carries a minimum; a trip is priced once.
  const minHire = isDayUnit ? car.minimum_hire_days : 1;
  const belowMinimum = isDayUnit && days > 0 && days < minHire;
  const minReturn = earliestReturnDay(from, minHire) || minDay;

  const requestDates = () => {
    if (!from || !to || belowMinimum) return;
    // No sign-in gate here - an unauthenticated visitor signs up inline on
    // the booking page itself as part of sending the request.
    navigate(`/cars/${car.id}/book?from=${from}&to=${to}${driver ? `&driver=${driver.id}` : ""}`);
  };

  return (
    <div
      style={{
        flex: "0 0 348px",
        minWidth: 290,
        position: "sticky",
        top: 82,
        background: "#FFFFFF",
        border: "1.5px solid #0B0F1A",
        borderRadius: 12,
        padding: "clamp(18px,2.4vw,24px)",
        boxShadow: "0 14px 34px rgba(11,15,26,.08)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        <span
          style={{
            font: "700 clamp(26px,3.2vw,32px)/1 Archivo,sans-serif",
            fontVariationSettings: "'wdth' 108",
            color: "#0B0F1A",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatMoney(unitRate(car))}
        </span>
        <span style={{ font: "400 15px/1.4 'Instrument Sans',sans-serif", color: "#5A6373" }}>
          per {HIRING_UNIT_LABEL[car.hiring_unit]}
        </span>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 130px", display: "block" }}>
          <span
            style={{
              display: "block",
              font: "600 11px/1 'IBM Plex Mono',monospace",
              letterSpacing: ".08em",
              color: "#838C9B",
              marginBottom: 7,
            }}
          >
            FROM
          </span>
          <input
            type="date"
            value={from}
            min={minDay}
            onChange={(e) => {
              setFrom(e.target.value);
              // Keep the pair coherent: a return before the new
              // pickup, or one inside the car's minimum hire, is
              // never what the renter meant.
              const soonest = earliestReturnDay(e.target.value, minHire);
              if (to && soonest && to < soonest) setTo(soonest);
            }}
            style={{
              width: "100%",
              height: 44,
              padding: "0 11px",
              border: "1px solid #CDD2DA",
              borderRadius: 8,
              font: "500 14px/1 'IBM Plex Mono',monospace",
              color: "#0B0F1A",
              background: "#FFFFFF",
            }}
          />
        </label>
        <label style={{ flex: "1 1 130px", display: "block" }}>
          <span
            style={{
              display: "block",
              font: "600 11px/1 'IBM Plex Mono',monospace",
              letterSpacing: ".08em",
              color: "#838C9B",
              marginBottom: 7,
            }}
          >
            UNTIL
          </span>
          <input
            type="date"
            value={to}
            min={minReturn}
            onChange={(e) => setTo(e.target.value)}
            style={{
              width: "100%",
              height: 44,
              padding: "0 11px",
              border: "1px solid #CDD2DA",
              borderRadius: 8,
              font: "500 14px/1 'IBM Plex Mono',monospace",
              color: "#0B0F1A",
              background: "#FFFFFF",
            }}
          />
        </label>
      </div>

      {days > 0 && total !== null && (
        <div
          style={{
            display: "grid",
            gap: 9,
            padding: "15px 0",
            borderTop: "1px solid #F1F3F6",
            borderBottom: "1px solid #F1F3F6",
            marginBottom: 15,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ font: "400 13.5px/1.4 'Instrument Sans',sans-serif", color: "#5A6373" }}>
              {isDayUnit
                ? `${days} day${days > 1 ? "s" : ""} × ${formatMoney(car.daily_rate)}`
                : "Flat trip rate"}
            </span>
            <span style={{ font: "500 13.5px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>
              {formatMoney({ amount: carTotal ?? 0, currency: car.daily_rate.currency })}
            </span>
          </div>
          {driver && driverTotal !== null && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ font: "400 13.5px/1.4 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                Driver {driver.display_name}
                {driverIsSeparate ? " (booked separately)" : ""}
              </span>
              <span style={{ font: "500 13.5px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>
                {formatMoney({ amount: driverTotal, currency: car.daily_rate.currency })}
              </span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ font: "600 14px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>Total</span>
            <span
              style={{
                font: "700 15px/1.4 Archivo,sans-serif",
                fontVariationSettings: "'wdth' 106",
                color: "#0B0F1A",
              }}
            >
              {formatMoney({ amount: total, currency: car.daily_rate.currency })}
            </span>
          </div>
        </div>
      )}
      {days > 0 && total === null && (
        <div
          style={{
            padding: "13px 0",
            borderTop: "1px solid #F1F3F6",
            borderBottom: "1px solid #F1F3F6",
            marginBottom: 15,
            font: "400 13px/1.5 'Instrument Sans',sans-serif",
            color: "#5A6373",
          }}
        >
          {car.quoted ? (
            <>
              {car.owner.display_name} prices each job once they&apos;ve seen your request
              {car.hiring_unit === "km" || car.hiring_unit === "tonne"
                ? ` - ${formatMoney(unitRate(car))} per ${HIRING_UNIT_LABEL[car.hiring_unit]} is their guide`
                : ""}
              {car.minimum_charge ? `, and they don't go out for less than ${formatMoney(car.minimum_charge)}` : ""}.
              Nothing is charged until you accept the price.
            </>
          ) : (
            <>
              Priced per {HIRING_UNIT_LABEL[car.hiring_unit]} - the exact total is worked out from your pickup and
              return times once you send the request.
            </>
          )}
        </div>
      )}

      {!car.chauffeured && carDrivers && carDrivers.data.length > 0 && (
        <div
          style={{
            marginBottom: 15,
            padding: "13px 14px",
            background: "#F4F6FE",
            border: "1px solid #DCE1FA",
            borderRadius: 10,
          }}
        >
          <div style={{ font: "600 14px/1.35 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 3 }}>
            Don't want to drive? Book a driver.
          </div>
          <div style={{ font: "400 12.5px/1.5 'Instrument Sans',sans-serif", color: "#5A6373", marginBottom: 9 }}>
            {driverIsSeparate
              ? `${car.owner.display_name} has no drivers of their own. These are checked drivers from other owners - booked and paid as a separate request.`
              : `Checked drivers from ${car.owner.display_name}, added to this booking.`}
          </div>
          <select
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            style={{
              width: "100%",
              height: 44,
              padding: "0 11px",
              border: "1px solid #CDD2DA",
              borderRadius: 8,
              font: "400 14px/1 'Instrument Sans',sans-serif",
              color: "#0B0F1A",
              background: "#FFFFFF",
            }}
          >
            <option value="">No driver - I'll drive myself</option>
            {carDrivers.data.map((d) => (
              <option key={d.id} value={d.id}>
                {d.display_name} · {rateLine(d)}
              </option>
            ))}
          </select>
          {driver && days > 0 && driverTotal === null && (
            <div style={{ marginTop: 7, font: "400 12.5px/1.5 'Instrument Sans',sans-serif", color: "#8A5200" }}>
              {driver.display_name} doesn't offer a per-{car.hiring_unit} rate. Pick another driver, or go without.
            </div>
          )}
        </div>
      )}

      {belowMinimum && (
        <div
          style={{
            marginBottom: 12,
            padding: "11px 13px",
            background: "#FDE7EA",
            border: "1px solid #F7BDC5",
            borderRadius: 8,
            font: "500 13px/1.5 'Instrument Sans',sans-serif",
            color: "#A50E22",
          }}
        >
          This car is hired for {minHire} days at a time. The earliest return for this pickup
          is {formatHireDate(minReturn)}.
        </div>
      )}

      <button
        type="button"
        disabled={!from || !to || belowMinimum}
        onClick={requestDates}
        style={{
          width: "100%",
          height: 50,
          background: from && to && !belowMinimum ? "#0F23A8" : "#CDD2DA",
          color: "#FFFFFF",
          border: "none",
          borderRadius: 8,
          font: "600 16px/1 'Instrument Sans',sans-serif",
          cursor: from && to && !belowMinimum ? "pointer" : "not-allowed",
          marginBottom: 11,
        }}
      >
        {driver ? "Request these dates with a driver" : "Request these dates"}
      </button>
    </div>
  );
}
