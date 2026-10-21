import { describe, expect, it } from "vitest";
import { draftPdfFileName } from "@/lib/format";

describe("draft PDF file name", () => {
  it("follows DRAFT - Form - Customer - date and strips en dashes", () => {
    expect(draftPdfFileName("New Home Order Form", "Jane Smith – Jones", "2026-10-21"))
      .toBe("DRAFT - New Home Order Form - Jane Smith - Jones - 2026-10-21.pdf");
  });
  it("removes unsafe characters", () => {
    expect(draftPdfFileName("Unit Sale Agreement & Welcome Pack", "A/B:C*?", "2026-10-21"))
      .toBe("DRAFT - Unit Sale Agreement and Welcome Pack - ABC - 2026-10-21.pdf");
  });
});
