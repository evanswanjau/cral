import { describe, expect, it } from "vitest";
import { normalizePhone } from "../identifier.js";

describe("normalizePhone", () => {
  it("accepts every common way a Kenyan mobile is typed", () => {
    const forms = [
      "+254712345678",
      "254712345678",
      "0712345678",
      "712345678", // no leading 0 — natural in a field that shows "+254"
      "0712 345 678",
      "+254 712 345 678",
      "(0712) 345-678",
      "0112345678", // Airtel 01x range
      "112345678",
    ];
    for (const form of forms) {
      expect(normalizePhone(form)).toMatch(/^\+254[17]\d{8}$/);
    }
    expect(normalizePhone("712345678")).toBe("+254712345678");
    expect(normalizePhone("0712345678")).toBe("+254712345678");
  });

  it("rejects things that aren't a Kenyan mobile", () => {
    for (const bad of ["", "12345", "0812345678", "0700123", "notaphone", "+1 202 555 0100"]) {
      expect(normalizePhone(bad)).toBeNull();
    }
  });
});
