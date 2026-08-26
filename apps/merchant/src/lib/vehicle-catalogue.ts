/**
 * Make/model suggestions for the vehicle form.
 *
 * A convenience list, deliberately not a validation whitelist - the field
 * accepts any text, because the logbook is the authority and a merchant may
 * well list something not covered here (grey imports, older models, trucks).
 * Weighted towards what actually circulates in the Kenyan hire market.
 */
export const VEHICLE_MAKES: Record<string, string[]> = {
  Audi: ["A3", "A4", "Q3", "Q5", "Q7"],
  BMW: ["1 Series", "3 Series", "5 Series", "X1", "X3", "X5"],
  BYD: ["Atto 3", "Dolphin", "Seal"],
  Chevrolet: ["Captiva", "Cruze", "Spark", "Trailblazer"],
  Chrysler: ["300C", "Voyager"],
  Daihatsu: ["Hijet", "Mira", "Terios"],
  Ford: ["EcoSport", "Escape", "Everest", "Ranger", "Transit"],
  Foton: ["Aumark", "Tunland", "View"],
  Honda: ["Accord", "CR-V", "Fit", "Insight", "Vezel"],
  Hyundai: ["Creta", "Elantra", "H-1", "Santa Fe", "Tucson"],
  Isuzu: ["D-Max", "Forward", "FRR", "MU-X", "NQR"],
  Jeep: ["Cherokee", "Compass", "Grand Cherokee", "Wrangler"],
  Kia: ["Cerato", "Picanto", "Rio", "Sorento", "Sportage"],
  "Land Rover": ["Defender", "Discovery", "Freelander", "Range Rover", "Range Rover Sport"],
  Lexus: ["ES", "GX", "LX", "NX", "RX"],
  Mahindra: ["Bolero", "Scorpio", "XUV500"],
  Mazda: ["Atenza", "Axela", "BT-50", "CX-5", "Demio"],
  "Mercedes-Benz": ["A-Class", "C-Class", "E-Class", "GLC", "GLE", "Sprinter", "V-Class"],
  Mitsubishi: ["ASX", "Canter", "L200", "Outlander", "Pajero", "Rosa"],
  Nissan: ["Almera", "Caravan", "Juke", "Note", "NP300", "Navara", "Patrol", "Serena", "Sylphy", "Tiida", "Urvan", "Wingroad", "X-Trail"],
  Peugeot: ["208", "3008", "5008", "Partner"],
  Renault: ["Duster", "Kwid", "Sandero"],
  Scania: ["G-Series", "P-Series", "R-Series"],
  Subaru: ["Forester", "Impreza", "Legacy", "Outback", "XV"],
  Suzuki: ["Alto", "Every", "Jimny", "Swift", "Vitara"],
  Tata: ["Prima", "Super Ace", "Xenon"],
  Toyota: [
    "Alphard", "Auris", "Axio", "Coaster", "Corolla", "Fielder", "Fortuner", "Harrier", "Hiace",
    "Highlander", "Hilux", "Ist", "Land Cruiser", "Land Cruiser Prado", "Mark X", "Noah",
    "Passo", "Premio", "Prius", "Probox", "Rav4", "Rush", "Succeed", "Vanguard", "Vitz", "Voxy", "Wish",
  ],
  Volkswagen: ["Amarok", "Golf", "Passat", "Polo", "Tiguan", "Touareg", "Transporter"],
  Volvo: ["FH", "FM", "XC60", "XC90"],
};

export const MAKE_NAMES = Object.keys(VEHICLE_MAKES);

/**
 * Shown before a merchant has typed anything, rather than the first 8 of
 * the full alphabetical list (which would surface Audi/BMW/BYD/Chevrolet -
 * accurate but not what most Kenyan hire-fleet vehicles actually are).
 * Alphabetical, same as the full list.
 */
export const POPULAR_KENYAN_MAKES = [
  "Honda",
  "Isuzu",
  "Land Rover",
  "Mazda",
  "Mercedes-Benz",
  "Mitsubishi",
  "Nissan",
  "Subaru",
  "Suzuki",
  "Toyota",
].sort((a, b) => a.localeCompare(b));

/** Models for a make, matched case-insensitively; empty for an unknown make. */
export function modelsForMake(make: string): string[] {
  const key = MAKE_NAMES.find((m) => m.toLowerCase() === make.trim().toLowerCase());
  return key ? (VEHICLE_MAKES[key] ?? []) : [];
}
