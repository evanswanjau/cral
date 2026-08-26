import { useNavigate } from "react-router-dom";
import { O } from "../styles.js";
import { ImageSquare } from "@phosphor-icons/react/dist/ssr/ImageSquare";
import { PlateBadge, PrimaryButton, SecondaryButton, StatusPill } from "../primitives.js";
import { usePhotoPreview } from "../../../lib/use-photo-preview.js";
import type { DraftPhoto, OnboardingDraft } from "../../../lib/onboarding-draft.js";

const NEXT_STEPS = [
  {
    color: "#C77400",
    title: "Document review · free",
    body: "Logbook matched to your ID, insurance dates confirmed, tracker certificate checked",
  },
  {
    color: "#CDD2DA",
    title: "Approved and live",
    body: "We let you know as soon as your listing is approved and can be booked",
  },
  {
    color: "#CDD2DA",
    title: "Manage everything from your dashboard",
    body: "Add vehicles, update rates, renew documents before they expire - and add the verified badge once you're approved",
  },
];

/** Cover thumbnail for a submitted vehicle; re-fetches its bytes after a reload. */
function DoneVehicleCover({ photo }: { photo: DraftPhoto | undefined }): JSX.Element {
  const cover = usePhotoPreview(photo?.documentId);
  return cover && photo ? (
    <img src={cover} alt={photo.name} style={O.doneVehicleThumb} />
  ) : (
    <span style={O.doneVehicleThumbFallback}>
      <ImageSquare size={18} weight="fill" color="#CDD2DA" />
    </span>
  );
}

export function Done({ draft, onAddAnother }: { draft: OnboardingDraft; onAddAnother: () => void }): JSX.Element {
  const navigate = useNavigate();
  return (
    <div style={O.doneWrap}>
      <div style={O.doneCheck}>✓</div>
      <h1 style={O.doneHeading}>Submitted for review</h1>
      <p style={O.doneLede}>
        We pick this up within two working days. Your listing goes live once it is approved and we
        let you know the moment it does.
      </p>

      {draft.vehicles.length > 0 && (
        <div style={O.reviewCard}>
          <div style={O.reviewCardHead}>
            <StatusPill status="pending" />
            <span style={O.sectionAside}>
              {draft.vehicles.length} VEHICLE{draft.vehicles.length === 1 ? "" : "S"}
            </span>
          </div>
          {draft.vehicles.map((v, i) => {
            const firstPhoto = v.photos[0];
            return (
              <div
                key={v.id}
                style={{
                  ...O.doneVehicleRow,
                  ...(i > 0 ? { borderTop: "1px solid #F1F3F6" } : {}),
                }}
              >
                <DoneVehicleCover photo={firstPhoto} />
                <div style={{ flex: "1 1 0%", minWidth: 140 }}>
                  <div style={O.fleetName}>{v.make} {v.model}</div>
                  <div style={O.fleetSub}>
                    {v.type} · {v.year} · {v.photos.length} photo{v.photos.length === 1 ? "" : "s"}
                  </div>
                </div>
                <PlateBadge>{v.registration || "-"}</PlateBadge>
                <div style={{ textAlign: "right" }}>
                  <span style={O.fleetRatePrefix}>KES</span>{" "}
                  <span style={O.fleetRate}>{Number(v.dailyRate || 0).toLocaleString("en-KE")}</span>
                  <span style={O.fleetRateSuffix}>/day</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={O.nextStepsCard}>
        <div style={O.nextStepEyebrow}>WHAT HAPPENS NEXT</div>
        {NEXT_STEPS.map((s) => (
          <div key={s.title} style={O.nextStepRow}>
            <span style={{ ...O.nextStepDot, background: s.color }} />
            <div>
              <div style={O.nextStepTitle}>{s.title}</div>
              <div style={O.nextStepBody}>{s.body}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...O.actionsRow, justifyContent: "center", marginTop: 24 }}>
        <PrimaryButton onClick={() => navigate("/")}>Proceed to dashboard</PrimaryButton>
        <SecondaryButton onClick={onAddAnother}>Add another vehicle</SecondaryButton>
      </div>
    </div>
  );
}
