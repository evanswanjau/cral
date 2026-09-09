import type { Knex } from "knex";
import { addTimestamps } from "../schema-helpers.js";

/**
 * Two things (see docs/plans/admin-review-checklist.md):
 *
 *  1. **Two gates.** The vehicle approve gate stops requiring the
 *     merchant's own documents. `vehicle_review.required_document_kinds`
 *     shrinks to the three per-vehicle docs; a new
 *     `merchant_approval.required_document_kinds` holds the account /
 *     business set (wider for a company). An approved merchant
 *     (`merchants.approved_at`) clears the account half for every future
 *     car.
 *
 *  2. **Working checklists.** `vehicle_review.checklist` and
 *     `merchant_approval.checklist` are seeded item lists (id, group,
 *     label, help, severity block|flag, applies_when, an optional
 *     `document` the item hangs under, and the phrases a failed item drops
 *     into a request-changes / reject note). A reviewer works through them;
 *     a `block` item must `pass` before approve is allowed; `flag`s feed
 *     the note. Answers live in `vehicle_review_checks` /
 *     `merchant_review_checks`, one row per (entity, item), so a second
 *     reviewer sees what was checked.
 *
 *     On the vehicle case each item carries `document` (`logbook` /
 *     `comprehensive_insurance` / `tracker_certificate` / `photos`); the
 *     screen shows the checklist as an accordion under that document, and
 *     once every `block` item under a real document passes the document is
 *     marked accepted automatically.
 *
 * The item lists are editable later from Settings -> Review rules — same
 * seam as 20260907100000's `platform_settings`.
 */

const VEHICLE_CHECKLIST = [
  {
    id: "lb_pages",
    group: "Logbook",
    document: "logbook",
    severity: "block",
    label: "Logbook is complete and legible",
    help: "All pages present, text readable, corners in frame.",
    changes_phrase:
      "The logbook scan is incomplete or unreadable. Re-scan every page flat, in daylight, with all corners visible.",
    reject_phrase: "The logbook provided could not be verified.",
  },
  {
    id: "lb_plate",
    group: "Logbook",
    document: "logbook",
    severity: "block",
    label: "Registration on the logbook matches the plate",
    help: "The number on the logbook is the same as the plate on the listing.",
    changes_phrase:
      "The registration on the logbook does not match the plate on the listing. Correct the plate or upload the right logbook.",
    reject_phrase: "The logbook is for a different vehicle than the one listed.",
  },
  {
    id: "lb_owner",
    group: "Logbook",
    document: "logbook",
    severity: "block",
    label: "Registered owner matches the account",
    help: "The owner on the logbook is the merchant, their company, or a named director - or a signed management agreement plus the owner's ID is attached.",
    changes_phrase:
      "The name on the logbook does not match your account. Upload a logbook in your name, or a signed management agreement plus the owner's ID.",
    reject_phrase:
      "The logbook is in a third party's name with no management agreement on file.",
  },
  {
    id: "lb_details",
    group: "Logbook",
    document: "logbook",
    severity: "flag",
    label: "Make, model and year match the logbook",
    help: "The make/model/year entered agree with the logbook.",
    changes_phrase:
      "The make, model or year of manufacture on the listing does not match the logbook. Correct the listing details.",
    reject_phrase: "",
  },
  {
    id: "lb_vin",
    group: "Logbook",
    document: "logbook",
    severity: "flag",
    label: "Engine and chassis numbers are legible",
    help: "For the fraud paper-trail - both should be readable on the scan.",
    changes_phrase:
      "The engine or chassis number is not readable on the logbook scan. Re-scan the relevant page.",
    reject_phrase: "",
  },
  {
    id: "ins_comp",
    group: "Insurance",
    document: "comprehensive_insurance",
    severity: "block",
    label: "Cover is comprehensive, not third-party",
    help: "The certificate says COMPREHENSIVE, not THIRD PARTY ONLY.",
    changes_phrase:
      "The insurance uploaded is third-party only. A vehicle on Cruz Ride Auto must carry comprehensive cover. Upload the comprehensive certificate.",
    reject_phrase: "",
  },
  {
    id: "ins_current",
    group: "Insurance",
    document: "comprehensive_insurance",
    severity: "block",
    label: "Cover is in force - expiry date is in the future",
    help: "The 'valid to' date on the certificate has not passed. (Was an automatic check; now yours to confirm on the scan.)",
    changes_phrase:
      "The insurance certificate has expired or expires before the listing could go live. Upload a current certificate.",
    reject_phrase: "",
  },
  {
    id: "ins_plate",
    group: "Insurance",
    document: "comprehensive_insurance",
    severity: "block",
    label: "Registration on the certificate matches the plate",
    help: "The certificate covers this exact vehicle.",
    changes_phrase:
      "The registration on the insurance certificate does not match this vehicle. Upload the certificate for the listed plate.",
    reject_phrase: "",
  },
  {
    id: "ins_name",
    group: "Insurance",
    document: "comprehensive_insurance",
    severity: "flag",
    label: "Insured name matches the owner",
    help: "The policyholder is the merchant or the registered owner.",
    changes_phrase:
      "The name on the insurance certificate does not match the vehicle owner. Confirm the policy covers this owner.",
    reject_phrase: "",
  },
  {
    id: "trk_present",
    group: "Tracker",
    document: "tracker_certificate",
    severity: "block",
    applies_when: "rate_over:800000",
    label: "Tracker certificate is on file",
    help: "Required over KES 8,000 a day.",
    changes_phrase:
      "A tracker certificate is required for a vehicle at this daily rate. Upload the certificate from a licensed provider.",
    reject_phrase: "",
  },
  {
    id: "trk_plate",
    group: "Tracker",
    document: "tracker_certificate",
    severity: "block",
    applies_when: "rate_over:800000",
    label: "Tracker certificate names this plate",
    help: "The certificate is for this exact vehicle.",
    changes_phrase:
      "The tracker certificate does not name this vehicle's registration. Upload the certificate for the listed plate.",
    reject_phrase: "",
  },
  {
    id: "trk_current",
    group: "Tracker",
    document: "tracker_certificate",
    severity: "flag",
    applies_when: "rate_over:800000",
    label: "Tracker subscription is current",
    help: "Install / renewal date shows the subscription hasn't lapsed.",
    changes_phrase:
      "The tracker subscription appears to have lapsed. Upload proof of an active subscription.",
    reject_phrase: "",
  },
  {
    id: "ph_plate",
    group: "Photos",
    document: "photos",
    severity: "flag",
    label: "The plate is visible in a photo and matches",
    help: "At least one photo shows the number plate, and it matches the listing.",
    changes_phrase:
      "None of the photos clearly show the number plate. Add a photo with the plate visible.",
    reject_phrase: "",
  },
  {
    id: "ph_real",
    group: "Photos",
    document: "photos",
    severity: "flag",
    label: "Photos are of this actual vehicle",
    help: "Not stock or marketing images; a real, specific car.",
    changes_phrase:
      "The photos look like stock images rather than this vehicle. Upload your own photos of the actual car.",
    reject_phrase: "The photos provided are not of the listed vehicle.",
  },
  {
    id: "ph_damage",
    group: "Photos",
    document: "photos",
    severity: "flag",
    label: "No major damage that contradicts availability",
    help: "The car looks roadworthy and hireable.",
    changes_phrase:
      "The photos show damage that needs explaining before this can go live. Add a note or updated photos.",
    reject_phrase: "",
  },
];

const MERCHANT_CHECKLIST = [
  {
    id: "id_scan",
    group: "Owner identity",
    severity: "block",
    label: "National ID is complete and legible",
    help: "Both sides, readable, not expired.",
    changes_phrase: "The National ID scan is incomplete or unreadable. Re-scan both sides clearly.",
    reject_phrase: "",
  },
  {
    id: "id_name",
    group: "Owner identity",
    severity: "block",
    label: "ID name matches the account owner name",
    help: "The name on the ID is the name entered on the account.",
    changes_phrase:
      "The name on your National ID does not match the name on the account. Correct the account name.",
    reject_phrase: "",
  },
  {
    id: "kra_name",
    group: "Owner identity",
    severity: "block",
    label: "KRA PIN certificate name matches the ID",
    help: "Personal KRA PIN is in the same name as the National ID.",
    changes_phrase:
      "The name on the KRA PIN certificate does not match your National ID. Upload the correct certificate.",
    reject_phrase: "",
  },
  {
    id: "kra_match",
    group: "Owner identity",
    severity: "flag",
    label: "KRA PIN on the certificate matches the one entered",
    help: "The PIN typed on the account is the one on the certificate.",
    changes_phrase:
      "The KRA PIN entered does not match the certificate. Correct the PIN on your account.",
    reject_phrase: "",
  },
  {
    id: "co_cert",
    group: "Company",
    severity: "block",
    applies_when: "company",
    label: "Certificate of Incorporation is on file and legible",
    help: "Shows the company name and registration number.",
    changes_phrase: "The Certificate of Incorporation is missing or unreadable. Upload a clear copy.",
    reject_phrase: "",
  },
  {
    id: "co_name",
    group: "Company",
    severity: "block",
    applies_when: "company",
    label: "Company name matches the certificate exactly",
    help: "The registered name on the certificate is the name entered.",
    changes_phrase:
      "The company name on your account does not match the Certificate of Incorporation. Correct the company name.",
    reject_phrase: "",
  },
  {
    id: "co_regno",
    group: "Company",
    severity: "block",
    applies_when: "company",
    label: "Incorporation number matches the one entered",
    help: "The registration number on the certificate is the one on the account.",
    changes_phrase:
      "The incorporation number on your account does not match the certificate. Correct it.",
    reject_phrase: "",
  },
  {
    id: "co_kra",
    group: "Company",
    severity: "block",
    applies_when: "company",
    label: "Company KRA PIN certificate is on file and in the company name",
    help: "The company's own KRA PIN, matching the company name.",
    changes_phrase:
      "The company KRA PIN certificate is missing or is not in the company's name. Upload the correct certificate.",
    reject_phrase: "",
  },
  {
    id: "cr12_age",
    group: "Company",
    severity: "block",
    applies_when: "company",
    label: "CR12 is dated within the last 12 months",
    help: "An older CR12 does not reflect current directors and shareholders.",
    changes_phrase:
      "The CR12 provided is more than 12 months old. Upload a current CR12 from the Registrar of Companies.",
    reject_phrase: "",
  },
  {
    id: "cr12_dir",
    group: "Company",
    severity: "block",
    applies_when: "company",
    label: "Contact person appears on the CR12",
    help: "The account's contact person is a director or shareholder on the CR12 - or an authority letter is attached.",
    changes_phrase:
      "The contact person on the account is not listed on the CR12. Add them, or attach a board resolution / authority letter.",
    reject_phrase: "We could not confirm that the contact person is authorised to act for the company.",
  },
  {
    id: "co_status",
    group: "Company",
    severity: "flag",
    applies_when: "company",
    label: "Company is active / not struck off",
    help: "From the CR12 or a registry check.",
    changes_phrase:
      "The company appears inactive or struck off the register. Provide evidence it is in good standing.",
    reject_phrase: "",
  },
  {
    id: "co_addr",
    group: "Company",
    severity: "flag",
    applies_when: "company",
    label: "Physical address is a real business address",
    help: "Specific and plausible - not a PO box alone.",
    changes_phrase:
      "The physical address on file is not specific enough. Provide a full business address.",
    reject_phrase: "",
  },
  {
    id: "same_ent",
    group: "Consistency",
    severity: "block",
    label: "Every document names the same entity",
    help: "ID, KRA and (for a company) the certificates all agree on who this is.",
    changes_phrase:
      "Your documents do not all refer to the same person or company. Upload a consistent set.",
    reject_phrase: "The documents provided refer to different entities.",
  },
  {
    id: "no_alter",
    group: "Consistency",
    severity: "flag",
    label: "No signs of document alteration",
    help: "Fonts, stamps and alignment look genuine; no edited fields.",
    changes_phrase: "One or more documents show signs of editing. Upload clean originals.",
    reject_phrase: "A document shows signs of alteration. This account has been paused for review.",
  },
  {
    id: "payout_nm",
    group: "Payout",
    severity: "flag",
    label: "Payout name matches the account owner / company",
    help: "The M-Pesa or bank account name is the merchant's.",
    changes_phrase: "The payout account name does not match your account. Update your payout details.",
    reject_phrase: "",
  },
];

export async function up(knex: Knex): Promise<void> {
  await knex("platform_settings")
    .where({ key: "vehicle_review.required_document_kinds" })
    .update({
      value: JSON.stringify(["logbook", "comprehensive_insurance", "tracker_certificate"]),
      updated_at: knex.fn.now(),
    });

  await knex("platform_settings").insert([
    {
      key: "merchant_approval.required_document_kinds",
      value: JSON.stringify({
        individual: ["national_id", "kra_pin"],
        company: ["national_id", "kra_pin", "certificate_of_incorporation", "company_kra_pin", "cr12"],
      }),
    },
    { key: "vehicle_review.checklist", value: JSON.stringify(VEHICLE_CHECKLIST) },
    { key: "merchant_approval.checklist", value: JSON.stringify(MERCHANT_CHECKLIST) },
  ]);

  await knex.schema.createTable("vehicle_review_checks", (table) => {
    table.string("vehicle_id", 34).notNullable().references("id").inTable("vehicles").onDelete("CASCADE");
    table.string("item_id", 40).notNullable();
    table.string("result", 10).notNullable().defaultTo("pending"); // pending | pass | flag
    table.text("note").nullable();
    table.string("checked_by", 34).nullable(); // admin_users.id
    table.timestamp("checked_at", { useTz: true }).nullable();
    addTimestamps(knex, table);
    table.primary(["vehicle_id", "item_id"]);
  });

  await knex.schema.createTable("merchant_review_checks", (table) => {
    table.string("merchant_id", 34).notNullable().references("id").inTable("merchants").onDelete("CASCADE");
    table.string("item_id", 40).notNullable();
    table.string("result", 10).notNullable().defaultTo("pending");
    table.text("note").nullable();
    table.string("checked_by", 34).nullable();
    table.timestamp("checked_at", { useTz: true }).nullable();
    addTimestamps(knex, table);
    table.primary(["merchant_id", "item_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("merchant_review_checks");
  await knex.schema.dropTableIfExists("vehicle_review_checks");
  await knex("platform_settings")
    .whereIn("key", [
      "merchant_approval.required_document_kinds",
      "vehicle_review.checklist",
      "merchant_approval.checklist",
    ])
    .delete();
  await knex("platform_settings")
    .where({ key: "vehicle_review.required_document_kinds" })
    .update({
      value: JSON.stringify([
        "logbook",
        "comprehensive_insurance",
        "tracker_certificate",
        "national_id",
        "kra_pin",
      ]),
      updated_at: knex.fn.now(),
    });
}
