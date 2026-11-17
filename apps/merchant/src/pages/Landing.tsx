import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { netFromGross } from "@cral/types";
import { WhatsappLogo } from "@phosphor-icons/react/dist/ssr/WhatsappLogo";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { DeviceMobile } from "@phosphor-icons/react/dist/ssr/DeviceMobile";
import { MapPin } from "@phosphor-icons/react/dist/ssr/MapPin";
import { Car } from "@phosphor-icons/react/dist/ssr/Car";
import { Truck } from "@phosphor-icons/react/dist/ssr/Truck";
import { SteeringWheel } from "@phosphor-icons/react/dist/ssr/SteeringWheel";
import { Wrench } from "@phosphor-icons/react/dist/ssr/Wrench";
import { GearSix } from "@phosphor-icons/react/dist/ssr/GearSix";
import { Storefront } from "@phosphor-icons/react/dist/ssr/Storefront";
import { NotePencil } from "@phosphor-icons/react/dist/ssr/NotePencil";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { Coins } from "@phosphor-icons/react/dist/ssr/Coins";
import { Tag } from "@phosphor-icons/react/dist/ssr/Tag";
import { Prohibit } from "@phosphor-icons/react/dist/ssr/Prohibit";
import { Key } from "@phosphor-icons/react/dist/ssr/Key";
import { Wallet } from "@phosphor-icons/react/dist/ssr/Wallet";
import { FileText } from "@phosphor-icons/react/dist/ssr/FileText";
import { CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { Headset } from "@phosphor-icons/react/dist/ssr/Headset";
import { Scales } from "@phosphor-icons/react/dist/ssr/Scales";
import { NavigationArrow } from "@phosphor-icons/react/dist/ssr/NavigationArrow";
import { Package } from "@phosphor-icons/react/dist/ssr/Package";
import { Buildings } from "@phosphor-icons/react/dist/ssr/Buildings";
import { Handshake } from "@phosphor-icons/react/dist/ssr/Handshake";
import { IdentificationCard } from "@phosphor-icons/react/dist/ssr/IdentificationCard";
import { ShieldStar } from "@phosphor-icons/react/dist/ssr/ShieldStar";
import type { Icon } from "@phosphor-icons/react";
import { usePageTitle } from "../lib/use-page-title.js";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_E164, whatsappLink } from "../lib/support.js";

/**
 * The CRAL Merchant Portal Front Door - Unified Multi-Supplier Partner Gateway.
 *
 * Suppliers on CRAL:
 *  1. Car & Fleet Owners (passenger car rentals)
 *  2. Truck & Haulage Operators (commercial freight & tippers)
 *  3. Professional Drivers (vetted chauffeured & private drivers)
 *  4. Garages & Auto Workshops (routine service, diagnostics, repairs)
 *  5. Spare Parts Dealers (genuine & OEM parts matched by chassis/VIN)
 *  6. Car Dealerships & Private Sellers (verified vehicle sales)
 *
 * Built strictly according to CRAL brand tokens:
 *  - Headlines: Archivo with font-variation-settings 'wdth' 110
 *  - Body: Instrument Sans
 *  - Kickers & Numbers: IBM Plex Mono
 *  - Signature 14-degree skew brand accents
 *  - Commission percentage is never displayed as raw rate (owner's global rule)
 */

const C = {
  ink: "#0B0F1A",
  blue: "#0F23A8",
  blue700: "#0B1B85",
  blue50: "#EDEFFC",
  blue200: "#B6C0F4",
  blue400: "#5B6FE0",
  red: "#D81E32",
  canvas: "#FAFBFC",
  n100: "#F1F3F6",
  n200: "#E4E7EC",
  n300: "#CDD2DA",
  n500: "#838C9B",
  n600: "#5A6373",
  n700: "#333B4A",
  verified: "#0B8A5B",
  verifiedTint: "#DDF3E9",
  whatsapp: "#25D366",
} as const;

const DISPLAY = "Archivo,sans-serif";
const SANS = "'Instrument Sans',sans-serif";
const MONO = "'IBM Plex Mono',monospace";

const IMG = (name: string) => `/images/landing/${name}.webp`;

export type SupplierTrackId = "cars" | "trucks" | "drivers" | "garages" | "parts" | "dealers";

export interface SupplierTrack {
  id: SupplierTrackId;
  label: string;
  badge: string;
  heroKicker: string;
  tagline: string;
  description: string;
  icon: Icon;
  benefits: Array<{
    icon: Icon;
    title: string;
    description: string;
  }>;
  steps: Array<{
    n: string;
    icon: Icon;
    title: string;
    body: string;
  }>;
  calculator: {
    title: string;
    subtitle: string;
    rateLabel: string;
    rateUnit: string;
    countLabel: string;
    countUnit: string;
    defaultRate: number;
    defaultCount: number;
    minRate: number;
    maxRate: number;
    minCount: number;
    maxCount: number;
    presets: Array<{ label: string; rate: number; count: number }>;
    outputDescription: (rate: number, count: number, net: number) => string;
    footnote: string;
  };
  documents: {
    title: string;
    subtitle: string;
    items: string[];
    companyExtra: string;
  };
  waMessage: string;
}

export const SUPPLIER_TRACKS: Record<SupplierTrackId, SupplierTrack> = {
  cars: {
    id: "cars",
    label: "Car & Fleet Owners",
    badge: "Passenger Rentals",
    heroKicker: "PASSENGER VEHICLE HOSTING",
    tagline: "Turn idle cars into weekly payouts with zero listing fees",
    description:
      "List personal sedans, SUVs, crossovers, and passenger vans on Kenya's verified rental network. Accept hires on your terms, safeguard handovers with mandatory pickup OTPs, and rely on transparent pre-and-post inspection arbitration.",
    icon: Car,
    benefits: [
      {
        icon: Coins,
        title: "Weekly M-Pesa Payouts",
        description:
          "Turn idle vehicles into steady income. Payouts land every Monday on M-Pesa or monthly to your bank account with complete statements.",
      },
      {
        icon: Tag,
        title: "Daily Rate × Hire Days Pricing",
        description:
          "You set your daily rate and adjust it anytime. No listing fee and zero charges on days your car stays parked in your driveway.",
      },
      {
        icon: Key,
        title: "Pickup OTP Handover Security",
        description:
          "Handover keys with 100% confidence. The hirer must read a one-time cryptographic 6-digit OTP generated by CRAL before release.",
      },
      {
        icon: Scales,
        title: "Damage Dispute Arbitration",
        description:
          "Mandatory digital inspection walks at handover and return. Any disputed scratches or damages are arbitrated by CRAL with escrow backing.",
      },
    ],
    steps: [
      {
        n: "01",
        icon: NotePencil,
        title: "List vehicle in 10 minutes",
        body: "Enter vehicle specs, upload clear exterior/interior photos, set your daily rate, and choose self-drive or chauffeured.",
      },
      {
        n: "02",
        icon: MagnifyingGlass,
        title: "Compliance & tracker verification",
        body: "A CRAL reviewer verifies your NTSA logbook, comprehensive insurance certificate, and active telematics tracker within 48 hours.",
      },
      {
        n: "03",
        icon: Wallet,
        title: "Verify OTP code & get paid",
        body: "Accept booking requests that fit your schedule, confirm the hirer's OTP at handover, and receive automated payouts.",
      },
    ],
    calculator: {
      title: "Passenger Vehicle Revenue Estimator",
      subtitle: "Calculate your projected monthly take-home after CRAL platform service fees.",
      rateLabel: "DAILY HIRE RATE",
      rateUnit: "KES / day",
      countLabel: "HIRE DAYS A MONTH",
      countUnit: "days",
      defaultRate: 5000,
      defaultCount: 12,
      minRate: 2500,
      maxRate: 30000,
      minCount: 1,
      maxCount: 30,
      presets: [
        { label: "Sedan (e.g. Fielder / Axio)", rate: 4500, count: 12 },
        { label: "Compact SUV (e.g. Harrier / X-Trail)", rate: 8000, count: 14 },
        { label: "Executive 4x4 (e.g. Prado / Land Cruiser)", rate: 16000, count: 10 },
      ],
      outputDescription: (rate, count) =>
        `Hirer pays ${formatKes(rate * count)} over ${count} ${count === 1 ? "day" : "days"}. You take home net earnings after standard platform fee.`,
      footnote:
        "Estimates based on typical market utilization across Nairobi, Mombasa, and regional hubs. CRAL never charges listing fees or idle car fees.",
    },
    documents: {
      title: "Vehicle Host Verification Checklist",
      subtitle: "Photos from your smartphone are acceptable during onboarding.",
      items: [
        "Vehicle Logbook (NTSA verified copy in owner's name)",
        "Valid Comprehensive Insurance Certificate (PSV, Commercial, or Private as applicable)",
        "Certified GPS Telematics / Tracker Certificate from an approved vendor",
        "Host National ID / Alien Card & KRA PIN Certificate",
      ],
      companyExtra:
        "Listing as a fleet company? You will also provide your Certificate of Incorporation, CR12, and Corporate KRA PIN.",
    },
    waMessage: "Hi CRAL - I would like to partner as a Car / Fleet Host",
  },

  trucks: {
    id: "trucks",
    label: "Truck & Haulage Operators",
    badge: "Commercial Cargo",
    heroKicker: "COMMERCIAL FREIGHT & HAULAGE",
    tagline: "Commercial cargo jobs, corridor matching, and guaranteed trip escrows",
    description:
      "Connect tippers, canters, flatbeds, prime movers, and heavy plant to verified industrial shippers and construction projects. Eliminate empty backhauls, set per-km or per-tonne tariffs, and guarantee payment before dispatch.",
    icon: Truck,
    benefits: [
      {
        icon: Truck,
        title: "Commercial Cargo Jobs on Demand",
        description:
          "Receive high-yield freight and tipper requests from verified construction firms, manufacturers, and agricultural distributors across Kenya.",
      },
      {
        icon: NavigationArrow,
        title: "Kenya Corridor Route Matching",
        description:
          "Algorithmic route matching along major economic arteries: Mombasa–Nairobi–Nakuru–Kisumu–Eldoret and transit border routes to Malaba.",
      },
      {
        icon: Tag,
        title: "Per-KM & Per-Tonne Pricing Control",
        description:
          "Define minimum trip mobilization charges, demurrage waiting allowances, and per-km or per-tonne rates tailored to your fleet's capacity.",
      },
      {
        icon: ShieldCheck,
        title: "Escrow-Protected Upfront Freight",
        description:
          "Shipper payment is locked into CRAL escrow before your truck leaves the yard. Instant payout is disbursed upon electronic POD sign-off.",
      },
    ],
    steps: [
      {
        n: "01",
        icon: NotePencil,
        title: "Register fleet capacity & depot",
        body: "Input your vehicle specs: axle layout, payload tonnage, trailer type (flatbed, tipper, box-body, reefer), and operating corridors.",
      },
      {
        n: "02",
        icon: MagnifyingGlass,
        title: "NTSA commercial & GIT audit",
        body: "CRAL verifies your commercial inspection certificate, Goods-in-Transit (GIT) insurance policy, and speed governor certification.",
      },
      {
        n: "03",
        icon: Wallet,
        title: "Accept dispatch & earn on e-POD",
        body: "Review cargo manifests, dispatch your driver, obtain the receiver's digital sign-off, and receive automated settlement.",
      },
    ],
    calculator: {
      title: "Commercial Haulage Revenue Estimator",
      subtitle: "Calculate monthly net proceeds based on average trip freight charges and volume.",
      rateLabel: "AVERAGE TRIP RATE",
      rateUnit: "KES / trip",
      countLabel: "TRIPS A MONTH",
      countUnit: "trips",
      defaultRate: 35000,
      defaultCount: 10,
      minRate: 10000,
      maxRate: 250000,
      minCount: 1,
      maxCount: 40,
      presets: [
        { label: "3-Tonne Canter (Local Metro)", rate: 18000, count: 14 },
        { label: "10-Tonne Tipper (Quarry & Sand)", rate: 35000, count: 18 },
        { label: "28-Tonne Prime Mover (Corridor Run)", rate: 95000, count: 6 },
      ],
      outputDescription: (rate, count) =>
        `Gross freight billing of ${formatKes(rate * count)} over ${count} completed ${count === 1 ? "trip" : "trips"}. Net freight settlement deposited to your bank or M-Pesa Paybill.`,
      footnote:
        "Trip earnings vary by distance, fuel escalation clauses, and axle configurations. CRAL charges zero membership fees to haulage operators.",
    },
    documents: {
      title: "Transporter & Haulier Compliance Checklist",
      subtitle: "Commercial documents ensure priority dispatch on enterprise logistics contracts.",
      items: [
        "Commercial Vehicle Logbook indicating valid registered ownership",
        "Goods in Transit (GIT) Insurance Policy covering your payload class",
        "Valid NTSA Commercial Vehicle Inspection Sticker & Speed Governor Certificate",
        "Registered Transporter National ID / Certificate of Incorporation & KRA PIN",
      ],
      companyExtra:
        "Fleet operators dispatching multiple trucks should include driver PSV badges and commercial DL endorsements.",
    },
    waMessage: "Hi CRAL - I would like to partner as a Truck / Haulage Operator",
  },

  drivers: {
    id: "drivers",
    label: "Professional Drivers",
    badge: "Chauffeured & Rosters",
    heroKicker: "VERIFIED CHAUFFEUR NETWORK",
    tagline: "Join verified merchant rosters, chauffeured gigs, and zero client haggling",
    description:
      "Take the wheel on Kenya's premier chauffeuring network. Pair with high-profile car hosts, VIP corporate delegations, and cross-country overland expeditions on guaranteed day rates with zero client haggling.",
    icon: SteeringWheel,
    benefits: [
      {
        icon: SteeringWheel,
        title: "Verified Merchant Fleet Rosters",
        description:
          "Connect directly with multi-car hosts and corporate fleet managers who need trusted, vetted drivers on regular rotations.",
      },
      {
        icon: ShieldStar,
        title: "Exclusive Chauffeured Gigs",
        description:
          "Access VIP airport transfers, executive corporate hires, safari excursions, and wedding motorcades across Kenya.",
      },
      {
        icon: Coins,
        title: "Protected Day & Hour Rates",
        description:
          "Earn guaranteed day rates starting from KES 2,500 to KES 6,500+. Client funds are secured in escrow prior to journey departure.",
      },
      {
        icon: Handshake,
        title: "Zero Client Haggling",
        description:
          "Never argue over fuel, subsistence allowances, or trip overtime. Every trip scope is digitally agreed upon and paid on time.",
      },
    ],
    steps: [
      {
        n: "01",
        icon: NotePencil,
        title: "Submit DL & NTSA PSV endorsements",
        body: "Upload your valid Kenyan Smart Driving License (Class B, C, or D) alongside your NTSA PSV badge and reference contacts.",
      },
      {
        n: "02",
        icon: MagnifyingGlass,
        title: "Background vetting & Good Conduct",
        body: "CRAL compliance checks your valid Police Clearance Certificate (Good Conduct) and performs a telephone background verification.",
      },
      {
        n: "03",
        icon: Wallet,
        title: "Clock in, drive & receive payouts",
        body: "Accept chauffeured assignments in your county, clock in via the mobile portal, complete your trip, and receive weekly payouts.",
      },
    ],
    calculator: {
      title: "Chauffeur & Driver Income Estimator",
      subtitle: "Estimate your monthly take-home as a vetted professional on CRAL partner rosters.",
      rateLabel: "DAILY CHAUFFEUR RATE",
      rateUnit: "KES / day",
      countLabel: "DRIVING DAYS A MONTH",
      countUnit: "days",
      defaultRate: 3500,
      defaultCount: 16,
      minRate: 2000,
      maxRate: 10000,
      minCount: 1,
      maxCount: 26,
      presets: [
        { label: "City & Business Chauffeur", rate: 3000, count: 18 },
        { label: "VIP Executive / Safari Tour Guide", rate: 5000, count: 16 },
        { label: "Heavy Commercial Truck Driver", rate: 4500, count: 20 },
      ],
      outputDescription: (rate, count) =>
        `Total gross bookings of ${formatKes(rate * count)} for ${count} ${count === 1 ? "day" : "days"} on duty. Payouts arrive weekly on your personal M-Pesa line.`,
      footnote:
        "Daily rates exclude client-funded meal and upcountry accommodation allowances where applicable. Drivers pay zero subscription fees.",
    },
    documents: {
      title: "Professional Driver Onboarding Checklist",
      subtitle: "Vetted drivers gain immediate access to corporate and private chauffeured assignments.",
      items: [
        "Valid Kenyan Smart Driving License (DL) with relevant endorsements",
        "Valid NTSA PSV Badge (mandatory for passenger vehicles)",
        "Valid Police Clearance Certificate (Certificate of Good Conduct, issued within 12 months)",
        "National ID / Alien Card & Personal KRA PIN Certificate",
      ],
      companyExtra:
        "Have defensive driving certifications or customer care training from AA Kenya or St. John Ambulance? Add them for VIP badge status.",
    },
    waMessage: "Hi CRAL - I would like to register as a Professional Driver",
  },

  garages: {
    id: "garages",
    label: "Garages & Workshops",
    badge: "Auto Repairs & Service",
    heroKicker: "CERTIFIED AUTO WORKSHOP NETWORK",
    tagline: "Receive localized repair RFQs with upfront customer escrow & 72h payouts",
    description:
      "Expand your workshop's order book with vehicle owners and commercial fleets in your county. Send digital quotes against real diagnostic faults, benefit from upfront escrow protection, and receive guaranteed 72-hour payouts.",
    icon: Wrench,
    benefits: [
      {
        icon: Wrench,
        title: "County Repair & Maintenance RFQs",
        description:
          "Receive matched service, diagnostics, bodywork, brake overhauls, and engine repair requests directly from local vehicle hosts and owners.",
      },
      {
        icon: FileText,
        title: "Digital Itemized Quote Builder",
        description:
          "Build and send transparent quotes with itemized labor, parts, and completion timelines in under 2 minutes from your phone.",
      },
      {
        icon: ShieldCheck,
        title: "Payment Held Upfront Before Work",
        description:
          "Never purchase parts out of pocket or chase unpaid job cards. The customer deposits 100% of the quote in escrow before you turn a wrench.",
      },
      {
        icon: Coins,
        title: "Automatic 72h Payout on Release",
        description:
          "Funds are disbursed to your business bank account or M-Pesa Till within 72 hours of digital vehicle handover and sign-off.",
      },
    ],
    steps: [
      {
        n: "01",
        icon: NotePencil,
        title: "Register workshop & bay capabilities",
        body: "List your physical workshop location, bay count, specialized equipment (OBD diagnostics, paint booth, wheel alignment), and technicians.",
      },
      {
        n: "02",
        icon: MagnifyingGlass,
        title: "Review RFQs & dispatch digital quotes",
        body: "Inspect owner-uploaded fault videos, descriptions, and chassis details. Issue an itemized estimate with labor and parts breakdown.",
      },
      {
        n: "03",
        icon: Wallet,
        title: "Complete repair & receive escrow settlement",
        body: "Execute the approved work under secured escrow. The client approves vehicle pickup and your payment is released without delay.",
      },
    ],
    calculator: {
      title: "Workshop Billing & Revenue Estimator",
      subtitle: "Estimate your monthly garage turnover through CRAL's verified repair RFQ marketplace.",
      rateLabel: "AVERAGE JOB CARD VALUE",
      rateUnit: "KES / job",
      countLabel: "REPAIRS COMPLETED A MONTH",
      countUnit: "jobs",
      defaultRate: 25000,
      defaultCount: 16,
      minRate: 5000,
      maxRate: 350000,
      minCount: 1,
      maxCount: 80,
      presets: [
        { label: "Routine Maintenance & Servicing", rate: 12000, count: 25 },
        { label: "Mechanical & Suspension Overhaul", rate: 35000, count: 14 },
        { label: "Accident Repair & Bodywork", rate: 95000, count: 6 },
      ],
      outputDescription: (rate, count) =>
        `Total gross workshop billings of ${formatKes(rate * count)} for ${count} completed ${count === 1 ? "job" : "jobs"}. Net settlement transferred straight to your bank or Till.`,
      footnote:
        "CRAL provides upfront escrow protection on all quotes. You never risk buying parts for a client who fails to settle their bill.",
    },
    documents: {
      title: "Auto Workshop Accreditation Checklist",
      subtitle: "Accredited workshops receive preferential placement for corporate and fleet maintenance.",
      items: [
        "County Government Single Business Permit (SBP) for auto workshop premises",
        "Business Registration Certificate / Certificate of Incorporation & KRA PIN",
        "Lead Technician / Head Mechanic trade certification (NITA, TVET, or equivalent)",
        "Proof of Physical Workshop Premises (lease agreement, photo of yard, or utility bill)",
      ],
      companyExtra:
        "Garage Keeper's Liability Insurance or third-party premises cover qualifies your workshop for high-value corporate fleet tenders.",
    },
    waMessage: "Hi CRAL - I would like to accredit my Garage / Workshop",
  },

  parts: {
    id: "parts",
    label: "Spare Parts Dealers",
    badge: "Genuine & OEM Parts",
    heroKicker: "AUTHENTIC AUTOMOTIVE SPARES",
    tagline: "Fulfill chassis-matched inquiries with guaranteed delivery payment",
    description:
      "Sell auto parts directly to verified workshops and car owners across Kenya. Receive VIN-accurate parts inquiries, quote genuine, OEM, or certified aftermarket components, and enjoy instant payment upon courier delivery.",
    icon: GearSix,
    benefits: [
      {
        icon: GearSix,
        title: "Real Chassis & VIN-Matched Inquiries",
        description:
          "No more guessing or mismatched part returns. Inquiries arrive with verified chassis/VIN numbers and photo references.",
      },
      {
        icon: Package,
        title: "Quote Genuine, OEM, or Certified Used",
        description:
          "Provide transparent tier options: Genuine, OEM, or verified tested replacement, with clear warranty terms that build customer loyalty.",
      },
      {
        icon: ShieldCheck,
        title: "Guaranteed Escrow Before Dispatch",
        description:
          "Buyer funds are locked in platform escrow before you pull the part from your shelves. Dispatched goods are guaranteed paid.",
      },
      {
        icon: Truck,
        title: "Nationwide Courier Integration",
        description:
          "Same-day rider delivery in Nairobi and express G4S/Fargo courier dispatch to all 47 counties with automatic tracking numbers.",
      },
    ],
    steps: [
      {
        n: "01",
        icon: NotePencil,
        title: "Create parts dealer profile",
        body: "Specify your parts categories (engine, suspension, braking, electrical, panels) and vehicle specialties (Toyota, Isuzu, Subaru, European, Heavy Trucks).",
      },
      {
        n: "02",
        icon: MagnifyingGlass,
        title: "Receive VIN-accurate inquiries",
        body: "Get live alerts for parts needed in your inventory class. Quote price, condition (Genuine/OEM/Used), and delivery timeframe in seconds.",
      },
      {
        n: "03",
        icon: Wallet,
        title: "Hand over to courier & receive payout",
        body: "Dispatch via verified rider or courier. The buyer or garage confirms part match and funds are instantly credited to your wallet.",
      },
    ],
    calculator: {
      title: "Spare Parts Turnover Estimator",
      subtitle: "Calculate monthly parts sales revenue through chassis-matched inquiries.",
      rateLabel: "AVERAGE PART ORDER VALUE",
      rateUnit: "KES / order",
      countLabel: "ORDERS FULFILLED A MONTH",
      countUnit: "orders",
      defaultRate: 15000,
      defaultCount: 30,
      minRate: 2000,
      maxRate: 250000,
      minCount: 1,
      maxCount: 150,
      presets: [
        { label: "Fast-Moving Filters & Brake Pads", rate: 6500, count: 50 },
        { label: "Suspension, Steering & Shocks", rate: 18000, count: 28 },
        { label: "Major Engine, Gearbox & Turbo Units", rate: 65000, count: 8 },
      ],
      outputDescription: (rate, count) =>
        `Turnover of ${formatKes(rate * count)} across ${count} fulfilled parts orders. Instant escrow payouts upon buyer delivery confirmation.`,
      footnote:
        "CRAL escrow eliminates bad debt and dishonored checks from rogue mechanics. Parts pricing remains entirely under your control.",
    },
    documents: {
      title: "Spare Parts Merchant Verification Checklist",
      subtitle: "Build trust with thousands of workshops and vehicle owners across Kenya.",
      items: [
        "Certificate of Business Registration / Certificate of Incorporation",
        "Business KRA PIN Certificate",
        "County Government Single Business Permit for shop / warehouse location",
        "Store Owner or Managing Director National ID Card",
      ],
      companyExtra:
        "Dealers holding official brand distributorships (e.g. Denso, Bosch, KYB, NGK) receive the highlighted 'Verified OEM Partner' badge.",
    },
    waMessage: "Hi CRAL - I would like to partner as a Spare Parts Dealer",
  },

  dealers: {
    id: "dealers",
    label: "Car Dealerships & Sellers",
    badge: "Verified Vehicle Sales",
    heroKicker: "CERTIFIED AUTO SHOWROOMS",
    tagline: "Showcase certified showroom inventory to authenticated buyers with zero broker spam",
    description:
      "Present certified local and imported vehicle inventory to authenticated buyers across Kenya. Enjoy verified NTSA paper trails, pre-integrated bank asset financing, and complete freedom from predatory brokers and spam.",
    icon: Storefront,
    benefits: [
      {
        icon: Storefront,
        title: "Authenticated High-Intent Buyers",
        description:
          "Showcase inventory to real, verified buyers with confirmed identity and pre-qualified asset finance readiness.",
      },
      {
        icon: FileText,
        title: "Transparent NTSA Paper Trails",
        description:
          "Every listing features verified logbook status, import QISJ inspection check, duty clearance, and clear ownership records.",
      },
      {
        icon: Prohibit,
        title: "Zero Broker Spam & Price Padding",
        description:
          "No rogue street middlemen inflating your showroom prices or gatekeeping your inventory. Deal directly with the buyer.",
      },
      {
        icon: Buildings,
        title: "Integrated Bank Asset Financing",
        description:
          "Fast-track vehicle sales with integrated bank financing approvals from NCBA, Co-op Bank, Stanbic, and KCB built right into your listings.",
      },
    ],
    steps: [
      {
        n: "01",
        icon: NotePencil,
        title: "Register showroom & upload stock",
        body: "Create your verified dealership profile with yard location, business credentials, and upload showroom vehicles with HD gallery photos.",
      },
      {
        n: "02",
        icon: MagnifyingGlass,
        title: "CRAL title & provenance verification",
        body: "Our compliance team inspects logbook details, NTSA caveats, duty payment proof, and mechanical inspection scores.",
      },
      {
        n: "03",
        icon: Wallet,
        title: "Schedule test-drives & close sales",
        body: "Host verified buyers for scheduled viewings, close the sale via secure escrow or partner bank asset finance, and receive funds.",
      },
    ],
    calculator: {
      title: "Dealership Sales Volume & Commission Savings",
      subtitle: "Project your vehicle sales turnover on Kenya's verified automotive portal.",
      rateLabel: "AVERAGE VEHICLE PRICE",
      rateUnit: "KES / vehicle",
      countLabel: "VEHICLES SOLD A MONTH",
      countUnit: "units",
      defaultRate: 2800000,
      defaultCount: 3,
      minRate: 600000,
      maxRate: 15000000,
      minCount: 1,
      maxCount: 25,
      presets: [
        { label: "City Hatchbacks & Sedans", rate: 1400000, count: 5 },
        { label: "Family SUVs & Crossovers", rate: 3200000, count: 3 },
        { label: "Commercial Fleets & Luxury 4x4s", rate: 6500000, count: 2 },
      ],
      outputDescription: (rate, count) =>
        `Total inventory turnover of ${formatKes(rate * count)} over ${count} ${count === 1 ? "unit" : "units"} sold. CRAL's capped transaction commission saves tens of thousands vs broker markups.`,
      footnote:
        "Listing certified inventory is 100% free with no monthly display fees. Unsold showroom stock can also be monetized on CRAL rentals.",
    },
    documents: {
      title: "Showroom & Dealership Accreditation Checklist",
      subtitle: "Verified dealerships earn the trusted 'CRAL Certified Yard' badge.",
      items: [
        "Motor Vehicle Dealer License (KG plate permit if operating) or Certificate of Incorporation",
        "County Government Single Business Permit for showroom / motor yard location",
        "Dealership KRA PIN Certificate & Tax Compliance Certificate",
        "Managing Director / Principal Dealer National ID Card",
      ],
      companyExtra:
        "Original NTSA logbooks, import declaration forms (IDF), and QISJ inspection certificates must be presented for all verified inventory.",
    },
    waMessage: "Hi CRAL - I would like to list inventory as a Car Dealership",
  },
};

const TRACK_ORDER: SupplierTrackId[] = ["cars", "trucks", "drivers", "garages", "parts", "dealers"];

const CROSS_VERTICAL_SYNERGIES = [
  {
    icon: SteeringWheel,
    title: "Car Hosts + Vetted Drivers",
    body: "Host passenger vehicles as self-drive or hire pre-vetted chauffeurs from the platform roster for VIP and safari assignments.",
  },
  {
    icon: Wrench,
    title: "Fleets + Certified Garages",
    body: "Car hosts and haulage operators route vehicle maintenance through accredited workshops with pre-negotiated merchant labor rates.",
  },
  {
    icon: GearSix,
    title: "Garages + Parts Dealers",
    body: "Mechanics order chassis-matched parts straight from accredited dealers with express delivery, guaranteed escrow, and zero mismatch returns.",
  },
  {
    icon: Storefront,
    title: "Dealerships + Rental Fleet",
    body: "Car dealerships can monetize unsold showroom inventory on the rental fleet to earn weekly income while awaiting authenticated buyers.",
  },
];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Can I operate in multiple supplier categories with one merchant account?",
    a: "Yes! CRAL is built as a unified multi-supplier network. Once your merchant identity (National ID, KRA PIN, and CR12 for companies) is verified through our single KYC process, you can list passenger vehicles, dispatch trucks, register drivers, and quote on repair and parts RFQs from one consolidated merchant dashboard.",
  },
  {
    q: "What does it cost to list vehicles, trucks, or services on CRAL?",
    a: "Nothing. There are zero listing fees, zero setup fees, and zero recurring monthly subscriptions across all six verticals. CRAL only earns a small service commission when you successfully complete a booking, haulage run, repair job, or parts sale.",
  },
  {
    q: "How does payment protection and escrow work?",
    a: "Every transaction on CRAL is protected by our secure platform escrow. For car rentals and freight haulage, the client pays before the trip begins. For garages and parts dealers, 100% of the quote is deposited into escrow before work begins or parts are dispatched. You never chase an unpaid invoice.",
  },
  {
    q: "How and when do merchant payouts land?",
    a: "Payouts are disbursed automatically to your registered M-Pesa line or bank account. Rental hosts and drivers receive payouts every Monday or monthly on the 1st. Freight transporters, garages, and parts dealers receive payouts immediately upon digital delivery or within 72 hours of customer handover.",
  },
  {
    q: "How does the pickup OTP and damage arbitration work for car hosts?",
    a: "When a customer arrives to collect a car, they present a 6-digit one-time authorization code generated in their CRAL app. Both host and hirer complete a quick time-stamped photo walkthrough. If any damage occurs during the hire, CRAL arbitrates the claim using the pre-trip photos with security deposit backing.",
  },
  {
    q: "Do I need to be a registered company to partner with CRAL?",
    a: "No. Individual proprietors and registered companies can both join. Individual merchants provide their National ID and KRA PIN; registered companies provide their Certificate of Incorporation, CR12, and corporate KRA PIN to unlock multi-staff fleet operations.",
  },
  {
    q: "How long does supplier verification take?",
    a: "Our local compliance team reviews submitted documents within 24 to 48 working hours. You will receive an SMS and email notification the moment your merchant profile is active and ready to transact.",
  },
];

function formatKes(amount: number): string {
  return `KES ${Math.round(amount).toLocaleString("en-KE")}`;
}

const CSS = `
.ml-root { background:${C.canvas}; color:${C.ink}; min-height:100vh; display:flex; flex-direction:column; font-family:${SANS}; }
.ml-root *, .ml-root *::before, .ml-root *::after { box-sizing:border-box; }
.ml-wrap { width:100%; max-width:1180px; margin:0 auto; padding:0 clamp(16px,4vw,40px); }
.ml-section { padding:clamp(48px,7vw,92px) 0; }
.ml-root [id] { scroll-margin-top:84px; }

/* Header */
.ml-header { position:sticky; top:0; z-index:50; background:rgba(11,15,26,.94); backdrop-filter:saturate(140%) blur(12px); -webkit-backdrop-filter:saturate(140%) blur(12px); border-bottom:1px solid rgba(255,255,255,.08); }
.ml-header-inner { display:flex; align-items:center; gap:20px; height:72px; }
.ml-nav { display:flex; gap:22px; margin-left:20px; }
.ml-nav a { font:500 13.5px/1 ${SANS}; color:#A7B0BE; text-decoration:none; transition:color .14s ease; }
.ml-nav a:hover { color:#FFFFFF; }
.ml-header-right { margin-left:auto; display:flex; align-items:center; gap:14px; }
.ml-text-link { font:600 14px/1 ${SANS}; color:#FFFFFF; text-decoration:none; display:inline-flex; align-items:center; gap:7px; transition:color .14s ease; }
.ml-text-link:hover { color:${C.blue200}; }

/* Buttons */
.ml-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; height:46px; padding:0 22px; border-radius:10px; font:600 15px/1 ${SANS}; text-decoration:none; border:1px solid transparent; cursor:pointer; transition:background .14s ease, border-color .14s ease, transform .12s ease, box-shadow .14s ease; white-space:nowrap; }
.ml-btn:active { transform:translateY(1px); }
.ml-btn-sm { height:38px; padding:0 16px; font-size:13.5px; border-radius:8px; }
.ml-btn-primary { background:${C.blue}; color:#FFFFFF; box-shadow:0 6px 18px rgba(15,35,168,.3); }
.ml-btn-primary:hover { background:${C.blue700}; }
.ml-btn-ghost { background:rgba(255,255,255,.07); color:#FFFFFF; border-color:rgba(255,255,255,.24); }
.ml-btn-ghost:hover { background:rgba(255,255,255,.15); border-color:rgba(255,255,255,.45); }
.ml-btn-white { background:#FFFFFF; color:${C.blue}; box-shadow:0 4px 14px rgba(0,0,0,.12); }
.ml-btn-white:hover { background:${C.blue50}; }
.ml-btn-outline { background:transparent; color:${C.blue}; border-color:${C.blue200}; }
.ml-btn-outline:hover { background:${C.blue50}; border-color:${C.blue}; }
.ml-btn:focus-visible, .ml-track-btn:focus-visible, .ml-faq summary:focus-visible, .ml-fab:focus-visible, .ml-preset-chip:focus-visible { outline:3px solid ${C.blue200}; outline-offset:2px; }

/* Hero */
.ml-hero { position:relative; min-height:clamp(600px,88vh,780px); display:flex; align-items:center; overflow:hidden; background:${C.ink}; }
.ml-hero-img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:40% 50%; opacity:.35; }
.ml-hero-shade { position:absolute; inset:0; background:linear-gradient(90deg,rgba(11,15,26,.97) 0%,rgba(11,15,26,.90) 45%,rgba(11,15,26,.55) 75%,rgba(11,15,26,.3) 100%), linear-gradient(0deg,rgba(11,15,26,.85) 0%,rgba(11,15,26,0) 50%); }
.ml-hero-content { position:relative; z-index:2; padding-top:clamp(48px,7vw,80px); padding-bottom:clamp(48px,7vw,80px); }
.ml-hero h1 { margin:0 0 20px; max-width:18ch; font:700 clamp(36px,5.8vw,66px)/1.04 ${DISPLAY}; font-variation-settings:'wdth' 110; letter-spacing:-.03em; color:#FFFFFF; text-wrap:balance; }
.ml-hero-lede { margin:0 0 34px; max-width:640px; font:400 clamp(16px,1.9vw,20px)/1.55 ${SANS}; color:#CBD3E0; }
.ml-cta-row { display:flex; flex-wrap:wrap; gap:14px; }
.ml-chips { display:flex; flex-wrap:wrap; gap:10px; margin-top:36px; }
.ml-chip { display:inline-flex; align-items:center; gap:8px; padding:8px 14px; border-radius:999px; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.14); font:500 13px/1 ${SANS}; color:#E6EAF0; }

/* Stats Bar */
.ml-stats { background:#FFFFFF; border-bottom:1px solid ${C.n200}; }
.ml-stats-grid { display:grid; grid-template-columns:repeat(4,1fr); }
.ml-stat { padding:26px 20px; border-left:1px solid ${C.n200}; }
.ml-stat:first-child { border-left:0; }
.ml-stat-num { font:700 clamp(26px,3.2vw,34px)/1 ${DISPLAY}; font-variation-settings:'wdth' 110; letter-spacing:-.025em; color:${C.ink}; }
.ml-stat-label { margin-top:8px; font:400 13.5px/1.45 ${SANS}; color:${C.n600}; }

/* Section Headings */
.ml-kicker { display:flex; align-items:center; gap:10px; margin-bottom:14px; font:500 11.5px/1 ${MONO}; letter-spacing:.12em; color:${C.n500}; text-transform:uppercase; }
.ml-kicker-skew { display:inline-block; width:18px; height:4px; background:${C.red}; transform:skewX(-14deg); }
.ml-h2 { margin:0 0 14px; font:700 clamp(28px,3.8vw,42px)/1.08 ${DISPLAY}; font-variation-settings:'wdth' 110; letter-spacing:-.025em; color:${C.ink}; text-wrap:balance; }
.ml-sub { margin:0; max-width:680px; font:400 clamp(15px,1.6vw,17px)/1.6 ${SANS}; color:${C.n600}; }
.ml-head { margin-bottom:clamp(30px,4vw,44px); }

/* Supplier Track Selector */
.ml-track-selector-wrap { background:#FFFFFF; border:1px solid ${C.n200}; border-radius:18px; padding:10px; box-shadow:0 2px 10px rgba(11,15,26,.04); margin-bottom:34px; }
.ml-tracks-grid { display:grid; grid-template-columns:repeat(6,1fr); gap:8px; }
.ml-track-btn { position:relative; display:flex; flex-direction:column; align-items:center; text-align:center; padding:18px 10px 16px; border-radius:12px; border:1px solid transparent; background:transparent; cursor:pointer; transition:all .16s ease; text-decoration:none; }
.ml-track-btn:hover { background:${C.canvas}; border-color:${C.n200}; }
.ml-track-btn.active { background:${C.ink}; border-color:${C.ink}; box-shadow:0 8px 24px rgba(11,15,26,.18); transform:translateY(-2px); }
.ml-track-icon-box { width:46px; height:46px; border-radius:12px; display:grid; place-items:center; background:${C.blue50}; color:${C.blue}; margin-bottom:12px; transition:all .16s ease; }
.ml-track-btn.active .ml-track-icon-box { background:rgba(255,255,255,.12); color:#FFFFFF; border:1px solid rgba(255,255,255,.2); }
.ml-track-btn-title { font:600 14px/1.3 ${SANS}; color:${C.ink}; margin-bottom:5px; transition:color .16s ease; }
.ml-track-btn.active .ml-track-btn-title { color:#FFFFFF; }
.ml-track-btn-badge { font:500 10.5px/1 ${MONO}; letter-spacing:.05em; color:${C.n500}; padding:3px 7px; border-radius:4px; background:${C.n100}; transition:all .16s ease; }
.ml-track-btn.active .ml-track-btn-badge { color:#FFFFFF; background:rgba(255,255,255,.16); }
.ml-track-active-bar { position:absolute; bottom:0; left:20%; right:20%; height:3px; background:${C.red}; border-radius:3px 3px 0 0; transform:skewX(-14deg); }

/* Track Spotlight Card */
.ml-spotlight { background:#FFFFFF; border:1px solid ${C.n200}; border-radius:20px; padding:clamp(28px,4vw,48px); box-shadow:0 12px 36px rgba(11,15,26,.06); margin-bottom:44px; }
.ml-spotlight-top { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:flex-start; gap:24px; padding-bottom:30px; border-bottom:1px solid ${C.n200}; }
.ml-spotlight-copy { max-width:720px; }
.ml-spotlight-copy h3 { margin:0 0 10px; font:700 clamp(24px,3.2vw,36px)/1.15 ${DISPLAY}; font-variation-settings:'wdth' 110; letter-spacing:-.025em; color:${C.ink}; }
.ml-spotlight-copy p { margin:0; font:400 16px/1.6 ${SANS}; color:${C.n600}; }
.ml-spotlight-actions { display:flex; flex-wrap:wrap; gap:12px; align-self:center; }

/* 4 Pillar Benefits */
.ml-benefits-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:18px; margin-top:32px; }
.ml-benefit-card { padding:22px; border-radius:14px; background:${C.canvas}; border:1px solid ${C.n200}; display:flex; flex-direction:column; }
.ml-benefit-icon { width:42px; height:42px; border-radius:10px; background:${C.blue50}; color:${C.blue}; display:grid; place-items:center; margin-bottom:14px; }
.ml-benefit-card h4 { margin:0 0 8px; font:600 16px/1.35 ${SANS}; color:${C.ink}; }
.ml-benefit-card p { margin:0; font:400 13.8px/1.55 ${SANS}; color:${C.n600}; }

/* Revenue Calculator */
.ml-calc-container { background:#FFFFFF; border:1px solid ${C.n200}; border-radius:20px; padding:clamp(24px,4vw,44px); box-shadow:0 8px 30px rgba(11,15,26,.05); }
.ml-calc-layout { display:grid; grid-template-columns:1fr 1.15fr; gap:clamp(28px,5vw,60px); align-items:center; }
.ml-calc-left { display:flex; flex-direction:column; }
.ml-presets { display:flex; flex-wrap:wrap; gap:8px; margin:22px 0 26px; }
.ml-preset-chip { padding:7px 12px; border-radius:8px; border:1px solid ${C.n200}; background:${C.canvas}; font:500 12.5px/1 ${SANS}; color:${C.n700}; cursor:pointer; transition:all .14s ease; }
.ml-preset-chip:hover { border-color:${C.blue400}; background:${C.blue50}; color:${C.blue700}; }
.ml-preset-chip.active { border-color:${C.blue}; background:${C.blue}; color:#FFFFFF; }
.ml-check-points { display:grid; gap:12px; margin:0 0 28px; padding:0; list-style:none; }
.ml-check-points li { display:flex; gap:11px; align-items:flex-start; font:400 14.5px/1.5 ${SANS}; color:${C.n700}; }

/* Calculator Right Card */
.ml-calc-box { background:${C.ink}; border-radius:18px; padding:clamp(24px,3.4vw,36px); color:#FFFFFF; box-shadow:0 24px 50px rgba(11,15,26,.28); border:1px solid #1F2839; }
.ml-calc-box-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; padding-bottom:14px; border-bottom:1px solid #222C3E; }
.ml-calc-badge { font:500 11px/1 ${MONO}; letter-spacing:.1em; color:#9EABBE; text-transform:uppercase; }
.ml-calc-fields { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:18px; }
.ml-calc-label { display:block; margin-bottom:8px; font:600 10.5px/1 ${MONO}; letter-spacing:.08em; color:#8C97A8; }
.ml-calc-input { width:100%; height:48px; padding:0 14px; border:1px solid #2A3346; border-radius:10px; background:#131A28; color:#FFFFFF; font:600 16px/1 ${SANS}; transition:border-color .14s ease; }
.ml-calc-input:focus { outline:none; border-color:${C.blue400}; box-shadow:0 0 0 3px rgba(91,111,224,.3); }
.ml-calc-range { width:100%; accent-color:${C.blue400}; height:6px; cursor:pointer; }
.ml-calc-result { margin-top:22px; padding-top:22px; border-top:1px solid #222C3E; }
.ml-calc-out-label { font:600 11px/1 ${MONO}; letter-spacing:.1em; color:#8C97A8; margin-bottom:8px; }
.ml-calc-big-num { font:700 clamp(32px,4.4vw,48px)/1 ${DISPLAY}; font-variation-settings:'wdth' 110; letter-spacing:-.03em; color:#FFFFFF; }
.ml-calc-explainer { margin:10px 0 0; font:400 13.5px/1.55 ${SANS}; color:#CBD3E0; }
.ml-calc-footnote { margin:16px 0 0; font:400 12px/1.5 ${SANS}; color:#7C8697; }

/* 3-Step Walkthrough */
.ml-steps-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:20px; }
.ml-step-card { background:#FFFFFF; border:1px solid ${C.n200}; border-radius:16px; padding:28px 24px 26px; display:flex; flex-direction:column; position:relative; box-shadow:0 2px 8px rgba(11,15,26,.03); }
.ml-step-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:18px; }
.ml-step-badge { font:600 11.5px/1 ${MONO}; letter-spacing:.08em; color:${C.blue}; padding:5px 9px; border-radius:6px; background:${C.blue50}; }
.ml-step-icon { width:44px; height:44px; border-radius:12px; background:${C.ink}; color:#FFFFFF; display:grid; place-items:center; }
.ml-step-card h3 { margin:0 0 10px; font:600 18px/1.3 ${SANS}; color:${C.ink}; }
.ml-step-card p { margin:0; font:400 14.5px/1.6 ${SANS}; color:${C.n600}; }

/* "One Account, All Verticals" Feature Section */
.ml-unified { background:${C.ink}; color:#FFFFFF; border-radius:24px; padding:clamp(36px,5.5vw,68px) clamp(20px,4.5vw,56px); margin:clamp(48px,7vw,84px) 0; position:relative; overflow:hidden; }
.ml-unified-header { max-width:760px; margin-bottom:clamp(36px,5vw,52px); }
.ml-unified-header h2 { margin:0 0 16px; font:700 clamp(30px,4.2vw,46px)/1.08 ${DISPLAY}; font-variation-settings:'wdth' 110; letter-spacing:-.025em; color:#FFFFFF; }
.ml-unified-header p { margin:0; font:400 clamp(16px,1.8vw,18px)/1.6 ${SANS}; color:#A7B0BE; }
.ml-unified-pillars { display:grid; grid-template-columns:repeat(3,1fr); gap:22px; margin-bottom:44px; }
.ml-unified-card { background:#131A28; border:1px solid #232C3E; border-radius:16px; padding:26px 22px; }
.ml-unified-icon { width:46px; height:46px; border-radius:12px; background:rgba(255,255,255,.08); color:${C.blue200}; display:grid; place-items:center; margin-bottom:16px; border:1px solid rgba(255,255,255,.14); }
.ml-unified-card h3 { margin:0 0 10px; font:600 18px/1.3 ${SANS}; color:#FFFFFF; }
.ml-unified-card p { margin:0; font:400 14px/1.6 ${SANS}; color:#97A2B4; }

/* Synergy Matrix Box */
.ml-synergies { background:#161E2E; border:1px solid #253147; border-radius:16px; padding:26px; }
.ml-synergies-title { font:600 12px/1 ${MONO}; letter-spacing:.1em; color:#9FB0C8; text-transform:uppercase; margin-bottom:18px; display:flex; align-items:center; gap:8px; }
.ml-synergies-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; }
.ml-synergy-item { padding:14px; border-radius:10px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.07); }
.ml-synergy-item h4 { margin:0 0 6px; font:600 14.5px/1.3 ${SANS}; color:#FFFFFF; display:flex; align-items:center; gap:8px; }
.ml-synergy-item p { margin:0; font:400 13px/1.55 ${SANS}; color:#8C99AE; }

/* Documents Checklist */
.ml-docs-layout { display:grid; grid-template-columns:1fr 1.15fr; gap:clamp(28px,5vw,60px); align-items:start; }
.ml-doc-card { background:#FFFFFF; border:1px solid ${C.n200}; border-radius:18px; padding:clamp(22px,3vw,32px); box-shadow:0 4px 16px rgba(11,15,26,.04); }
.ml-doc-list { list-style:none; margin:0; padding:0; display:grid; gap:8px; }
.ml-doc-list li { display:flex; align-items:center; gap:14px; padding:12px 6px; border-bottom:1px solid ${C.n100}; font:500 15px/1.45 ${SANS}; color:${C.n700}; }
.ml-doc-list li:last-child { border-bottom:0; }
.ml-doc-icon { flex:none; width:36px; height:36px; border-radius:10px; background:${C.blue50}; color:${C.blue}; display:grid; place-items:center; }
.ml-doc-extra { margin-top:20px; padding:16px 18px; border-radius:12px; background:${C.canvas}; border:1px solid ${C.n200}; font:400 13.5px/1.55 ${SANS}; color:${C.n600}; }

/* Why CRAL Section */
.ml-why { background:#FFFFFF; border-top:1px solid ${C.n200}; border-bottom:1px solid ${C.n200}; }
.ml-why-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:clamp(20px,3vw,32px); }
.ml-why-icon { width:48px; height:48px; border-radius:12px; background:${C.ink}; color:#FFFFFF; display:grid; place-items:center; margin-bottom:16px; }
.ml-why h3 { margin:0 0 8px; font:600 17px/1.35 ${SANS}; color:${C.ink}; }
.ml-why p { margin:0; font:400 14.5px/1.6 ${SANS}; color:${C.n600}; }

/* FAQ */
.ml-faq { display:grid; gap:10px; }
.ml-faq details { background:#FFFFFF; border:1px solid ${C.n200}; border-radius:12px; transition:border-color .14s, box-shadow .14s; }
.ml-faq details[open] { border-color:${C.blue200}; box-shadow:0 8px 24px rgba(15,35,168,.08); }
.ml-faq summary { list-style:none; cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:18px 20px; font:600 16px/1.4 ${SANS}; color:${C.ink}; border-radius:12px; }
.ml-faq summary::-webkit-details-marker { display:none; }
.ml-faq-caret { flex:none; color:${C.n500}; transition:transform .18s; }
.ml-faq details[open] .ml-faq-caret { transform:rotate(180deg); color:${C.blue}; }
.ml-faq-a { padding:0 20px 20px; margin:0; font:400 15px/1.65 ${SANS}; color:${C.n600}; }
.ml-help { margin-top:24px; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:16px; padding:20px 22px; border-radius:14px; background:${C.blue50}; border:1px solid ${C.blue200}; }
.ml-help-text { display:flex; align-items:center; gap:14px; font:500 15px/1.45 ${SANS}; color:${C.blue700}; }

/* Final CTA */
.ml-final { position:relative; overflow:hidden; background:${C.blue}; }
.ml-final-img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:.22; mix-blend-mode:luminosity; }
.ml-final-shade { position:absolute; inset:0; background:linear-gradient(100deg,rgba(15,35,168,.96) 20%,rgba(11,27,133,.88) 100%); }
.ml-final-inner { position:relative; z-index:2; padding:clamp(56px,8vw,100px) 0; text-align:center; }
.ml-final h2 { margin:0 auto 16px; max-width:20ch; font:700 clamp(32px,4.6vw,52px)/1.06 ${DISPLAY}; font-variation-settings:'wdth' 110; letter-spacing:-.03em; color:#FFFFFF; text-wrap:balance; }
.ml-final p { margin:0 auto 32px; max-width:580px; font:400 17px/1.6 ${SANS}; color:#D6DCF7; }
.ml-final .ml-cta-row { justify-content:center; }

/* Footer */
.ml-footer { background:${C.ink}; color:#8C97A8; border-top:1px solid #1A2232; }
.ml-footer-grid { display:grid; grid-template-columns:1.5fr 1fr 1fr 1fr; gap:32px; padding:52px 0 40px; }
.ml-footer h4 { margin:0 0 16px; font:600 11.5px/1 ${MONO}; letter-spacing:.12em; color:#78869B; text-transform:uppercase; }
.ml-footer ul { list-style:none; margin:0; padding:0; display:grid; gap:11px; }
.ml-footer a { font:400 14px/1.4 ${SANS}; color:#CBD3E0; text-decoration:none; display:inline-flex; align-items:center; gap:8px; transition:color .14s ease; }
.ml-footer a:hover { color:#FFFFFF; }
.ml-footer-base { border-top:1px solid #1C2637; padding:22px 0 92px; font:500 11.5px/1.6 ${MONO}; letter-spacing:.08em; color:#5F6B7D; display:flex; justify-content:space-between; flex-wrap:wrap; gap:12px; }

/* Floating WhatsApp FAB */
.ml-fab { position:fixed; right:clamp(16px,2.4vw,28px); bottom:clamp(16px,2.4vw,28px); z-index:50; display:inline-flex; align-items:center; gap:10px; height:54px; padding:0 22px 0 18px; border-radius:999px; background:${C.whatsapp}; color:${C.ink}; font:600 14.5px/1 ${SANS}; text-decoration:none; box-shadow:0 12px 30px rgba(11,15,26,.3); transition:transform .15s ease, box-shadow .15s ease; }
.ml-fab:hover { transform:translateY(-2px); box-shadow:0 16px 36px rgba(11,15,26,.38); }

/* Responsive Media Queries */
@media (max-width: 1100px) {
  .ml-tracks-grid { grid-template-columns:repeat(3,1fr); gap:10px; }
  .ml-benefits-grid { grid-template-columns:repeat(2,1fr); }
  .ml-synergies-grid { grid-template-columns:repeat(2,1fr); }
}
@media (max-width: 960px) {
  .ml-calc-layout, .ml-docs-layout { grid-template-columns:1fr; }
  .ml-steps-grid { grid-template-columns:1fr; }
  .ml-unified-pillars { grid-template-columns:1fr; }
  .ml-why-grid { grid-template-columns:repeat(2,1fr); }
  .ml-footer-grid { grid-template-columns:1fr 1fr; }
}
@media (max-width: 840px) {
  .ml-nav { display:none; }
  .ml-stats-grid { grid-template-columns:repeat(2,1fr); }
  .ml-stat:nth-child(3) { border-left:0; }
  .ml-stat:nth-child(n+3) { border-top:1px solid ${C.n200}; }
}
@media (max-width: 640px) {
  .ml-tracks-grid { grid-template-columns:repeat(2,1fr); }
  .ml-benefits-grid { grid-template-columns:1fr; }
  .ml-synergies-grid { grid-template-columns:1fr; }
  .ml-calc-fields { grid-template-columns:1fr; }
  .ml-header-wa { display:none; }
  .ml-fab-label { display:none; }
  .ml-fab { width:54px; padding:0; justify-content:center; }
  .ml-cta-row .ml-btn { flex:1 1 100%; }
  .ml-footer-grid { grid-template-columns:1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .ml-root * { transition:none !important; }
}
`;

function Kicker({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="ml-kicker">
      <span className="ml-kicker-skew" />
      {children}
    </div>
  );
}

function WhatsAppButton({ message, label, className }: { message: string; label: string; className: string }): JSX.Element {
  return (
    <a className={className} href={whatsappLink(message)} target="_blank" rel="noreferrer">
      <WhatsappLogo size={20} weight="fill" />
      {label}
    </a>
  );
}

function Header(): JSX.Element {
  return (
    <header className="ml-header">
      <div className="ml-wrap ml-header-inner">
        <Link to="/" aria-label="CRAL Merchant Gateway Home">
          <img src="/logo-white.png" alt="Cruz Ride Auto Limited" style={{ display: "block", height: 42, width: "auto" }} />
        </Link>
        <nav className="ml-nav" aria-label="Merchant portal navigation">
          <a href="#tracks">Supplier Tracks</a>
          <a href="#calculator">Revenue Estimator</a>
          <a href="#one-account">Unified KYC</a>
          <a href="#how">How It Works</a>
          <a href="#documents">Requirements</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="ml-header-right">
          <a
            className="ml-text-link ml-header-wa"
            href={whatsappLink("Hi CRAL - I would like to inquire about partnering on the verified network")}
            target="_blank"
            rel="noreferrer"
          >
            <WhatsappLogo size={18} weight="fill" />
            Merchant Desk
          </a>
          <Link className="ml-text-link" to="/sign-in">
            Sign in
          </Link>
          <Link className="ml-btn ml-btn-primary ml-btn-sm" to="/create-account">
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero(): JSX.Element {
  return (
    <section className="ml-hero">
      <img className="ml-hero-img" src={IMG("hero")} alt="" />
      <div className="ml-hero-shade" />
      <div className="ml-wrap ml-hero-content">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <span style={{ display: "block", width: 28, height: 5, background: C.red, transform: "skewX(-14deg)" }} />
          <span style={{ font: `600 11.5px/1 ${MONO}`, letterSpacing: ".16em", color: "#A7B0BE" }}>
            KENYA'S UNIFIED AUTOMOTIVE SUPPLIER NETWORK
          </span>
        </div>
        <h1>Grow Your Automotive Business on Kenya's Verified Network</h1>
        <p className="ml-hero-lede">
          One verified platform for car hosts, truck transporters, drivers, garages, parts dealers, and car dealerships.
        </p>
        <div className="ml-cta-row">
          <Link className="ml-btn ml-btn-primary" to="/create-account">
            Join the Partner Network
            <ArrowRight size={18} weight="bold" />
          </Link>
          <WhatsAppButton
            className="ml-btn ml-btn-ghost"
            message="Hi CRAL - I want to explore automotive supplier partnership options"
            label="Chat with Onboarding Desk"
          />
        </div>
        <div className="ml-chips">
          <span className="ml-chip">
            <ShieldCheck size={16} weight="bold" color="#57D69E" />
            One-time KYC for all 6 verticals
          </span>
          <span className="ml-chip">
            <DeviceMobile size={16} weight="bold" />
            Direct M-Pesa & Bank settlements
          </span>
          <span className="ml-chip">
            <MapPin size={16} weight="bold" />
            Active across all 47 counties
          </span>
          <span className="ml-chip">
            <Handshake size={16} weight="bold" />
            Escrow-backed upfront payments
          </span>
        </div>
      </div>
    </section>
  );
}

function Stats(): JSX.Element {
  const stats = [
    { num: "KES 0", label: "listing fees across every supplier vertical" },
    { num: "6 Verticals", label: "cars, trucks, drivers, garages, parts, dealerships" },
    { num: "47 Counties", label: "nationwide customer and logistics reach" },
    { num: "24-48 Hours", label: "average KYC verification and onboarding speed" },
  ];
  return (
    <div className="ml-stats">
      <div className="ml-wrap ml-stats-grid">
        {stats.map((s) => (
          <div key={s.num} className="ml-stat">
            <div className="ml-stat-num">{s.num}</div>
            <div className="ml-stat-label">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SupplierTrackSelector({
  activeTrack,
  onSelectTrack,
}: {
  activeTrack: SupplierTrackId;
  onSelectTrack: (track: SupplierTrackId) => void;
}): JSX.Element {
  return (
    <section id="tracks" className="ml-section">
      <div className="ml-wrap">
        <div className="ml-head">
          <Kicker>SIX SPECIALISED SUPPLIER TRACKS</Kicker>
          <h2 className="ml-h2">Choose your partner vertical.</h2>
          <p className="ml-sub">
            Whether you manage passenger cars, commercial tippers, a team of drivers, an auto repair facility, a parts
            counter, or a vehicle showroom, CRAL powers your operations on one verified infrastructure.
          </p>
        </div>

        {/* 6 Interactive Track Tabs */}
        <div className="ml-track-selector-wrap" role="tablist" aria-label="Supplier partner vertical tracks">
          <div className="ml-tracks-grid">
            {TRACK_ORDER.map((id) => {
              const track = SUPPLIER_TRACKS[id];
              const IconComponent = track.icon;
              const isActive = activeTrack === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`spotlight-${id}`}
                  className={`ml-track-btn ${isActive ? "active" : ""}`}
                  onClick={() => onSelectTrack(id)}
                >
                  <div className="ml-track-icon-box">
                    <IconComponent size={24} weight={isActive ? "fill" : "regular"} />
                  </div>
                  <span className="ml-track-btn-title">{track.label}</span>
                  <span className="ml-track-btn-badge">{track.badge}</span>
                  {isActive && <div className="ml-track-active-bar" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic Track Spotlight */}
        {(() => {
          const track = SUPPLIER_TRACKS[activeTrack];
          return (
            <article id={`spotlight-${activeTrack}`} className="ml-spotlight">
              <div className="ml-spotlight-top">
                <div className="ml-spotlight-copy">
                  <Kicker>{track.heroKicker}</Kicker>
                  <h3>{track.tagline}</h3>
                  <p>{track.description}</p>
                </div>
                <div className="ml-spotlight-actions">
                  <Link className="ml-btn ml-btn-primary" to={`/create-account?vertical=${activeTrack}`}>
                    Register as {track.label}
                    <ArrowRight size={18} weight="bold" />
                  </Link>
                  <WhatsAppButton
                    className="ml-btn ml-btn-outline"
                    message={track.waMessage}
                    label="WhatsApp Desk"
                  />
                </div>
              </div>

              {/* 4 Pillar Benefit Cards */}
              <div className="ml-benefits-grid">
                {track.benefits.map((b) => {
                  const BIcon = b.icon;
                  return (
                    <div key={b.title} className="ml-benefit-card">
                      <div className="ml-benefit-icon">
                        <BIcon size={22} weight="regular" />
                      </div>
                      <h4>{b.title}</h4>
                      <p>{b.description}</p>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })()}
      </div>
    </section>
  );
}

function RevenueCalculator({ activeTrack }: { activeTrack: SupplierTrackId }): JSX.Element {
  const track = SUPPLIER_TRACKS[activeTrack];
  const { calculator } = track;

  const [rate, setRate] = useState<number>(calculator.defaultRate);
  const [count, setCount] = useState<number>(calculator.defaultCount);
  const [currentTrack, setCurrentTrack] = useState<SupplierTrackId>(activeTrack);

  // When parent switches activeTrack, sync default values
  if (currentTrack !== activeTrack) {
    setCurrentTrack(activeTrack);
    setRate(calculator.defaultRate);
    setCount(calculator.defaultCount);
  }

  const validRate = Number.isFinite(rate) && rate > 0 ? rate : 0;
  const validCount = Number.isFinite(count) && count > 0 ? count : 0;

  const { net } = useMemo(() => {
    const g = validRate * validCount;
    return { net: netFromGross(g) };
  }, [validRate, validCount]);

  function handlePreset(pRate: number, pCount: number) {
    setRate(pRate);
    setCount(pCount);
  }

  return (
    <section id="calculator" className="ml-section" style={{ paddingTop: 0 }}>
      <div className="ml-wrap">
        <div className="ml-calc-container">
          <div className="ml-calc-layout">
            <div className="ml-calc-left">
              <Kicker>REVENUE ESTIMATOR · {track.label.toUpperCase()}</Kicker>
              <h2 className="ml-h2">{calculator.title}</h2>
              <p className="ml-sub">{calculator.subtitle}</p>

              {/* Quick Preset Selector Chips */}
              <div style={{ marginTop: 20 }}>
                <span style={{ font: `600 11px/1 ${MONO}`, letterSpacing: ".08em", color: C.n500, textTransform: "uppercase" }}>
                  QUICK EXAMPLES & BENCHMARKS
                </span>
                <div className="ml-presets">
                  {calculator.presets.map((p) => {
                    const isSelected = rate === p.rate && count === p.count;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        className={`ml-preset-chip ${isSelected ? "active" : ""}`}
                        onClick={() => handlePreset(p.rate, p.count)}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <ul className="ml-check-points">
                <li>
                  <CheckCircle size={22} weight="fill" color={C.verified} style={{ flex: "none" }} />
                  <span><strong>Zero upfront fees:</strong> No listing charges and nothing deducted while assets sit idle.</span>
                </li>
                <li>
                  <CheckCircle size={22} weight="fill" color={C.verified} style={{ flex: "none" }} />
                  <span><strong>Escrow safety:</strong> Customer funds held safely in platform escrow prior to work or dispatch.</span>
                </li>
                <li>
                  <CheckCircle size={22} weight="fill" color={C.verified} style={{ flex: "none" }} />
                  <span><strong>Direct settlement:</strong> Transparent accounting with weekly M-Pesa or monthly bank remittances.</span>
                </li>
              </ul>

              <div>
                <Link className="ml-btn ml-btn-primary" to={`/create-account?vertical=${activeTrack}`}>
                  Start earning on {track.label}
                  <ArrowRight size={18} weight="bold" />
                </Link>
              </div>
            </div>

            {/* Interactive Calculator Input & Output Box */}
            <div className="ml-calc-box">
              <div className="ml-calc-box-head">
                <span className="ml-calc-badge">{track.badge}</span>
                <span style={{ font: `500 12px/1 ${MONO}`, color: "#A7B0BE" }}>KENYA SHILLINGS (KES)</span>
              </div>

              <div className="ml-calc-fields">
                <label>
                  <span className="ml-calc-label">{calculator.rateLabel} ({calculator.rateUnit})</span>
                  <input
                    className="ml-calc-input"
                    type="number"
                    min={calculator.minRate}
                    max={calculator.maxRate}
                    step={500}
                    value={rate}
                    onChange={(e) => setRate(Math.max(0, Number(e.target.value)))}
                  />
                </label>

                <label>
                  <span className="ml-calc-label" style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{calculator.countLabel}</span>
                    <span style={{ color: "#FFFFFF" }}>{count} {calculator.countUnit}</span>
                  </span>
                  <input
                    className="ml-calc-input"
                    type="number"
                    min={calculator.minCount}
                    max={calculator.maxCount}
                    value={count}
                    onChange={(e) => setCount(Math.max(1, Number(e.target.value)))}
                  />
                </label>
              </div>

              <div style={{ marginTop: 14 }}>
                <input
                  className="ml-calc-range"
                  type="range"
                  min={calculator.minCount}
                  max={calculator.maxCount}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
              </div>

              <div className="ml-calc-result">
                <div className="ml-calc-out-label">ESTIMATED NET TAKE-HOME A MONTH</div>
                <div className="ml-calc-big-num">{formatKes(net)}</div>
                <div className="ml-calc-explainer">
                  {calculator.outputDescription(rate, count, net)}
                </div>
                <p className="ml-calc-footnote">
                  {calculator.footnote} Terms and service rates are detailed in your merchant agreement upon onboarding.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StepsWalkthrough({ activeTrack }: { activeTrack: SupplierTrackId }): JSX.Element {
  const track = SUPPLIER_TRACKS[activeTrack];
  return (
    <section id="how" className="ml-section" style={{ paddingTop: 0 }}>
      <div className="ml-wrap">
        <div className="ml-head">
          <Kicker>STEP-BY-STEP ONBOARDING · {track.label.toUpperCase()}</Kicker>
          <h2 className="ml-h2">From registration to verified payouts in three steps.</h2>
          <p className="ml-sub">
            Our streamlined digital compliance workflow gets you active on Kenya's verified network in 24 to 48 hours.
          </p>
        </div>

        <div className="ml-steps-grid">
          {track.steps.map((s) => {
            const StepIcon = s.icon;
            return (
              <article key={s.n} className="ml-step-card">
                <div className="ml-step-top">
                  <span className="ml-step-badge">STEP {s.n}</span>
                  <div className="ml-step-icon">
                    <StepIcon size={22} weight="regular" />
                  </div>
                </div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function UnifiedAccountSection(): JSX.Element {
  return (
    <section id="one-account" className="ml-wrap">
      <div className="ml-unified">
        <div className="ml-unified-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span style={{ display: "block", width: 26, height: 4, background: C.red, transform: "skewX(-14deg)" }} />
            <span style={{ font: `600 11.5px/1 ${MONO}`, letterSpacing: ".16em", color: "#A7B0BE" }}>
              CRAL UNIFIED ARCHITECTURE
            </span>
          </div>
          <h2>One Account, All Verticals. Complete KYC Once.</h2>
          <p>
            You never have to register multiple times or repeat compliance paperwork. A single verified CRAL merchant
            identity grants you instant access across all six automotive verticals.
          </p>
        </div>

        <div className="ml-unified-pillars">
          <div className="ml-unified-card">
            <div className="ml-unified-icon">
              <IdentificationCard size={26} weight="regular" />
            </div>
            <h3>Universal Compliance Passport</h3>
            <p>
              Submit your National ID, KRA PIN, and (for incorporated entities) Certificate of Incorporation and CR12
              once. Our compliance team clears your master account for passenger cars, heavy haulage, workshop repairs,
              and parts sales.
            </p>
          </div>

          <div className="ml-unified-card">
            <div className="ml-unified-icon">
              <Handshake size={26} weight="regular" />
            </div>
            <h3>Cross-Vertical Synergies</h3>
            <p>
              Unlock powerful internal synergies: hire vetted drivers from the driver roster, schedule fleet maintenance
              at accredited partner garages with pre-negotiated labor rates, and source genuine VIN-matched spare parts
              with priority dispatch.
            </p>
          </div>

          <div className="ml-unified-card">
            <div className="ml-unified-icon">
              <Wallet size={26} weight="regular" />
            </div>
            <h3>Consolidated Multi-Stream Ledger</h3>
            <p>
              Track your rental earnings, commercial freight dispatches, driver billings, repair job invoices, and spare
              parts sales in one clean financial dashboard. Receive unified weekly M-Pesa disbursements or monthly bank
              transfers.
            </p>
          </div>
        </div>

        <div className="ml-synergies">
          <div className="ml-synergies-title">
            <CheckCircle size={16} weight="fill" color="#57D69E" />
            <span>HOW CRAL SUPPLIERS COLLABORATE ACROSS VERTICALS</span>
          </div>
          <div className="ml-synergies-grid">
            {CROSS_VERTICAL_SYNERGIES.map((syn) => {
              const SIcon = syn.icon;
              return (
                <div key={syn.title} className="ml-synergy-item">
                  <h4>
                    <SIcon size={18} weight="bold" color={C.blue200} />
                    {syn.title}
                  </h4>
                  <p>{syn.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function DocumentsSection({ activeTrack }: { activeTrack: SupplierTrackId }): JSX.Element {
  const track = SUPPLIER_TRACKS[activeTrack];
  return (
    <section id="documents" className="ml-section">
      <div className="ml-wrap ml-docs-layout">
        <div>
          <Kicker>DOCUMENT CHECKLIST · {track.label.toUpperCase()}</Kicker>
          <h2 className="ml-h2">{track.documents.title}</h2>
          <p className="ml-sub" style={{ marginBottom: 22 }}>
            {track.documents.subtitle} Upload high-resolution photos or scans from your phone. Our compliance desk checks
            submissions promptly to activate your account.
          </p>
          <WhatsAppButton
            className="ml-btn ml-btn-primary"
            message={`Hi CRAL - I have a question regarding documents required for ${track.label}`}
            label="Ask Compliance on WhatsApp"
          />
        </div>

        <div className="ml-doc-card">
          <ul className="ml-doc-list">
            {track.documents.items.map((item) => (
              <li key={item}>
                <span className="ml-doc-icon">
                  <FileText size={18} weight="regular" />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="ml-doc-extra">
            <strong>Corporate Entities & Fleets:</strong> {track.documents.companyExtra}
          </div>
        </div>
      </div>
    </section>
  );
}

function WhyChooseCral(): JSX.Element {
  const pillars = [
    {
      icon: Prohibit,
      title: "No Upfront or Listing Fees",
      body: "CRAL only earns when you do. No monthly software fees, no listing charges, and zero penalties when your asset is not deployed.",
    },
    {
      icon: ShieldCheck,
      title: "Escrow-Backed Payment Security",
      body: "Every booking, freight run, repair quote, and parts sale is backed by customer funds committed to platform escrow before work starts.",
    },
    {
      icon: Scales,
      title: "Local Dispute Arbitration",
      body: "Fair, prompt resolution for vehicle damage claims, cargo detention, or repair scope disputes with verified time-stamped digital trails.",
    },
    {
      icon: Wallet,
      title: "Automated M-Pesa & Bank Payouts",
      body: "Weekly Monday M-Pesa runs or monthly 1st bank transfers with automated transaction receipts and downloadable tax statements.",
    },
  ];

  return (
    <section className="ml-section ml-why">
      <div className="ml-wrap">
        <div className="ml-head">
          <Kicker>WHY MERCHANTS PARTNER WITH CRAL</Kicker>
          <h2 className="ml-h2">Engineered for Kenya's automotive commerce.</h2>
          <p className="ml-sub">
            Built from the ground up to solve payment defaults, broker extortion, and trust deficits in the local automotive market.
          </p>
        </div>
        <div className="ml-why-grid">
          {pillars.map((w) => {
            const WhyIcon = w.icon;
            return (
              <div key={w.title}>
                <div className="ml-why-icon">
                  <WhyIcon size={24} weight="regular" />
                </div>
                <h3>{w.title}</h3>
                <p>{w.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Faq(): JSX.Element {
  return (
    <section id="faq" className="ml-section">
      <div className="ml-wrap" style={{ maxWidth: 880 }}>
        <div className="ml-head">
          <Kicker>FREQUENTLY ASKED QUESTIONS</Kicker>
          <h2 className="ml-h2">Everything suppliers ask about CRAL.</h2>
          <p className="ml-sub">
            Have questions about listing cars, dispatching trucks, registering as a driver, or accrediting your garage or parts store?
          </p>
        </div>
        <div className="ml-faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>
                {f.q}
                <CaretDown className="ml-faq-caret" size={18} weight="bold" />
              </summary>
              <p className="ml-faq-a">{f.a}</p>
            </details>
          ))}
        </div>
        <div className="ml-help">
          <div className="ml-help-text">
            <Headset size={28} weight="regular" />
            <span>Have a specific partnership query? Our merchant support team is available on WhatsApp.</span>
          </div>
          <WhatsAppButton
            className="ml-btn ml-btn-primary ml-btn-sm"
            message="Hi CRAL - I have a specific question about supplier onboarding"
            label="Chat with Us"
          />
        </div>
      </div>
    </section>
  );
}

function FinalCta({ activeTrack }: { activeTrack: SupplierTrackId }): JSX.Element {
  const track = SUPPLIER_TRACKS[activeTrack];
  return (
    <section className="ml-final">
      <img className="ml-final-img" src={IMG("cta")} alt="" loading="lazy" />
      <div className="ml-final-shade" />
      <div className="ml-wrap ml-final-inner">
        <h2>Ready to scale your automotive business in Kenya?</h2>
        <p>
          Join hundreds of verified car owners, haulage operators, drivers, garages, parts dealers, and showrooms on
          Kenya's trusted multi-sided network.
        </p>
        <div className="ml-cta-row">
          <Link className="ml-btn ml-btn-white" to={`/create-account?vertical=${activeTrack}`}>
            Create Merchant Account
            <ArrowRight size={18} weight="bold" />
          </Link>
          <WhatsAppButton
            className="ml-btn ml-btn-ghost"
            message={track.waMessage}
            label="Onboard on WhatsApp"
          />
        </div>
      </div>
    </section>
  );
}

function Footer(): JSX.Element {
  return (
    <footer className="ml-footer">
      <div className="ml-wrap">
        <div className="ml-footer-grid">
          <div>
            <img
              src="/logo-white.png"
              alt="Cruz Ride Auto Limited"
              style={{ display: "block", height: 46, width: "auto", marginBottom: 16 }}
            />
            <p style={{ margin: 0, maxWidth: 320, font: `400 14px/1.6 ${SANS}`, color: "#A7B0BE" }}>
              The unified multi-supplier merchant portal of CRAL: connecting car hosts, truck operators, drivers,
              garages, parts dealers, and car dealerships across Kenya.
            </p>
          </div>
          <div>
            <h4>SUPPLIER TRACKS</h4>
            <ul>
              <li><a href="#tracks">Car & Fleet Owners</a></li>
              <li><a href="#tracks">Truck & Haulage</a></li>
              <li><a href="#tracks">Professional Drivers</a></li>
              <li><a href="#tracks">Garages & Workshops</a></li>
              <li><a href="#tracks">Spare Parts Dealers</a></li>
              <li><a href="#tracks">Car Dealerships</a></li>
            </ul>
          </div>
          <div>
            <h4>PORTAL & PLATFORM</h4>
            <ul>
              <li><Link to="/create-account">Create an Account</Link></li>
              <li><Link to="/sign-in">Merchant Sign In</Link></li>
              <li><a href="#calculator">Revenue Calculator</a></li>
              <li><a href="#one-account">Unified KYC Passport</a></li>
              <li><a href="#how">How It Works</a></li>
              <li><a href="#faq">Partner FAQ</a></li>
            </ul>
          </div>
          <div>
            <h4>MERCHANT DESK</h4>
            <ul>
              <li>
                <a href={whatsappLink()} target="_blank" rel="noreferrer">
                  <WhatsappLogo size={16} weight="fill" /> WhatsApp: {SUPPORT_PHONE_DISPLAY}
                </a>
              </li>
              <li>
                <a href={`tel:${SUPPORT_PHONE_E164}`}>Call: {SUPPORT_PHONE_DISPLAY}</a>
              </li>
              <li>
                <span style={{ color: "#78869B", font: `400 13px/1.5 ${SANS}` }}>Hours: Mon–Sat 8:00am–6:00pm EAT</span>
              </li>
            </ul>
          </div>
        </div>
        <div className="ml-footer-base">
          <span>© 2026 CRAL · CRUZ RIDE AUTO LIMITED · NAIROBI, KENYA</span>
          <span>ALL RIGHTS RESERVED · ONE VERIFIED AUTOMOTIVE NETWORK</span>
        </div>
      </div>
    </footer>
  );
}

export function Landing(): JSX.Element {
  usePageTitle("Automotive Partner Gateway");
  const [activeTrack, setActiveTrack] = useState<SupplierTrackId>("cars");
  const tracksRef = useRef<HTMLDivElement>(null);

  function handleSelectTrack(trackId: SupplierTrackId) {
    setActiveTrack(trackId);
  }

  const activeTrackData = SUPPLIER_TRACKS[activeTrack];

  return (
    <div className="ml-root">
      <style>{CSS}</style>
      <Header />
      <main>
        <Hero />
        <Stats />
        <div ref={tracksRef}>
          <SupplierTrackSelector activeTrack={activeTrack} onSelectTrack={handleSelectTrack} />
        </div>
        <RevenueCalculator activeTrack={activeTrack} />
        <UnifiedAccountSection />
        <StepsWalkthrough activeTrack={activeTrack} />
        <DocumentsSection activeTrack={activeTrack} />
        <WhyChooseCral />
        <Faq />
        <FinalCta activeTrack={activeTrack} />
      </main>
      <Footer />
      <a
        className="ml-fab"
        href={whatsappLink(activeTrackData.waMessage)}
        target="_blank"
        rel="noreferrer"
        aria-label={`Chat with CRAL on WhatsApp regarding ${activeTrackData.label}`}
      >
        <WhatsappLogo size={28} weight="fill" />
        <span className="ml-fab-label">Chat with Us</span>
      </a>
    </div>
  );
}
