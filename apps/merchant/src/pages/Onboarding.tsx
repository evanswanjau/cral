import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { O } from "../components/onboarding/styles.js";
import { ErrorBanner } from "../components/onboarding/primitives.js";
import { getMe, logout } from "../lib/auth-api.js";
import { setSession } from "../lib/auth.js";
import {
  loadDraftFromServer,
  saveDraft,
  submitDraft,
  syncDraftToServer,
  type OnboardingDraft,
} from "../lib/onboarding-draft.js";
import { Welcome } from "../components/onboarding/steps/Welcome.js";
import { YourDetails } from "../components/onboarding/steps/YourDetails.js";
import { Vehicles } from "../components/onboarding/steps/Vehicles.js";
import { Documents } from "../components/onboarding/steps/Documents.js";
import { Review } from "../components/onboarding/steps/Review.js";
import { Done } from "../components/onboarding/steps/Done.js";

const STEPS = [
  { n: 1, label: "Welcome" },
  { n: 2, label: "Your details" },
  { n: 3, label: "Vehicles" },
  { n: 4, label: "Documents" },
  { n: 5, label: "Review" },
];

/**
 * Merchant onboarding wizard, built to the design bundle's rendered output
 * ("03 Merchant Onboarding.html" - see CLAUDE.md's "Getting the real
 * design source" note).
 *
 * Progress lives server-side (apps/api/src/modules/merchant) so it resumes
 * on any device - GET /merchant/onboarding on mount, a debounced PATCH on
 * every top-level field change, and real endpoints for vehicles/documents
 * called directly from their step components. localStorage is still
 * written on every change as a same-device offline-typing buffer only - 
 * see lib/onboarding-draft.ts's file header.
 */
export function Onboarding(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: initialDraft, isLoading } = useQuery({
    queryKey: ["onboarding"],
    queryFn: loadDraftFromServer,
  });
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [saved, setSaved] = useState(false);
  const resuming = useRef(false);
  const emailFetched = useRef(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  useEffect(() => {
    if (initialDraft && !draft) {
      resuming.current = initialDraft.step > 1 || initialDraft.vehicles.length > 0;
      setDraft(initialDraft);
    }
  }, [initialDraft, draft]);

  // Fetch the account email once…
  useEffect(() => {
    if (emailFetched.current) return;
    emailFetched.current = true;
    getMe()
      .then((me) => setAccountEmail(me.email ?? null))
      .catch(() => {
        // Onboarding still works without it - the email field just stays
        // "Loading…" rather than blocking the whole wizard on a /me failure.
      });
  }, []);

  // …and stamp it onto the draft whenever both are ready. Kept separate
  // because /me usually resolves before `draft` exists, and re-applied if a
  // draft reload from the server (which carries no email) wipes it.
  useEffect(() => {
    if (accountEmail && draft && draft.email !== accountEmail) {
      setDraft((d) => (d ? { ...d, email: accountEmail } : d));
    }
  }, [accountEmail, draft]);

  /**
   * Local-only: merges into the in-memory draft (and, via the effect below,
   * the localStorage offline-typing buffer) so typing feels instant. Does
   * NOT talk to the server - that only happens at a deliberate commit point
   * (moving to another step, or submitting), via `commitAndSync` below, so
   * a field never depends on a debounce window firing before the merchant
   * navigates away.
   */
  function patch(p: Partial<OnboardingDraft>) {
    setSaved(false);
    setDraft((d) => (d ? { ...d, ...p } : d));
  }

  useEffect(() => {
    if (!draft) return;
    saveDraft(draft);
    // Keep the shared query cache mirroring the live draft. Without this,
    // ["onboarding"] stays frozen at whatever `initialDraft` looked like on
    // this component's first mount - so RequireOnboarding (which shares the
    // same cache key) sees a stale, pre-submission snapshot the instant it
    // mounts, redirects back to /onboarding, and a fresh Onboarding mount
    // then rehydrates its own `draft` from that same stale entry, making
    // real progress (submission, uploaded documents) look "lost".
    queryClient.setQueryData(["onboarding"], draft);
  }, [draft, queryClient]);

  // Progress commits when the merchant moves between steps. That leaves one
  // gap: filling in a step and then closing the tab or reloading without
  // pressing Continue. Committing on pagehide/hidden closes it, and unlike
  // beforeunload these actually fire on mobile and on tab-close. `draftRef`
  // keeps the listener reading current state without re-subscribing on
  // every keystroke.
  const draftRef = useRef<OnboardingDraft | null>(null);
  draftRef.current = draft;

  useEffect(() => {
    function commitInFlight() {
      const current = draftRef.current;
      if (current) void syncDraftToServer(current).catch(() => {});
    }
    function onVisibility() {
      if (document.visibilityState === "hidden") commitInFlight();
    }
    window.addEventListener("pagehide", commitInFlight);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", commitInFlight);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  /** Merges `p` into the draft and sends the *whole* resulting draft to the server in one shot. */
  function commitAndSync(p: Partial<OnboardingDraft>) {
    if (!draft) return;
    const merged = { ...draft, ...p };
    setSaved(false);
    setDraft(merged);
    void syncDraftToServer(merged)
      .then(() => setSaved(true))
      .catch(() => {
        // The local/offline buffer already has this change - the next
        // commit point (another step change, or submit) tries again with
        // whatever's current at that time.
      });
  }

  function goStep(n: number) {
    commitAndSync({ step: n, maxStepReached: Math.max(draft?.maxStepReached ?? n, n) });
    window.scrollTo({ top: 0 });
  }

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!draft) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Review's terms-accepted toggle (and anything else touched on this
      // last step) has no later "continue" to piggyback a sync onto - this
      // is the final commit point before the real submit endpoint reads
      // the merchant row, so send it first.
      await syncDraftToServer(draft);
      const next = await submitDraft();
      setDraft(next);
      window.scrollTo({ top: 0 });
    } catch (err) {
      // The wizard's own client-side gates should normally prevent this - 
      // this is the honest backstop when the server disagrees.
      setSubmitError(err instanceof Error ? err.message : "Couldn't submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleAddAnother() {
    commitAndSync({ submitted: false, step: 3, screen: "fleet", editingVehicleId: null });
  }

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // The progress is already server-side (that's the whole point of
      // this rewrite) - a failed revoke call still shouldn't trap someone
      // on this screen, so sign them out locally regardless.
    }
    setSession(null);
    navigate("/sign-in", { replace: true });
  }

  if (isLoading || !draft) {
    return (
      <div style={O.page}>
        <div style={O.content} />
      </div>
    );
  }

  const showStepper = !draft.submitted;

  return (
    <div style={O.page}>
      <div style={O.topBar}>
        <div style={O.topBarInner}>
          <img src="/logo.png" alt="Cruz Ride Auto Limited" style={O.logo} />
          <div style={O.topBarRight}>
            <span style={{ ...O.saveState, ...(saved ? O.saveStateSaved : O.saveStateUnsaved) }}>
              {saved ? "DRAFT SAVED" : "NOT SAVED YET"}
            </span>
            <span style={O.topBarRule} />
            <span style={O.onboardingLabel}>MERCHANT ONBOARDING</span>
            <span style={O.topBarRule} />
            <button type="button" style={O.logoutButton} onClick={() => void handleLogout()}>
              LOG OUT
            </button>
            <span style={O.skewRuleTopBar} />
          </div>
        </div>
      </div>

      {showStepper && (
        <div style={O.stepperBar}>
          <div style={O.stepperInner}>
            {STEPS.map((s) => {
              const isDone = draft.step > s.n;
              const isActive = draft.step === s.n;
              const visited = s.n <= draft.maxStepReached;
              return (
                <button
                  type="button"
                  key={s.n}
                  disabled={!visited}
                  onClick={() => goStep(s.n)}
                  style={{
                    ...O.stepItem,
                    boxShadow: `inset 0 -2px 0 0 ${isActive ? "#0F23A8" : "transparent"}`,
                    cursor: visited ? "pointer" : "default",
                  }}
                >
                  <span
                    style={{
                      ...O.stepCircle,
                      background: isDone ? "#DDF3E9" : isActive ? "#0F23A8" : "#FFFFFF",
                      color: isDone ? "#0B8A5B" : isActive ? "#FFFFFF" : "#A7AEBB",
                      border: `1px solid ${isDone ? "#A8DEC7" : isActive ? "#0F23A8" : "#CDD2DA"}`,
                    }}
                  >
                    {isDone ? "✓" : s.n}
                  </span>
                  <span style={{ ...O.stepLabel, color: isActive || isDone ? "#0B0F1A" : "#A7AEBB" }}>
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <main style={O.content}>
        <div style={O.contentInner}>
        {draft.submitted ? (
          <Done draft={draft} onAddAnother={handleAddAnother} />
        ) : draft.step === 1 ? (
          <Welcome onStart={() => goStep(2)} resuming={resuming.current} />
        ) : draft.step === 2 ? (
          <YourDetails draft={draft} onChange={patch} onBack={() => goStep(1)} onContinue={() => goStep(3)} />
        ) : draft.step === 3 ? (
          <Vehicles draft={draft} onChange={patch} onBack={() => goStep(2)} onContinue={() => goStep(4)} />
        ) : draft.step === 4 ? (
          <Documents draft={draft} onChange={patch} onBack={() => goStep(3)} onContinue={() => goStep(5)} />
        ) : (
          <>
            {submitError && <div style={{ marginBottom: 16 }}><ErrorBanner message={submitError} /></div>}
            <Review
              draft={draft}
              onChange={patch}
              onEditStep={goStep}
              onBack={() => goStep(4)}
              onSubmit={handleSubmit}
              submitting={submitting}
            />
          </>
        )}
        </div>
      </main>

      <footer style={O.footer}>
        <div style={O.footerInner}>
          <div style={O.footerLeft}>
            <span style={O.skewRule} />
            <span style={O.footerText}>CRUZ RIDE AUTO LIMITED · CRAL.CO.KE</span>
          </div>
          <span style={O.footerRight}>HELLO@CRAL.CO.KE · +254 733 376061</span>
        </div>
      </footer>
    </div>
  );
}
