import { useEffect, useRef, useState } from "react";
import { O } from "../styles.js";
import { Combobox } from "../Combobox.js";
import { MAX_PHOTOS, PhotoUpload } from "../PhotoUpload.js";
import { MAKE_NAMES, modelsForMake, POPULAR_KENYAN_MAKES } from "../../../lib/vehicle-catalogue.js";
import { VEHICLE_CATEGORIES, vehicleTypeLabel } from "../../../lib/vehicle-categories.js";
import { COUNTIES } from "../../../lib/kenya.js";
import { RateField } from "../RateField.js";
import {
  BackButton,
  FormField,
  PlateBadge,
  PrimaryButton,
  Select,
  TextInput,
} from "../primitives.js";
import {
  createVehicleOnServer,
  deleteVehicleOnServer,
  emptyVehicle,
  updateVehicleOnServer,
  type DraftVehicle,
  type Fuel,
  type OnboardingDraft,
  type Transmission,
  type VehicleType,
} from "../../../lib/onboarding-draft.js";

/** Value is the stored category slug; the label is how it reads on screen. */
const VEHICLE_TYPES = VEHICLE_CATEGORIES;
const TRANSMISSIONS: Transmission[] = ["Automatic", "Manual"];
const FUELS: Fuel[] = ["Petrol", "Diesel", "Hybrid", "Electric"];
/**
 * Kenyan plates are 3 letters + 3 digits + 1 letter (KDL 442N). Space is
 * inserted after the first three characters as the merchant types, rather
 * than requiring them to type it themselves.
 */
function formatPlate(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  return clean.length > 3 ? `${clean.slice(0, 3)} ${clean.slice(3)}` : clean;
}

export function Vehicles({
  draft,
  onChange,
  onBack,
  onContinue,
}: {
  draft: OnboardingDraft;
  onChange: (patch: Partial<OnboardingDraft>) => void;
  onBack: () => void;
  onContinue: () => void;
}): JSX.Element {
  if (draft.screen === "vehicle-form") {
    const saved = draft.vehicles.find((v) => v.id === draft.editingVehicleId);
    // Resume whatever was typed before the reload, as long as it belongs to
    // the vehicle being edited.
    const inProgress =
      draft.vehicleDraft && draft.vehicleDraft.id === draft.editingVehicleId ? draft.vehicleDraft : null;
    const editing = inProgress ?? saved ?? emptyVehicle(draft.editingVehicleId ?? "");
    return (
      <VehicleForm
        key={editing.id}
        vehicle={editing}
        isNew={!draft.vehicles.some((v) => v.id === editing.id)}
        onDraftChange={(v) => onChange({ vehicleDraft: v })}
        onCancel={() => onChange({ screen: "fleet", editingVehicleId: null, vehicleDraft: null })}
        onSave={(v) => {
          const exists = draft.vehicles.some((x) => x.id === v.id);
          const vehicles = exists ? draft.vehicles.map((x) => (x.id === v.id ? v : x)) : [...draft.vehicles, v];
          onChange({ vehicles, screen: "fleet", editingVehicleId: null, vehicleDraft: null });
        }}
      />
    );
  }

  return (
    <div style={O.wFleet}>
      <div style={O.stepEyebrow}>STEP 3 OF 5</div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
        <div>
          <h1 style={O.h1Step}>Your vehicles</h1>
          <p style={O.stepLede}>
            {draft.vehicles.length === 0
              ? "Add your first vehicle. You can add the rest of the fleet now or come back to it later."
              : "Add as many as you like now, or come back for the rest later. Papers for each one come in the next step."}
          </p>
        </div>
        <span style={{ font: "500 12px/1 'IBM Plex Mono',monospace", letterSpacing: ".07em", color: "#838C9B", whiteSpace: "nowrap" }}>
          {draft.vehicles.length} VEHICLE{draft.vehicles.length === 1 ? "" : "S"}
        </span>
      </div>

      <div style={O.fleetList}>
        {draft.vehicles.map((v) => (
          <div key={v.id} style={O.fleetRow}>
            <PlateBadge>{v.registration || "-"}</PlateBadge>
            <div style={{ flex: "1 1 0%", minWidth: 160 }}>
              <div style={O.fleetName}>{v.make} {v.model}</div>
              <div style={O.fleetSub}>
                {vehicleTypeLabel(v.type)} · {v.year} · {v.transmission} · {v.colour || "-"} · {v.county || "-"} · {v.chauffeured ? "With driver" : "Self-drive"}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={O.fleetRatePrefix}>KES</span>{" "}
              <span style={O.fleetRate}>{Number(v.dailyRate || 0).toLocaleString("en-KE")}</span>
              <span style={O.fleetRateSuffix}>/day</span>
            </div>
            <div style={O.fleetActions}>
              <button
                type="button"
                style={O.fleetEditBtn}
                onClick={() => onChange({ screen: "vehicle-form", editingVehicleId: v.id })}
              >
                Edit
              </button>
              <button
                type="button"
                style={O.fleetRemoveBtn}
                onClick={() => {
                  onChange({ vehicles: draft.vehicles.filter((x) => x.id !== v.id) });
                  void deleteVehicleOnServer(v.id);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        style={O.dashedAddRow}
        onClick={() => onChange({ screen: "vehicle-form", editingVehicleId: `v_${Date.now()}` })}
      >
        {draft.vehicles.length === 0 ? "+ Add your first vehicle" : "+ Add another vehicle"}
      </button>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <BackButton onClick={onBack}>← Back</BackButton>
        <PrimaryButton disabled={draft.vehicles.length === 0} onClick={onContinue}>
          Continue to documents
        </PrimaryButton>
      </div>
    </div>
  );
}

function VehicleForm({
  vehicle,
  isNew,
  onCancel,
  onSave,
  onDraftChange,
}: {
  vehicle: DraftVehicle;
  isNew: boolean;
  onCancel: () => void;
  onSave: (v: DraftVehicle) => void;
  onDraftChange: (v: DraftVehicle) => void;
}): JSX.Element {
  const [v, setV] = useState<DraftVehicle>(vehicle);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  // The real server-side vehicle id, once one exists - needed before photos
  // can be uploaded (they need a real vehicle_id). Existing vehicles start
  // with one (vehicle.id is already a server id by the time it's editable);
  // a new vehicle gets one lazily, the first moment its required fields are
  // filled in, via the effect below.
  const [serverVehicleId, setServerVehicleId] = useState<string | null>(isNew ? null : vehicle.id);
  const creatingRef = useRef(false);
  const updateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Every keystroke is mirrored up to the draft so a reload resumes here.
  const patch = (p: Partial<DraftVehicle>) =>
    setV((prev) => {
      const next = { ...prev, ...p };
      onDraftChange(next);
      return next;
    });

  const requiredFilled = v.make.trim() && v.model.trim() && v.year.trim() && v.registration.trim() && v.county.trim() && v.pickupAddress.trim() && v.dailyRate.trim();
  const photosOk = v.photos.length === MAX_PHOTOS;

  // Lazily create the vehicle on the server the first moment it's saveable
  // in principle - this is what lets PhotoUpload attach photos to a real
  // vehicle_id before the merchant clicks "Save vehicle".
  useEffect(() => {
    if (!isNew || serverVehicleId || creatingRef.current || !requiredFilled) return;
    creatingRef.current = true;
    createVehicleOnServer(v)
      .then((created) => setServerVehicleId(created.id))
      .catch(() => {
        // Stays null - PhotoUpload keeps showing "fill in the details
        // above first" and the next field edit retries via this effect.
      })
      .finally(() => {
        creatingRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, serverVehicleId, requiredFilled]);

  // Debounced sync of field edits once the vehicle exists server-side.
  useEffect(() => {
    if (!serverVehicleId) return;
    if (updateTimer.current) clearTimeout(updateTimer.current);
    updateTimer.current = setTimeout(() => {
      void updateVehicleOnServer(serverVehicleId, v);
    }, 800);
    return () => {
      if (updateTimer.current) clearTimeout(updateTimer.current);
    };
  }, [v, serverVehicleId]);

  async function handleSave() {
    if (!requiredFilled || !photosOk) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    try {
      const id = serverVehicleId ?? (await createVehicleOnServer(v)).id;
      // The server's response is authoritative for docs/photos - they were
      // uploaded directly via PhotoUpload, not through this PATCH body.
      const saved = await updateVehicleOnServer(id, v);
      onSave(saved);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    // Nothing has been committed to the draft's vehicle list yet - a
    // vehicle created during this session by the lazy-create effect above
    // is an orphan the merchant explicitly walked away from.
    if (isNew && serverVehicleId) void deleteVehicleOnServer(serverVehicleId);
    onCancel();
  }

  return (
    <div style={O.wVehicleForm}>
      <button type="button" onClick={handleCancel} style={O.backLink}>← All vehicles</button>
      <h1 style={O.h1Step}>{isNew ? "Add a vehicle" : `Edit ${vehicle.registration || "vehicle"}`}</h1>
      <p style={{ ...O.stepLede, marginBottom: 20 }}>
        Copy the make, model and registration straight from the logbook, then add at least three
        photos. Documents come in the next step.
      </p>

      <div style={O.formRow}>
        <div style={O.formMain}>
          <div style={O.formCard}>
            <div style={O.formFields}>
              <FormField label="Vehicle type">
                <Select value={v.type} onChange={(e) => patch({ type: e.target.value as VehicleType })}>
                  {VEHICLE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </FormField>
              <FormField label="Make" required error={showErrors && !v.make.trim() ? "Required." : undefined} helper="Pick from the list or type your own.">
                <Combobox
                  value={v.make}
                  onChange={(make) => patch({ make })}
                  options={MAKE_NAMES}
                  defaultOptions={POPULAR_KENYAN_MAKES}
                  placeholder="Toyota"
                  error={showErrors && !v.make.trim()}
                  emptyHint="Not listed - we'll use what you typed."
                />
              </FormField>
              <FormField label="Model" required error={showErrors && !v.model.trim() ? "Required." : undefined} helper="Include the trim if the logbook does.">
                <Combobox
                  value={v.model}
                  onChange={(model) => patch({ model })}
                  options={modelsForMake(v.make)}
                  placeholder="Land Cruiser Prado"
                  error={showErrors && !v.model.trim()}
                  emptyHint="Not listed - we'll use what you typed."
                />
              </FormField>
              <FormField label="Year" required error={showErrors && !v.year.trim() ? "Required." : undefined} helper="Four digits.">
                <TextInput value={v.year} onChange={(e) => patch({ year: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="2019" error={showErrors && !v.year.trim()} />
              </FormField>
              <FormField label="Registration" required error={showErrors && !v.registration.trim() ? "Required." : undefined} helper="Spaced and uppercased as you type.">
                <TextInput
                  value={v.registration}
                  onChange={(e) => patch({ registration: formatPlate(e.target.value) })}
                  placeholder="KDL 442N"
                  error={showErrors && !v.registration.trim()}
                />
              </FormField>
              <FormField label="Transmission">
                <Select value={v.transmission} onChange={(e) => patch({ transmission: e.target.value as Transmission })}>
                  {TRANSMISSIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </FormField>
              <FormField label="Fuel">
                <Select value={v.fuel} onChange={(e) => patch({ fuel: e.target.value as Fuel })}>
                  {FUELS.map((f) => <option key={f} value={f}>{f}</option>)}
                </Select>
              </FormField>
              <FormField label="Colour" helper="As written in the logbook.">
                <TextInput value={v.colour} onChange={(e) => patch({ colour: e.target.value })} placeholder="Pearl white" />
              </FormField>
              <FormField label="County" required error={showErrors && !v.county.trim() ? "Required." : undefined} helper="Where this vehicle is based.">
                <Select value={v.county} onChange={(e) => patch({ county: e.target.value })}>
                  <option value="">Select a county</option>
                  {COUNTIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Pickup address" required error={showErrors && !v.pickupAddress.trim() ? "Required." : undefined} helper="Road or estate, plus town - hirers see the area only.">
                <TextInput value={v.pickupAddress} onChange={(e) => patch({ pickupAddress: e.target.value })} placeholder="Westlands, Nairobi" error={showErrors && !v.pickupAddress.trim()} />
              </FormField>
              <RateField
                grossValue={v.dailyRate}
                mode={v.rateMode}
                onChange={(g, m) => patch({ dailyRate: g, rateMode: m })}
                error={showErrors && !v.dailyRate.trim()}
              />
              <FormField label="Driver" helper="Whether this hire comes with your driver, or the hirer drives it themselves.">
                <Select
                  value={v.chauffeured ? "chauffeured" : "self_drive"}
                  onChange={(e) => patch({ chauffeured: e.target.value === "chauffeured" })}
                >
                  <option value="chauffeured">With driver (chauffeured)</option>
                  <option value="self_drive">Self-drive</option>
                </Select>
              </FormField>
            </div>
          </div>

      <div style={{ ...O.card, marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={O.cardTitle}>Photos</div>
          <span
            style={{
              ...O.statusPillBase,
              background: photosOk ? "#DDF3E9" : "#FFF3DB",
              border: `1px solid ${photosOk ? "#A8DEC7" : "#F5D9A3"}`,
              color: photosOk ? "#076945" : "#8A5200",
            }}
          >
            {v.photos.length}/{MAX_PHOTOS}
          </span>
        </div>
        <p style={{ ...O.helper, marginTop: 0, marginBottom: 14 }}>
          Exactly three - outside, inside, and the back or side. Drag onto a card or click to browse.
        </p>

        <PhotoUpload photos={v.photos} onChange={(photos) => patch({ photos })} vehicleId={serverVehicleId} />

        {showErrors && !photosOk && <div style={O.fieldError}>Add three photos before saving.</div>}
        <p style={{ ...O.helper, marginTop: 6 }}>
          Daylight, no number plate blur, whole vehicle in frame. JPG, PNG or WEBP, up to 2MB each.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <BackButton onClick={handleCancel}>Cancel</BackButton>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {showErrors && (!requiredFilled || !photosOk) && (
            <span style={{ font: "600 13px/1 'Instrument Sans',sans-serif", color: "#D81E32" }}>Check the highlighted fields.</span>
          )}
          <PrimaryButton onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving…" : "Save vehicle"}
          </PrimaryButton>
        </div>
      </div>
        </div>

        <Earnings dailyRate={v.dailyRate} />
      </div>
    </div>
  );
}

/** CRAL's commission on completed bookings - merchant-facing surfaces only. */
const COMMISSION_PCT = 10;

const fmt = (n: number): string => n.toLocaleString("en-KE");

/**
 * What the owner actually takes home: the price hirers see, CRAL's cut, and
 * the resulting per-day earnings. Deliberately *not* a demand-pricing
 * calculator - no quiet-day/long-hire tiers (owner's call, 2026-08-25).
 * Fee is rounded to whole shillings and earnings derived by subtraction, so
 * the three figures always reconcile exactly and no float reaches the UI.
 */
export function Earnings({ dailyRate }: { dailyRate: string }): JSX.Element {
  const rate = Number(dailyRate) || 0;
  const fee = Math.round((rate * COMMISSION_PCT) / 100);
  const earns = rate - fee;

  return (
    <aside style={O.earnAside}>
      <div style={O.earnHead}>
        <span style={O.earnRule} />
        <span style={O.earnHeadText}>WHAT YOU EARN</span>
      </div>

      <div style={O.earnRow}>
        <span style={O.earnLabel}>
          Listed price, per day
          <span style={O.earnSub}>What hirers see</span>
        </span>
        <span style={O.earnValue}>{rate ? `KES ${fmt(rate)}` : "-"}</span>
      </div>

      <div style={O.earnRow}>
        <span style={O.earnLabel}>
          CRAL fee
          <span style={O.earnSub}>Only on completed bookings - never while a vehicle sits idle</span>
        </span>
        <span style={{ ...O.earnValue, color: rate ? "#A50E22" : "#0B0F1A" }}>
          {rate ? `− KES ${fmt(fee)}` : "-"}
        </span>
      </div>

      <div style={O.earnHighlight}>
        <div style={O.earnHighlightLabel}>You earn, per day</div>
        <div style={O.earnHighlightValue}>
          <span style={O.earnHighlightKes}>KES</span>
          {rate ? fmt(earns) : "-"}
        </div>
      </div>

      <div style={O.earnNote}>
        {rate
          ? "Nothing is charged while the vehicle sits idle. Our fee applies only to completed bookings and is set out in the merchant terms you accept at the end."
          : "Type a daily rate and we will show what you earn."}
      </div>
    </aside>
  );
}
