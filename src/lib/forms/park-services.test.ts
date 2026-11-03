import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { writtenStatementForm } from "./written-statement";

const fields = (writtenStatementForm as any).steps.flatMap((s: any) => s.fields);
describe("Written Statement park services", () => {
  it("services and charges fill from park settings, not a fixed default", () => {
    for (const k of ["services_included", "additional_charges"]) {
      const f = fields.find((x: any) => x.key === k);
      expect(f.parkField).toBe(k);
      expect(f.defaultValue).toBeUndefined();
    }
  });
  it("Harvey's Nurseries includes Sewerage and Water", () => {
    const sql = readFileSync("drizzle/migrations/0017_park_services_and_charges.sql", "utf8");
    expect(sql).toMatch(/services_included='Sewerage and Water'[^;]*Harvey''s Nurseries/);
    expect(sql).not.toMatch(/services_included='Sewerage, Water'[^;]*Harvey''s Nurseries/);
  });
  it("the other three water-included parks keep the spreadsheet wording", () => {
    const sql = readFileSync("drizzle/migrations/0017_park_services_and_charges.sql", "utf8");
    for (const park of ["Haveringland Hall", "Merry Hill", "Walworth Retreat"]) {
      expect(sql).toMatch(new RegExp(`services_included='Sewerage, Water'[^;]*${park}`));
    }
  });
});
