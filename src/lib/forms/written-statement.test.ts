import { describe, expect, it } from "vitest";
import { allFields, isRequired, isVisible } from "./types";
import { writtenStatementForm } from "./written-statement";
import { getForm, FORM_ORDER } from "./registry";
import { validateFields } from "./validate";
import { validateSigningWrite } from "./write-validation";
import { statementSignatures } from "./written-statement.test-fixture";

const fields = allFields(writtenStatementForm);
const customerFields = fields.filter((f) => f.group === "customerSignature");
const hidden = ["customer_name", "customer_email", "customer_phone", "park_name_confirm", "sales_person", "rep_name", "rep_signature", "rep_sign_date", "second_occupier"];

describe("Written Statement witnesses and export-only omissions", () => {
  it.each(["rep", "offsite"] as const)("requires each visible witness detail in %s mode", (mode) => {
    const ctx = { mode, isDirector: false };
    const values = statementSignatures();
    expect(validateFields(customerFields, values, ctx)).toEqual({});
    for (const who of ["one", "two"]) {
      for (const part of ["signature", "name", "address", "date"]) {
        const key = `occupier_${who}_witness_${part}`;
        const field = fields.find((f) => f.key === key);
        expect(field).toBeDefined();
        if (!field) throw new Error("Missing witness field");
        expect(isVisible(field, values, ctx)).toBe(true);
        expect(isRequired(field)).toBe(true);
        expect(field.group).toBe("customerSignature");
        expect(validateFields(customerFields, { ...values, [key]: "" }, ctx)).toHaveProperty(key);
      }
    }
  });
  it("accepts both offsite witnesses and refuses a missing witness", () => {
    const ctx = { mode: "offsite" as const, isDirector: false };
    const values = statementSignatures();
    const patch = Object.fromEntries(customerFields.map((f) => [f.key, values[f.key]]));
    expect(validateSigningWrite(writtenStatementForm, patch, {}, ctx, "customerSignature", "EKOS-TEST")).toEqual(patch);
    for (const key of ["occupier_one_witness_signature", "occupier_two_witness_signature", "occupier_two_witness_address"]) {
      expect(() => validateSigningWrite(writtenStatementForm, { ...patch, [key]: "" }, {}, ctx, "customerSignature", "EKOS-TEST")).toThrow("required signing");
    }
  });
  it.each(["rep", "offsite"] as const)("does not require Occupier Two's witness without a second occupier in %s mode", (mode) => {
    const values = statementSignatures(false);
    const ctx = { mode, isDirector: false };
    expect(validateFields(customerFields, values, ctx)).toEqual({});
    expect(fields.filter((f) => f.key.startsWith("occupier_two_witness_")).every((f) => !isVisible(f, values, ctx))).toBe(true);
  });
  it("places each witness directly after their occupier's date", () => {
    const keys = fields.map((f) => f.key);
    for (const who of ["one", "two"]) expect(keys.slice(keys.indexOf(`occupier_${who}_date`) + 1, keys.indexOf(`occupier_${who}_date`) + 5))
      .toEqual(["signature", "name", "address", "date"].map((part) => `occupier_${who}_witness_${part}`));
  });
  it("hides only specified step-4 metadata in exports, keeping web fields and signature blocks", () => {
    for (const key of hidden) expect(fields.find((f) => f.key === key)?.pdfHide).toBe(true);
    expect(fields.find((f) => f.key === "party_customer_name")?.pdfHide).not.toBe(true);
    for (const f of fields.filter((f) => f.type === "signature" && f.group !== undefined)) expect(f.pdfHide).not.toBe(true);
    expect(fields.find((f) => f.key === "customer_email")?.type).toBe("email");
  });
  it.each(FORM_ORDER.filter((type) => type !== "written_statement"))("does not opt %s into the new layout or witnesses", (type) => {
    const def = getForm(type);
    expect(def.pdfLayout).not.toBe("ordered-signatures");
    expect(allFields(def).some((f) => f.key.startsWith("occupier_one_witness"))).toBe(false);
    for (const f of allFields(def).filter((f) => ["customer_name", "customer_email", "sales_person", "rep_signature"].includes(f.key))) expect(f.pdfHide).not.toBe(true);
  });
});