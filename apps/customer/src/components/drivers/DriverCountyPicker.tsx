/**
 * The task in the drivers hero (UI3, proposal 4.3 Drivers column): pick a
 * county and the list below narrows to it. Only counties that have a
 * driver taking bookings are offered, so a pick never lands on an empty
 * list. The choice lives in `?county=` so it survives a reload and a
 * shared link.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md section 4.3.
 */
export function DriverCountyPicker({
  counties,
  county,
  onChange,
  total,
}: {
  counties: string[];
  county: string;
  onChange: (county: string) => void;
  /** Drivers shown for the current pick, or null while loading. */
  total: number | null;
}): JSX.Element {
  return (
    <div style={{ background: "#FFFFFF", borderRadius: 12, padding: "18px 18px 16px", boxShadow: "0 12px 32px rgba(11,15,26,.28)" }}>
      <label style={{ display: "block" }}>
        <span style={{ display: "block", marginBottom: 7, font: "600 12px/1 'Instrument Sans',sans-serif", color: "#5A6373" }}>
          Where do you need a driver?
        </span>
        <select
          value={county}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%",
            height: 48,
            padding: "0 12px",
            border: "1px solid #CDD2DA",
            borderRadius: 8,
            background: "#FFFFFF",
            font: "500 15px/1 'Instrument Sans',sans-serif",
            color: "#0B0F1A",
          }}
        >
          <option value="">Any county</option>
          {counties.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <a
        href="#drivers"
        style={{
          marginTop: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 48,
          background: "#0F23A8",
          color: "#FFFFFF",
          borderRadius: 8,
          font: "600 15px/1 'Instrument Sans',sans-serif",
          textDecoration: "none",
        }}
      >
        {total === null ? "See drivers" : total === 1 ? "See 1 driver" : `See ${total} drivers`}
      </a>
      <p style={{ margin: "10px 0 0", font: "400 12.5px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" }}>
        Looking costs nothing. You sign in only to send a request.
      </p>
    </div>
  );
}
