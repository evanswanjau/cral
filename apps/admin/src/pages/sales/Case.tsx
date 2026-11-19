import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChecklistRow } from "../../components/console/review/ChecklistRow.js";
import { ReasonModal } from "../../components/console/review/modals.js";
import type { CheckResult } from "../../lib/vehicles-api.js";
import { assignSale, decideSale, fetchSaleCase, kes, saleFileObjectUrl, setSaleCheck, type SaleCase, type SaleFile } from "../../lib/sales-api.js";
import { usePageTitle } from "../../lib/use-page-title.js";
import { SALE_STATUS } from "./Queue.js";

/**
 * One sale-listing case (Phase 6 CS2 - docs/decisions/car-sales.md).
 * Checklist-first on the shared review engine. The reviewer compares the
 * logbook by eye with the listing and the account holder shown here; the
 * console reads nothing off the logbook itself. Not from a canvas; built in
 * the console's idiom (outlets/Case.tsx) with the shared ChecklistRow.
 */

const MIN_PHOTOS = 4;
const DECIDABLE = ["pending", "review"];

const label = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function Case(): JSX.Element {
  const { listingId } = useParams<{ listingId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const key = ["admin", "sales", listingId];
  const { data: l, isLoading, error } = useQuery({ queryKey: key, queryFn: () => fetchSaleCase(listingId!), enabled: !!listingId });
  usePageTitle(l ? `${l.ref} ${l.make} ${l.model}` : "Car sale");

  const [modal, setModal] = useState<null | "changes" | "reject">(null);
  const [err, setErr] = useState<string | null>(null);

  const onDone = (updated: SaleCase) => {
    qc.setQueryData(key, updated);
    void qc.invalidateQueries({ queryKey: ["admin", "sales", "list"] });
    setErr(null);
  };
  const onFail = (e: unknown) => setErr(e instanceof Error ? e.message : "That didn't go through. Try again.");

  const checkMut = useMutation({
    mutationFn: (v: Parameters<typeof setSaleCheck>[1]) => setSaleCheck(listingId!, v),
    onSuccess: onDone,
    onError: onFail,
  });
  const assignMut = useMutation({ mutationFn: () => assignSale(listingId!), onSuccess: onDone, onError: onFail });
  const decideMut = useMutation({
    mutationFn: (v: { action: "approve" | "request_changes" | "reject"; note?: string }) => decideSale(listingId!, v.action, v.note),
    onSuccess: (u) => {
      onDone(u);
      setModal(null);
    },
    onError: onFail,
  });

  if (isLoading) return <div style={S.empty}>Loading…</div>;
  if (error || !l) return <div style={S.empty}>Couldn't load that listing.</div>;

  const s = SALE_STATUS[l.status];
  const open = DECIDABLE.includes(l.status);
  const cl = l.checklist;
  const blockers = [
    !cl.complete && `${cl.outstanding} ${cl.outstanding === 1 ? "check" : "checks"} to answer`,
    cl.flagged > 0 && `${cl.flagged} flagged`,
    !l.merchant.approved && "account not approved",
    l.photos.length < MIN_PHOTOS && `fewer than ${MIN_PHOTOS} photos`,
    !l.logbook && "no logbook",
  ].filter((x): x is string => !!x);
  const canApprove = open && blockers.length === 0;
  const groups = [...new Set(cl.items.map((i) => i.group))];
  const onSet = (itemId: string, result: CheckResult, note?: string) => checkMut.mutate({ item_id: itemId, result, note: note ?? null });
  const title = `${l.year} ${l.make} ${l.model}`;

  return (
    <div>
      <button type="button" onClick={() => navigate("/sales")} style={S.backBtn}>← All listings</button>

      <div style={S.headRow}>
        <div>
          <h1 style={S.h1}>{title}</h1>
          <p style={S.lede}>{l.ref} · {l.registration} · {l.viewing_area}, {l.county}</p>
        </div>
        <span style={{ ...S.badge, background: s.bg, borderColor: s.border, color: s.fg }}>{s.label}</span>
      </div>

      <div style={S.facts}>
        <Fact label="ACCOUNT HOLDER" value={l.merchant.name} link={`/merchants/${l.merchant.id}`} />
        <Fact label="ACCOUNT TYPE" value={l.merchant.owner_type === "company" ? "Company" : "Individual"} />
        <Fact label="REGISTRATION" value={l.registration} />
        <Fact label="MAKE AND MODEL" value={`${l.make} ${l.model}`} />
        <Fact label="FINANCED" value={l.encumbered ? "Yes, a lender is on the logbook" : "No"} />
        <Fact label="ASKING" value={`${kes(l.asking_price)}${l.negotiable ? " (negotiable)" : ""}`} />
        <Fact label="REVIEWER" value={l.assignee?.name ?? "Unassigned"} />
      </div>

      <div style={S.facts}>
        <Fact label="YEAR" value={String(l.year)} />
        <Fact label="MILEAGE" value={`${l.mileage_km.toLocaleString("en-KE")} km`} />
        <Fact label="BODY" value={label(l.body_type)} />
        <Fact label="GEARBOX / FUEL" value={`${label(l.transmission)} / ${label(l.fuel)}`} />
        <Fact label="IMPORT" value={label(l.import_status)} />
        <Fact label="ACCIDENTS" value={label(l.accident_history)} />
      </div>
      <p style={{ ...S.lede, marginBottom: 18 }}>
        <strong>Known faults:</strong> {l.known_faults}
        {l.description ? <><br /><strong>Description:</strong> {l.description}</> : null}
      </p>

      {!l.merchant.approved && (
        <div style={S.warn}>
          The merchant's account isn't approved yet, so this listing can't go live.{" "}
          <Link to={`/merchants/${l.merchant.id}`} style={{ color: "#0F23A8", fontWeight: 600 }}>Review the account</Link>
        </div>
      )}
      {l.open_reports > 0 && (
        <div style={{ ...S.warn, background: "#FDE7EA", borderColor: "#F7BDC5", color: "#A50E22" }}>
          {l.open_reports} open {l.open_reports === 1 ? "report" : "reports"} from buyers.{" "}
          <Link to="/sales/reports" style={{ color: "#0F23A8", fontWeight: 600 }}>Open reports</Link>
        </div>
      )}
      {l.reviewer_note && !open && <div style={S.warn}>Last note to the merchant: {l.reviewer_note}</div>}

      <div style={S.panel}>
        <div style={S.panelHead}>
          <span style={S.panelTitle}>Logbook</span>
          <span style={S.mono}>COMPARE WITH THE DETAILS ABOVE</span>
        </div>
        <div style={{ padding: 18 }}>
          {l.logbook ? <FileView listingId={l.id} file={l.logbook} wide /> : <span style={S.help}>No logbook uploaded.</span>}
        </div>
      </div>

      <div style={{ ...S.panel, marginTop: 16 }}>
        <div style={S.panelHead}>
          <span style={S.panelTitle}>Photos</span>
          <span style={S.mono}>{l.photos.length} UPLOADED</span>
        </div>
        <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10 }}>
          {l.photos.map((p) => <FileView key={p.id} listingId={l.id} file={p} />)}
        </div>
      </div>

      <div style={{ ...S.panel, marginTop: 16 }}>
        <div style={S.panelHead}>
          <span style={S.panelTitle}>Checklist</span>
          <span style={S.mono}>
            {cl.checked}/{cl.total} ANSWERED{cl.flagged ? ` · ${cl.flagged} FLAGGED` : ""}
          </span>
        </div>
        {groups.map((g) => (
          <div key={g}>
            <div style={S.groupHead}>{g.toUpperCase()}</div>
            {cl.items
              .filter((i) => i.group === g)
              .map((item, idx) => (
                <ChecklistRow key={item.id} item={item} index={idx} saving={checkMut.isPending || !open} onSet={onSet} />
              ))}
          </div>
        ))}
      </div>

      {err && <div style={{ ...S.warn, marginTop: 16, background: "#FDE7EA", borderColor: "#F7BDC5", color: "#A50E22" }}>{err}</div>}

      {open && (
        <div style={{ ...S.panel, padding: 18, marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            disabled={!canApprove || decideMut.isPending}
            style={{ ...S.btn, background: canApprove ? "#0B8A5B" : "#F1F3F6", borderColor: canApprove ? "#0B8A5B" : "#E4E7EC", color: canApprove ? "#FFFFFF" : "#9AA2B0" }}
            onClick={() => decideMut.mutate({ action: "approve" })}
          >
            Approve and go live
          </button>
          <button type="button" disabled={!cl.complete} style={{ ...S.btn, opacity: cl.complete ? 1 : 0.5 }} onClick={() => setModal("changes")}>
            Request changes
          </button>
          <button
            type="button"
            disabled={!cl.complete}
            style={{ ...S.btn, color: "#D81E32", borderColor: "#F7BDC5", opacity: cl.complete ? 1 : 0.5 }}
            onClick={() => setModal("reject")}
          >
            Reject
          </button>
          <button type="button" style={S.btn} disabled={assignMut.isPending} onClick={() => assignMut.mutate()}>
            Assign to me
          </button>
          {blockers.length > 0 && <span style={S.hint}>Approve needs: {blockers.join(", ")}.</span>}
        </div>
      )}

      {modal && (
        <ReasonModal
          mode={modal}
          subject={title}
          suggestedNote={modal === "reject" ? cl.suggested_note.reject : cl.suggested_note.changes}
          hint="The merchant reads this as written."
          busy={decideMut.isPending}
          onConfirm={(note) => decideMut.mutate({ action: modal === "reject" ? "reject" : "request_changes", note })}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

/** A photo thumbnail, or the logbook (image inline, PDF as a link). */
function FileView({ listingId, file, wide }: { listingId: string; file: SaleFile; wide?: boolean }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    let live = true;
    saleFileObjectUrl(listingId, file.id)
      .then((u) => {
        made = u;
        if (live) setUrl(u);
      })
      .catch(() => {});
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [listingId, file.id]);
  const box: CSSProperties = {
    width: "100%",
    maxWidth: wide ? 640 : undefined,
    aspectRatio: wide ? undefined : "4 / 3",
    objectFit: wide ? "contain" : "cover",
    borderRadius: 8,
    background: "#F1F3F6",
    display: "block",
  };
  if (!url) return <div style={{ ...box, minHeight: 80, display: "flex", alignItems: "center", justifyContent: "center", ...S.help }}>File not loaded</div>;
  if (!file.content_type.startsWith("image/")) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ ...S.btn, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
        Open {file.original_name}
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img src={url} alt={file.original_name} style={box} />
    </a>
  );
}

function Fact({ label: l, value, link }: { label: string; value: string; link?: string }): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={S.mono}>{l}</span>
      {link ? (
        <Link to={link} style={{ ...S.factValue, color: "#0F23A8", textDecoration: "none" }}>{value}</Link>
      ) : (
        <span style={{ ...S.factValue, color: "#1A1F2B" }}>{value}</span>
      )}
    </div>
  );
}

const S = {
  backBtn: { height: 34, padding: "0 4px", background: "none", border: "none", font: "600 13px/1 'Instrument Sans',sans-serif", color: "#5A6373", cursor: "pointer", marginBottom: 10 },
  headRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 },
  h1: { margin: "0 0 4px", font: "600 clamp(23px,3vw,28px)/1.15 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", letterSpacing: "-.02em", color: "#1A1F2B" },
  lede: { margin: 0, font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" },
  badge: { display: "inline-flex", alignItems: "center", padding: "5px 11px", border: "1px solid", borderRadius: 999, font: "600 11px/1.4 'IBM Plex Mono',monospace", letterSpacing: ".05em", flex: "none" },
  facts: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,150px),1fr))", gap: 16, marginBottom: 18 },
  factValue: { font: "600 14px/1.3 'Instrument Sans',sans-serif", overflow: "hidden", textOverflow: "ellipsis" },
  mono: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#9AA2B0" },
  warn: { padding: "12px 14px", marginBottom: 16, background: "#FFF3DB", border: "1px solid #F5D9A3", borderRadius: "var(--r)", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#8A5200" },
  panel: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", overflow: "hidden" },
  panelHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "15px 18px", borderBottom: "1px solid #F1F3F6" },
  panelTitle: { font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B" },
  groupHead: { padding: "12px 18px 6px", font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#9AA2B0" },
  help: { font: "400 12px/1.45 'Instrument Sans',sans-serif", color: "#838C9B", marginTop: 2 },
  hint: { font: "400 12px/1.45 'Instrument Sans',sans-serif", color: "#8A5200" },
  btn: { height: 32, padding: "0 12px", background: "#FFFFFF", color: "#0F23A8", border: "1px solid #E4E7EC", borderRadius: "var(--r-sm)", font: "600 12px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  empty: { padding: "28px 18px", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
} satisfies Record<string, CSSProperties>;
