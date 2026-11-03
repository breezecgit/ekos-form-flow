import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { writtenStatementForm } from "./written-statement";

const WORDING_FIX = ".lovable/park-services-wording-fix-2026-11-03.sql";
const SEED = "drizzle/migrations/0017_park_services_and_charges.sql";

const fields = (writtenStatementForm as any).steps.flatMap((s: any) => s.fields);

describe("Written Statement park services", () => {
  it("services and charges fill from park settings, not a fixed default", () => {
    for (const k of ["services_included", "additional_charges"]) {
      const f = fields.find((x: any) => x.key === k);
      expect(f.parkField).toBe(k);
      expect(f.defaultValue).toBeUndefined();
    }
  });

  it("Harvey's Nurseries wording fix reads 'Sewerage and Water'", () => {
    const sql = readFileSync(WORDING_FIX, "utf8");
    expect(sql).toMatch(/services_included\s*=\s*'Sewerage and Water'[^;]*Harvey''s Nurseries/);
    // Only the one park is touched, and the comma version is not reintroduced.
    expect(sql.match(/^UPDATE/gm)).toHaveLength(1);
    expect(sql).not.toMatch(/SET[^;]*'Sewerage, Water'/);
  });

  it("the wording fix does not disturb the parks the spreadsheet already had right", () => {
    const fix = readFileSync(WORDING_FIX, "utf8");
    const seed = readFileSync(SEED, "utf8");
    for (const park of ["Haveringland Hall", "Merry Hill", "Walworth Retreat"]) {
      expect(fix).not.toMatch(new RegExp(`WHERE[^;]*${park}`));
      expect(seed).toMatch(new RegExp(`services_included='Sewerage, Water'[^;]*${park}`));
    }
    for (const park of ["Castle View", "Outhill View", "Carlton Manor", "Coastal Retreat", "Sun Valley"]) {
      expect(seed).toMatch(new RegExp(`services_included='Sewerage'[^;]*${park}`));
    }
    expect(seed).toMatch(/name='Dales View'/);
  });
});
