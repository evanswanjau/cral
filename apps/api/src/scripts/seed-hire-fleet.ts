import type { MachineType, TruckType, VehicleCategory } from "../modules/vehicles/categories.js";

/**
 * The data behind `npm run seed:hire -w apps/api` (PR H2 of
 * `docs/plans/hire-that-works.md`, Part 3): 12 merchants, 100 vehicles,
 * 2 renters. Kept apart from the script so the mix can be read (and
 * changed) without reading the safety rules.
 *
 * Order matters: a vehicle's plate is `KZZ <n>S` where `n` is its place in
 * `FLEET` (1-based), so a re-run finds the same vehicle by the same plate.
 * Append new rows at the end; never reorder.
 */

export const SEED_EMAIL_DOMAIN = "@cral-seed.test";

/** One model: what every vehicle of it shares, and the photo folder it uses. */
export interface SeedModel {
  /** Folder under `seed-assets/vehicles/` holding `1.jpg`, `2.jpg`, `3.jpg`. */
  photos: string;
  type: VehicleCategory;
  make: string;
  model: string;
  seats: number;
  transmission: "Automatic" | "Manual";
  fuel: "Petrol" | "Diesel" | "Hybrid";
  truckType?: TruckType;
  payloadKg?: number;
  machineType?: MachineType;
}

export const MODELS = {
  // Sedans / small cars
  axio: { photos: "axio", type: "sedan", make: "Toyota", model: "Axio", seats: 5, transmission: "Automatic", fuel: "Petrol" },
  fielder: { photos: "fielder", type: "sedan", make: "Toyota", model: "Fielder", seats: 5, transmission: "Automatic", fuel: "Petrol" },
  vitz: { photos: "vitz", type: "sedan", make: "Toyota", model: "Vitz", seats: 5, transmission: "Automatic", fuel: "Petrol" },
  demio: { photos: "demio", type: "sedan", make: "Mazda", model: "Demio", seats: 5, transmission: "Automatic", fuel: "Petrol" },
  note: { photos: "note", type: "sedan", make: "Nissan", model: "Note", seats: 5, transmission: "Automatic", fuel: "Petrol" },
  fit: { photos: "fit", type: "sedan", make: "Honda", model: "Fit", seats: 5, transmission: "Automatic", fuel: "Hybrid" },
  premio: { photos: "premio", type: "sedan", make: "Toyota", model: "Premio", seats: 5, transmission: "Automatic", fuel: "Petrol" },
  mazda3: { photos: "mazda3", type: "sedan", make: "Mazda", model: "Axela (Mazda3)", seats: 5, transmission: "Automatic", fuel: "Petrol" },
  // SUVs / 4x4 / pickups
  rav4: { photos: "rav4", type: "suv", make: "Toyota", model: "RAV4", seats: 5, transmission: "Automatic", fuel: "Petrol" },
  xtrail: { photos: "xtrail", type: "suv", make: "Nissan", model: "X-Trail", seats: 7, transmission: "Automatic", fuel: "Petrol" },
  forester: { photos: "forester", type: "suv", make: "Subaru", model: "Forester", seats: 5, transmission: "Automatic", fuel: "Petrol" },
  prado: { photos: "prado", type: "suv", make: "Toyota", model: "Land Cruiser Prado", seats: 7, transmission: "Automatic", fuel: "Diesel" },
  lc70: { photos: "land-cruiser-70", type: "suv", make: "Toyota", model: "Land Cruiser 70", seats: 5, transmission: "Manual", fuel: "Diesel" },
  lc200: { photos: "land-cruiser-200", type: "suv", make: "Toyota", model: "Land Cruiser 200", seats: 7, transmission: "Automatic", fuel: "Diesel" },
  pajeroSport: { photos: "pajero-sport", type: "suv", make: "Mitsubishi", model: "Pajero Sport", seats: 7, transmission: "Automatic", fuel: "Diesel" },
  dmax: { photos: "dmax", type: "suv", make: "Isuzu", model: "D-Max double cab", seats: 5, transmission: "Manual", fuel: "Diesel" },
  hilux: { photos: "hilux", type: "suv", make: "Toyota", model: "Hilux double cab", seats: 5, transmission: "Manual", fuel: "Diesel" },
  cx5: { photos: "cx5", type: "suv", make: "Mazda", model: "CX-5", seats: 5, transmission: "Automatic", fuel: "Petrol" },
  // Vans / minibuses
  noah: { photos: "noah", type: "van", make: "Toyota", model: "Noah", seats: 8, transmission: "Automatic", fuel: "Petrol" },
  voxy: { photos: "voxy", type: "van", make: "Toyota", model: "Voxy", seats: 7, transmission: "Automatic", fuel: "Petrol" },
  hiace: { photos: "hiace", type: "van", make: "Toyota", model: "HiAce 14-seater", seats: 14, transmission: "Manual", fuel: "Diesel" },
  caravan: { photos: "caravan", type: "van", make: "Nissan", model: "Caravan", seats: 14, transmission: "Manual", fuel: "Diesel" },
  // Trucks
  nkrPickup: { photos: "isuzu-nkr", type: "truck", make: "Isuzu", model: "NKR dropside", seats: 3, transmission: "Manual", fuel: "Diesel", truckType: "pickup", payloadKg: 1500 },
  canter: { photos: "fuso-canter", type: "truck", make: "Mitsubishi Fuso", model: "Canter", seats: 3, transmission: "Manual", fuel: "Diesel", truckType: "canter", payloadKg: 3500 },
  hino300: { photos: "hino-300", type: "truck", make: "Hino", model: "300", seats: 3, transmission: "Manual", fuel: "Diesel", truckType: "canter", payloadKg: 3000 },
  npr: { photos: "isuzu-nkr", type: "truck", make: "Isuzu", model: "NPR", seats: 3, transmission: "Manual", fuel: "Diesel", truckType: "canter", payloadKg: 3500 },
  frrBox: { photos: "isuzu-frr", type: "truck", make: "Isuzu", model: "NQR box body", seats: 3, transmission: "Manual", fuel: "Diesel", truckType: "box_body", payloadKg: 5000 },
  fsrFlatbed: { photos: "hino-500", type: "truck", make: "Hino", model: "500 flatbed", seats: 3, transmission: "Manual", fuel: "Diesel", truckType: "flatbed", payloadKg: 10000 },
  fighterFlatbed: { photos: "fuso-fighter", type: "truck", make: "Mitsubishi Fuso", model: "Fighter flatbed", seats: 3, transmission: "Manual", fuel: "Diesel", truckType: "flatbed", payloadKg: 8000 },
  fvzTipper: { photos: "isuzu-fvz-tipper", type: "truck", make: "Isuzu", model: "FVZ tipper", seats: 3, transmission: "Manual", fuel: "Diesel", truckType: "tipper", payloadKg: 15000 },
  tata: { photos: "tata", type: "truck", make: "Tata", model: "LPT 1613 dropside", seats: 3, transmission: "Manual", fuel: "Diesel", truckType: "flatbed", payloadKg: 10000 },
  reefer: { photos: "reefer", type: "truck", make: "Isuzu", model: "FRR refrigerated", seats: 3, transmission: "Manual", fuel: "Diesel", truckType: "refrigerated", payloadKg: 6000 },
  bowser: { photos: "water-bowser", type: "truck", make: "Isuzu", model: "Forward water bowser (10,000 l)", seats: 3, transmission: "Manual", fuel: "Diesel", truckType: "water_bowser", payloadKg: 10000 },
  actros: { photos: "actros", type: "truck", make: "Mercedes-Benz", model: "Actros 2645", seats: 2, transmission: "Automatic", fuel: "Diesel", truckType: "prime_mover", payloadKg: 30000 },
  scania: { photos: "scania", type: "truck", make: "Scania", model: "G460", seats: 2, transmission: "Automatic", fuel: "Diesel", truckType: "prime_mover", payloadKg: 30000 },
  lowLoader: { photos: "low-loader", type: "truck", make: "Scania", model: "R-series low loader", seats: 2, transmission: "Automatic", fuel: "Diesel", truckType: "low_loader", payloadKg: 40000 },
  craneTruck: { photos: "crane-truck", type: "truck", make: "MAZ", model: "5337 truck crane (16 t)", seats: 3, transmission: "Manual", fuel: "Diesel", truckType: "crane_truck", payloadKg: 8000 },
  // Machinery
  cat320: { photos: "cat-320", type: "machinery", make: "Caterpillar", model: "320 excavator", seats: 1, transmission: "Automatic", fuel: "Diesel", machineType: "excavator" },
  pc200: { photos: "komatsu-pc200", type: "machinery", make: "Komatsu", model: "PC200 excavator", seats: 1, transmission: "Automatic", fuel: "Diesel", machineType: "excavator" },
  jcb3cx: { photos: "jcb-3cx", type: "machinery", make: "JCB", model: "3CX backhoe", seats: 1, transmission: "Manual", fuel: "Diesel", machineType: "backhoe_loader" },
  cat950: { photos: "cat-950", type: "machinery", make: "Caterpillar", model: "950 wheel loader", seats: 1, transmission: "Automatic", fuel: "Diesel", machineType: "wheel_loader" },
  cat140: { photos: "cat-140", type: "machinery", make: "Caterpillar", model: "140 grader", seats: 1, transmission: "Automatic", fuel: "Diesel", machineType: "grader" },
  roller: { photos: "roller", type: "machinery", make: "Bomag", model: "BW 120 tandem roller", seats: 1, transmission: "Automatic", fuel: "Diesel", machineType: "roller" },
  catD6: { photos: "cat-d6", type: "machinery", make: "Caterpillar", model: "D6 dozer", seats: 1, transmission: "Automatic", fuel: "Diesel", machineType: "bulldozer" },
  forklift: { photos: "forklift", type: "machinery", make: "Toyota", model: "diesel forklift (3 t)", seats: 1, transmission: "Automatic", fuel: "Diesel", machineType: "forklift" },
  tadano: { photos: "tadano", type: "machinery", make: "Tadano", model: "rough-terrain crane (25 t)", seats: 1, transmission: "Automatic", fuel: "Diesel", machineType: "mobile_crane" },
} as const satisfies Record<string, SeedModel>;
export type ModelKey = keyof typeof MODELS;

export interface SeedMerchant {
  key: string;
  ownerType: "individual" | "company";
  firstName: string;
  surname: string;
  companyName?: string;
  county: string;
}

/** 7 individuals, 5 companies. Emails are `<key>@cral-seed.test`. */
export const MERCHANTS: SeedMerchant[] = [
  { key: "peter.kamau", ownerType: "individual", firstName: "Peter", surname: "Kamau", county: "Nairobi" },
  { key: "mary.wanjiku", ownerType: "individual", firstName: "Mary", surname: "Wanjiku", county: "Kiambu" },
  { key: "ali.mohamed", ownerType: "individual", firstName: "Ali", surname: "Mohamed", county: "Mombasa" },
  { key: "faith.chebet", ownerType: "individual", firstName: "Faith", surname: "Chebet", county: "Uasin Gishu" },
  { key: "otieno.ouma", ownerType: "individual", firstName: "Otieno", surname: "Ouma", county: "Kisumu" },
  { key: "grace.mutua", ownerType: "individual", firstName: "Grace", surname: "Mutua", county: "Machakos" },
  { key: "wairimu.ndungu", ownerType: "individual", firstName: "Wairimu", surname: "Ndung'u", county: "Nyeri" },
  { key: "pwani.haulage", ownerType: "company", firstName: "Hassan", surname: "Bakari", companyName: "Pwani Haulage Ltd", county: "Mombasa" },
  { key: "riftvalley.transporters", ownerType: "company", firstName: "Kiprono", surname: "Langat", companyName: "Rift Valley Transporters Ltd", county: "Nakuru" },
  { key: "athi.plant", ownerType: "company", firstName: "Daniel", surname: "Musyoka", companyName: "Athi Plant Hire Ltd", county: "Machakos" },
  { key: "jiji.carhire", ownerType: "company", firstName: "Esther", surname: "Njeri", companyName: "Jiji Car Hire Ltd", county: "Nairobi" },
  { key: "thikaroad.logistics", ownerType: "company", firstName: "Joseph", surname: "Kariuki", companyName: "Thika Road Logistics Ltd", county: "Kiambu" },
];

/** Two renters with accepted ID and licence, so a booking needs no Ops step first. */
export const RENTERS = [
  { key: "renter.amina", fullName: "Amina Yusuf" },
  { key: "renter.brian", fullName: "Brian Kiplagat" },
];

/**
 * How a listing is priced. Rates are whole shillings here and become cents
 * in the script. `quote` = per day, but "Always quote me first".
 */
export type SeedPrice =
  | { unit: "day"; rate: number; quote?: true }
  | { unit: "trip"; rate: number }
  | { unit: "km"; rate: number; minimum: number }
  | { unit: "tonne"; rate: number; minimum: number };

export interface SeedVehicle {
  merchant: string;
  model: ModelKey;
  county: string;
  area: string;
  year: number;
  colour: string;
  price: SeedPrice;
  /** Comes with a driver (cars) or an operator (machines); trucks always do. */
  driver?: boolean;
  minDays?: number;
}

const day = (rate: number): SeedPrice => ({ unit: "day", rate });
const trip = (rate: number): SeedPrice => ({ unit: "trip", rate });

export const FLEET: SeedVehicle[] = [
  // --- Cars: 25 sedans / small cars -------------------------------------
  { merchant: "peter.kamau", model: "axio", county: "Nairobi", area: "Westlands", year: 2016, colour: "Silver", price: day(3800) },
  { merchant: "peter.kamau", model: "axio", county: "Nairobi", area: "Kilimani", year: 2017, colour: "White", price: day(4000) },
  { merchant: "peter.kamau", model: "fielder", county: "Nairobi", area: "South B", year: 2016, colour: "Silver", price: day(4200) },
  { merchant: "peter.kamau", model: "vitz", county: "Nairobi", area: "Kasarani", year: 2015, colour: "Red", price: day(3500) },
  { merchant: "peter.kamau", model: "note", county: "Nairobi", area: "Ngong Road", year: 2017, colour: "Gunmetal", price: day(3600) },
  { merchant: "peter.kamau", model: "premio", county: "Nairobi", area: "Upper Hill", year: 2018, colour: "Pearl white", price: day(5500), driver: true },
  { merchant: "peter.kamau", model: "mazda3", county: "Nairobi", area: "Lavington", year: 2018, colour: "Soul red", price: day(5800) },
  { merchant: "peter.kamau", model: "fit", county: "Kajiado", area: "Kitengela", year: 2016, colour: "Blue", price: day(3500) },
  { merchant: "mary.wanjiku", model: "axio", county: "Kiambu", area: "Thika", year: 2015, colour: "Silver", price: day(3500) },
  { merchant: "mary.wanjiku", model: "vitz", county: "Kiambu", area: "Ruiru", year: 2016, colour: "White", price: day(3500) },
  { merchant: "mary.wanjiku", model: "demio", county: "Kiambu", area: "Kiambu town", year: 2017, colour: "Grey", price: day(3600) },
  { merchant: "ali.mohamed", model: "axio", county: "Mombasa", area: "Nyali", year: 2017, colour: "White", price: day(4000) },
  { merchant: "ali.mohamed", model: "premio", county: "Mombasa", area: "Mombasa CBD", year: 2017, colour: "Black", price: day(5500), driver: true },
  { merchant: "ali.mohamed", model: "note", county: "Kilifi", area: "Malindi", year: 2016, colour: "Silver", price: day(3800) },
  { merchant: "ali.mohamed", model: "fit", county: "Kilifi", area: "Watamu", year: 2017, colour: "White", price: day(3800) },
  { merchant: "faith.chebet", model: "fielder", county: "Uasin Gishu", area: "Eldoret town", year: 2015, colour: "Silver", price: day(3800) },
  { merchant: "faith.chebet", model: "demio", county: "Uasin Gishu", area: "Eldoret town", year: 2016, colour: "Blue", price: day(3500) },
  { merchant: "faith.chebet", model: "axio", county: "Uasin Gishu", area: "Langas", year: 2016, colour: "Silver", price: day(3600) },
  { merchant: "otieno.ouma", model: "vitz", county: "Kisumu", area: "Milimani", year: 2016, colour: "Silver", price: day(3500) },
  { merchant: "otieno.ouma", model: "axio", county: "Kisumu", area: "Kisumu CBD", year: 2017, colour: "White", price: day(3800) },
  { merchant: "otieno.ouma", model: "fielder", county: "Kisumu", area: "Mamboleo", year: 2017, colour: "Grey", price: day(4000) },
  { merchant: "wairimu.ndungu", model: "fit", county: "Nyeri", area: "Nyeri town", year: 2016, colour: "Silver", price: day(3500) },
  { merchant: "wairimu.ndungu", model: "note", county: "Meru", area: "Meru town", year: 2017, colour: "White", price: day(3600) },
  { merchant: "jiji.carhire", model: "mazda3", county: "Nairobi", area: "JKIA", year: 2019, colour: "Machine grey", price: day(6000) },
  { merchant: "jiji.carhire", model: "premio", county: "Nairobi", area: "JKIA", year: 2019, colour: "Silver", price: day(6000), driver: true },

  // --- Cars: 20 SUVs / 4x4 / pickups -------------------------------------
  { merchant: "jiji.carhire", model: "prado", county: "Nairobi", area: "Karen", year: 2019, colour: "Pearl white", price: day(15000), driver: true, minDays: 2 },
  { merchant: "jiji.carhire", model: "prado", county: "Nairobi", area: "Westlands", year: 2018, colour: "Black", price: day(14000), minDays: 2 },
  { merchant: "jiji.carhire", model: "lc200", county: "Nairobi", area: "Karen", year: 2017, colour: "White", price: day(25000), driver: true, minDays: 2 },
  { merchant: "jiji.carhire", model: "lc200", county: "Nairobi", area: "Gigiri", year: 2016, colour: "Black", price: day(22000), driver: true, minDays: 2 },
  { merchant: "jiji.carhire", model: "rav4", county: "Nairobi", area: "Westlands", year: 2019, colour: "Silver", price: day(8000) },
  { merchant: "jiji.carhire", model: "xtrail", county: "Nairobi", area: "Kilimani", year: 2018, colour: "Grey", price: day(7500) },
  { merchant: "jiji.carhire", model: "cx5", county: "Nairobi", area: "Lavington", year: 2018, colour: "Soul red", price: day(8500) },
  { merchant: "peter.kamau", model: "forester", county: "Nairobi", area: "Kileleshwa", year: 2017, colour: "Green", price: day(7000) },
  { merchant: "mary.wanjiku", model: "rav4", county: "Kiambu", area: "Thika", year: 2017, colour: "White", price: day(7000) },
  { merchant: "mary.wanjiku", model: "hilux", county: "Kiambu", area: "Limuru", year: 2018, colour: "White", price: day(9000), minDays: 2 },
  { merchant: "ali.mohamed", model: "pajeroSport", county: "Mombasa", area: "Nyali", year: 2018, colour: "Bronze", price: day(10000), driver: true },
  { merchant: "faith.chebet", model: "lc70", county: "Uasin Gishu", area: "Eldoret town", year: 2015, colour: "Beige", price: day(12000), driver: true, minDays: 2 },
  { merchant: "faith.chebet", model: "dmax", county: "Uasin Gishu", area: "Kapseret", year: 2017, colour: "Red", price: day(7500) },
  { merchant: "otieno.ouma", model: "xtrail", county: "Kisumu", area: "Milimani", year: 2017, colour: "Silver", price: day(7000) },
  { merchant: "otieno.ouma", model: "forester", county: "Kisumu", area: "Kisumu CBD", year: 2016, colour: "Blue", price: day(6500) },
  { merchant: "wairimu.ndungu", model: "lc70", county: "Nyeri", area: "Nyeri town", year: 2014, colour: "White", price: day(11000), driver: true, minDays: 2 },
  { merchant: "wairimu.ndungu", model: "prado", county: "Meru", area: "Meru town", year: 2016, colour: "Silver", price: day(13000), driver: true },
  { merchant: "riftvalley.transporters", model: "hilux", county: "Nakuru", area: "Nakuru town", year: 2019, colour: "Silver", price: day(9500) },
  { merchant: "riftvalley.transporters", model: "dmax", county: "Nakuru", area: "Naivasha", year: 2018, colour: "White", price: day(8000) },
  { merchant: "grace.mutua", model: "pajeroSport", county: "Machakos", area: "Machakos town", year: 2017, colour: "White", price: day(9500) },

  // --- Cars: 15 vans / minibuses -----------------------------------------
  { merchant: "jiji.carhire", model: "noah", county: "Nairobi", area: "Embakasi", year: 2016, colour: "Silver", price: day(7000), driver: true },
  { merchant: "jiji.carhire", model: "voxy", county: "Nairobi", area: "Embakasi", year: 2017, colour: "Black", price: day(7500), driver: true },
  { merchant: "jiji.carhire", model: "hiace", county: "Nairobi", area: "Industrial Area", year: 2018, colour: "White", price: day(12000), driver: true },
  { merchant: "jiji.carhire", model: "hiace", county: "Nairobi", area: "Industrial Area", year: 2017, colour: "White", price: day(11000), driver: true },
  { merchant: "peter.kamau", model: "noah", county: "Nairobi", area: "Rongai", year: 2015, colour: "Silver", price: day(6500) },
  { merchant: "mary.wanjiku", model: "voxy", county: "Kiambu", area: "Ruiru", year: 2016, colour: "White", price: day(6500) },
  { merchant: "ali.mohamed", model: "hiace", county: "Mombasa", area: "Changamwe", year: 2016, colour: "White", price: day(10000), driver: true, minDays: 2 },
  { merchant: "ali.mohamed", model: "noah", county: "Kilifi", area: "Kilifi town", year: 2016, colour: "Silver", price: day(7000), driver: true },
  { merchant: "faith.chebet", model: "caravan", county: "Uasin Gishu", area: "Eldoret town", year: 2016, colour: "White", price: day(10000), driver: true },
  { merchant: "otieno.ouma", model: "voxy", county: "Kisumu", area: "Kisumu CBD", year: 2017, colour: "Silver", price: day(7000), driver: true },
  { merchant: "grace.mutua", model: "hiace", county: "Machakos", area: "Machakos town", year: 2015, colour: "White", price: day(9500), driver: true },
  { merchant: "grace.mutua", model: "noah", county: "Machakos", area: "Athi River", year: 2016, colour: "Pearl white", price: day(6500) },
  { merchant: "wairimu.ndungu", model: "caravan", county: "Nyeri", area: "Karatina", year: 2015, colour: "Silver", price: day(9000), driver: true },
  { merchant: "riftvalley.transporters", model: "hiace", county: "Nakuru", area: "Nakuru town", year: 2017, colour: "White", price: day(10000), driver: true, minDays: 2 },
  { merchant: "riftvalley.transporters", model: "noah", county: "Nakuru", area: "Naivasha", year: 2017, colour: "Silver", price: day(7000), driver: true },

  // --- Trucks: 25 (10 per day, 8 per trip, 7 quote first) ----------------
  // per day
  { merchant: "pwani.haulage", model: "canter", county: "Mombasa", area: "Changamwe", year: 2016, colour: "White", price: day(9000) },
  { merchant: "pwani.haulage", model: "frrBox", county: "Mombasa", area: "Shimanzi", year: 2017, colour: "White", price: day(16000) },
  { merchant: "pwani.haulage", model: "reefer", county: "Mombasa", area: "Port Reitz", year: 2018, colour: "White", price: day(22000) },
  { merchant: "pwani.haulage", model: "actros", county: "Mombasa", area: "Miritini", year: 2017, colour: "Red", price: day(45000), minDays: 2 },
  { merchant: "riftvalley.transporters", model: "hino300", county: "Nakuru", area: "Lanet", year: 2016, colour: "White", price: day(10000) },
  { merchant: "riftvalley.transporters", model: "fighterFlatbed", county: "Nakuru", area: "Nakuru town", year: 2015, colour: "Blue", price: day(18000) },
  { merchant: "riftvalley.transporters", model: "bowser", county: "Nakuru", area: "Naivasha", year: 2016, colour: "Blue", price: day(15000) },
  { merchant: "thikaroad.logistics", model: "nkrPickup", county: "Nairobi", area: "Industrial Area", year: 2017, colour: "White", price: day(9000) },
  { merchant: "thikaroad.logistics", model: "fvzTipper", county: "Kiambu", area: "Juja", year: 2018, colour: "Yellow", price: day(25000) },
  { merchant: "thikaroad.logistics", model: "craneTruck", county: "Nairobi", area: "Industrial Area", year: 2016, colour: "White", price: day(35000), minDays: 2 },
  // per trip
  { merchant: "pwani.haulage", model: "npr", county: "Mombasa", area: "Changamwe", year: 2017, colour: "White", price: trip(12000) },
  { merchant: "pwani.haulage", model: "frrBox", county: "Kilifi", area: "Mtwapa", year: 2016, colour: "White", price: trip(18000) },
  { merchant: "pwani.haulage", model: "scania", county: "Mombasa", area: "Miritini", year: 2018, colour: "White", price: trip(120000) },
  { merchant: "riftvalley.transporters", model: "canter", county: "Nakuru", area: "Nakuru town", year: 2016, colour: "White", price: trip(9000) },
  { merchant: "riftvalley.transporters", model: "fsrFlatbed", county: "Uasin Gishu", area: "Eldoret town", year: 2017, colour: "White", price: trip(45000) },
  { merchant: "thikaroad.logistics", model: "tata", county: "Machakos", area: "Mlolongo", year: 2017, colour: "Yellow", price: trip(15000) },
  { merchant: "thikaroad.logistics", model: "hino300", county: "Nairobi", area: "Kasarani", year: 2018, colour: "White", price: trip(10000) },
  { merchant: "thikaroad.logistics", model: "bowser", county: "Kajiado", area: "Kitengela", year: 2015, colour: "Blue", price: trip(12000) },
  // quote first: 3 per km, 2 per tonne, 2 "Always quote me first"
  { merchant: "pwani.haulage", model: "actros", county: "Mombasa", area: "Miritini", year: 2019, colour: "White", price: { unit: "km", rate: 250, minimum: 60000 } },
  { merchant: "pwani.haulage", model: "lowLoader", county: "Mombasa", area: "Changamwe", year: 2016, colour: "Silver", price: { unit: "km", rate: 400, minimum: 120000 } },
  { merchant: "riftvalley.transporters", model: "scania", county: "Nakuru", area: "Lanet", year: 2017, colour: "Red", price: { unit: "km", rate: 220, minimum: 50000 } },
  { merchant: "pwani.haulage", model: "fvzTipper", county: "Mombasa", area: "Mariakani", year: 2016, colour: "Yellow", price: { unit: "tonne", rate: 1500, minimum: 15000 } },
  { merchant: "thikaroad.logistics", model: "tata", county: "Kiambu", area: "Thika", year: 2016, colour: "Yellow", price: { unit: "tonne", rate: 1200, minimum: 12000 } },
  { merchant: "pwani.haulage", model: "lowLoader", county: "Nairobi", area: "Industrial Area", year: 2018, colour: "White", price: { unit: "day", rate: 60000, quote: true } },
  { merchant: "riftvalley.transporters", model: "craneTruck", county: "Nakuru", area: "Nakuru town", year: 2015, colour: "White", price: { unit: "day", rate: 30000, quote: true } },

  // --- Machinery: 15 (13 per day, 2 per trip), all with operator ---------
  { merchant: "athi.plant", model: "cat320", county: "Machakos", area: "Athi River", year: 2016, colour: "Yellow", price: day(45000), driver: true },
  { merchant: "athi.plant", model: "cat320", county: "Kajiado", area: "Kitengela", year: 2017, colour: "Yellow", price: day(48000), driver: true },
  { merchant: "athi.plant", model: "pc200", county: "Machakos", area: "Mlolongo", year: 2015, colour: "Yellow", price: day(42000), driver: true },
  { merchant: "athi.plant", model: "cat950", county: "Machakos", area: "Athi River", year: 2016, colour: "Yellow", price: day(40000), driver: true },
  { merchant: "athi.plant", model: "cat140", county: "Kajiado", area: "Isinya", year: 2014, colour: "Yellow", price: day(60000), driver: true, minDays: 2 },
  { merchant: "athi.plant", model: "catD6", county: "Kajiado", area: "Kajiado town", year: 2013, colour: "Yellow", price: day(70000), driver: true, minDays: 2 },
  { merchant: "athi.plant", model: "tadano", county: "Machakos", area: "Athi River", year: 2014, colour: "White", price: day(90000), driver: true },
  { merchant: "athi.plant", model: "jcb3cx", county: "Machakos", area: "Machakos town", year: 2017, colour: "Yellow", price: trip(35000), driver: true },
  { merchant: "thikaroad.logistics", model: "pc200", county: "Kiambu", area: "Juja", year: 2016, colour: "Yellow", price: day(40000), driver: true },
  { merchant: "thikaroad.logistics", model: "jcb3cx", county: "Kiambu", area: "Ruiru", year: 2018, colour: "Yellow", price: day(25000), driver: true },
  { merchant: "thikaroad.logistics", model: "roller", county: "Kiambu", area: "Thika", year: 2015, colour: "Yellow", price: day(22000), driver: true },
  { merchant: "thikaroad.logistics", model: "forklift", county: "Nairobi", area: "Industrial Area", year: 2017, colour: "Orange", price: day(18000), driver: true },
  { merchant: "grace.mutua", model: "cat320", county: "Machakos", area: "Machakos town", year: 2015, colour: "Yellow", price: day(42000), driver: true },
  { merchant: "grace.mutua", model: "jcb3cx", county: "Machakos", area: "Kangundo", year: 2016, colour: "Yellow", price: day(24000), driver: true },
  { merchant: "grace.mutua", model: "roller", county: "Kajiado", area: "Kitengela", year: 2016, colour: "Yellow", price: trip(30000), driver: true },
];

/** `KZZ 001S` ... `KZZ 100S` - an unissued series, `S` for seed. */
export function seedPlate(index: number): string {
  return `KZZ ${String(index + 1).padStart(3, "0")}S`;
}

/** Matches every plate `seedPlate` can make, and nothing a real vehicle carries. */
export const SEED_PLATE_SQL_PATTERN = "^KZZ [0-9]{3}S$";
