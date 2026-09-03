import { useState } from "react";
import { O } from "./styles.js";
import { FormField, TextInput } from "./primitives.js";

/**
 * The daily-rate input with a "which number am I typing?" switch (owner's
 * call, 2026-09-04):
 *
 *  - "list"  - the merchant types the price a hirer pays. Unchanged.
 *  - "net"   - the merchant types the amount they want to receive; we
 *              gross it up by the commission rate for the stored/list
 *              price and show what the hirer pays.
 *
 * `daily_rate_amount` on the server is always the gross (list) price -
 * `mode` is only remembered so this field opens the same way next time.
 */

// CRAL's commission on completed bookings. Mirrors
// apps/api/src/lib/booking-pricing.ts#COMMISSION_RATE.
export const COMMISSION_PCT = 10;

const fmt = (n: number): string => (n > 0 ? n.toLocaleString("en-KE") : "-");
const digits = (s: string): number => parseInt(s.replace(/\D/g, ""), 10) || 0;

/** Take-home -> the list price a hirer pays. */
export function grossFromNet(net: number): number {
  return net > 0 ? Math.round(net / (1 - COMMISSION_PCT / 100)) : 0;
}
/** List price -> take-home. */
export function netFromGross(gross: number): number {
  return gross > 0 ? gross - Math.round((gross * COMMISSION_PCT) / 100) : 0;
}

export function RateField({
  grossValue,
  mode,
  onChange,
  error,
}: {
  /** The stored/list price, as a plain shilling string ("8500"). */
  grossValue: string;
  mode: "list" | "net";
  onChange: (grossValue: string, mode: "list" | "net") => void;
  error?: boolean;
}): JSX.Element {
  // In "net" mode the user's typed take-home is tracked locally so rounding
  // on the round-trip through gross doesn't make the field jump.
  const [netText, setNetText] = useState<string>(() =>
    mode === "net" && grossValue ? String(netFromGross(digits(grossValue))) : "",
  );

  const gross = digits(grossValue);
  const net = mode === "net" ? digits(netText) : netFromGross(gross);
  const fee = mode === "net" ? grossFromNet(net) - net : Math.round((gross * COMMISSION_PCT) / 100);
  const hirerPays = mode === "net" ? grossFromNet(net) : gross;

  function pick(next: "list" | "net"): void {
    if (next === mode) return;
    if (next === "net") setNetText(gross ? String(netFromGross(gross)) : "");
    // Gross value stays the same across the switch; only the view changes.
    onChange(grossValue, next);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {(
          [
            ["list", "Set the list price"],
            ["net", "Set what I keep"],
          ] as const
        ).map(([key, label]) => {
          const on = mode === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => pick(key)}
              style={{
                height: 32,
                padding: "0 13px",
                borderRadius: 999,
                border: `1px solid ${on ? "#0B0F1A" : "#CDD2DA"}`,
                background: on ? "#0B0F1A" : "#FFFFFF",
                color: on ? "#FFFFFF" : "#333B4A",
                font: "600 12px/1 'Instrument Sans',sans-serif",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <FormField
        label={mode === "net" ? "Amount you keep, per day" : "Daily rate"}
        required
        error={error ? "Required." : undefined}
        helper={
          mode === "net"
            ? "We add CRAL's commission on top for the price hirers see."
            : "What a hirer pays per day. You can change it later from your dashboard."
        }
      >
        <div style={{ display: "flex" }}>
          <span style={O.kesPrefixTag}>KES</span>
          <TextInput
            value={mode === "net" ? netText : grossValue}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, "");
              if (mode === "net") {
                setNetText(raw);
                onChange(String(grossFromNet(digits(raw))), "net");
              } else {
                onChange(raw, "list");
              }
            }}
            placeholder={mode === "net" ? "8,000" : "8,500"}
            inputMode="numeric"
            style={{ borderRadius: "0 8px 8px 0" }}
            error={error}
          />
        </div>
      </FormField>

      {(mode === "net" ? net > 0 : gross > 0) && (
        <div
          style={{
            marginTop: 8,
            padding: "10px 12px",
            background: "#F8F9FB",
            border: "1px solid #E4E7EC",
            borderRadius: 8,
            font: "400 12px/1.6 'Instrument Sans',sans-serif",
            color: "#5A6373",
          }}
        >
          {mode === "net" ? (
            <>
              Hirer pays <strong>KES {fmt(hirerPays)}</strong> - CRAL fee KES {fmt(fee)} - you keep{" "}
              <strong>KES {fmt(net)}</strong>.
            </>
          ) : (
            <>
              You keep <strong>KES {fmt(net)}</strong> after the KES {fmt(fee)} CRAL fee on a
              completed hire.
            </>
          )}
        </div>
      )}
    </div>
  );
}
