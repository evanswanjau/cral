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
    <div style={{ border: "1px solid #E4E7EC", borderRadius: 10, padding: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <span style={{ font: "600 13px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>
          Pricing<span style={{ color: "#D81E32" }}> *</span>
        </span>
        <div style={{ display: "inline-flex", gap: 4, background: "#F1F3F6", borderRadius: 999, padding: 3 }}>
          {(
            [
              ["list", "List price"],
              ["net", "What I keep"],
            ] as const
          ).map(([key, label]) => {
            const on = mode === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => pick(key)}
                style={{
                  height: 28,
                  padding: "0 14px",
                  borderRadius: 999,
                  border: "none",
                  background: on ? "#FFFFFF" : "transparent",
                  color: on ? "#0B0F1A" : "#5A6373",
                  font: "600 12px/1 'Instrument Sans',sans-serif",
                  cursor: "pointer",
                  boxShadow: on ? "0 1px 3px rgba(11,15,26,.16)" : "none",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ maxWidth: 280 }}>
        <FormField
          label={mode === "net" ? "Amount you keep, per day" : "Daily rate, per day"}
          error={error ? "Required." : undefined}
          helper={
            mode === "net"
              ? "CRAL's commission is added on top for the price hirers see."
              : "What a hirer pays. You can change it later from your dashboard."
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
      </div>

      {(mode === "net" ? net > 0 : gross > 0) && (
        <div
          style={{
            marginTop: 12,
            display: "flex",
            gap: 20,
            flexWrap: "wrap",
            font: "400 12px/1.4 'Instrument Sans',sans-serif",
            color: "#5A6373",
          }}
        >
          <span>
            Hirer pays <strong style={{ color: "#0B0F1A" }}>KES {fmt(hirerPays)}</strong>
          </span>
          <span>CRAL fee KES {fmt(fee)}</span>
          <span>
            You keep <strong style={{ color: "#0B0F1A" }}>KES {fmt(net)}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
