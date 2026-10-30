import { describe, expect, it } from "vitest";
import { getForm } from "./registry";
import { MAX_FORM_BYTES, checkPayloadSize, validateFormWrite, validateSigningWrite } from "./write-validation";
import { allFields, findField, isVisible, type FormDef, type FormValues } from "./types";
import { validateAll } from "./validate";

const ctx = { mode: "rep" as const, isDirector: false };
const def: FormDef = { type: "fixture", title: "Fictional", steps: [{ id: "one", fields: [
  { key: "name", type: "text" }, { key: "email", type: "email", required: false },
  { key: "handover", type: "date", allowTbc: true }, { key: "date", type: "date" },
  { key: "choice", type: "radio", options: [{ value: "Yes" }] },
  { key: "signature", type: "signature", group: "customerSignature" },
  { key: "accept", type: "checkbox", group: "customerSignature" },
  { key: "conditional", type: "text", showIf: (v) => v["choice"] === "Yes" },
] }] };
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4f8AAAAASUVORK5CYII=";

// Build valid fictional answers so submit tests exercise the actual full definition.
function validAnswers(form: FormDef): FormValues {
  const values: FormValues = {};
  for (const f of allFields(form)) {
    if (f.type === "static" || f.type === "links") continue;
    values[f.key] = f.type === "checkbox" ? true
      : f.type === "signature" ? png
      : f.type === "date" ? "2026-11-20"
      : f.type === "email" ? "fictional@example.com"
      : f.type === "money" ? "0"
      : f.type === "file" ? [{ id: "11111111-1111-4111-8111-111111111111", name: "fictional.pdf", path: "fictional/plan.pdf", mime: "application/pdf" }]
      : f.type === "multiselect" ? [f.options?.[0]?.value ?? ""]
      : f.type === "radio" || f.type === "select" ? f.options?.find((o) => !o.directorOnly)?.value ?? ""
      : "Fictional";
  }
  values["second_customer"] = "No";
  values["include_decking"] = "Yes";
  return values;
}

describe("decking plan submission rules", () => {
  const usa = getForm("unit_sale_agreement");
  const nho = getForm("new_home_order");
  it("USA requires the plan only when the upload is visible", () => {
    const field = findField(usa, "decking_plan");
    if (!field) throw new Error("Missing decking plan field");
    const values = { ...validAnswers(usa), decking_plan: [] };
    expect(isVisible(field, values, ctx)).toBe(true);
    expect(validateAll(usa, values, ctx)).toEqual({ decking_plan: expect.any(String) });
    expect(() => validateFormWrite(usa, values, ctx, "submit")).toThrow("required");
    const noDecking = { ...values, include_decking: "No" };
    expect(isVisible(field, noDecking, ctx)).toBe(false);
    expect(() => validateFormWrite(usa, noDecking, ctx, "submit")).not.toThrow();
    expect(() => validateFormWrite(usa, validAnswers(usa), ctx, "submit")).not.toThrow();
  });
  it("NHO still submits with decking selected and no plan", () => {
    expect(() => validateFormWrite(nho, { ...validAnswers(nho), decking_plan: [] }, ctx, "submit")).not.toThrow();
  });
  it("existing USA drafts without a plan still save but require it on staff submission", () => {
    const existing = { ...validAnswers(usa), decking_plan: [] };
    expect(() => validateFormWrite(usa, existing, ctx, "draft", existing)).not.toThrow();
    expect(() => validateFormWrite(usa, existing, ctx, "submit", existing)).toThrow("required");
  });
  it("existing remote USA signing still accepts only customer signing details without demanding a staff upload", () => {
    const existing = { ...validAnswers(usa), decking_plan: [] };
    const patch = { customer_one_name: "Fictional Customer", customer_one_signature: png, customer_one_date: "2026-11-20", second_customer: "No", accept_terms: true, accept_extras: true };
    expect(validateSigningWrite(usa, patch, existing, { mode: "offsite", isDirector: false }, "customerSignature", "EKOS-FICTIONAL")).toEqual(patch);
    expect(() => validateSigningWrite(usa, { ...patch, decking_plan: validAnswers(usa)["decking_plan"] }, existing, { mode: "offsite", isDirector: false }, "customerSignature", "EKOS-FICTIONAL")).toThrow("Only the signing");
  });
  it.each(["new_home_order", "unit_sale_agreement"])("%s still saves a deliberately selected handover TBC", (type) => {
    expect(() => validateFormWrite(getForm(type), { handover_date: "TBC" }, ctx, "draft")).not.toThrow();
  });
});

describe("form write validation", () => {
  it("rep draft payloads cannot choose the Director-only Completed option", () => {
    expect(() => validateFormWrite(getForm("reservation"), { status: "Completed" }, ctx, "draft")).toThrow("Director");
  });
  it("rejects invalid money without changing editable legitimate totals", () => {
    const moneyDef: FormDef = { type: "fixture", title: "Fictional", steps: [{ id: "one", fields: [{ key: "total", type: "money" }] }] };
    expect(() => validateFormWrite(moneyDef, { total: "not-money" }, ctx, "draft")).toThrow();
    expect(() => validateFormWrite(moneyDef, { total: "£1,234.50" }, ctx, "draft")).not.toThrow();
  });
  it.each(["reservation", "identification", "new_home_order", "unit_sale_agreement"])("allows a partial %s draft", (type) => {
    expect(() => validateFormWrite(getForm(type), {}, ctx, "draft")).not.toThrow();
  });
  it("requires visible answers on submission", () => {
    expect(() => validateFormWrite(def, {}, ctx, "submit")).toThrow("required");
  });
  it("rejects unexpected workflow fields", () => {
    expect(() => validateFormWrite(def, { created_by: "spoof" }, ctx, "draft")).toThrow("Unexpected");
  });
  it("does not allow a client to change the legal template version", () => {
    expect(() => validateFormWrite(def, { statement_version: 2 }, ctx, "draft", { statement_version: 1 })).toThrow("Protected");
  });
  it("preserves unchanged pinned metadata", () => {
    expect(() => validateFormWrite(def, { statement_version: 1 }, ctx, "draft", { statement_version: 1 })).not.toThrow();
  });
  it("accepts approved handover TBC", () => {
    expect(() => validateFormWrite(def, { handover: "TBC" }, ctx, "draft")).not.toThrow();
  });
  it("refuses TBC for a signing date", () => {
    expect(() => validateFormWrite(def, { date: "TBC" }, ctx, "draft")).toThrow();
  });
  it("refuses impossible dates", () => {
    expect(() => validateFormWrite(def, { date: "2026-02-30" }, ctx, "draft")).toThrow();
  });
  it("checks supplied optional emails", () => {
    expect(() => validateFormWrite(def, { email: "not-an-email" }, ctx, "draft")).toThrow();
  });
  it("rejects unavailable options", () => {
    expect(() => validateFormWrite(def, { choice: "Other" }, ctx, "draft")).toThrow();
  });
  it("checks checkbox types", () => {
    expect(() => validateFormWrite(def, { accept: "true" }, ctx, "draft")).toThrow();
  });
  it("rejects malformed signatures", () => {
    expect(() => validateFormWrite(def, { signature: "data:image/png;base64,AA==" }, ctx, "draft")).toThrow();
  });
  it("accepts a bounded PNG signature", () => {
    expect(() => validateFormWrite(def, { signature: png }, ctx, "draft")).not.toThrow();
  });
  it("rejects oversized form payloads", () => {
    expect(() => checkPayloadSize({ name: "x".repeat(MAX_FORM_BYTES) })).toThrow("too large");
  });
  it("returns only the approved signature group", () => {
    expect(validateSigningWrite(def, { signature: png, accept: true }, {}, { mode: "offsite", isDirector: false }, "customerSignature", "EKOS-FICTIONAL")).toEqual({ signature: png, accept: true });
  });
  it("rejects customer changes to another field", () => {
    expect(() => validateSigningWrite(def, { name: "changed" }, {}, { mode: "offsite", isDirector: false }, "customerSignature", "EKOS-FICTIONAL")).toThrow("Only the signing");
  });
});

describe("off-site signing with hidden second-signer boxes", () => {
  const off = { mode: "offsite", isDirector: false } as const;
  it("Reservation with no second customer accepts an unchanged hidden auto date and does not save it", async () => {
    const { getForm } = await import("./registry");
    const res = getForm("reservation");
    const existing = { customer_one_date: "2026-10-29", customer_two_date: "2026-10-29" };
    const patch = validateSigningWrite(res, { customer_one_name: "Fictional Person", customer_one_signature: png, customer_one_date: "2026-10-29", second_customer: "No", customer_two_date: "2026-10-29", customer_two_name: "", accept_terms: true, accept_extras: true }, existing, off, "customerSignature", "EKOS-FICTIONAL");
    expect(patch["customer_two_date"]).toBeUndefined();
    expect(patch["customer_two_name"]).toBeUndefined();
    expect(patch["customer_one_signature"]).toBe(png);
  });
  it("still refuses a hidden box sent with a changed value", async () => {
    const { getForm } = await import("./registry");
    const res = getForm("reservation");
    expect(() => validateSigningWrite(res, { second_customer: "No", customer_two_date: "2026-10-30" }, { customer_two_date: "2026-10-29" }, off, "customerSignature", "EKOS-FICTIONAL")).toThrow("Only the visible signing");
  });
  it("still refuses a box outside the signing section", async () => {
    const { getForm } = await import("./registry");
    expect(() => validateSigningWrite(getForm("reservation"), { customer_phone: "000" }, {}, off, "customerSignature", "EKOS-FICTIONAL")).toThrow("Only the signing");
  });
});
describe("hidden auto-dated signing boxes on every form", () => {
  it("are ignored when echoed unchanged (Written Statement, NHO, USA, Reservation)", async () => {
    const { getForm } = await import("./registry");
    const { allFields } = await import("./types");
    for (const type of ["reservation", "written_statement", "new_home_order", "unit_sale"]) {
      let def; try { def = getForm(type); } catch { continue; }
      const hidden = allFields(def).filter((f) => f.group === "customerSignature" && f.defaultToday && f.showIf && !f.showIf({}, { mode: "offsite", isDirector: false }));
      for (const f of hidden) {
        let message = "";
        try { validateSigningWrite(def, { [f.key]: "2026-10-29" }, { [f.key]: "2026-10-29" }, { mode: "offsite", isDirector: false }, "customerSignature", "EKOS-FICTIONAL"); } catch (e) { message = (e as Error).message; }
        expect(message).not.toContain("Only the visible");
      }
    }
  });
});
