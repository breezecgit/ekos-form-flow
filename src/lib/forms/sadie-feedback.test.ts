import { describe, expect, it } from "vitest";
import { FORM_ORDER, getForm } from "./registry";
import { validateFields } from "./validate";
import { formatDate, shortDate } from "../format";
import { staffEmailLink } from "../email-links";

const ctx = { mode: "rep" as const, isDirector: false };

for (const type of FORM_ORDER) {
  const fields = getForm(type).steps.flatMap((step) => step.fields);
  const handover = fields.find((field) => field.key === "handover_date");
  const notes = fields.find((field) => field.key === "notes");
  describe(type, () => {
    if (handover) {
      it("accepts TBC as a required handover answer", () => {
        expect(handover.allowTbc).toBe(true);
        expect(validateFields([handover], { handover_date: "TBC" }, ctx)).toEqual({});
        expect(validateFields([handover], { handover_date: "" }, ctx)).toHaveProperty("handover_date");
      });
    }
    if (notes) {
      it("allows empty Notes", () => {
        expect(notes.required).toBe(false);
        expect(validateFields([notes], { notes: "" }, ctx)).toEqual({});
      });
    }
    it("keeps the exact saved form destination through login", () => {
      const path = `/forms/${type}/12345678-1234-1234-1234-123456789abc`;
      const url = new URL(staffEmailLink("https://forms.ekosgroup.co.uk/", path));
      expect(url.origin).toBe("https://forms.ekosgroup.co.uk");
      expect(url.pathname).toBe("/auth");
      expect(url.searchParams.get("redirect")).toBe(path);
    });
  });
}

it("preserves TBC in PDF/email and short tracker date formatting", () => {
  expect(formatDate("TBC")).toBe("TBC");
  expect(shortDate("TBC")).toBe("TBC");
  expect(formatDate("2026-10-18")).toBe("18/10/2026");
});

it("keeps the exact review destination through login", () => {
  const url = new URL(staffEmailLink("https://forms.ekosgroup.co.uk", "/admin/submissions/test-id"));
  expect(url.searchParams.get("redirect")).toBe("/admin/submissions/test-id");
});