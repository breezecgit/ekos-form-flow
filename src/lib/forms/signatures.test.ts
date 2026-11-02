import { describe, expect, it } from "vitest";
import { getForm } from "./registry";
import { amendmentSignatures, amendmentSigningRoute, clearAllSignatures, clearCustomerSignatures, deletionWarnings, firstCustomerSignature } from "./signatures";

const SIG = "data:image/png;base64,AAAA";
const NEW = "data:image/png;base64,BBBB";

describe("disapproval clears every signature", () => {
  it("Reservation: customer and rep signatures and dates cleared, names and answers kept", () => {
    const def = getForm("reservation");
    const out = clearAllSignatures(def, {
      customer_one_signature: SIG, customer_one_date: "2026-11-01", customer_one_name: "Ann Test",
      rep_signature: SIG, rep_sign_date: "2026-11-01", rep_name: "Ben", customer_name: "Ann Test",
    });
    expect(out["customer_one_signature"]).toBe("");
    expect(out["customer_one_date"]).toBe("");
    expect(out["rep_signature"]).toBe("");
    expect(out["rep_sign_date"]).toBe("");
    expect(out["customer_one_name"]).toBe("Ann Test");
    expect(out["customer_name"]).toBe("Ann Test");
  });
  it("Written Statement: witness and Director signatures cleared too", () => {
    const def = getForm("written_statement");
    const out = clearAllSignatures(def, { occupier_one_witness_signature: SIG, occupier_one_witness_date: "2026-11-01", director_signature: SIG, occupier_one_signature: SIG });
    expect(out["occupier_one_witness_signature"]).toBe("");
    expect(out["occupier_one_witness_date"]).toBe("");
    expect(out["director_signature"]).toBe("");
    expect(out["occupier_one_signature"]).toBe("");
  });
  it("every form has its signatures cleared", () => {
    for (const t of ["reservation", "identification", "new_home_order", "unit_sale_agreement", "written_statement"]) {
      const def = getForm(t);
      const sigKeys = def.steps.flatMap((s) => s.fields).filter((f) => f.type === "signature").map((f) => f.key);
      const out = clearAllSignatures(def, Object.fromEntries(sigKeys.map((k) => [k, SIG])));
      for (const k of sigKeys) expect(out[k]).toBe("");
    }
  });
});

describe("amendment signing route", () => {
  it("Customer Signing Live signs on the device; Offsite emails; Identification never asks the customer", () => {
    expect(amendmentSigningRoute("unit_sale_agreement", { status: "In Review" })).toBe("live");
    expect(amendmentSigningRoute("unit_sale_agreement", { status: "In Review (Offsite)" })).toBe("offsite");
    expect(amendmentSigningRoute("identification", { status: "In Review" })).toBe("none");
  });
  it("live: a fresh customer signature is required and kept; rep signature stays original", () => {
    const def = getForm("unit_sale_agreement");
    const before = { status: "In Review", customer_one_signature: SIG, rep_signature: SIG };
    expect(() => amendmentSignatures(def, before, { ...before }, "live")).toThrow(/signed again/);
    expect(() => amendmentSignatures(def, before, clearCustomerSignatures(def, before), "live")).toThrow(/sign/);
    const out = amendmentSignatures(def, before, { ...before, customer_one_signature: NEW, rep_signature: "" }, "live");
    expect(out["customer_one_signature"]).toBe(NEW);
    expect(out["rep_signature"]).toBe(SIG);
    expect(firstCustomerSignature(def, out)?.signature).toBe(NEW);
  });
  it("offsite: original signatures are kept on the form", () => {
    const def = getForm("unit_sale_agreement");
    const before = { status: "In Review", customer_one_signature: SIG, customer_one_date: "2026-10-01" };
    const edited = { ...clearCustomerSignatures(def, before), status: "In Review (Offsite)" };
    const out = amendmentSignatures(def, before, edited, "offsite");
    expect(out["customer_one_signature"]).toBe(SIG);
    expect(out["customer_one_date"]).toBe("2026-10-01");
    expect(out["status"]).toBe("In Review");
  });
});

describe("deleting some forms", () => {
  it("warns when a later form is kept", () => {
    expect(deletionWarnings(["reservation", "new_home_order", "unit_sale_agreement"], ["new_home_order"])).toEqual(["new_home_order:unit_sale_agreement"]);
    expect(deletionWarnings(["reservation", "new_home_order"], ["new_home_order"])).toEqual([]);
  });
});
