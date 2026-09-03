import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { P } from "../components/portal/styles.js";
import { PAYOUT_STATUS, money } from "../components/portal/status.js";
import { useToast } from "../components/portal/Toast.js";
import {
  downloadStatement,
  usePayoutList,
  useSeedDevPayouts,
  type PayoutRunSummary,
  type PayoutTile,
} from "../lib/payouts-api.js";

/** Nairobi's calendar month, which is what the statement endpoint expects. */
function currentMonth(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

function formatRunDate(day: string): string {
  return new Date(`${day}T00:00:00.000Z`)
    .toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "short" })
    .toUpperCase();
}

const TILE_LABEL: Record<PayoutTile["key"], string> = {
  next_payout: "NEXT PAYOUT",
  clearing: "CLEARING",
  paid_this_month: "PAID THIS MONTH",
};

/**
 * The third tile is the only one on a tinted ground: it is the figure that
 * has actually landed, and the design lifts it out of the other two.
 */
function tileSkin(key: PayoutTile["key"]) {
  if (key === "paid_this_month") {
    return { bg: "#DDF3E9", border: "#A8DEC7", dot: "#0B8A5B", kFg: "#076945", unitFg: "#0B8A5B", subFg: "#076945" };
  }
  return {
    bg: "#FFFFFF",
    border: "#E4E7EC",
    dot: key === "next_payout" ? "#C77400" : "#0B7BC1",
    kFg: "#9AA2B0",
    unitFg: "#838C9B",
    subFg: "#5A6373",
  };
}

function Tile({ tile }: { tile: PayoutTile }): JSX.Element {
  const skin = tileSkin(tile.key);
  const amount = money(tile.amount.amount);
  return (
    <div style={{ ...P.poTile, background: skin.bg, border: `1px solid ${skin.border}` }}>
      <div style={P.poTileHead}>
        <span style={{ ...P.poTileDot, background: skin.dot }} />
        <span style={{ ...P.poTileKicker, color: skin.kFg }}>{TILE_LABEL[tile.key]}</span>
      </div>
      <div style={{ ...P.poTileValue, color: "#0B0F1A" }}>
        <span style={{ ...P.poTileUnit, color: skin.unitFg }}>KES</span> {amount === " - " ? "0" : amount}
      </div>
      <div style={{ ...P.poTileSub, color: skin.subFg }}>{tile.note}</div>
    </div>
  );
}

function HistoryRow({ run, onOpen }: { run: PayoutRunSummary; onOpen: () => void }): JSX.Element {
  const [hover, setHover] = useState(false);
  const skin = PAYOUT_STATUS[run.status];
  const covers = `${run.line_count} ${run.line_count === 1 ? "booking" : "bookings"}`;
  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...P.poHistoryRow, background: hover ? "#FAFBFC" : "transparent" }}
    >
      <span style={P.poRefChip}>{run.ref}</span>
      <div style={{ minWidth: 0 }}>
        <div style={P.poHistoryDate}>{formatRunDate(run.run_date)}</div>
        <div style={P.poHistoryCovers}>{covers}</div>
      </div>
      <div style={{ textAlign: "right", minWidth: 0 }}>
        <div style={P.poHistoryNet}>{money(run.net.amount)}</div>
        <div style={P.poHistoryGross}>of {money(run.gross.amount)}</div>
      </div>
      <span style={{ minWidth: 0 }}>
        <span style={{ ...P.poStatusPill, background: skin.tint, border: `1px solid ${skin.border}`, color: skin.text }}>
          <span style={{ ...P.poStatusDot, background: skin.core }} />
          {skin.label}
        </span>
      </span>
      <span style={P.chevron}>›</span>
    </div>
  );
}

function SkeletonRow(): JSX.Element {
  const bar = (width: number, height = 12): CSSProperties => ({ ...P.skeletonBar, width, height });
  return (
    <div style={{ ...P.poHistoryRow, cursor: "default" }}>
      <div className="cral-shimmer" style={{ ...bar(80, 26), borderRadius: 4 }} />
      <div>
        <div className="cral-shimmer" style={bar(110)} />
        <div className="cral-shimmer" style={{ ...bar(80, 10), marginTop: 6 }} />
      </div>
      <div className="cral-shimmer" style={{ ...bar(64), marginLeft: "auto" }} />
      <div className="cral-shimmer" style={{ ...bar(92, 22), borderRadius: 999 }} />
      <span />
    </div>
  );
}

function EmptyState({ onSeed, seeding }: { onSeed: () => void; seeding: boolean }): JSX.Element {
  return (
    <div style={P.emptyWrap}>
      <div style={P.emptyIcon}>◎</div>
      <div style={P.emptyTitle}>No payouts yet</div>
      <p style={P.emptyBody}>
        A payout run is cut once a hire is finished and the hirer's deposit has been released. Nothing has reached that
        point yet.
      </p>
      {import.meta.env.DEV && (
        <button type="button" onClick={onSeed} disabled={seeding} style={P.actionBtn}>
          {seeding ? "Seeding…" : "Seed demo payouts"}
        </button>
      )}
    </div>
  );
}

export function PayoutList(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, isLoading } = usePayoutList();
  const seed = useSeedDevPayouts();
  const [downloading, setDownloading] = useState(false);

  const summary = data?.summary;
  const month = currentMonth();

  async function onStatement(): Promise<void> {
    setDownloading(true);
    try {
      await downloadStatement(month);
      toast(`Statement for ${month} downloaded.`, "#0B8A5B");
    } catch {
      toast("That statement couldn't be prepared. Try again in a moment.", "#D81E32");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <div style={P.listHead}>
        <div>
          <h1 style={P.h1}>Payouts</h1>
          <p style={P.lede}>Hirers pay CRAL upfront. Your payout clears 24 hours after the vehicle comes back.</p>
        </div>
        <button
          type="button"
          onClick={onStatement}
          disabled={downloading}
          style={{ ...P.addButton, background: "#FFFFFF", color: "#1A1F2B", border: "1px solid #CDD2DA" }}
        >
          {downloading ? "Preparing…" : "Monthly statement"}
        </button>
      </div>

      {summary && (
        <div style={P.poTileGrid}>
          {summary.tiles.map((tile) => (
            <Tile key={tile.key} tile={tile} />
          ))}
        </div>
      )}

      <div style={P.table}>
        <div style={P.cardHead}>
          <span style={P.cardTitle}>Payout history</span>
          <span style={{ ...P.cardHeadTag, color: "#838C9B" }}>{new Date().getFullYear()} · YEAR TO DATE</span>
        </div>

        <div style={P.poHistoryHead}>
          <span style={P.poHistoryHeadCell}>PAYOUT</span>
          <span style={P.poHistoryHeadCell}>RUN DATE · COVERS</span>
          <span style={{ ...P.poHistoryHeadCell, textAlign: "right" }}>NET PAID</span>
          <span style={P.poHistoryHeadCell}>STATUS</span>
          <span />
        </div>

        {isLoading && [0, 1, 2].map((i) => <SkeletonRow key={i} />)}

        {!isLoading && data?.data.length === 0 && (
          <EmptyState onSeed={() => seed.mutate()} seeding={seed.isPending} />
        )}

        {!isLoading &&
          data?.data.map((run) => (
            <HistoryRow key={run.id} run={run} onOpen={() => navigate(`/payouts/${run.id}`)} />
          ))}

        {!isLoading && data && data.data.length > 0 && (
          <div style={P.tableFooter}>
            <span style={P.tableFooterLeft}>
              {summary?.run_count} {summary?.run_count === 1 ? "PAYOUT RUN" : "PAYOUT RUNS"} · KES{" "}
              {money(summary?.net_total.amount ?? 0)} NET
            </span>
            <span style={P.tableFooterRight}>CRAL commission applies to completed bookings only.</span>
          </div>
        )}
      </div>
    </div>
  );
}
