import type { DraftVehicle } from "../../lib/onboarding-draft.js";

/**
 * How the vehicle form words itself for a car, a truck or a machine (PR H6):
 * the noun, which papers the details come from, what the photos should
 * show, and who comes with the hire. A machine has an operator, not a
 * driver, and often a serial number instead of a logbook plate.
 */
export function formWords(v: DraftVehicle): {
  noun: string;
  makePlaceholder: string;
  modelPlaceholder: string;
  lede: string;
  photoHint: string;
  photoTips: string;
  captions: readonly string[];
  crewLabel: string;
  crewHelper: string;
  withCrew: string;
  withoutCrew: string;
} {
  if (v.type === "machinery") {
    return {
      noun: "machine",
      makePlaceholder: "Caterpillar",
      modelPlaceholder: "320D",
      lede:
        v.registrationKind === "serial"
          ? "Copy the make, model and serial number from the machine's plate or papers, then add at least three photos. Documents come in the next step."
          : "Copy the make, model and registration straight from the logbook, then add at least three photos. Documents come in the next step.",
      photoHint: "At least three: the whole machine side on, the cab or controls, and the bucket, arm or attachment. Add more if they help.",
      photoTips: "Daylight, whole machine in frame. JPG, PNG or WEBP, up to 2MB each.",
      captions: ["Whole machine · side on", "Cab or controls", "Bucket, arm or attachment"],
      crewLabel: "Operator",
      crewHelper: "Whether your operator comes with the machine, or the hirer brings their own.",
      withCrew: "With operator",
      withoutCrew: "Hirer's own operator",
    };
  }
  if (v.type === "truck") {
    return {
      noun: "truck",
      makePlaceholder: "Isuzu",
      modelPlaceholder: "FRR",
      lede: "Copy the make, model and registration straight from the logbook, then add at least three photos. Documents come in the next step.",
      photoHint: "At least three: the front, the cab, and the load bed or body. Add more if they help.",
      photoTips: "Daylight, no number plate blur, whole truck in frame. JPG, PNG or WEBP, up to 2MB each.",
      captions: ["Front three-quarter", "Cab · dashboard", "Load bed or body"],
      crewLabel: "Driver",
      crewHelper: "Whether your driver comes with the truck, or the hirer brings their own.",
      withCrew: "With driver",
      withoutCrew: "Hirer's own driver",
    };
  }
  return {
    noun: "vehicle",
    makePlaceholder: "Toyota",
    modelPlaceholder: "Land Cruiser Prado",
    lede: "Copy the make, model and registration straight from the logbook, then add at least three photos. Documents come in the next step.",
    photoHint: "At least three: outside, inside, and the back or side. Add more if they help. Drag onto a card or click to browse.",
    photoTips: "Daylight, no number plate blur, whole vehicle in frame. JPG, PNG or WEBP, up to 2MB each.",
    captions: ["Front three-quarter", "Interior · dashboard", "Rear or side"],
    crewLabel: "Driver",
    crewHelper: "Whether this hire comes with your driver, or the hirer drives it themselves.",
    withCrew: "With driver",
    withoutCrew: "Self-drive",
  };
}
