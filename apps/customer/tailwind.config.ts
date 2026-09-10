import type { Config } from "tailwindcss";

// Real values from the CRAL Design System v2 brand doc - see
// packages/ui/src/tokens.ts, which is the canonical copy of these. Kept in
// step with apps/merchant/tailwind.config.ts and apps/admin's equivalent.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B0F1A",
        "cruz-blue": {
          DEFAULT: "#0F23A8",
          50: "#EDEFFC",
          100: "#DCE1FA",
          200: "#B6C0F4",
          400: "#5B6FE0",
          600: "#0F23A8",
          700: "#0B1B85",
          900: "#060F5E",
        },
        "cruz-red": "#D81E32",
        boost: "#B5179F",
        paper: "#FBF8F2",
        neutral: {
          canvas: "#FAFBFC",
          50: "#F8F9FB",
          100: "#F1F3F6",
          200: "#E4E7EC",
          300: "#CDD2DA",
          400: "#A7AEBB",
          500: "#838C9B",
          600: "#5A6373",
          700: "#333B4A",
          900: "#0B0F1A",
        },
        status: {
          "pending-core": "#C77400",
          "pending-tint": "#FFF3DB",
          "pending-border": "#F5D9A3",
          "pending-text": "#8A5200",
          "review-core": "#0B7BC1",
          "review-tint": "#E1F1FA",
          "review-border": "#A9D6EE",
          "review-text": "#075D93",
          "verified-core": "#0B8A5B",
          "verified-tint": "#DDF3E9",
          "verified-border": "#A8DEC7",
          "verified-text": "#076945",
          "rejected-core": "#D81E32",
          "rejected-tint": "#FDE7EA",
          "rejected-border": "#F7BDC5",
          "rejected-text": "#A50E22",
        },
      },
      fontFamily: {
        display: ['"Archivo"', "sans-serif"],
        sans: ['"Instrument Sans"', "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ['"IBM Plex Mono"', '"SFMono-Regular"', "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
