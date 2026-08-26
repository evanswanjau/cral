import { useState, type ReactNode } from "react";
import { P } from "./styles.js";

export function Modal({
  title,
  sub,
  width = 520,
  onClose,
  onConfirm,
  ctaLabel,
  ctaBg = "#0F23A8",
  ctaDisabled,
  children,
}: {
  title: string;
  sub?: string;
  width?: number;
  onClose: () => void;
  onConfirm: () => void;
  ctaLabel: string;
  ctaBg?: string;
  ctaDisabled?: boolean;
  children: ReactNode;
}): JSX.Element {
  const [ctaHover, setCtaHover] = useState(false);
  return (
    <div style={P.overlay} onClick={onClose}>
      <div style={{ ...P.modalBox, maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div style={P.modalHead}>
          <div>
            <div style={P.modalTitle}>{title}</div>
            {sub && <div style={P.modalSub}>{sub}</div>}
          </div>
          <button type="button" onClick={onClose} style={P.modalClose}>
            ×
          </button>
        </div>

        <div style={P.modalBody}>{children}</div>

        <div style={P.modalFoot}>
          <button type="button" onClick={onClose} style={P.modalCancel}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={ctaDisabled}
            onMouseEnter={() => setCtaHover(true)}
            onMouseLeave={() => setCtaHover(false)}
            style={{
              ...P.modalCta,
              background: ctaBg,
              cursor: ctaDisabled ? "not-allowed" : "pointer",
              opacity: ctaDisabled ? 0.6 : 1,
              filter: ctaHover && !ctaDisabled ? "brightness(.92)" : "none",
            }}
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
