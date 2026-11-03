import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { writtenStatementForm } from "./written-statement";

const WORDING_FIX = ".lovable/park-services-wording-fix-2026-11-03.sql";
const SEED = "drizzle/migrations/0017_park_services_and_charges.sql";

const fields = (writtenStatementForm as any).steps.flatMap((s: any) => s.fields);

const COMMA_PARKS = ["Harvey''s Nurseries", "Haveringland Hall", "Merry Hill", "Walworth Retreat"];
const SEWERAGE_ONLY = ["Castle View", "Outhill View", "Carlton Manor", "Coastal Retreat", "Sun Valley"];

describe("Written Statement park services", () => {
  it("services and charges fill from park settings, not a fixed default", () => {
    for (const k of ["services_included", "additional_charges"]) {
      const f = fields.find((x: any) => x.key === k);
      expect(f.parkField).toBe(k);
      expect(f.defaultValue).toBeUndefined();
    }
  });

  it("all four parks that had the comma wording now read 'Sewerage and Water'", () => {
    const sql = readFileSync(WORDING_FIX, "utf8");
    for (const park of COMMA_PARKS) {
      expect(sql).toMatch(new RegExp(`SET services_included = 'Sewerage and Water'[\\s\\S]*?${park}`));
    }
    // The comma version is never (re)introduced by a data fix.
    expect(sql).not.toMatch(/SET\s+services_included\s*=\s*'Sewerage, Water'/);
  });

  it("the fixes touch only services_included, and only for those four parks", () => {
    const sql = readFileSync(WORDING_FIX, "utf8");
    expect(sql.match(/^UPDATE/gm)).toHaveLength(2);
    expect(sql).not.toMatch(/SET[^;]*additional_charges/);
    for (const park of [...SEWERAGE_ONLY, "Dales View"]) {
      expect(sql).not.toMatch(new RegExp(`WHERE[^;]*${park}`));
    }
  });

  it("the parks the spreadsheet already had right are untouched", () => {
    const seed = readFileSync(SEED, "utf8");
    for (const park of SEWERAGE_ONLY) {
      expect(seed).toMatch(new RegExp(`services_included='Sewerage'[^;]*${park}`));
    }
    expect(seed).toMatch(/name='Dales View'/);
  });

  it("migration 0017 is left as the untouched record of what originally ran", () => {
    const seed = readFileSync(SEED, "utf8");
    expect(seed).toMatch(/services_included='Sewerage, Water'[^;]*Haveringland Hall/);
    expect(seed).toMatch(/services_included='Sewerage, Water'[^;]*Harvey''s Nurseries/);
  });
});
