import { Link, useParams } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ApiClientError } from "../lib/api.js";
import { usePageTitle } from "../lib/use-page-title.js";
import {
  LINE_LABELS,
  SERVICE_LABELS,
  carName,
  getServiceRecord,
  kesText,
  type ServiceRecordEntry,
} from "../lib/garage-api.js";
import { P } from "../components/garage/OrderParts.js";
import { bodyText } from "../components/subsite/Section.js";

/**
 * `/my-cars/:id`: one car's service record (Phase 4 GS4). Every garage job
 * on this car that was completed, latest first, with the work paid for
 * line by line. It is read from the jobs themselves, so it shows nothing
 * that didn't happen through CRAL: no job, no entry.
 *
 * Not from a canvas; built from tokens.ts and the garage order page.
 */

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Nairobi" });
}

const CONFIRMED: Record<ServiceRecordEntry["confirmed_by"], string> = {
  customer: "Confirmed by you",
  auto: "Confirmed automatically 72 hours after the car was ready",
  ops: "Settled by CRAL support",
};

function Entry({ e }: { e: ServiceRecordEntry }): JSX.Element {
  const lines = e.work.flatMap((w) => w.lines.map((l) => ({ ...l, extra: w.kind === "extra" })));
  return (
    <article style={P.card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={P.mono}>
            {fmtDate(e.completed_at).toUpperCase()} · {e.ref}
          </div>
          <h2 style={{ ...P.h2, fontSize: 18 }}>{e.service_type ? SERVICE_LABELS[e.service_type] : "Garage job"}</h2>
          {e.outlet && (
            <p style={{ ...bodyText, fontSize: 13 }}>
              {e.outlet.name}, {e.outlet.address}, {e.outlet.county}
            </p>
          )}
        </div>
        <div style={P.total}>{kesText(e.total)}</div>
      </div>
      {e.description && <p style={{ ...bodyText, fontSize: 13, marginTop: 8 }}>You asked for: {e.description}</p>}
      <table style={P.table}>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td style={{ ...P.td, ...P.mono, width: 80 }}>{(LINE_LABELS[l.kind] ?? l.kind).toUpperCase()}</td>
              <td style={{ ...P.td, overflowWrap: "anywhere" }}>
                {l.description}
                {l.extra && <span style={{ ...P.mono, marginLeft: 8 }}>EXTRA WORK</span>}
              </td>
              <td style={{ ...P.td, textAlign: "right", whiteSpace: "nowrap" }}>{kesText(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        <span style={{ ...bodyText, fontSize: 13 }}>{CONFIRMED[e.confirmed_by]}</span>
        <Link to={`/garage/orders/${e.order_id}`} style={{ font: "600 14px/44px 'Instrument Sans',sans-serif", color: "#0F23A8" }}>
          View the job
        </Link>
      </div>
    </article>
  );
}

export function CarServiceRecord(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["service-record", id],
    queryFn: ({ pageParam }) => getServiceRecord(id!, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : null),
    enabled: !!id,
  });
  const car = data?.pages[0]?.car;
  const entries = data?.pages.flatMap((p) => p.data) ?? [];
  usePageTitle(car ? `Service record · ${car.plate}` : "Service record");

  if (isLoading) {
    return (
      <div style={S.wrap}>
        <p style={bodyText}>Loading…</p>
      </div>
    );
  }
  if (error || !car) {
    const notFound = error instanceof ApiClientError && error.status === 404;
    return (
      <div style={S.wrap}>
        <h1 style={S.h1}>Service record</h1>
        <p style={bodyText}>{notFound ? "That car isn't in My cars." : "We couldn't load this service record. Try again."}</p>
        <p style={{ ...bodyText, marginTop: 12 }}>
          <Link to="/my-cars" style={S.link}>Back to My cars</Link>
        </p>
      </div>
    );
  }

  return (
    <div style={S.wrap}>
      <p style={{ ...bodyText, fontSize: 13 }}>
        <Link to="/my-cars" style={S.link}>My cars</Link>
      </p>
      <div style={P.mono}>SERVICE RECORD</div>
      <h1 style={S.h1}>{carName(car)}</h1>
      <p style={{ ...bodyText, fontFamily: "'IBM Plex Mono',monospace", fontSize: 14 }}>{car.plate}</p>
      <p style={{ ...bodyText, maxWidth: 620, marginTop: 10 }}>
        Every garage job on this car that was finished through CRAL, with what was done and what you paid, line by
        line. A garage sees only the jobs it did itself, never the rest of this record.
      </p>

      <div style={{ display: "grid", gap: 12, marginTop: 22 }}>
        {entries.length === 0 && (
          <div style={P.card}>
            <p style={bodyText}>
              No finished jobs yet. When a garage job on this car is confirmed, it stays here.
            </p>
            <p style={{ ...bodyText, marginTop: 8 }}>
              <Link to="/garage" style={S.link}>Ask garages for a price</Link>
            </p>
          </div>
        )}
        {entries.map((e) => (
          <Entry key={e.order_id} e={e} />
        ))}
        {hasNextPage && (
          <div>
            <button type="button" style={P.secondary} disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
              {isFetchingNextPage ? "Loading…" : "Show older jobs"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const S = {
  wrap: { maxWidth: 880, margin: "0 auto", padding: "clamp(24px,4vw,48px) clamp(16px,4vw,40px)" },
  h1: {
    margin: "4px 0 4px",
    font: "700 clamp(26px,3.6vw,36px)/1.1 Archivo,sans-serif",
    fontVariationSettings: "'wdth' 108",
    letterSpacing: "-.02em",
    color: "#0B0F1A",
  },
  link: { color: "#0F23A8", fontWeight: 600 },
} as const;
