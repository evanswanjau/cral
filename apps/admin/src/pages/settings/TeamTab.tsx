import { useState, type CSSProperties, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTeamMember,
  deactivateTeamMember,
  fetchTeam,
  reactivateTeamMember,
  resetTeamMemberPassword,
  updateTeamMember,
  type AdminRow,
} from "../../lib/team-api.js";
import { getAdminMe } from "../../lib/auth-api.js";
import type { AdminRole } from "../../lib/auth-api.js";
import { ApiClientError } from "../../lib/api.js";
import { ROLE_LABEL } from "../../components/console/styles.js";

/**
 * Settings → Team. No canvas file covers this tab's content — the twelve
 * console screens pulled from "Cruz Ride Auto - Admin Console.html" stop
 * at Vehicles/Merchants/Renters/Bookings, and "Cruz Admin Settings.dc.html"
 * itself wasn't reachable this session either. Same footing as the
 * customer portal's C9/C10/C8: built from `packages/ui/src/tokens.ts` and
 * the visual idiom this console already established (Merchants.tsx's
 * table, styles.ts's palette), flagged for a swap if a real Settings
 * canvas file turns up. The *placement* — a tab inside Settings, not its
 * own nav item — does come from the design (finding §6).
 *
 * Only the queue slugs real modules actually gate on today are offered —
 * `vehicles` / `merchants` / `renters` / `bookings`. The migration comment
 * also reserves `disputes` / `invoices` / `payouts` / `comms` for slices
 * that don't exist yet; adding those here would let a super admin assign
 * a queue that gates nothing.
 */
const QUEUES = ["vehicles", "merchants", "renters", "bookings"] as const;
const ROLES: AdminRole[] = ["admin_reviewer", "admin_finance", "admin_support", "admin_super"];

type Modal =
  | { kind: "add" }
  | { kind: "edit"; admin: AdminRow }
  | { kind: "deactivate"; admin: AdminRow }
  | { kind: "password"; name: string; password: string }
  | null;

export function TeamTab(): JSX.Element {
  const qc = useQueryClient();
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<{ text: string; dot: string } | null>(null);
  const flash = (text: string, dot = "#0B8A5B") => {
    setToast({ text, dot });
    window.setTimeout(() => setToast(null), 3600);
  };

  const { data: me } = useQuery({ queryKey: ["admin", "me"], queryFn: getAdminMe });
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "team", "list"],
    queryFn: () => fetchTeam(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "team", "list"] });

  const createMut = useMutation({
    mutationFn: createTeamMember,
    onSuccess: (res) => {
      invalidate();
      setModal({ kind: "password", name: res.admin.full_name, password: res.password });
    },
  });
  const updateMut = useMutation({
    mutationFn: (v: { id: string; role: AdminRole; queues: string[] }) =>
      updateTeamMember(v.id, { role: v.role, queues: v.queues }),
    onSuccess: () => {
      invalidate();
      setModal(null);
      flash("Role updated.");
    },
    onError: (e) => flash(e instanceof ApiClientError ? e.message : "That didn't save.", "#D81E32"),
  });
  const deactivateMut = useMutation({
    mutationFn: (id: string) => deactivateTeamMember(id),
    onSuccess: (admin) => {
      invalidate();
      setModal(null);
      flash(`${admin.full_name}'s access is disabled.`, "#C77400");
    },
    onError: (e) => flash(e instanceof ApiClientError ? e.message : "That didn't work.", "#D81E32"),
  });
  const reactivateMut = useMutation({
    mutationFn: (id: string) => reactivateTeamMember(id),
    onSuccess: (admin) => {
      invalidate();
      flash(`${admin.full_name} can sign in again.`);
    },
    onError: (e) => flash(e instanceof ApiClientError ? e.message : "That didn't work.", "#D81E32"),
  });
  const resetMut = useMutation({
    mutationFn: (admin: AdminRow) => resetTeamMemberPassword(admin.id).then((r) => ({ admin, ...r })),
    onSuccess: (res) => setModal({ kind: "password", name: res.admin.full_name, password: res.password }),
    onError: (e) => flash(e instanceof ApiClientError ? e.message : "That didn't work.", "#D81E32"),
  });

  return (
    <div>
      <div style={S.headRow}>
        <p style={S.lede}>Everyone with a way into the Ops console, and what they can touch.</p>
        <button type="button" onClick={() => setModal({ kind: "add" })} style={S.primaryBtn}>
          + Add admin
        </button>
      </div>

      {toast && (
        <div style={S.toast}>
          <span style={{ ...S.toastDot, background: toast.dot }} />
          {toast.text}
        </div>
      )}

      <div style={S.tableWrap}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 820 }}>
            <div style={{ ...S.rowGrid, ...S.tableHead }}>
              {["ADMIN", "ROLE", "QUEUES", "STATUS", "LAST SIGN-IN", ""].map((h, i) => (
                <span key={i} style={S.th}>
                  {h}
                </span>
              ))}
            </div>

            {isLoading && <div style={S.empty}>Loading the team…</div>}
            {error && <div style={S.empty}>Couldn't load the team. Try again.</div>}

            {data?.data.map((a) => (
              <Row
                key={a.id}
                a={a}
                isSelf={a.id === me?.id}
                onEdit={() => setModal({ kind: "edit", admin: a })}
                onDeactivate={() => setModal({ kind: "deactivate", admin: a })}
                onReactivate={() => reactivateMut.mutate(a.id)}
                onReset={() => resetMut.mutate(a)}
              />
            ))}
          </div>
        </div>
      </div>

      {modal?.kind === "add" && (
        <AddModal
          onClose={() => setModal(null)}
          onSubmit={(v) => createMut.mutate(v)}
          pending={createMut.isPending}
          error={createMut.error instanceof ApiClientError ? createMut.error : null}
        />
      )}
      {modal?.kind === "edit" && (
        <EditModal
          admin={modal.admin}
          onClose={() => setModal(null)}
          onSubmit={(role, queues) => updateMut.mutate({ id: modal.admin.id, role, queues })}
          pending={updateMut.isPending}
        />
      )}
      {modal?.kind === "deactivate" && (
        <ConfirmModal
          title={`Deactivate ${modal.admin.full_name}?`}
          body="They're signed out everywhere immediately and can't sign back in until someone reactivates this account."
          confirmLabel="Deactivate"
          pending={deactivateMut.isPending}
          onClose={() => setModal(null)}
          onConfirm={() => deactivateMut.mutate(modal.admin.id)}
        />
      )}
      {modal?.kind === "password" && (
        <PasswordModal name={modal.name} password={modal.password} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

function Row({
  a,
  isSelf,
  onEdit,
  onDeactivate,
  onReactivate,
  onReset,
}: {
  a: AdminRow;
  isSelf: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onReset: () => void;
}): JSX.Element {
  const initials = a.full_name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const disabled = a.status === "disabled";

  return (
    <div style={{ ...S.rowGrid, ...S.row, opacity: disabled ? 0.6 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
        <span style={S.avatar}>{initials}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ font: "600 14px/1.3 Archivo,sans-serif", color: "#1A1F2B" }}>{a.full_name}</span>
            {isSelf && <span style={S.youTag}>YOU</span>}
          </div>
          <div style={S.sub}>{a.email} · {a.phone}</div>
        </div>
      </div>
      <span style={{ font: "500 12px/1.4 'Instrument Sans',sans-serif", color: "#333B4A" }}>
        {ROLE_LABEL[a.role] ?? a.role}
      </span>
      <span style={S.sub}>
        {a.role === "admin_super" ? "All" : a.assigned_queues.length ? a.assigned_queues.join(", ") : "—"}
      </span>
      <span>
        <span
          style={{
            ...S.badge,
            background: disabled ? "#FDE7EA" : "#DDF3E9",
            borderColor: disabled ? "#F7BDC5" : "#A8DEC7",
            color: disabled ? "#A50E22" : "#076945",
          }}
        >
          {disabled ? "DISABLED" : "ACTIVE"}
        </span>
      </span>
      <span style={S.sub}>
        {a.last_login_at ? new Date(a.last_login_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "Never"}
      </span>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
        {!isSelf && (
          <>
            <button type="button" style={S.smallBtn} onClick={onEdit}>
              Edit
            </button>
            <button type="button" style={S.smallBtn} onClick={onReset}>
              Reset password
            </button>
            {disabled ? (
              <button type="button" style={S.smallBtn} onClick={onReactivate}>
                Reactivate
              </button>
            ) : (
              <button type="button" style={{ ...S.smallBtn, color: "#D81E32", borderColor: "#F7BDC5" }} onClick={onDeactivate}>
                Deactivate
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function QueuePicker({
  role,
  queues,
  onChange,
}: {
  role: AdminRole;
  queues: string[];
  onChange: (q: string[]) => void;
}): JSX.Element {
  if (role === "admin_super") {
    return <p style={S.hint}>An owner sees every queue - nothing to assign.</p>;
  }
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {QUEUES.map((q) => {
        const on = queues.includes(q);
        return (
          <button
            type="button"
            key={q}
            onClick={() => onChange(on ? queues.filter((x) => x !== q) : [...queues, q])}
            style={{ ...S.chip, background: on ? "#0F23A8" : "#FFFFFF", color: on ? "#FFFFFF" : "#333B4A", borderColor: on ? "#0F23A8" : "#E4E7EC" }}
          >
            {q}
          </button>
        );
      })}
    </div>
  );
}

function AddModal({
  onClose,
  onSubmit,
  pending,
  error,
}: {
  onClose: () => void;
  onSubmit: (v: { email: string; phone: string; full_name: string; role: AdminRole; queues: string[] }) => void;
  pending: boolean;
  error: ApiClientError | null;
}): JSX.Element {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AdminRole>("admin_reviewer");
  const [queues, setQueues] = useState<string[]>([]);

  return (
    <Overlay onClose={onClose}>
      <h2 style={S.modalTitle}>Add an admin</h2>
      <p style={S.modalBody}>
        They'll sign in with a generated password shown once at the end - relay it to them yourself, the same way
        the bootstrap script does.
      </p>
      <div style={{ display: "grid", gap: 12 }}>
        <Field label="Full name">
          <input style={S.input} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Wanjiru Kamau" />
        </Field>
        <Field label="Email">
          <input style={S.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="wanjiru@cral.co.ke" />
        </Field>
        <Field label="Phone (for the SMS sign-in code)">
          <input style={S.input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" />
        </Field>
        <Field label="Role">
          <select style={S.input} value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Queues">
          <QueuePicker role={role} queues={queues} onChange={setQueues} />
        </Field>
      </div>
      {error && <p style={S.errorText}>{error.message}</p>}
      <div style={S.modalActions}>
        <button type="button" style={S.secondaryBtn} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          style={S.primaryBtn}
          disabled={pending || !email || !phone || !fullName}
          onClick={() => onSubmit({ email, phone, full_name: fullName, role, queues })}
        >
          {pending ? "Creating…" : "Create admin"}
        </button>
      </div>
    </Overlay>
  );
}

function EditModal({
  admin,
  onClose,
  onSubmit,
  pending,
}: {
  admin: AdminRow;
  onClose: () => void;
  onSubmit: (role: AdminRole, queues: string[]) => void;
  pending: boolean;
}): JSX.Element {
  const [role, setRole] = useState<AdminRole>(admin.role);
  const [queues, setQueues] = useState<string[]>(admin.assigned_queues);

  return (
    <Overlay onClose={onClose}>
      <h2 style={S.modalTitle}>Edit {admin.full_name}</h2>
      <div style={{ display: "grid", gap: 12 }}>
        <Field label="Role">
          <select style={S.input} value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Queues">
          <QueuePicker role={role} queues={queues} onChange={setQueues} />
        </Field>
      </div>
      <div style={S.modalActions}>
        <button type="button" style={S.secondaryBtn} onClick={onClose}>
          Cancel
        </button>
        <button type="button" style={S.primaryBtn} disabled={pending} onClick={() => onSubmit(role, queues)}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </Overlay>
  );
}

function ConfirmModal({
  title,
  body,
  confirmLabel,
  pending,
  onClose,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}): JSX.Element {
  return (
    <Overlay onClose={onClose}>
      <h2 style={S.modalTitle}>{title}</h2>
      <p style={S.modalBody}>{body}</p>
      <div style={S.modalActions}>
        <button type="button" style={S.secondaryBtn} onClick={onClose}>
          Cancel
        </button>
        <button type="button" style={{ ...S.primaryBtn, background: "#D81E32" }} disabled={pending} onClick={onConfirm}>
          {pending ? "Working…" : confirmLabel}
        </button>
      </div>
    </Overlay>
  );
}

function PasswordModal({ name, password, onClose }: { name: string; password: string; onClose: () => void }): JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <Overlay onClose={onClose}>
      <h2 style={S.modalTitle}>{name}'s password</h2>
      <p style={S.modalBody}>
        Shown once - it isn't recoverable after you close this. Send it to them yourself (Slack, WhatsApp, in person).
      </p>
      <div style={S.passwordBox}>{password}</div>
      <div style={S.modalActions}>
        <button
          type="button"
          style={S.secondaryBtn}
          onClick={() => {
            void navigator.clipboard.writeText(password).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" style={S.primaryBtn} onClick={onClose}>
          Done
        </button>
      </div>
    </Overlay>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={S.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

function Overlay({ onClose, children }: { onClose: () => void; children: ReactNode }): JSX.Element {
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

const GRID = "minmax(0,1fr) 130px 160px 90px 100px 220px";

const S = {
  headRow: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16 },
  lede: { margin: 0, font: "400 14px/1.55 'Instrument Sans',sans-serif", color: "#5A6373", maxWidth: 520 },
  primaryBtn: {
    height: 44,
    padding: "0 18px",
    background: "#0F23A8",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "var(--r)",
    font: "600 14px/1 'Instrument Sans',sans-serif",
    cursor: "pointer",
  },
  secondaryBtn: {
    height: 44,
    padding: "0 16px",
    background: "#FFFFFF",
    color: "#1A1F2B",
    border: "1px solid #E4E7EC",
    borderRadius: "var(--r)",
    font: "600 14px/1 'Instrument Sans',sans-serif",
    cursor: "pointer",
  },
  smallBtn: {
    height: 32,
    padding: "0 10px",
    background: "#FFFFFF",
    color: "#333B4A",
    border: "1px solid #E4E7EC",
    borderRadius: "var(--r-sm)",
    font: "600 11px/1 'Instrument Sans',sans-serif",
    cursor: "pointer",
  },
  toast: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    marginBottom: 14,
    background: "#FFFFFF",
    border: "1px solid #E4E7EC",
    borderRadius: "var(--r)",
    font: "500 13px/1.4 'Instrument Sans',sans-serif",
    color: "#1A1F2B",
  },
  toastDot: { width: 8, height: 8, borderRadius: 999, flex: "none" },
  tableWrap: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", overflow: "hidden" },
  rowGrid: {
    display: "grid",
    gridTemplateColumns: GRID,
    alignItems: "center",
    gap: "clamp(10px,1.4vw,18px)",
    padding: "13px 18px",
  },
  tableHead: { padding: "10px 18px", background: "#FFFFFF", borderBottom: "1px solid #E4E7EC" },
  th: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#9AA2B0" },
  row: { borderBottom: "1px solid #F1F3F6" },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 999,
    background: "#F1F3F6",
    color: "#0F23A8",
    font: "600 11px/32px 'IBM Plex Mono',monospace",
    textAlign: "center",
    flex: "none",
  },
  sub: {
    font: "400 12px/1.4 'Instrument Sans',sans-serif",
    color: "#838C9B",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  youTag: {
    padding: "1px 7px",
    background: "#F1F3F6",
    borderRadius: 999,
    font: "600 9px/1.5 'IBM Plex Mono',monospace",
    letterSpacing: ".05em",
    color: "#5A6373",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 9px",
    border: "1px solid",
    borderRadius: 999,
    font: "600 10px/1.5 'IBM Plex Mono',monospace",
    letterSpacing: ".05em",
  },
  empty: { padding: "28px 18px", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(11,15,26,.44)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 80,
  },
  modal: {
    width: "100%",
    maxWidth: 440,
    background: "#FFFFFF",
    borderRadius: "var(--r-lg)",
    padding: 22,
    boxShadow: "0 24px 60px -18px rgba(11,15,26,.35)",
  },
  modalTitle: { margin: "0 0 8px", font: "600 18px/1.3 Archivo,sans-serif", color: "#1A1F2B" },
  modalBody: { margin: "0 0 16px", font: "400 13px/1.55 'Instrument Sans',sans-serif", color: "#5A6373" },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 },
  fieldLabel: { font: "600 11px/1 'IBM Plex Mono',monospace", letterSpacing: ".04em", color: "#5A6373" },
  input: {
    height: 42,
    padding: "0 12px",
    border: "1px solid #E4E7EC",
    borderRadius: "var(--r)",
    font: "400 14px/1 'Instrument Sans',sans-serif",
    color: "#1A1F2B",
    width: "100%",
    boxSizing: "border-box",
  },
  hint: { margin: 0, font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
  chip: {
    height: 30,
    padding: "0 12px",
    border: "1px solid",
    borderRadius: 999,
    font: "600 12px/1 'Instrument Sans',sans-serif",
    cursor: "pointer",
  },
  errorText: { margin: "10px 0 0", font: "500 13px/1.4 'Instrument Sans',sans-serif", color: "#D81E32" },
  passwordBox: {
    padding: "14px 14px",
    background: "#F1F3F6",
    borderRadius: "var(--r)",
    font: "600 15px/1.4 'IBM Plex Mono',monospace",
    color: "#1A1F2B",
    wordBreak: "break-all",
  },
} satisfies Record<string, CSSProperties>;
