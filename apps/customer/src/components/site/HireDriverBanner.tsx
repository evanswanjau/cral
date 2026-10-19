import { useNavigate } from "react-router-dom";

/**
 * The "book a driver" call to action (owner's call, 2026-10-19 -
 * docs/plans/drivers.md), shared by Home, Browse and the empty Trips page so
 * the offer reads the same everywhere. Built from confirmed tokens - no
 * canvas exists for drivers.
 */
export function HireDriverBanner({ compact = false }: { compact?: boolean }): JSX.Element {
  const navigate = useNavigate();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        flexWrap: "wrap",
        background: "#F4F6FE",
        border: "1px solid #DCE1FA",
        borderRadius: 12,
        padding: compact ? "14px 16px" : "16px 20px",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ font: "600 15px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 3 }}>
          Need a driver?
        </div>
        <p style={{ margin: 0, font: "400 13.5px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
          Hire a checked driver for your own car, or add one to a self-drive car when you book it.
        </p>
      </div>
      <button
        type="button"
        onClick={() => navigate("/drivers")}
        style={{
          height: 44,
          padding: "0 18px",
          background: "#0F23A8",
          color: "#FFFFFF",
          border: "none",
          borderRadius: 8,
          font: "600 14px/1 'Instrument Sans',sans-serif",
          cursor: "pointer",
          flex: "none",
        }}
      >
        Hire a driver →
      </button>
    </div>
  );
}
