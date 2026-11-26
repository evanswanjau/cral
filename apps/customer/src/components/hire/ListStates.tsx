import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { ArrowClockwise } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import type { Icon } from "@phosphor-icons/react";
import { color, font } from "@cral/ui";

/**
 * The designed states of a hire listing page (PR H3, "States" in
 * docs/plans/hire-that-works.md). Loading is the skeleton grid itself
 * (`VehicleCardSkeletonGrid`), so it isn't here. Each state says what
 * happened and offers the one next step: clear the filters, tell us what
 * you need, or try again with the filters kept.
 *
 * Not from a canvas; built from tokens.ts.
 */

function StateCard({
  icon: IconC,
  title,
  body,
  dashed,
  role,
  children,
}: {
  icon: Icon;
  title: string;
  body: string;
  dashed?: boolean;
  role?: "alert";
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      role={role}
      style={{
        background: "#FFFFFF",
        border: `1px ${dashed ? "dashed" : "solid"} ${dashed ? color.neutral[300] : color.neutral[200]}`,
        borderRadius: 12,
        padding: "40px 20px",
        textAlign: "center",
      }}
    >
      <IconC size={28} aria-hidden="true" color={color.neutral[500]} style={{ marginBottom: 10 }} />
      <div style={{ font: `600 17px/1.3 ${font.sans}`, color: color.ink, marginBottom: 8 }}>{title}</div>
      <p
        style={{
          margin: "0 auto 18px",
          maxWidth: 440,
          font: `400 14px/1.6 ${font.sans}`,
          color: color.neutral[600],
        }}
      >
        {body}
      </p>
      <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

const primaryBtn = {
  height: 44,
  padding: "0 20px",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  background: color.cruzBlue,
  color: "#FFFFFF",
  border: "none",
  borderRadius: 8,
  font: `600 14px/1 ${font.sans}`,
  textDecoration: "none",
  cursor: "pointer",
} as const;

/** Filters are set and nothing matches them. */
export function EmptyFiltered({ title, hint, onClear }: { title: string; hint: string; onClear: () => void }): JSX.Element {
  return (
    <StateCard icon={MagnifyingGlass} title={title} body={hint} dashed>
      <button type="button" onClick={onClear} style={primaryBtn}>
        Clear filters
      </button>
    </StateCard>
  );
}

/** No filters, and nothing of this type is live yet. Never a fake listing. */
export function EmptyNone({ noun }: { noun: string }): JSX.Element {
  return (
    <StateCard
      icon={MagnifyingGlass}
      title={`No ${noun} listed yet.`}
      body="Owners are joining. Check back soon, or tell us what you need and we'll look for you."
      dashed
    >
      <Link to="/contact" style={primaryBtn}>
        Tell us what you need
      </Link>
    </StateCard>
  );
}

/** The list didn't load. The filters stay; Try again refetches. */
export function ListError({ onRetry }: { onRetry: () => void }): JSX.Element {
  return (
    <StateCard
      icon={WarningCircle}
      role="alert"
      title="We couldn't load the list."
      body="Check your connection and try again. Your filters are kept."
    >
      <button type="button" onClick={onRetry} style={primaryBtn}>
        <ArrowClockwise size={16} aria-hidden="true" />
        Try again
      </button>
    </StateCard>
  );
}
