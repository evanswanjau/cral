import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { usePageTitle } from "../lib/use-page-title.js";
import { getCatalogVehicle, formatMoney, photoSrc } from "../lib/catalog-api.js";
import { VEHICLE_CATEGORY_LABEL } from "../lib/vehicle-categories.js";
import { createBooking, listMyBookings } from "../lib/bookings-api.js";
import {
  register as registerAccount,
  login,
  startPhoneVerification,
  confirmPhoneVerification,
  updateMyPhone,
  getMe,
} from "../lib/auth-api.js";
import { uploadRenterDocument, type RenterDocKind } from "../lib/documents-api.js";
import { useIsAuthenticated, setSession, deviceId, TERMS_VERSION } from "../lib/auth.js";
import { ApiClientError } from "../lib/api.js";
import {
  BOOKING_STEPS,
  BookingSteps,
  NEW_ACCOUNT_BOOKING_STEPS,
} from "../components/site/BookingSteps.js";
import {
  earliestPickupDay,
  earliestReturnDay,
  formatHireDate,
  hireDays,
  hireInstants,
} from "../lib/hire-dates.js";

/**
 * `/book/:id` - the pre-booking half of a hire, reproduced from the
 * design's "booking" screen (`Cruz Ride Auto Website.dc.html`).
 *
 * **This page ends the moment a booking exists.** Everything after the
 * request - waiting on the owner, paying, the confirmed hire - lives at
 * `/bookings/:bookingId`, because that has a URL a renter can reload,
 * bookmark, and arrive at from a notification. This page used to hold the
 * created booking in React state, so a refresh threw it away, dropped the
 * renter back on step one, and then blocked them with `dates_unavailable`
 * against their *own* confirmed booking. That is the bug this split
 * exists to kill (2026-09-19).
 *
 * The same reasoning drives `useExistingBooking` below: arriving here for
 * a car you already have a live booking on is a resume, not a new
 * request, so it redirects instead of letting you build a duplicate.
 *
 * Stages: `account` (signed-out first-timers only, per the design's own
 * `bkStage: acct ? 'review' : 'account'`) -> `verify` (prove the phone) ->
 * `review` -> redirect to the trip, where the wait and then the payment
 * happen. Nothing is charged on any stage of THIS page, and nothing is
 * charged on the next one either until the owner accepts (owner's call,
 * 2026-09-21, reversing the 2026-09-20 pay-first order).
 */

/** The renter's typed-but-unsent note, kept across a reload. */
function draftKey(vehicleId: string, from: string, to: string): string {
  return `cral:booking-draft:${vehicleId}:${from}:${to}`;
}

function readDraft(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(key: string, value: string): void {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // A private window with storage blocked still books fine - the draft
    // is a convenience, never a requirement.
  }
}

const label = {
  display: "block",
  font: "600 12px/1 'Instrument Sans',sans-serif",
  color: "#5A6373",
  marginBottom: 7,
} as const;

const field = {
  width: "100%",
  height: 46,
  padding: "0 13px",
  border: "1px solid #CDD2DA",
  borderRadius: 8,
  font: "400 15px/1 'Instrument Sans',sans-serif",
  color: "#0B0F1A",
  background: "#FFFFFF",
} as const;

const monoField = { ...field, font: "500 15px/1 'IBM Plex Mono',monospace" } as const;

function ErrorNote({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div
      style={{
        marginBottom: 16,
        padding: "13px 15px",
        background: "#FDE7EA",
        border: "1px solid #F7BDC5",
        borderRadius: 8,
        font: "500 13.5px/1.5 'Instrument Sans',sans-serif",
        color: "#A50E22",
      }}
    >
      {children}
    </div>
  );
}

/** One of the two identity documents, picked before the account exists. */
function DocPicker({
  badge,
  title,
  hint,
  file,
  onChange,
}: {
  badge: string;
  title: string;
  hint: string;
  file: File | null;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}): JSX.Element {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 13,
          padding: "13px 15px",
          background: file ? "#DDF3E9" : "#F8F9FB",
          border: `1.5px dashed ${file ? "#A8DEC7" : "#CDD2DA"}`,
          borderRadius: 10,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            flex: "none",
            width: 36,
            height: 36,
            borderRadius: 8,
            background: file ? "#FFFFFF" : "#EDEFFC",
            color: file ? "#076945" : "#0F23A8",
            font: "600 11px/36px 'IBM Plex Mono',monospace",
            textAlign: "center",
          }}
        >
          {file ? "✓" : badge}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: "block",
              font: "600 13.5px/1.35 'Instrument Sans',sans-serif",
              color: "#0B0F1A",
              marginBottom: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {file ? file.name : title}
          </span>
          <span style={{ display: "block", font: "400 12px/1.45 'Instrument Sans',sans-serif", color: "#5A6373" }}>
            {file ? "Tap to choose a different photo" : hint}
          </span>
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={onChange}
        style={{ display: "none" }}
      />
    </>
  );
}

export function Booking(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  const isAuthenticated = useIsAuthenticated();
  const [stage, setStage] = useState<"account" | "verify" | "review">(
    isAuthenticated ? "review" : "account",
  );

  const key = draftKey(id ?? "", from, to);
  const [note, setNote] = useState(() => readDraft(key));
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Both documents are collected here, not just the licence. The booking
  // gate (`documents_required`) needs the ID *and* the licence, so asking
  // for one of them here only guaranteed a bounce to `/documents` at the
  // last step - the worst place to discover a second upload (2026-09-21).
  const [docFiles, setDocFiles] = useState<Record<RenterDocKind, File | null>>({
    national_id: null,
    driving_licence: null,
  });
  // The licence's own expiry, typed rather than read off the photo -
  // there is no OCR here, and the reviewer checks the card against it.
  const [licenceExpiry, setLicenceExpiry] = useState("");
  // Told to them as they type, not only when they press the button - an
  // expired licence means the whole step has to be redone, so it is worth
  // saying the moment the date is known.
  const licenceExpired = licenceExpiry !== "" && licenceExpiry < new Date().toISOString().slice(0, 10);

  // The dates are editable here, in place. Sending someone back to the
  // car page to fix a date threw away the account, the documents and the
  // note they had already filled in on this one.
  const [editingDates, setEditingDates] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  const [code, setCode] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [editingPhone, setEditingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState("");

  const [accountExists, setAccountExists] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const { data: car, isLoading } = useQuery({
    queryKey: ["catalog", "vehicle", id],
    queryFn: () => getCatalogVehicle(id!),
    enabled: !!id,
    retry: false,
  });

  // Already holding this car for these dates? Then this is a resume, not a
  // new request - send them to the booking they already have rather than
  // letting them build a duplicate and hit `dates_unavailable` against
  // themselves.
  const { data: mine } = useQuery({
    queryKey: ["bookings", "mine", "upcoming"],
    queryFn: () => listMyBookings({ filter: "upcoming", limit: 50 }),
    enabled: isAuthenticated && !!id,
    retry: false,
  });

  usePageTitle(car ? `Book ${car.make} ${car.model}` : "Book a car");

  useEffect(() => writeDraft(key, note), [key, note]);

  useEffect(() => {
    if (!isLoading && (!from || !to) && id) navigate(`/cars/${id}`, { replace: true });
  }, [isLoading, from, to, id, navigate]);

  useEffect(() => {
    if (!mine || !id) return;
    const existing = mine.data.find(
      (b) => b.vehicle.id === id && (b.status === "requested" || b.status === "confirmed"),
    );
    if (existing) navigate(`/bookings/${existing.id}`, { replace: true });
  }, [mine, id, navigate]);

  // A signed-in renter skips the account step, but still has to have a
  // proven phone before the request can go out.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    void getMe()
      .then((me) => {
        if (cancelled) return;
        setStage(me.phone && me.phone_verified ? "review" : "verify");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  if (isLoading || !car || !from || !to) {
    return (
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "60px 24px" }}>
        <p style={{ font: "400 15px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>Loading…</p>
      </div>
    );
  }

  const name = `${car.make} ${car.model} ${car.year}`;
  const days = hireDays(from, to);
  const total = car.daily_rate.amount * days;
  // Dates arrive in the URL, so a pair below this car's minimum can still
  // land here (an old link, an edited query string). Say so on the way in
  // rather than at the end of the flow - the car page now blocks it at
  // the point the dates are picked.
  const belowMinimum = days > 0 && days < car.minimum_hire_days;
  const here = `/book/${id}?from=${from}&to=${to}`;
  const steps = isAuthenticated ? BOOKING_STEPS : NEW_ACCOUNT_BOOKING_STEPS;
  const doneIndex = isAuthenticated ? 0 : stage === "account" ? 0 : 1;

  const failWith = (e: unknown) => {
    if (e instanceof ApiClientError) setError({ code: e.code, message: e.message });
    else setError({ code: "unknown", message: "Something went wrong. Try again." });
  };

  const onDocChange = (kind: RenterDocKind) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setDocFiles((prev) => ({ ...prev, [kind]: file }));
  };

  const createAccount = async () => {
    setError(null);
    setAccountExists(false);
    if (!fullName || !phone || !email || !password) {
      setError({ code: "account_required", message: "Fill in your name, phone, email and password to continue." });
      return;
    }
    if (password.length < 10) {
      setError({ code: "account_required", message: "Password needs to be at least 10 characters." });
      return;
    }
    // Asked for here rather than at the request step: the API blocks a
    // request until both are on file, so the last screen is the wrong
    // place to find that out.
    if (!docFiles.national_id || !docFiles.driving_licence) {
      setError({ code: "account_required", message: "Add a photo of your ID and your licence to continue." });
      return;
    }
    if (!licenceExpiry) {
      setError({ code: "account_required", message: "Enter the expiry date shown on your licence." });
      return;
    }
    if (licenceExpired) {
      setError({
        code: "account_required",
        message: "That licence has expired. CRAL can only accept a licence that is still in date.",
      });
      return;
    }

    setSubmitting(true);
    try {
      try {
        await registerAccount({
          email,
          password,
          role: "customer",
          full_name: fullName,
          phone,
          accepted_terms_version: TERMS_VERSION,
        });
      } catch (e) {
        if (e instanceof ApiClientError && e.code === "account_exists") {
          setAccountExists(true);
          // The server says which field collided - repeating "email" when
          // it was the phone sent people round in circles re-typing the
          // wrong one.
          setError({
            code: "account_exists",
            message:
              e.field === "phone"
                ? "That phone number is already on a CRAL account."
                : "That email already has a CRAL account.",
          });
          return;
        }
        throw e;
      }
      setSession(await login(email, password, deviceId()));

      for (const kind of ["national_id", "driving_licence"] as const) {
        const file = docFiles[kind];
        if (!file) continue;
        try {
          await uploadRenterDocument(kind, file, kind === "driving_licence" ? licenceExpiry : undefined);
        } catch {
          // Non-fatal: the review step's documents_required path still
          // offers /documents, and either can be added there.
        }
      }
      await sendCode();
    } catch (e) {
      failWith(e);
    } finally {
      setSubmitting(false);
    }
  };

  const openDateEditor = () => {
    setDraftFrom(from);
    setDraftTo(to);
    setEditingDates(true);
  };

  /** The dates live in the URL, so saving is a query-string change - the
   * page re-derives days, price and the minimum-hire check from it. */
  const saveDates = () => {
    if (!draftFrom || !draftTo) return;
    setParams({ from: draftFrom, to: draftTo }, { replace: true });
    setEditingDates(false);
  };

  const sendCode = async () => {
    setError(null);
    try {
      const res = await startPhoneVerification();
      setMaskedPhone(res.masked_destination);
      setStage("verify");
    } catch (e) {
      failWith(e);
      setStage("verify");
    }
  };

  const confirmCode = async () => {
    setError(null);
    if (code.trim().length < 4) {
      setError({ code: "code_required", message: "Enter the code we texted you." });
      return;
    }
    setSubmitting(true);
    try {
      await confirmPhoneVerification(code.trim());
      setCode("");
      setStage("review");
    } catch (e) {
      failWith(e);
    } finally {
      setSubmitting(false);
    }
  };

  const savePhone = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await updateMyPhone(newPhone);
      setEditingPhone(false);
      setNewPhone("");
      await sendCode();
    } catch (e) {
      failWith(e);
    } finally {
      setSubmitting(false);
    }
  };

  const submitRequest = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const result = await createBooking({
        vehicle_id: car.id,
        ...hireInstants(from, to),
        ...(note ? { note_from_hirer: note } : {}),
      });
      writeDraft(key, "");
      // The booking now owns the URL. Everything from here - waiting,
      // paying, collecting - happens somewhere a reload can find.
      navigate(`/bookings/${result.id}`, { replace: true });
    } catch (e) {
      if (e instanceof ApiClientError && e.code === "phone_verification_required") {
        await sendCode();
        return;
      }
      failWith(e);
    } finally {
      setSubmitting(false);
    }
  };

  const card = {
    background: "#FFFFFF",
    border: "1px solid #E4E7EC",
    borderRadius: 12,
    padding: "clamp(20px,2.8vw,30px)",
  } as const;

  const primaryButton = {
    width: "100%",
    height: 50,
    background: "#0F23A8",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 8,
    font: "600 16px/1 'Instrument Sans',sans-serif",
    cursor: submitting ? "default" : "pointer",
    opacity: submitting ? 0.7 : 1,
  } as const;

  return (
    <div style={{ padding: "clamp(20px,3vw,34px) clamp(14px,3vw,32px) clamp(40px,6vw,72px)" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <BookingSteps steps={steps} doneIndex={doneIndex} />

        <div style={{ display: "flex", gap: "clamp(16px,2.4vw,26px)", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 420px", minWidth: 300, ...card }}>
            {/* ---- account: first-time hirers only ---- */}
            {stage === "account" && (
              <div>
                <h1
                  style={{
                    margin: "0 0 8px",
                    font: "700 clamp(22px,2.8vw,29px)/1.12 Archivo,sans-serif",
                    fontVariationSettings: "'wdth' 108",
                    letterSpacing: "-.025em",
                    color: "#0B0F1A",
                  }}
                >
                  Set up your account.
                </h1>
                <p style={{ margin: "0 0 18px", font: "400 15px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                  Welcome to CRAL. Set this up once and you are ready to hire.
                </p>

                <div
                  style={{
                    display: "flex",
                    gap: 11,
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    padding: "13px 15px",
                    background: "#EDEFFC",
                    border: "1px solid #DCE1FA",
                    borderRadius: 10,
                    marginBottom: 20,
                  }}
                >
                  <span style={{ flex: "1 1 165px", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#0B1B85" }}>
                    Hired with CRAL before?
                  </span>
                  <Link
                    to={`/sign-in?next=${encodeURIComponent(here)}`}
                    style={{
                      flex: "none",
                      height: 36,
                      padding: "0 14px",
                      display: "inline-flex",
                      alignItems: "center",
                      background: "#FFFFFF",
                      color: "#0B1B85",
                      border: "1px solid #B6C0F4",
                      borderRadius: 8,
                      font: "600 13px/1 'Instrument Sans',sans-serif",
                      textDecoration: "none",
                    }}
                  >
                    Sign in instead
                  </Link>
                </div>

                <div style={{ display: "grid", gap: 14, marginBottom: 22 }}>
                  <label style={{ display: "block" }}>
                    <span style={label}>Full name, as on your licence</span>
                    <input
                      type="text"
                      autoComplete="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Brian Kiptoo"
                      style={field}
                    />
                  </label>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <label style={{ flex: "1 1 160px", display: "block" }}>
                      <span style={label}>Phone</span>
                      <input
                        type="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="0722 000 000"
                        style={monoField}
                      />
                    </label>
                    <label style={{ flex: "1 1 160px", display: "block" }}>
                      <span style={label}>Email</span>
                      <input
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        style={field}
                      />
                    </label>
                  </div>
                  <label style={{ display: "block" }}>
                    <span style={label}>Password</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 10 characters"
                      style={field}
                    />
                  </label>
                </div>

                <div style={{ ...label, marginBottom: 7 }}>Your ID and licence</div>
                <p style={{ margin: "0 0 13px", font: "400 13.5px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                  We need these to validate your identity and that you are licensed to drive.
                </p>
                <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
                  <DocPicker
                    badge="ID"
                    title="Add a photo of your national ID"
                    hint="Both sides in one photo, or the clearer side"
                    file={docFiles.national_id}
                    onChange={onDocChange("national_id")}
                  />
                  <DocPicker
                    badge="DL"
                    title="Add a photo of your driving licence"
                    hint="The whole card in frame, expiry date readable"
                    file={docFiles.driving_licence}
                    onChange={onDocChange("driving_licence")}
                  />
                  <label style={{ display: "block" }}>
                    <span style={label}>Licence expiry date</span>
                    <input
                      type="date"
                      min={new Date().toISOString().slice(0, 10)}
                      value={licenceExpiry}
                      onChange={(e) => setLicenceExpiry(e.target.value)}
                      style={{
                        ...monoField,
                        borderColor: licenceExpired ? "#F7BDC5" : "#CDD2DA",
                      }}
                    />
                    {licenceExpired && (
                      <span
                        style={{
                          display: "block",
                          marginTop: 6,
                          font: "500 12.5px/1.45 'Instrument Sans',sans-serif",
                          color: "#A50E22",
                        }}
                      >
                        That licence expired on {formatHireDate(licenceExpiry)}. CRAL can only
                        accept a licence that is still in date.
                      </span>
                    )}
                  </label>
                </div>

                {error && (
                  <ErrorNote>
                    {error.message}
                    {accountExists && (
                      <>
                        {" "}
                        <Link to={`/sign-in?next=${encodeURIComponent(here)}`} style={{ color: "#A50E22" }}>
                          Sign in instead →
                        </Link>
                      </>
                    )}
                  </ErrorNote>
                )}

                <button type="button" onClick={createAccount} disabled={submitting} style={primaryButton}>
                  {submitting ? "Creating account…" : "Create account and continue"}
                </button>
                {/* One page covers both today - see `pages/Legal.tsx`. */}
                <p
                  style={{
                    margin: "11px 0 0",
                    font: "400 12px/1.55 'Instrument Sans',sans-serif",
                    color: "#9AA2B0",
                    textAlign: "center",
                  }}
                >
                  Creating an account accepts our{" "}
                  <Link to="/legal" style={{ color: "#5A6373", textDecoration: "underline" }}>
                    terms and conditions
                  </Link>{" "}
                  and{" "}
                  <Link to="/legal" style={{ color: "#5A6373", textDecoration: "underline" }}>
                    privacy policy
                  </Link>
                  .
                </p>
              </div>
            )}

            {/* ---- verify the phone ---- */}
            {stage === "verify" && (
              <div>
                <h1
                  style={{
                    margin: "0 0 8px",
                    font: "700 clamp(22px,2.8vw,29px)/1.12 Archivo,sans-serif",
                    fontVariationSettings: "'wdth' 108",
                    letterSpacing: "-.025em",
                    color: "#0B0F1A",
                  }}
                >
                  Confirm your phone number.
                </h1>
                <p style={{ margin: "0 0 20px", font: "400 15px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                  {maskedPhone
                    ? `We've sent an SMS code to ${maskedPhone}. Enter it below to continue.`
                    : "We've sent you an SMS code. Enter it below to continue."}
                </p>

                {editingPhone ? (
                  <div style={{ display: "grid", gap: 12, marginBottom: 18 }}>
                    <label style={{ display: "block" }}>
                      <span style={label}>Your phone number</span>
                      <input
                        type="tel"
                        autoComplete="tel"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="0722 000 000"
                        style={monoField}
                      />
                    </label>
                    {error && <ErrorNote>{error.message}</ErrorNote>}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={savePhone}
                        disabled={submitting || !newPhone}
                        style={{ ...primaryButton, width: "auto", padding: "0 20px" }}
                      >
                        {submitting ? "Saving…" : "Save and send a code"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPhone(false);
                          setError(null);
                        }}
                        style={{
                          height: 50,
                          padding: "0 20px",
                          background: "#FFFFFF",
                          color: "#333B4A",
                          border: "1px solid #E4E7EC",
                          borderRadius: 8,
                          font: "600 15px/1 'Instrument Sans',sans-serif",
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <label style={{ display: "block", marginBottom: 18 }}>
                      <span style={label}>The six-digit code</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="000000"
                        style={{ ...monoField, letterSpacing: ".3em", fontSize: 18 }}
                      />
                    </label>

                    {error && <ErrorNote>{error.message}</ErrorNote>}

                    <button type="button" onClick={confirmCode} disabled={submitting} style={primaryButton}>
                      {submitting ? "Checking…" : "Confirm and continue"}
                    </button>
                    <div
                      style={{
                        display: "flex",
                        gap: 14,
                        justifyContent: "center",
                        flexWrap: "wrap",
                        marginTop: 13,
                      }}
                    >
                      <button
                        type="button"
                        onClick={sendCode}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          font: "500 13px/1 'Instrument Sans',sans-serif",
                          color: "#0F23A8",
                          cursor: "pointer",
                        }}
                      >
                        Send it again
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPhone(true);
                          setError(null);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          font: "500 13px/1 'Instrument Sans',sans-serif",
                          color: "#5A6373",
                          cursor: "pointer",
                        }}
                      >
                        Use a different number
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ---- review and send ---- */}
            {stage === "review" && (
              <div>
                <h1
                  style={{
                    margin: "0 0 8px",
                    font: "700 clamp(22px,2.8vw,29px)/1.12 Archivo,sans-serif",
                    fontVariationSettings: "'wdth' 108",
                    letterSpacing: "-.025em",
                    color: "#0B0F1A",
                  }}
                >
                  Check this, then send it to {car.owner.display_name}.
                </h1>
                <p style={{ margin: "0 0 22px", font: "400 15px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                  Check the dates and the price before you send.
                </p>

                {editingDates && (
                  <div
                    style={{
                      display: "grid",
                      gap: 12,
                      padding: "14px 15px",
                      background: "#F8F9FB",
                      border: "1px solid #E4E7EC",
                      borderRadius: 10,
                      marginBottom: 18,
                    }}
                  >
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <label style={{ flex: "1 1 140px", display: "block" }}>
                        <span style={label}>Pickup</span>
                        <input
                          type="date"
                          value={draftFrom}
                          min={earliestPickupDay()}
                          onChange={(e) => {
                            setDraftFrom(e.target.value);
                            const soonest = earliestReturnDay(e.target.value, car.minimum_hire_days);
                            if (draftTo && soonest && draftTo < soonest) setDraftTo(soonest);
                          }}
                          style={monoField}
                        />
                      </label>
                      <label style={{ flex: "1 1 140px", display: "block" }}>
                        <span style={label}>Return</span>
                        <input
                          type="date"
                          value={draftTo}
                          min={earliestReturnDay(draftFrom, car.minimum_hire_days) || earliestPickupDay()}
                          onChange={(e) => setDraftTo(e.target.value)}
                          style={monoField}
                        />
                      </label>
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={saveDates}
                        disabled={!draftFrom || !draftTo}
                        style={{
                          height: 40,
                          padding: "0 16px",
                          background: "#0F23A8",
                          color: "#FFFFFF",
                          border: "none",
                          borderRadius: 8,
                          font: "600 13.5px/1 'Instrument Sans',sans-serif",
                          cursor: draftFrom && draftTo ? "pointer" : "not-allowed",
                          opacity: draftFrom && draftTo ? 1 : 0.6,
                        }}
                      >
                        Use these dates
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingDates(false)}
                        style={{
                          height: 40,
                          padding: "0 14px",
                          background: "#FFFFFF",
                          color: "#5A6373",
                          border: "1px solid #CDD2DA",
                          borderRadius: 8,
                          font: "600 13.5px/1 'Instrument Sans',sans-serif",
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div style={{ display: "grid", gap: 9, marginBottom: 22 }}>
                  <Row
                    label="Pickup"
                    value={formatHireDate(from)}
                    action={editingDates ? undefined : { text: "Change", onClick: openDateEditor }}
                  />
                  <Row label="Return" value={formatHireDate(to)} />
                  <Row label={`${days} day${days > 1 ? "s" : ""} × ${formatMoney(car.daily_rate)}`} value={formatMoney({ amount: total, currency: car.daily_rate.currency })} />
                  <div style={{ borderTop: "1px solid #F1F3F6", paddingTop: 9 }}>
                    <Row bold label="Total to pay" value={formatMoney({ amount: total, currency: car.daily_rate.currency })} />
                  </div>
                </div>

                <label style={{ display: "block", marginBottom: 22 }}>
                  <span style={label}>Anything {car.owner.display_name} should know</span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    placeholder="Driving to Naivasha on Saturday, back Sunday evening."
                    style={{
                      width: "100%",
                      padding: "11px 13px",
                      border: "1px solid #CDD2DA",
                      borderRadius: 8,
                      font: "400 15px/1.5 'Instrument Sans',sans-serif",
                      color: "#0B0F1A",
                      resize: "vertical",
                    }}
                  />
                </label>

                {error && (
                  <ErrorNote>
                    {error.message}
                    {error.code === "documents_required" && (
                      <>
                        {" "}
                        {/* `next` is what brings them back here afterwards. */}
                        <Link to={`/documents?next=${encodeURIComponent(here)}`} style={{ color: "#A50E22" }}>
                          Add them now →
                        </Link>
                      </>
                    )}
                    {error.code === "dates_unavailable" && (
                      <>
                        {" "}
                        <Link to="/bookings" style={{ color: "#A50E22" }}>
                          See your bookings →
                        </Link>
                      </>
                    )}
                  </ErrorNote>
                )}

                {belowMinimum && (
                  <div
                    style={{
                      marginBottom: 18,
                      padding: "13px 15px",
                      background: "#FDE7EA",
                      border: "1px solid #F7BDC5",
                      borderRadius: 8,
                      font: "500 13.5px/1.5 'Instrument Sans',sans-serif",
                      color: "#A50E22",
                    }}
                  >
                    This car is hired for {car.minimum_hire_days} days at a time.{" "}
                    <button
                      type="button"
                      onClick={openDateEditor}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        font: "600 13.5px/1.5 'Instrument Sans',sans-serif",
                        color: "#A50E22",
                        textDecoration: "underline",
                        cursor: "pointer",
                      }}
                    >
                      Change the dates →
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={submitRequest}
                  disabled={submitting || belowMinimum}
                  style={{ ...primaryButton, opacity: submitting || belowMinimum ? 0.7 : 1 }}
                >
                  {submitting ? "Sending…" : "Send request"}
                </button>
                <p
                  style={{
                    margin: "11px 0 0",
                    font: "400 12.5px/1.55 'Instrument Sans',sans-serif",
                    color: "#838C9B",
                    textAlign: "center",
                  }}
                >
                  {/*
                   * Not "you are refunded in full" - that was true only
                   * under the brief pay-first flow (2026-09-20 to
                   * 2026-09-21). A renter pays after the owner accepts,
                   * so at this point nothing has been charged and there
                   * is nothing to refund. Promising a refund here invents
                   * a transaction that never happened.
                   */}
                  {car.owner.display_name} has twelve hours to accept. Nothing is charged for a
                  request - you only pay once they say yes.
                </p>
              </div>
            )}
          </div>

          {/* ---- the car, alongside ---- */}
          <aside
            style={{
              flex: "0 0 300px",
              minWidth: 260,
              background: "#FFFFFF",
              border: "1px solid #E4E7EC",
              borderRadius: 12,
              padding: "clamp(18px,2.4vw,22px)",
              position: "sticky",
              top: 82,
            }}
          >
            {/*
             * The car itself, not just its name - this panel is the only
             * thing on the page that says which car is being hired, and a
             * renter arriving from a notification or a reload should be
             * able to recognise it at a glance. Same photo, plate and spec
             * wording as the card they clicked (`CarDetail`/`VehicleCard`),
             * so nothing reads as a different car between screens.
             */}
            <div
              style={{
                aspectRatio: "16 / 10",
                borderRadius: 10,
                background: "#F1F3F6",
                position: "relative",
                overflow: "hidden",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {car.photo_urls[0] ? (
                <img
                  src={photoSrc(car.photo_urls[0])}
                  alt={name}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "center 75%",
                  }}
                />
              ) : (
                <span
                  style={{
                    font: "500 10px/1.5 'IBM Plex Mono',monospace",
                    letterSpacing: ".1em",
                    color: "#9AA2B0",
                    textAlign: "center",
                    padding: "0 16px",
                  }}
                >
                  NO PHOTO YET
                </span>
              )}
            </div>
            <div style={{ font: "600 15px/1.35 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 4 }}>
              {name}
            </div>
            <div style={{ font: "500 12px/1.4 'IBM Plex Mono',monospace", color: "#838C9B", marginBottom: 8 }}>
              {car.registration} · {car.county ?? "Location on request"}
            </div>
            <div style={{ font: "400 12.5px/1.5 'Instrument Sans',sans-serif", color: "#5A6373", marginBottom: 16 }}>
              {VEHICLE_CATEGORY_LABEL[car.category] ?? car.category} · {car.seats} seats ·{" "}
              {car.transmission === "manual" ? "Manual" : "Auto"} · {car.fuel} ·{" "}
              {car.chauffeured ? "With driver" : "Self-drive"}
            </div>
            <div style={{ display: "grid", gap: 9, paddingTop: 14, borderTop: "1px solid #F1F3F6" }}>
              <Row label={`${formatHireDate(from)} - ${formatHireDate(to)}`} value={`${days} day${days > 1 ? "s" : ""}`} />
              <Row label={`${formatMoney(car.daily_rate)} × ${days}`} value={formatMoney({ amount: total, currency: car.daily_rate.currency })} />
              <div style={{ borderTop: "1px solid #F1F3F6", paddingTop: 9 }}>
                <Row bold label="Total to pay" value={formatMoney({ amount: total, currency: car.daily_rate.currency })} />
              </div>
            </div>
            <p style={{ margin: "14px 0 0", font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" }}>
              Earliest pickup is {formatHireDate(earliestPickupDay())} - cars are back with their
              owner by six.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Row({
  label: rowLabel,
  value,
  bold,
  action,
}: {
  label: string;
  value: string;
  bold?: boolean;
  /** An inline "Change" affordance, e.g. on the pickup row. */
  action?: { text: string; onClick: () => void } | undefined;
}): JSX.Element {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
      <span
        style={{
          font: bold ? "600 14px/1.4 'Instrument Sans',sans-serif" : "400 13.5px/1.4 'Instrument Sans',sans-serif",
          color: bold ? "#0B0F1A" : "#5A6373",
        }}
      >
        {rowLabel}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            style={{
              marginLeft: 8,
              background: "none",
              border: "none",
              padding: 0,
              font: "600 12.5px/1 'Instrument Sans',sans-serif",
              color: "#0F23A8",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            {action.text}
          </button>
        )}
      </span>
      <span
        style={{
          font: bold ? "700 15px/1.4 Archivo,sans-serif" : "500 13.5px/1.4 'Instrument Sans',sans-serif",
          fontVariationSettings: bold ? "'wdth' 106" : undefined,
          color: "#0B0F1A",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}
