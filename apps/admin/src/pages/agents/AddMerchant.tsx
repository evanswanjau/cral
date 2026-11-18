import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addAgentMerchant, type InviteResult } from "../../lib/agents-api.js";
import { ApiClientError } from "../../lib/api.js";
import { usePageTitle } from "../../lib/use-page-title.js";
import { A } from "./ui.js";

type OwnerType = "individual" | "company";

/**
 * Add merchant - one form, four fields (Phase 3, PR AG1,
 * `openapi/admin-agents.yaml`). Creates the owner's account and emails them
 * a link to set their own password; the agent never sees or sets it.
 *
 * Not from a canvas file - see `./ui.tsx`.
 */
export function AddMerchant(): JSX.Element {
  usePageTitle("Add merchant");
  const queryClient = useQueryClient();

  const [ownerType, setOwnerType] = useState<OwnerType>("individual");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [done, setDone] = useState<InviteResult | null>(null);

  const add = useMutation({
    mutationFn: addAgentMerchant,
    onSuccess: (res) => {
      setDone(res);
      void queryClient.invalidateQueries({ queryKey: ["admin", "agents", "merchants"] });
    },
  });

  const error = add.error instanceof ApiClientError ? add.error : null;
  const fieldError = (field: string) => (error?.field === field ? error.message : null);
  const ready = name.trim().length >= 2 && email.includes("@") && phone.trim().length >= 9;

  function reset(): void {
    setOwnerType("individual");
    setName("");
    setEmail("");
    setPhone("");
    setDone(null);
    add.reset();
  }

  if (done) {
    return (
      <div style={{ maxWidth: 560 }}>
        <h1 style={A.h1}>{done.invite_sent ? "Invite sent" : "Saved - the email didn't go"}</h1>
        <div style={{ ...A.card, padding: 20, marginTop: 14 }}>
          <p style={{ ...A.lede, margin: 0, color: "#1A1F2B" }}>
            {done.invite_sent ? (
              <>
                <strong>{done.merchant.name ?? done.merchant.email}</strong> will get an email at{" "}
                <strong>{done.merchant.email}</strong> to set their password and finish setting up. The link works for 7
                days.
              </>
            ) : (
              <>
                The account for <strong>{done.merchant.name ?? done.merchant.email}</strong> is saved, but the email to{" "}
                <strong>{done.merchant.email}</strong> didn't go through. Use Resend invite on My merchants in a few
                minutes.
              </>
            )}
          </p>
          <p style={{ ...A.hint, marginTop: 12 }}>
            They'll confirm their phone with an SMS code when they finish onboarding, then a CRAL reviewer checks the
            account and each vehicle before anything goes live.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
          <button type="button" style={A.primaryBtn} onClick={reset}>
            Add another
          </button>
          <Link to="/my-merchants" style={A.secondaryBtn}>
            Go to My merchants
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={A.h1}>Add merchant</h1>
      <p style={{ ...A.lede, marginBottom: 18 }}>
        Start an owner's account. We email them a link to set their own password and finish setting up - you never see
        or set it.
      </p>

      <form
        style={{ ...A.card, padding: 20, display: "grid", gap: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready || add.isPending) return;
          add.mutate({ owner_type: ownerType, name: name.trim(), email: email.trim(), phone: phone.trim() });
        }}
      >
        <div>
          <span style={A.label}>WHO ARE YOU SIGNING UP?</span>
          <div role="radiogroup" aria-label="Owner type" style={F.segment}>
            {(
              [
                { key: "individual", label: "A person" },
                { key: "company", label: "A company" },
              ] as const
            ).map((o) => {
              const on = ownerType === o.key;
              return (
                <button
                  key={o.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setOwnerType(o.key)}
                  style={{
                    ...F.segmentBtn,
                    background: on ? "#FFFFFF" : "transparent",
                    color: on ? "#0B0F1A" : "#5A6373",
                    boxShadow: on ? "0 1px 2px rgba(11,15,26,.12)" : "none",
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label htmlFor="am-name" style={A.label}>
            {ownerType === "company" ? "COMPANY NAME" : "OWNER'S FULL NAME"}
          </label>
          <input
            id="am-name"
            style={A.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={ownerType === "company" ? "Kamau Haulage Ltd" : "Jane Wanjiru Kamau"}
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="am-email" style={A.label}>
            EMAIL
          </label>
          <input
            id="am-email"
            type="email"
            inputMode="email"
            style={A.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            autoComplete="off"
            autoCapitalize="none"
          />
          {fieldError("email") ? (
            <p style={A.fieldError}>{fieldError("email")}</p>
          ) : (
            <p style={A.hint}>Their sign-in. The invite goes here, so check it with them.</p>
          )}
        </div>

        <div>
          <label htmlFor="am-phone" style={A.label}>
            PHONE
          </label>
          <input
            id="am-phone"
            type="tel"
            inputMode="tel"
            style={A.input}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0712 345 678"
            autoComplete="off"
          />
          {fieldError("phone") ? (
            <p style={A.fieldError}>{fieldError("phone")}</p>
          ) : (
            <p style={A.hint}>They'll confirm it with an SMS code when they finish onboarding.</p>
          )}
        </div>

        {error && error.field !== "email" && error.field !== "phone" && (
          <p style={{ ...A.errorText, margin: 0 }}>{error.message}</p>
        )}
        {add.error && !error && <p style={{ ...A.errorText, margin: 0 }}>Something went wrong. Try again.</p>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="submit" style={{ ...A.primaryBtn, opacity: ready ? 1 : 0.55 }} disabled={!ready || add.isPending}>
            {add.isPending ? "Adding…" : "Add and send invite"}
          </button>
          <Link to="/my-merchants" style={A.secondaryBtn}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

const F = {
  segment: {
    display: "inline-flex",
    gap: 4,
    padding: 4,
    background: "#F1F3F6",
    borderRadius: "var(--r)",
  },
  segmentBtn: {
    height: 36,
    padding: "0 16px",
    border: "none",
    borderRadius: "var(--r-sm)",
    font: "600 13px/1 'Instrument Sans',sans-serif",
    cursor: "pointer",
  },
} satisfies Record<string, CSSProperties>;
