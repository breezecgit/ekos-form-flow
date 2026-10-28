import { describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFPage } from "pdf-lib";
import { withoutRetiredAnswers } from "./retired-answers";
import { writtenStatementForm } from "./written-statement";
import { getForm, FORM_ORDER } from "./registry";
import { allFields } from "./types";
import { validateFormWrite, validateSigningWrite } from "./write-validation";
import { generateFormPdf } from "../pdf/generate.server";

const legacy = { customer_name: "Written Statement Test", status: "In Review", accept_terms: true, accept_extras: true };
const acceptanceKeys = ["accept_terms", "accept_extras"];

describe("Written Statement-only acceptance retirement", () => {
  it("has no acceptance fields in any step, including offsite signing", () => {
    expect(allFields(writtenStatementForm).filter((f) => acceptanceKeys.includes(f.key))).toEqual([]);
    expect(allFields(writtenStatementForm).some((f) => f.key === "occupier_one_signature" && f.group === "customerSignature")).toBe(true);
  });
  it("Reservation still contains both acceptance boxes", () => {
    expect(allFields(getForm("reservation")).filter((f) => acceptanceKeys.includes(f.key)).map((f) => f.key).sort())
      .toEqual([...acceptanceKeys].sort());
  });
  it.each(FORM_ORDER.filter((type) => type !== "written_statement"))("leaves %s answers unchanged", (type) => {
    expect(withoutRetiredAnswers(type, legacy)).toBe(legacy);
  });
  it("strips both legacy keys without mutating saved answers or signatures", () => {
    const values = { ...legacy, party_customer_name: "Removed Party Test", occupier_one_signature: "saved-signature" };
    expect(withoutRetiredAnswers("written_statement", values)).toEqual({ customer_name: legacy.customer_name, status: "In Review", occupier_one_signature: "saved-signature" });
    expect(values.accept_terms).toBe(true);
    expect(values.accept_extras).toBe(true);
  });
  it("accepts legacy draft payloads but still rejects unrelated unexpected fields", () => {
    expect(() => validateFormWrite(writtenStatementForm, legacy, { mode: "rep", isDirector: false }, "draft", legacy)).not.toThrow();
    expect(() => validateFormWrite(writtenStatementForm, { ...legacy, unexpected_key: true }, { mode: "rep", isDirector: false }, "draft", legacy)).toThrow("Unexpected");
  });
  it("ignores legacy ticks at the public signing boundary without granting other write access", () => {
    const ctx = { mode: "offsite" as const, isDirector: false };
    const signing = { accept_terms: true, accept_extras: true, occupier_one_name: "Test Occupier",
      occupier_one_signature: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=",
      occupier_one_date: "2026-10-28", second_occupier: "No",
      occupier_one_witness_signature: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=",
      occupier_one_witness_name: "Test Witness", occupier_one_witness_address: "Test Address", occupier_one_witness_date: "2026-10-28" };
    const { accept_terms: _terms, accept_extras: _extras, ...expected } = signing;
    expect(validateSigningWrite(writtenStatementForm, signing, legacy, ctx, "customerSignature", "EKOS-TEST"))
      .toEqual(expected);
    expect(() => validateSigningWrite(writtenStatementForm, { new_home_address: "changed" }, legacy, ctx, "customerSignature", "EKOS-TEST")).toThrow("Only the signing");
  });
  it("generates a real PDF from legacy answers with signatures but no acceptance boxes", async () => {
    const drawn = vi.spyOn(PDFPage.prototype, "drawText");
    try {
      const bytes = await generateFormPdf({ def: writtenStatementForm, values: legacy, ctx: { mode: "director", isDirector: true },
        orderNumber: "EKOS-TEST", park: "Test Park", customerName: legacy.customer_name, parkLinks: {} });
      expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
      const printed = drawn.mock.calls.map(([text]) => text).join("\n");
      const removedFields = allFields(getForm("reservation")).filter((f) => acceptanceKeys.includes(f.key));
      expect(removedFields).toHaveLength(2);
      for (const f of removedFields) {
        expect(printed).not.toContain(f.label);
        expect(printed).not.toContain(f.key);
      }
      expect(printed).toContain("Signatures");
      expect(printed).toContain("Signed (Occupier)");
    } finally { drawn.mockRestore(); }
  });
});