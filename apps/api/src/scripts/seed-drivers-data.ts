/**
 * The data behind `npm run seed:drivers -w apps/api` (PR DR3 of
 * `docs/plans/drivers-that-work.md`): 40 drivers spread over the 12
 * `seed:hire` merchants and the counties they work in. Kept apart from the
 * script so the mix can be read (and changed) without reading the safety
 * rules.
 *
 * Order matters: a driver's seed number is its place in `DRIVERS`
 * (1-based). It fixes the licence number (`SEED-DL-001`), the national ID,
 * the KRA PIN and the phone, so a re-run finds the same driver. Append new
 * rows at the end; never reorder.
 */

export type SeedGender = "female" | "male";

export interface SeedDriver {
  /** A `seed:hire` merchant key (`seed-hire-fleet.ts#MERCHANTS`). */
  merchant: string;
  fullName: string;
  /** Picks a photo from `seed-assets/drivers/<gender>/`. */
  gender: SeedGender;
  county: string;
  /** Whole shillings; at least one is set. */
  day?: number;
  hour?: number;
  trip?: number;
}

export const DRIVERS: SeedDriver[] = [
  // Nairobi - Peter Kamau and Jiji Car Hire
  { merchant: "peter.kamau", fullName: "James Mwangi Kariuki", gender: "male", county: "Nairobi", day: 3000, hour: 500 },
  { merchant: "peter.kamau", fullName: "Kevin Otieno Omondi", gender: "male", county: "Nairobi", day: 2800 },
  { merchant: "peter.kamau", fullName: "Lucy Wambui Njoroge", gender: "female", county: "Nairobi", hour: 600, trip: 2500 },
  { merchant: "peter.kamau", fullName: "Samuel Kiprotich Rotich", gender: "male", county: "Kajiado", day: 2700, trip: 3500 },
  { merchant: "jiji.carhire", fullName: "Dennis Kiplagat Korir", gender: "male", county: "Nairobi", day: 3500, hour: 650, trip: 3000 },
  { merchant: "jiji.carhire", fullName: "Brenda Akinyi Odhiambo", gender: "female", county: "Nairobi", day: 3500, hour: 600 },
  { merchant: "jiji.carhire", fullName: "Patrick Njuguna Gitau", gender: "male", county: "Nairobi", trip: 2800 },
  { merchant: "jiji.carhire", fullName: "Collins Wafula Barasa", gender: "male", county: "Nairobi", day: 4000, hour: 700 },
  { merchant: "jiji.carhire", fullName: "Agnes Nyambura Kamau", gender: "female", county: "Nairobi", hour: 550 },
  { merchant: "jiji.carhire", fullName: "Michael Ochieng Owino", gender: "male", county: "Kajiado", day: 3200, trip: 4000 },
  // Kiambu - Mary Wanjiku and Thika Road Logistics
  { merchant: "mary.wanjiku", fullName: "John Kamau Mburu", gender: "male", county: "Kiambu", day: 2600, hour: 450 },
  { merchant: "mary.wanjiku", fullName: "Esther Wangari Ndegwa", gender: "female", county: "Kiambu", day: 2500 },
  { merchant: "thikaroad.logistics", fullName: "Stephen Kimani Waweru", gender: "male", county: "Kiambu", day: 3000, trip: 3500 },
  { merchant: "thikaroad.logistics", fullName: "Francis Macharia Ngugi", gender: "male", county: "Kiambu", trip: 3000 },
  { merchant: "thikaroad.logistics", fullName: "George Kinyua Muriuki", gender: "male", county: "Nairobi", day: 3200, hour: 550 },
  { merchant: "thikaroad.logistics", fullName: "Caroline Wanjiru Mugo", gender: "female", county: "Kiambu", hour: 500, trip: 2200 },
  // Mombasa and Kilifi - Ali Mohamed and Pwani Haulage
  { merchant: "ali.mohamed", fullName: "Omar Said Abdalla", gender: "male", county: "Mombasa", day: 3000, hour: 500 },
  { merchant: "ali.mohamed", fullName: "Mwanaisha Juma Salim", gender: "female", county: "Mombasa", day: 2800, trip: 2500 },
  { merchant: "ali.mohamed", fullName: "Baraka Kazungu Charo", gender: "male", county: "Kilifi", day: 2600, trip: 4500 },
  { merchant: "pwani.haulage", fullName: "Rashid Mwinyi Hamisi", gender: "male", county: "Mombasa", day: 3500, trip: 5000 },
  { merchant: "pwani.haulage", fullName: "Kahindi Ngala Karisa", gender: "male", county: "Kilifi", trip: 4000 },
  { merchant: "pwani.haulage", fullName: "Zainabu Athman Omar", gender: "female", county: "Mombasa", hour: 550 },
  // Uasin Gishu - Faith Chebet
  { merchant: "faith.chebet", fullName: "Kipchumba Kibet Sang", gender: "male", county: "Uasin Gishu", day: 2500, hour: 400 },
  { merchant: "faith.chebet", fullName: "Jepkosgei Chelimo Kosgei", gender: "female", county: "Uasin Gishu", day: 2500, trip: 3500 },
  { merchant: "faith.chebet", fullName: "Edwin Kiptoo Cheruiyot", gender: "male", county: "Uasin Gishu", trip: 6000 },
  // Kisumu - Otieno Ouma
  { merchant: "otieno.ouma", fullName: "Felix Onyango Okoth", gender: "male", county: "Kisumu", day: 2600, hour: 450 },
  { merchant: "otieno.ouma", fullName: "Millicent Adhiambo Atieno", gender: "female", county: "Kisumu", day: 2500 },
  { merchant: "otieno.ouma", fullName: "Victor Ouma Oduor", gender: "male", county: "Kisumu", hour: 450, trip: 3000 },
  // Machakos - Grace Mutua and Athi Plant Hire
  { merchant: "grace.mutua", fullName: "Peter Mutinda Musyoki", gender: "male", county: "Machakos", day: 2500, trip: 3000 },
  { merchant: "grace.mutua", fullName: "Faith Mwende Kioko", gender: "female", county: "Machakos", hour: 400 },
  { merchant: "athi.plant", fullName: "Benson Mutua Wambua", gender: "male", county: "Machakos", day: 3500 },
  { merchant: "athi.plant", fullName: "Joseph Kyalo Nzioka", gender: "male", county: "Machakos", day: 3800, trip: 5500 },
  // Nyeri and Meru - Wairimu Ndung'u
  { merchant: "wairimu.ndungu", fullName: "Paul Maina Wachira", gender: "male", county: "Nyeri", day: 2500, hour: 400 },
  { merchant: "wairimu.ndungu", fullName: "Gladys Muthoni Gichuki", gender: "female", county: "Nyeri", trip: 2500 },
  { merchant: "wairimu.ndungu", fullName: "Erick Mutwiri Kirimi", gender: "male", county: "Meru", day: 2400, trip: 3500 },
  // Nakuru - Rift Valley Transporters
  { merchant: "riftvalley.transporters", fullName: "Kipkemoi Langat Ngeno", gender: "male", county: "Nakuru", day: 3000, trip: 4500 },
  { merchant: "riftvalley.transporters", fullName: "Daniel Kiprop Kirui", gender: "male", county: "Nakuru", day: 3200, hour: 500 },
  { merchant: "riftvalley.transporters", fullName: "Nancy Chepngeno Bett", gender: "female", county: "Nakuru", hour: 500, trip: 2500 },
  { merchant: "riftvalley.transporters", fullName: "Wycliffe Simiyu Wekesa", gender: "male", county: "Nakuru", trip: 7000 },
  { merchant: "riftvalley.transporters", fullName: "Hillary Kipngetich Mutai", gender: "male", county: "Uasin Gishu", day: 3000 },
];

/**
 * Seeded drivers' phones come from Ofcom's drama range, `+44 7700 900000`
 * to `+44 7700 900999`, which the UK regulator keeps for films and TV and
 * never gives to a real phone. No Kenyan range is published as reserved
 * that way, so a Kenyan-looking number could one day ring a stranger;
 * this one cannot. Driver `n` (1-based) gets `+447700900` + `n` as three
 * digits.
 */
export const SEED_PHONE_PREFIX = "+447700900";
export const seedDriverPhone = (n: number): string => `${SEED_PHONE_PREFIX}${String(n).padStart(3, "0")}`;

/** `SEED-DL-001`: the key a re-run finds a seeded driver by. */
export const SEED_LICENCE_PREFIX = "SEED-DL-";
export const seedLicence = (n: number): string => `${SEED_LICENCE_PREFIX}${String(n).padStart(3, "0")}`;
