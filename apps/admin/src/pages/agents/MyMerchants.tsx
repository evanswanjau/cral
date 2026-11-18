import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  displayPhone,
  fetchAgentMerchants,
  fetchSignupLink,
  resendAgentInvite,
  whatsappHref,
  type AgentMerchant,
} from "../../lib/agents-api.js";
import { getAdminClaims } from "../../lib/auth.js";
import { ApiClientError } from "../../lib/api.js";
import { usePageTitle } from "../../lib/use-page-title.js";
import { A, StatusChip } from "./ui.js";
import { AssistPanel } from "./AssistPanel.js";

/**
 * My merchants - the owners this sales agent signed up and how far each one
 * has got (Phase 3, PR AG1, `openapi/admin-agents.yaml`). An owner
 * (`admin_super`) sees every agent's sign-ups here, with the agent named.
 *
 * Not from a canvas file - see `./ui.tsx`.
 */
export function MyMerchants(): JSX.Element {
  const isOwner = getAdminClaims()?.role === "admin_super";
  usePageTitle(isOwner ? "Agent sign-ups" : "My merchants");
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setQ(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const list = useInfiniteQuery({
    queryKey: ["admin", "agents", "merchants", q],
    queryFn: ({ pageParam }) => fetchAgentMerchants({ q, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: "",
    getNextPageParam: (last) => (last.has_more && last.next_cursor ? last.next_cursor : undefined),
  });

  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const resend = useMutation({
    mutationFn: (m: AgentMerchant) => resendAgentInvite(m.id),
    onSuccess: (res) => {
      setNotice(
        res.invite_sent
          ? { ok: true, text: `A fresh invite is on its way to ${res.merchant.email}. The old link no longer works.` }
          : { ok: false, text: `The email to ${res.merchant.email} didn't go through. Try again in a few minutes.` },
      );
      void queryClient.invalidateQueries({ queryKey: ["admin", "agents", "merchants"] });
    },
    onError: (err) => {
      setNotice({
        ok: false,
        text: err instanceof ApiClientError ? err.message : "Couldn't resend the invite. Try again.",
      });
      void queryClient.invalidateQueries({ queryKey: ["admin", "agents", "merchants"] });
    },
  });

  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;

  return (
    <div>
      <div style={A.headRow}>
        <div>
          <h1 style={A.h1}>{isOwner ? "Agent sign-ups" : "My merchants"}</h1>
          <p style={A.lede}>
            {isOwner
              ? "Every owner a sales agent signed up, and how far each one has got."
              : "The owners you signed up, and how far each one has got. You can't approve anyone: a CRAL reviewer checks every account and every vehicle."}
          </p>
        </div>
        <Link to="/my-merchants/new" style={A.primaryBtn}>
          Add merchant
        </Link>
      </div>

      <SignupLinkCard />

      <div style={{ marginBottom: 14, maxWidth: 420 }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone"
          aria-label="Search by name or phone"
          style={A.input}
        />
      </div>

      {notice && (
        <div role="status" style={A.notice}>
          <span style={{ ...A.noticeDot, background: notice.ok ? "#0B8A5B" : "#D81E32" }} />
          <span style={{ flex: 1 }}>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
            style={{ border: "none", background: "transparent", color: "#838C9B", cursor: "pointer", font: "500 16px/1 'Instrument Sans',sans-serif" }}
          >
            ×
          </button>
        </div>
      )}

      <div style={A.card}>
        {list.isLoading && <div style={A.empty}>Loading your merchants…</div>}
        {list.error && <div style={A.empty}>Couldn't load your merchants. Try again.</div>}
        {list.data && rows.length === 0 && (
          <div style={A.empty}>
            {q ? (
              "Nobody matches that search."
            ) : (
              <>
                No merchants yet. <Link to="/my-merchants/new">Add your first one</Link> - they'll get an email to set
                their password and finish setting up.
              </>
            )}
          </div>
        )}

        {rows.map((m) => (
          <Row
            key={m.id}
            m={m}
            showAgent={isOwner}
            resending={resend.isPending && resend.variables?.id === m.id}
            onResend={() => {
              setNotice(null);
              resend.mutate(m);
            }}
          />
        ))}

        {list.data && (
          <div style={A.foot}>
            <span>
              {total} {total === 1 ? "MERCHANT" : "MERCHANTS"} · NEWEST FIRST
            </span>
            {list.hasNextPage && (
              <button
                type="button"
                style={A.smallBtn}
                disabled={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                {list.isFetchingNextPage ? "Loading…" : "Show more"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The agent's personal sign-up link (PR AG2). An owner who creates an
 * account after opening it is credited to the agent; nothing to type.
 */
function SignupLinkCard(): JSX.Element | null {
  const link = useQuery({ queryKey: ["admin", "agents", "link"], queryFn: fetchSignupLink, staleTime: Infinity });
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  if (link.error) return null;
  const url = link.data?.url ?? "";
  const share = `Sign up to earn with CRAL: ${url}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard blocked (an http page, an old browser): the link is
      // selectable text right beside the button.
    }
  }

  return (
    <div style={{ ...A.card, padding: "14px 18px", marginBottom: 14, overflow: "visible" }}>
      <div style={A.label}>YOUR SIGN-UP LINK</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <code style={L.url}>{link.isLoading ? "Loading…" : url}</code>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" style={A.smallBtn} disabled={!url} onClick={() => void copy()}>
            {copied ? "Copied" : "Copy"}
          </button>
          {url && (
            <a
              href={`https://wa.me/?text=${encodeURIComponent(share)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={A.smallBtn}
            >
              Share on WhatsApp
            </a>
          )}
        </div>
      </div>
      <p style={A.hint}>
        Owners who create an account through this link show up here as yours. If someone already has an account,
        the link doesn't move them.
      </p>
    </div>
  );
}

const L = {
  url: {
    flex: "1 1 240px",
    minWidth: 0,
    padding: "9px 11px",
    background: "#FAFBFC",
    border: "1px solid #E4E7EC",
    borderRadius: "var(--r-sm)",
    font: "500 13px/1.3 'IBM Plex Mono',monospace",
    color: "#1A1F2B",
    overflowWrap: "anywhere",
    userSelect: "all",
  },
} satisfies Record<string, CSSProperties>;

function Row({
  m,
  showAgent,
  resending,
  onResend,
}: {
  m: AgentMerchant;
  showAgent: boolean;
  resending: boolean;
  onResend: () => void;
}): JSX.Element {
  const contact = [m.phone ? displayPhone(m.phone) : null, m.email].filter(Boolean).join(" · ");
  const [assisting, setAssisting] = useState(false);
  // PR AG3: only before submission, and only once the owner has verified
  // their own phone (the consent code goes there).
  const canFill = m.status === "invited" || m.status === "onboarding";
  return (
    <div style={R.row}>
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={R.name}>{m.name ?? m.email}</span>
          {m.owner_type === "company" && <span style={R.tag}>COMPANY</span>}
          {m.onboarding_source === "agent_link" && (
            <span style={R.tag} title="Signed up through a personal sign-up link">
              {showAgent ? "VIA LINK" : "VIA YOUR LINK"}
            </span>
          )}
        </div>
        <div style={R.sub}>{contact}</div>
        {showAgent && m.agent && <div style={R.sub}>Signed up by {m.agent.name}</div>}
      </div>

      <div style={{ flex: "0 1 auto" }}>
        <StatusChip m={m} />
      </div>

      <div style={R.actions}>
        {m.phone && (
          <>
            <a href={`tel:${m.phone}`} style={A.smallBtn}>
              Call
            </a>
            <a href={whatsappHref(m.phone)} target="_blank" rel="noopener noreferrer" style={A.smallBtn}>
              WhatsApp
            </a>
          </>
        )}
        {m.invite_pending && (
          <button type="button" style={A.smallBtn} disabled={resending} onClick={onResend}>
            {resending ? "Sending…" : "Resend invite"}
          </button>
        )}
        {canFill && (
          <button
            type="button"
            style={{ ...A.smallBtn, ...(m.assist_ready ? {} : { color: "#9AA2B0", cursor: "not-allowed" }) }}
            disabled={!m.assist_ready}
            title={m.assist_ready ? undefined : "The owner verifies their phone in onboarding first."}
            onClick={() => setAssisting(true)}
          >
            Fill in onboarding
          </button>
        )}
      </div>
      {canFill && !m.assist_ready && (
        <div style={{ ...R.sub, flexBasis: "100%", marginTop: 0, color: "#838C9B" }}>
          To fill in onboarding with them, the owner first verifies their phone in onboarding (Your details).
        </div>
      )}
      {assisting && <AssistPanel m={m} onClose={() => setAssisting(false)} />}
    </div>
  );
}

const R = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: "10px clamp(12px,1.6vw,20px)",
    flexWrap: "wrap",
    padding: "14px 18px",
    borderBottom: "1px solid #F1F3F6",
  },
  name: { font: "600 15px/1.25 Archivo,sans-serif", color: "#1A1F2B", overflowWrap: "anywhere" },
  tag: {
    padding: "1px 6px",
    border: "1px solid #E4E7EC",
    borderRadius: "var(--r-sm)",
    font: "500 9px/1.5 'IBM Plex Mono',monospace",
    letterSpacing: ".06em",
    color: "#838C9B",
  },
  sub: { marginTop: 3, font: "400 13px/1.4 'Instrument Sans',sans-serif", color: "#5A6373", overflowWrap: "anywhere" },
  actions: { display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto" },
} satisfies Record<string, CSSProperties>;
