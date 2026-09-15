import { useMemo, useState, type CSSProperties } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTemplate,
  fetchAudiences,
  fetchRuns,
  fetchTemplates,
  sendComms,
  type AudienceKey,
  type CommsChannel,
  type TemplateRow,
} from "../lib/comms-api.js";
import { ApiClientError } from "../lib/api.js";
import { usePageTitle } from "../lib/use-page-title.js";

/**
 * "Cruz Admin Communications.dc.html" — pulled from the design bundle
 * directly (2026-09-16, the owner named the screen after an earlier pass
 * missed it). Three tabs, one screen: Bulk Email/SMS (compose), Templates,
 * Logs. `SideNav`'s Communications group gives each its own route, per the
 * design's own three nav keys (`comms` / `ctpl` / `clog`); this component
 * reads which one it's on from the URL and renders that tab's body.
 *
 * `?merchant=&name=` (from MerchantFile's "Message merchant" button)
 * pre-selects the "single" audience. There is no merchant picker for the
 * general case yet - pasting an id is the fallback, flagged below.
 *
 * "Schedule" (the design's second button next to Send) has no backend -
 * omitted rather than faked, same rule as every other unbuilt capability
 * in this console.
 */
const TABS: Array<{ path: string; key: "compose" | "templates" | "logs"; label: string }> = [
  { path: "/communications", key: "compose", label: "Bulk Email/SMS" },
  { path: "/communications/templates", key: "templates", label: "Templates" },
  { path: "/communications/logs", key: "logs", label: "Logs" },
];

const TITLES: Record<string, { title: string; blurb: string }> = {
  compose: { title: "Bulk Email/SMS", blurb: "Reach merchants by SMS or email — one at a time or the whole marketplace." },
  templates: { title: "Templates", blurb: "The messages the platform sends on its own, and the ones you send by hand." },
  logs: { title: "Communication logs", blurb: "Every send, who it went to, and how much of it landed." },
};

const SMS_COST_PER_SEGMENT_KES = 0.8;
const SMS_SEGMENT_LEN = 160;

export function Communications(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tab = TABS.find((t) => t.path === location.pathname)?.key ?? "compose";
  usePageTitle(`Communications - ${TITLES[tab]!.title}`);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={S.h1}>{TITLES[tab]!.title}</h1>
        <p style={S.blurb}>{TITLES[tab]!.blurb}</p>
      </div>

      <div style={S.pillStrip} role="tablist" aria-label="Communications sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === tab}
            onClick={() => navigate(t.path)}
            style={{ ...S.pill, background: t.key === tab ? "#0F23A8" : "transparent", color: t.key === tab ? "#FFFFFF" : "#5A6373" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "compose" && (
        <ComposeTab prefillMerchantId={params.get("merchant")} prefillMerchantName={params.get("name")} state={location.state as ComposeState | null} />
      )}
      {tab === "templates" && <TemplatesTab />}
      {tab === "logs" && <LogsTab />}
    </div>
  );
}

// --- Compose --------------------------------------------------------

interface ComposeState {
  subject?: string;
  body?: string;
  channel?: CommsChannel;
}

function ComposeTab({
  prefillMerchantId,
  prefillMerchantName,
  state,
}: {
  prefillMerchantId: string | null;
  prefillMerchantName: string | null;
  state: ComposeState | null;
}): JSX.Element {
  const qc = useQueryClient();
  const [audience, setAudience] = useState<AudienceKey>(prefillMerchantId ? "single" : "all");
  const [merchantId, setMerchantId] = useState(prefillMerchantId ?? "");
  const [channel, setChannel] = useState<CommsChannel>(state?.channel ?? "sms");
  const [subject, setSubject] = useState(state?.subject ?? "");
  const [message, setMessage] = useState(state?.body ?? "Habari, ");
  const [toast, setToast] = useState<{ text: string; dot: string } | null>(null);
  const flash = (text: string, dot = "#0B8A5B") => {
    setToast({ text, dot });
    window.setTimeout(() => setToast(null), 3600);
  };

  const { data: audiencesRes } = useQuery({ queryKey: ["admin", "comms", "audiences"], queryFn: fetchAudiences });
  const { data: templatesRes } = useQuery({ queryKey: ["admin", "comms", "templates"], queryFn: fetchTemplates });

  const aud = audiencesRes?.data.find((a) => a.key === audience);
  const isEmail = channel === "email" || channel === "both";
  const segments = Math.max(1, Math.ceil(message.length / SMS_SEGMENT_LEN));
  const recipientCount = audience === "single" ? (merchantId ? 1 : 0) : (aud?.count ?? 0);
  const smsCount = channel === "email" ? 0 : recipientCount * segments;

  const quickTemplates = useMemo(
    () => (templatesRes?.data ?? []).filter((t) => t.trigger === "manual" || t.label === "Insurance or inspection expiring"),
    [templatesRes],
  );

  const sendMut = useMutation({
    mutationFn: () =>
      sendComms({
        audience,
        ...(audience === "single" ? { merchant_id: merchantId } : {}),
        channel,
        ...(isEmail && subject ? { subject } : {}),
        body: message,
      }),
    onSuccess: (run) => {
      flash(`Queued for ${run.recipient_count} recipient${run.recipient_count === 1 ? "" : "s"}.`);
      void qc.invalidateQueries({ queryKey: ["admin", "comms", "runs"] });
    },
    onError: (e) => flash(e instanceof ApiClientError ? e.message : "That didn't send.", "#D81E32"),
  });

  const applyTemplate = (t: TemplateRow) => {
    setChannel(t.channel);
    if (t.subject) setSubject(t.subject);
    setMessage(t.body);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
      <div style={S.card}>
        <div style={{ display: "grid", gap: 16 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={S.fieldLabel}>Audience</span>
            <select value={audience} onChange={(e) => setAudience(e.target.value as AudienceKey)} style={S.input}>
              {(audiencesRes?.data ?? []).map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
            {audience === "single" ? (
              <input
                value={merchantId}
                onChange={(e) => setMerchantId(e.target.value)}
                placeholder="Merchant id (mer_...)"
                style={S.input}
              />
            ) : (
              <span style={S.hint}>
                {aud?.count ?? "—"} recipients · {aud?.note}
              </span>
            )}
            {audience === "single" && prefillMerchantName && (
              <span style={S.hint}>Sending to {prefillMerchantName}.</span>
            )}
          </label>

          <div style={{ display: "grid", gap: 6 }}>
            <span style={S.fieldLabel}>Channel</span>
            <div style={{ display: "flex", gap: 8 }}>
              {(["sms", "email", "both"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  style={{ ...S.channelBtn, background: channel === c ? "#0F23A8" : "#F1F3F6", borderColor: channel === c ? "#0F23A8" : "#E4E7EC", color: channel === c ? "#FFFFFF" : "#333B4A" }}
                >
                  {c === "sms" ? "SMS" : c === "email" ? "Email" : "SMS + Email"}
                </button>
              ))}
            </div>
          </div>

          {isEmail && (
            <label style={{ display: "grid", gap: 6 }}>
              <span style={S.fieldLabel}>Subject</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Verification pricing from September" style={S.input} />
            </label>
          )}

          <label style={{ display: "grid", gap: 6 }}>
            <span style={S.fieldLabel}>Message</span>
            <textarea
              rows={7}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write the message. Keep SMS under 160 characters where you can."
              style={{ ...S.input, height: "auto", padding: 12, resize: "vertical" }}
            />
            <span style={S.mono}>
              {message.length} characters
              {channel !== "email" ? ` · ${segments} SMS segment${segments === 1 ? "" : "s"} per recipient` : ""}
            </span>
          </label>

          {quickTemplates.length > 0 && (
            <div style={{ display: "grid", gap: 7 }}>
              <span style={S.fieldLabel}>Start from a template</span>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {quickTemplates.map((t) => (
                  <button key={t.id ?? t.label} type="button" onClick={() => applyTemplate(t)} style={S.chip}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, paddingTop: 16, borderTop: "1px solid #F1F3F6" }}>
            <button
              type="button"
              disabled={sendMut.isPending || recipientCount === 0 || !message.trim()}
              onClick={() => sendMut.mutate()}
              style={{ ...S.sendBtn, opacity: recipientCount === 0 || !message.trim() ? 0.5 : 1 }}
            >
              {sendMut.isPending ? "Sending…" : `Send to ${recipientCount} recipient${recipientCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <div style={S.card}>
          <div style={S.kicker}>PREVIEW</div>
          <div style={{ border: "1px solid #E4E7EC", borderRadius: "var(--r)", padding: 14, background: "#FAFBFC" }}>
            {isEmail && <div style={S.previewSubject}>{subject || "Subject line"}</div>}
            <div style={S.previewBody}>{message || "Your message will appear here."}</div>
          </div>
          <div style={{ marginTop: 14, font: "400 12px/1.55 'Instrument Sans',sans-serif", color: "#838C9B" }}>
            Sent from the addresses configured for TextSMS / your email adapter. Delivery and opt-outs are tracked on
            the Logs tab.
          </div>
        </div>
        <div style={S.card}>
          <div style={S.kicker}>ESTIMATED COST</div>
          <div style={{ display: "grid", gap: 9, fontVariantNumeric: "tabular-nums" }}>
            <Row label="SMS segments" value={smsCount ? String(smsCount) : "—"} />
            <Row label="At KES 0.80 each" value={smsCount ? `KES ${Math.round(smsCount * SMS_COST_PER_SEGMENT_KES).toLocaleString("en-KE")}` : "KES 0"} />
            <Row label="Email" value="Free" valueColor="#076945" />
          </div>
        </div>
      </div>

      {toast && (
        <div style={S.toast}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: toast.dot, flex: "none" }} />
          <span style={{ font: "600 13px/1.35 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>{toast.text}</span>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, valueColor = "#1A1F2B" }: { label: string; value: string; valueColor?: string }): JSX.Element {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", font: "400 13px/1.4 'Instrument Sans',sans-serif", color: "#5A6373" }}>
      <span>{label}</span>
      <span style={{ fontWeight: 600, color: valueColor }}>{value}</span>
    </div>
  );
}

// --- Templates --------------------------------------------------------

function TemplatesTab(): JSX.Element {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["admin", "comms", "templates"], queryFn: fetchTemplates });

  const createMut = useMutation({
    mutationFn: createTemplate,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "comms", "templates"] });
      setCreating(false);
    },
  });

  const use = (t: TemplateRow) => navigate("/communications", { state: { subject: t.subject ?? undefined, body: t.body, channel: t.channel } });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button type="button" onClick={() => setCreating(true)} style={S.newBtn}>
          New template
        </button>
      </div>
      <div style={S.tableWrap}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 820 }}>
            <div style={{ ...S.rowGrid, ...S.tableHead }}>
              {["TEMPLATE", "CHANNEL", "TRIGGER", "LAST USED", "USES"].map((h) => (
                <span key={h} style={S.th}>{h}</span>
              ))}
            </div>
            {isLoading && <div style={S.empty}>Loading templates…</div>}
            {data?.data.map((t) => (
              <button key={t.id ?? t.label} type="button" onClick={() => use(t)} style={{ ...S.rowGrid, ...S.rowBtn }}>
                <div style={{ minWidth: 0, textAlign: "left" }}>
                  <div style={S.rowTitle}>{t.label}</div>
                  <div style={S.rowSub}>{t.body}</div>
                </div>
                <div style={S.rowSub}>{t.channel === "both" ? "SMS + Email" : t.channel === "sms" ? "SMS" : "Email"}</div>
                <div>
                  <span style={{ ...S.trigTag, ...(t.trigger === "automatic" ? S.trigAuto : S.trigManual) }}>{t.trigger === "automatic" ? "Automatic" : "Manual"}</span>
                </div>
                <div style={S.mono}>{t.last_used_at ? new Date(t.last_used_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase() : "—"}</div>
                <div style={{ font: "600 13px/1 'IBM Plex Mono',monospace", color: "#333B4A" }}>{t.use_count}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {creating && (
        <NewTemplateModal
          onClose={() => setCreating(false)}
          onSubmit={(v) => createMut.mutate(v)}
          pending={createMut.isPending}
        />
      )}
    </div>
  );
}

function NewTemplateModal({
  onClose,
  onSubmit,
  pending,
}: {
  onClose: () => void;
  onSubmit: (v: { label: string; channel: CommsChannel; subject?: string; body: string }) => void;
  pending: boolean;
}): JSX.Element {
  const [label, setLabel] = useState("");
  const [channel, setChannel] = useState<CommsChannel>("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={S.modalTitle}>New template</h2>
        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 5 }}>
            <span style={S.fieldLabel}>Label</span>
            <input style={S.input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Invoice reminder" />
          </label>
          <label style={{ display: "grid", gap: 5 }}>
            <span style={S.fieldLabel}>Channel</span>
            <select style={S.input} value={channel} onChange={(e) => setChannel(e.target.value as CommsChannel)}>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
              <option value="both">SMS + Email</option>
            </select>
          </label>
          {channel !== "sms" && (
            <label style={{ display: "grid", gap: 5 }}>
              <span style={S.fieldLabel}>Subject</span>
              <input style={S.input} value={subject} onChange={(e) => setSubject(e.target.value)} />
            </label>
          )}
          <label style={{ display: "grid", gap: 5 }}>
            <span style={S.fieldLabel}>Message</span>
            <textarea style={{ ...S.input, height: "auto", padding: 12 }} rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button type="button" style={S.secondaryBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            style={S.newBtn}
            disabled={pending || !label.trim() || !body.trim()}
            onClick={() => onSubmit({ label, channel, ...(subject ? { subject } : {}), body })}
          >
            {pending ? "Saving…" : "Save template"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Logs --------------------------------------------------------

function LogsTab(): JSX.Element {
  const { data, isLoading } = useQuery({ queryKey: ["admin", "comms", "runs"], queryFn: () => fetchRuns() });

  const stats = data?.stats;
  const tiles = [
    { label: "SENT THIS MONTH", value: stats ? String(stats.sent_this_month) : "—", note: "automatic and manual", dot: "#0F23A8" },
    { label: "DELIVERY RATE", value: stats?.delivery_rate != null ? `${Math.round(stats.delivery_rate * 100)}%` : "—", note: "SMS and email combined", dot: "#0B8A5B" },
    { label: "SMS SPEND", value: stats ? `KES ${stats.sms_spend_kes.toLocaleString("en-KE")}` : "—", note: "this month", dot: "#C77400" },
    { label: "OPT-OUTS", value: stats ? String(stats.opt_outs) : "—", note: "merchants, SMS only", dot: "#D81E32" },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 16 }}>
        {tiles.map((t) => (
          <div key={t.label} style={S.statTile}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: t.dot, flex: "none" }} />
              <span style={S.kicker}>{t.label}</span>
            </div>
            <div style={S.statValue}>{t.value}</div>
            <div style={{ font: "400 11px/1.4 'Instrument Sans',sans-serif", color: "#838C9B" }}>{t.note}</div>
          </div>
        ))}
      </div>

      <div style={S.tableWrap}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 880 }}>
            <div style={{ ...S.rowGrid5, ...S.tableHead }}>
              {["SENT", "SUBJECT / MESSAGE", "AUDIENCE", "CHANNEL", "STATUS", "SENT BY"].map((h) => (
                <span key={h} style={S.th}>{h}</span>
              ))}
            </div>
            {isLoading && <div style={S.empty}>Loading logs…</div>}
            {data?.data.map((r) => (
              <div key={r.id} style={{ ...S.rowGrid5, ...S.row }}>
                <div style={S.mono}>{new Date(r.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={S.rowTitle}>{r.subject || r.body.slice(0, 60)}</div>
                  <div style={S.rowSub}>{r.recipient_count} merchants · {r.sent_count} sent{r.failed_count ? ` · ${r.failed_count} failed` : ""}</div>
                </div>
                <div style={S.rowSub}>{r.audience_label}</div>
                <div style={S.rowSub}>{r.channel === "both" ? "SMS + Email" : r.channel === "sms" ? "SMS" : "Email"}</div>
                <div>
                  <span style={{ ...S.trigTag, ...(r.status === "done" ? S.trigDone : S.trigSending) }}>{r.status === "done" ? "Done" : "Sending"}</span>
                </div>
                <div style={S.mono}>{r.sent_by_name}</div>
              </div>
            ))}
            {data && data.data.length === 0 && !isLoading && <div style={S.empty}>Nothing sent yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

const S = {
  h1: { margin: "0 0 7px", font: "600 clamp(25px,3.4vw,32px)/1.1 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", letterSpacing: "-.022em", color: "#0B0F1A" },
  blurb: { margin: 0, font: "400 14px/1.55 'Instrument Sans',sans-serif", color: "#5A6373", maxWidth: 660 },
  pillStrip: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18, padding: 4, background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: 999, width: "fit-content" },
  pill: { height: 36, padding: "0 16px", border: "none", borderRadius: 999, cursor: "pointer", font: "600 13px/1 'Instrument Sans',sans-serif" },
  card: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", padding: 22 },
  fieldLabel: { font: "600 12px/1 'Instrument Sans',sans-serif", color: "#333B4A" },
  input: { height: 44, padding: "0 12px", border: "1px solid #E4E7EC", borderRadius: "var(--r)", font: "400 14px/1 'Instrument Sans',sans-serif", color: "#1A1F2B", width: "100%", boxSizing: "border-box" },
  hint: { font: "400 12px/1.4 'Instrument Sans',sans-serif", color: "#838C9B" },
  mono: { font: "400 11px/1.4 'IBM Plex Mono',monospace", color: "#838C9B" },
  channelBtn: { flex: 1, height: 42, border: "1px solid", borderRadius: "var(--r)", cursor: "pointer", font: "600 13px/1 'Instrument Sans',sans-serif" },
  chip: { height: 32, padding: "0 12px", background: "#F1F3F6", border: "1px solid #E4E7EC", borderRadius: 999, cursor: "pointer", font: "600 12px/1 'Instrument Sans',sans-serif", color: "#333B4A" },
  sendBtn: { flex: 1, height: 46, background: "#0F23A8", color: "#fff", border: "none", borderRadius: "var(--r)", font: "600 14px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  kicker: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".09em", color: "#9AA2B0", marginBottom: 14 },
  previewSubject: { font: "600 13px/1.4 'Instrument Sans',sans-serif", color: "#1A1F2B", marginBottom: 9, paddingBottom: 9, borderBottom: "1px solid #F1F3F6" },
  previewBody: { font: "400 13px/1.6 'Instrument Sans',sans-serif", color: "#333B4A", whiteSpace: "pre-wrap" },
  toast: { position: "fixed", left: "50%", bottom: 26, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 11, padding: "13px 18px", background: "#F1F3F6", border: "1px solid #E4E7EC", borderRadius: 999, boxShadow: "0 12px 32px -10px rgba(0,0,0,.3)", zIndex: 60 },
  newBtn: { height: 42, padding: "0 18px", background: "#0F23A8", color: "#fff", border: "none", borderRadius: "var(--r)", font: "600 13px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  secondaryBtn: { height: 42, padding: "0 16px", background: "#FFFFFF", color: "#1A1F2B", border: "1px solid #E4E7EC", borderRadius: "var(--r)", font: "600 13px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  tableWrap: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", overflow: "hidden" },
  rowGrid: { display: "grid", gridTemplateColumns: "minmax(0,1fr) 118px 130px 108px 96px", gap: 14, alignItems: "center", padding: "12px 18px", width: "100%", boxSizing: "border-box" },
  rowGrid5: { display: "grid", gridTemplateColumns: "124px minmax(0,1fr) 128px 104px 118px 108px", gap: 14, alignItems: "center", padding: "12px 18px" },
  tableHead: { background: "#F1F3F6", borderBottom: "1px solid #E4E7EC" },
  th: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#5A6373" },
  row: { borderBottom: "1px solid #F1F3F6" },
  rowBtn: { background: "none", border: "none", borderBottom: "1px solid #F1F3F6", cursor: "pointer", textAlign: "left" as const },
  rowTitle: { font: "600 13px/1.35 'Instrument Sans',sans-serif", color: "#1A1F2B" },
  rowSub: { font: "400 12px/1.45 'Instrument Sans',sans-serif", color: "#838C9B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  trigTag: { display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, border: "1px solid", font: "600 11px/1 'Instrument Sans',sans-serif" },
  trigAuto: { background: "#E1F1FA", borderColor: "#A9D6EE", color: "#075D93" },
  trigManual: { background: "#F1F3F6", borderColor: "#E4E7EC", color: "#5A6373" },
  trigDone: { background: "#DDF3E9", borderColor: "#A8DEC7", color: "#076945" },
  trigSending: { background: "#FFF3DB", borderColor: "#F5D9A3", color: "#8A5200" },
  empty: { padding: "28px 18px", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
  statTile: { padding: "15px 17px", background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)" },
  statValue: { font: "700 24px/1 Archivo,sans-serif", fontVariationSettings: "'wdth' 108", color: "#0B0F1A", fontVariantNumeric: "tabular-nums", marginBottom: 6 },
  overlay: { position: "fixed", inset: 0, background: "rgba(11,15,26,.44)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 80 },
  modal: { width: "100%", maxWidth: 440, background: "#FFFFFF", borderRadius: "var(--r-lg)", padding: 22, boxShadow: "0 24px 60px -18px rgba(11,15,26,.35)" },
  modalTitle: { margin: "0 0 12px", font: "600 18px/1.3 Archivo,sans-serif", color: "#1A1F2B" },
} satisfies Record<string, CSSProperties>;
