import "../lib/load-env.js";
import { db } from "../db/client.js";
import { generateId } from "../lib/ids.js";
import { getOrCreateMerchant } from "../modules/merchant/service.js";

/**
 * `npm run seed:vehicles -w apps/api -- <email>` — loads the design
 * bundle's own seven-vehicle SEED fleet ("Cruz Merchant Portal.dc.html")
 * against an existing user's merchant row, so the built screen can be
 * compared directly against the design canvas rather than eyeballed.
 * Wipes that merchant's existing vehicles first, so it's safe to re-run.
 */

interface SeedDoc {
  kind: "logbook" | "comprehensive_insurance" | "tracker_certificate";
  review_state: "ok" | "pending" | "expiring" | "rejected";
  expires_at?: string;
}

interface SeedEvent {
  kind: string;
  tone: "grey" | "blue" | "green" | "amber" | "red";
  label: string;
  body?: string;
  occurred_at: string;
}

interface SeedVehicle {
  registration: string;
  type: string;
  make: string;
  model: string;
  year: string;
  seats: number;
  transmission: string;
  fuel: string;
  colour: string;
  pickup_address: string;
  daily_rate: number; // KES, not cents
  minimum_hire_days: number;
  chauffeured: boolean;
  status: "draft" | "pending" | "review" | "action" | "rejected" | "live" | "paused";
  submitted_at: string | null;
  verification_badge: "none" | "pending" | "active";
  verification_badge_expires_at?: string;
  reviewer_note?: string;
  reviewer_note_meta?: string;
  reviewer_note_resolved?: boolean;
  docs: SeedDoc[];
  events: SeedEvent[];
}

const SEED: SeedVehicle[] = [
  {
    registration: "KDL 442N", type: "SUV", make: "Toyota", model: "Land Cruiser Prado", year: "2019", seats: 7,
    transmission: "Automatic", fuel: "Diesel", colour: "Pearl white", pickup_address: "Nairobi · Westlands",
    daily_rate: 12500, minimum_hire_days: 2, chauffeured: true, status: "review", submitted_at: "2026-08-09T18:02:00Z",
    verification_badge: "none",
    docs: [
      { kind: "logbook", review_state: "ok" },
      { kind: "comprehensive_insurance", review_state: "ok", expires_at: "2027-03-14" },
      { kind: "tracker_certificate", review_state: "ok" },
    ],
    events: [
      { kind: "reviewer_opened", tone: "blue", label: "Reviewer opened your file", occurred_at: "2026-08-12T09:41:00Z" },
      { kind: "submitted", tone: "grey", label: "Submitted for review", body: "Three documents and six photos received.", occurred_at: "2026-08-09T18:02:00Z" },
    ],
  },
  {
    registration: "KCX 118T", type: "Van", make: "Toyota", model: "Hiace 9-seater", year: "2017", seats: 9,
    transmission: "Manual", fuel: "Diesel", colour: "Silver", pickup_address: "Nairobi · Embakasi",
    daily_rate: 9000, minimum_hire_days: 1, chauffeured: true, status: "action", submitted_at: "2026-08-04T11:12:00Z",
    verification_badge: "none",
    reviewer_note:
      "The certificate uploaded is third-party only. Kenyan law allows it, but a vehicle carrying paying passengers on CRAL must carry comprehensive cover with PSV endorsement. Upload the comprehensive certificate and we will finish the review the same day.",
    reviewer_note_meta: "J. Otieno · Compliance · 11 AUG 2026",
    reviewer_note_resolved: false,
    docs: [
      { kind: "logbook", review_state: "ok" },
      { kind: "comprehensive_insurance", review_state: "rejected" },
      { kind: "tracker_certificate", review_state: "ok" },
    ],
    events: [
      { kind: "note", tone: "red", label: "More information needed", body: "Insurance certificate rejected.", occurred_at: "2026-08-11T15:20:00Z" },
      { kind: "reviewer_opened", tone: "blue", label: "Reviewer opened your file", occurred_at: "2026-08-11T14:55:00Z" },
      { kind: "submitted", tone: "grey", label: "Submitted for review", occurred_at: "2026-08-04T11:12:00Z" },
    ],
  },
  {
    registration: "KDA 907Q", type: "Car", make: "Nissan", model: "Note", year: "2018", seats: 5,
    transmission: "Automatic", fuel: "Petrol", colour: "Gunmetal", pickup_address: "Nairobi · Kilimani",
    daily_rate: 4200, minimum_hire_days: 1, chauffeured: false, status: "live", submitted_at: "2026-07-12T08:40:00Z",
    verification_badge: "active", verification_badge_expires_at: "2027-07-24",
    docs: [
      { kind: "logbook", review_state: "ok" },
      { kind: "comprehensive_insurance", review_state: "ok", expires_at: "2026-09-30" },
      { kind: "tracker_certificate", review_state: "ok" },
    ],
    events: [
      { kind: "verification_activated", tone: "green", label: "Verification badge activated", body: "Agent visit confirmed the vehicle. Valid until July 2027.", occurred_at: "2026-07-24T16:30:00Z" },
      { kind: "approved", tone: "green", label: "Approved and live", occurred_at: "2026-07-15T10:08:00Z" },
      { kind: "submitted", tone: "grey", label: "Submitted for review", occurred_at: "2026-07-12T08:40:00Z" },
    ],
  },
  {
    registration: "KBZ 663M", type: "Lorry", make: "Isuzu", model: "FRR 10-tonne", year: "2015", seats: 3,
    transmission: "Manual", fuel: "Diesel", colour: "White", pickup_address: "Mombasa · Changamwe",
    daily_rate: 18000, minimum_hire_days: 3, chauffeured: true, status: "pending", submitted_at: "2026-08-13T20:15:00Z",
    verification_badge: "none",
    docs: [
      { kind: "logbook", review_state: "ok" },
      { kind: "comprehensive_insurance", review_state: "pending", expires_at: "2027-01-08" },
      { kind: "tracker_certificate", review_state: "ok" },
    ],
    events: [
      { kind: "submitted", tone: "amber", label: "Submitted for review", body: "In the queue. Reviews take up to two working days.", occurred_at: "2026-08-13T20:15:00Z" },
    ],
  },
  {
    registration: "KDG 233V", type: "Car", make: "Toyota", model: "Fielder", year: "2016", seats: 5,
    transmission: "Automatic", fuel: "Petrol", colour: "Silver", pickup_address: "Nakuru · Milimani",
    daily_rate: 3800, minimum_hire_days: 1, chauffeured: false, status: "live", submitted_at: "2026-07-18T17:26:00Z",
    verification_badge: "none",
    reviewer_note: "Your insurance expires in 19 days. Upload the renewal before 02 September and the listing keeps taking bookings without a break.",
    reviewer_note_meta: "Automatic check · 14 AUG 2026",
    reviewer_note_resolved: false,
    docs: [
      { kind: "logbook", review_state: "ok" },
      { kind: "comprehensive_insurance", review_state: "ok", expires_at: "2026-09-02" },
      { kind: "tracker_certificate", review_state: "ok" },
    ],
    events: [
      { kind: "expiring", tone: "amber", label: "Insurance expiring soon", body: "19 days left on the current certificate.", occurred_at: "2026-08-14T06:00:00Z" },
      { kind: "approved", tone: "green", label: "Approved and live", occurred_at: "2026-07-21T12:44:00Z" },
      { kind: "submitted", tone: "grey", label: "Submitted for review", occurred_at: "2026-07-18T17:26:00Z" },
    ],
  },
  {
    registration: "KCB 771A", type: "Pickup", make: "Mitsubishi", model: "L200 double cab", year: "2014", seats: 5,
    transmission: "Manual", fuel: "Diesel", colour: "Black", pickup_address: "Eldoret · Town",
    daily_rate: 0, minimum_hire_days: 1, chauffeured: true, status: "draft", submitted_at: null,
    verification_badge: "none",
    docs: [{ kind: "logbook", review_state: "ok" }],
    events: [
      { kind: "draft_started", tone: "grey", label: "Draft started", body: "Three documents and a daily rate still to add.", occurred_at: "2026-08-13T22:07:00Z" },
    ],
  },
  {
    registration: "KDL 559X", type: "SUV", make: "Mazda", model: "CX-5", year: "2020", seats: 5,
    transmission: "Automatic", fuel: "Petrol", colour: "Soul red", pickup_address: "Nairobi · Karen",
    daily_rate: 9500, minimum_hire_days: 2, chauffeured: false, status: "rejected", submitted_at: "2026-07-29T09:18:00Z",
    verification_badge: "none",
    reviewer_note:
      "The name on the logbook is Achieng Odhiambo, which does not match your account or your company registration. We can only list vehicles you own or are contracted to manage. Upload a logbook in your name, or a signed management agreement plus the owner's ID.",
    reviewer_note_meta: "A. Wanjiru · Compliance · 01 AUG 2026",
    reviewer_note_resolved: false,
    docs: [
      { kind: "logbook", review_state: "rejected" },
      { kind: "comprehensive_insurance", review_state: "ok", expires_at: "2027-02-11" },
      { kind: "tracker_certificate", review_state: "ok" },
    ],
    events: [
      { kind: "rejected", tone: "red", label: "Rejected", body: "Logbook is in a third party's name.", occurred_at: "2026-08-01T11:35:00Z" },
      { kind: "reviewer_opened", tone: "blue", label: "Reviewer opened your file", occurred_at: "2026-08-01T11:02:00Z" },
      { kind: "submitted", tone: "grey", label: "Submitted for review", occurred_at: "2026-07-29T09:18:00Z" },
    ],
  },
];

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npm run seed:vehicles -w apps/api -- <email>");
    process.exit(1);
  }

  const user = await db("users").where({ email }).first();
  if (!user) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
  }

  const merchant = await getOrCreateMerchant(user.id);
  // The design's fleet belongs to a mature, already-approved merchant —
  // set that here rather than requiring a second approve:merchant run.
  await db("merchants").where({ id: merchant.id }).update({ approved_at: new Date() });
  await db("vehicles").where({ merchant_id: merchant.id }).delete();

  for (const seed of SEED) {
    const [vehicle] = await db("vehicles")
      .insert({
        id: generateId("vehicle"),
        merchant_id: merchant.id,
        type: seed.type,
        make: seed.make,
        model: seed.model,
        year: seed.year,
        registration: seed.registration,
        transmission: seed.transmission,
        fuel: seed.fuel,
        colour: seed.colour,
        seats: seed.seats,
        pickup_address: seed.pickup_address,
        daily_rate_amount: seed.daily_rate * 100,
        minimum_hire_days: seed.minimum_hire_days,
        chauffeured: seed.chauffeured,
        status: seed.status,
        listing_ref: `CRAL-V-${await nextRef()}`,
        submitted_at: seed.submitted_at,
        verification_badge: seed.verification_badge,
        verification_badge_expires_at: seed.verification_badge_expires_at ?? null,
        reviewer_note: seed.reviewer_note ?? null,
        reviewer_note_meta: seed.reviewer_note_meta ?? null,
        reviewer_note_resolved: seed.reviewer_note_resolved ?? false,
      })
      .returning("*");

    for (const doc of seed.docs) {
      await db("documents").insert({
        id: generateId("document"),
        merchant_id: merchant.id,
        vehicle_id: vehicle.id,
        kind: doc.kind,
        storage_key: `seed/${vehicle.id}/${doc.kind}`,
        original_name: `${doc.kind}.pdf`,
        size_bytes: 12345,
        content_type: "application/pdf",
        review_state: doc.review_state,
        expires_at: doc.expires_at ?? null,
      });
    }

    for (const event of seed.events) {
      await db("vehicle_events").insert({
        id: generateId("vehicleEvent"),
        vehicle_id: vehicle.id,
        merchant_id: merchant.id,
        kind: event.kind,
        tone: event.tone,
        label: event.label,
        body: event.body ?? null,
        actor_type: "system",
        occurred_at: event.occurred_at,
      });
    }

    // eslint-disable-next-line no-console
    console.log(`Seeded ${seed.registration} (${vehicle.id})`);
  }

  await db.destroy();
}

async function nextRef(): Promise<string> {
  const result = await db.raw<{ rows: { n: string }[] }>("select nextval('vehicle_listing_ref_seq') as n");
  return result.rows[0]!.n;
}

main().catch((error: unknown) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
