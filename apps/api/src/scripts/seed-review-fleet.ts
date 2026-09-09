import "../lib/load-env.js";
import { ulid } from "ulid";
import { db } from "../db/client.js";
import { generateId } from "../lib/ids.js";
import { hashPassword } from "../lib/password.js";
import { nextListingRef, appendVehicleEvent } from "../lib/vehicle-events.js";

/**
 * `npm run seed:review-fleet -w apps/api` — stands up a throwaway merchant
 * with a spread of submitted vehicles so the admin vehicle-review queue
 * (PR 2) has something real to work against. Non-destructive: it creates
 * its own merchant each run (a fresh `review-fleet-<ts>@example.test`), so
 * nothing existing is touched. Dev only — refuses under NODE_ENV=production.
 *
 * Document bytes are not stored (fake `storage_key`s), so "Open scan"
 * shows the graceful "file no longer stored" state — the queue, the case
 * layout, assign, accept/reject and the decisions all work.
 */
const FLEET = [
  { reg: "KBQ 417M", make: "Toyota", model: "Hiace", type: "van", year: "2017", rate: 9000, status: "pending", hoursAgo: 18 },
  { reg: "KCH 882T", make: "Nissan", model: "X-Trail", type: "suv", year: "2019", rate: 8500, status: "pending", hoursAgo: 55 },
  { reg: "KDF 205P", make: "Toyota", model: "Prado", type: "suv", year: "2020", rate: 14000, status: "review", hoursAgo: 40 },
  { reg: "KCA 640H", make: "Mazda", model: "Demio", type: "sedan", year: "2016", rate: 3200, status: "action", hoursAgo: 72 },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    console.error("seed:review-fleet is dev-only.");
    process.exit(1);
  }

  const stamp = Date.now();
  const email = `review-fleet-${stamp}@example.test`;
  const [user] = await db("users")
    .insert({
      id: generateId("user"),
      full_name: "Karanja Fleet Ltd",
      phone: `+2547${ulid().slice(-8).replace(/[A-Z]/g, "1")}`,
      email,
      password_hash: await hashPassword(`dev-${ulid()}`),
      roles: ["merchant"],
      email_verified: true,
      phone_verified: true,
    })
    .returning("*");
  if (!user) throw new Error("user insert failed");

  const [merchant] = await db("merchants")
    .insert({
      id: generateId("merchant"),
      user_id: user.id,
      owner_type: "company",
      company_name: "Karanja Fleet Ltd",
      first_name: "Mwangi",
      surname: "Karanja",
      payout_method: "mpesa",
      payout_same: true,
      onboarding_step: 5,
      onboarding_max_step: 5,
      onboarding_screen: "done",
      onboarding_submitted: true,
    })
    .returning("*");
  if (!merchant) throw new Error("merchant insert failed");

  // The two account documents — pending, so the approve gate shows them outstanding.
  for (const kind of ["national_id", "kra_pin"]) {
    await db("documents").insert({
      id: generateId("document"),
      merchant_id: merchant.id,
      vehicle_id: null,
      kind,
      storage_key: `seed/${merchant.id}/${kind}`,
      original_name: `${kind}.pdf`,
      size_bytes: 12345,
      content_type: "application/pdf",
      review_state: "pending",
    });
  }

  for (const v of FLEET) {
    const submittedAt = new Date(Date.now() - v.hoursAgo * 60 * 60 * 1000);
    const [vehicle] = await db("vehicles")
      .insert({
        id: generateId("vehicle"),
        merchant_id: merchant.id,
        type: v.type,
        make: v.make,
        model: v.model,
        year: v.year,
        registration: v.reg,
        transmission: "Automatic",
        fuel: "Petrol",
        colour: "Silver",
        seats: v.type === "van" ? 9 : 5,
        county: "Nairobi",
        pickup_address: "Westlands, Nairobi",
        daily_rate_amount: v.rate * 100,
        minimum_hire_days: 1,
        chauffeured: v.type === "van",
        status: v.status,
        listing_ref: await nextListingRef(db),
        submitted_at: submittedAt,
        insurance_expiry: "2027-02-15",
        ...(v.status === "action"
          ? { reviewer_note: "The tracker certificate is from a provider we don't recognise. Upload one from a licensed provider.", reviewer_note_meta: "From your reviewer", reviewer_note_resolved: false }
          : {}),
      })
      .returning("*");
    if (!vehicle) throw new Error("vehicle insert failed");

    for (const kind of ["logbook", "comprehensive_insurance", "tracker_certificate"]) {
      await db("documents").insert({
        id: generateId("document"),
        merchant_id: merchant.id,
        vehicle_id: vehicle.id,
        kind,
        storage_key: `seed/${vehicle.id}/${kind}`,
        original_name: `${kind}.pdf`,
        size_bytes: 12345,
        content_type: "application/pdf",
        review_state: v.status === "action" && kind === "tracker_certificate" ? "rejected" : "pending",
        ...(kind === "comprehensive_insurance" ? { expires_at: "2027-02-15" } : {}),
      });
    }

    await appendVehicleEvent(db, {
      vehicleId: vehicle.id,
      merchantId: merchant.id,
      kind: "submitted",
      tone: "amber",
      label: "Submitted for review",
      body: "Three documents and photos received.",
      actorType: "merchant",
    });

    // eslint-disable-next-line no-console
    console.log(`  ${v.reg.padEnd(9)} ${v.status.padEnd(8)} ${vehicle.id}`);
  }

  // eslint-disable-next-line no-console
  console.log(
    `\nSeeded 4 vehicles for a throwaway merchant (${email}).\nOpen the Ops console → Vehicles.\n`,
  );
  await db.destroy();
}

main().catch((err: unknown) => {
  console.error("seed:review-fleet failed:", err);
  process.exit(1);
});
