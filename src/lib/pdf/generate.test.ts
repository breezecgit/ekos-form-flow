import { describe, expect, it } from "vitest";
import { omitPdfField } from "./generate.server";

for (const completed of [false, true]) {
  describe(completed ? "completed PDFs" : "review PDFs", () => {
    it("omits the Status Guide", () => {
      expect(omitPdfField("status_guide", completed)).toBe(true);
    });
    it("omits the Status field without omitting captured signatures", () => {
      expect(omitPdfField("status", completed)).toBe(true);
      expect(omitPdfField("customer_one_signature", completed)).toBe(false);
      expect(omitPdfField("sales_person_signature", completed)).toBe(false);
    });
  });
}

it("only omits the other approval notes in completed copies", () => {
  expect(omitPdfField("authorised_signatory_note", false)).toBe(false);
  expect(omitPdfField("authorised_signatory_note", true)).toBe(true);
  expect(omitPdfField("construction_note", false)).toBe(false);
  expect(omitPdfField("construction_note", true)).toBe(true);
});