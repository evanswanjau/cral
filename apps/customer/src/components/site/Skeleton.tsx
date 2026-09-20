import type { CSSProperties } from "react";

/**
 * Loading placeholders. Every loading state on a listing surface uses
 * these rather than a spinner or a "Searching..." line: the grid keeps
 * its shape, so nothing under the cursor jumps when the real cards land.
 * The shimmer is one CSS class (`.cral-skel`, index.css) because a
 * keyframed gradient can't be expressed as an inline style.
 */
export function Skeleton({
  width,
  height,
  radius = 6,
  style,
}: {
  width?: number | string;
  height: number;
  radius?: number;
  style?: CSSProperties;
}): JSX.Element {
  return (
    <span
      className="cral-skel"
      aria-hidden="true"
      style={{ display: "block", width: width ?? "100%", height, borderRadius: radius, ...style }}
    />
  );
}

/** Mirrors VehicleCard's own geometry - 150px photo, then the text block. */
export function VehicleCardSkeleton({ width }: { width?: number }): JSX.Element {
  return (
    <div
      aria-hidden="true"
      style={{
        width: width ?? "100%",
        flex: width ? "none" : undefined,
        background: "#FFFFFF",
        border: "1px solid #E4E7EC",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <Skeleton height={150} radius={0} />
      <div style={{ padding: "14px 15px 15px" }}>
        <Skeleton height={14} width="72%" style={{ marginBottom: 9 }} />
        <Skeleton height={11} width="88%" style={{ marginBottom: 16 }} />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            paddingTop: 11,
            borderTop: "1px solid #F1F3F6",
          }}
        >
          <Skeleton height={16} width={92} />
          <Skeleton height={11} width={64} />
        </div>
      </div>
    </div>
  );
}

export function VehicleCardSkeletonGrid({ count }: { count: number }): JSX.Element {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <VehicleCardSkeleton key={i} />
      ))}
    </>
  );
}
