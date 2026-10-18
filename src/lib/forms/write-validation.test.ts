import { describe, expect, it } from "vitest";
import { getForm } from "./registry";
import { MAX_FORM_BYTES, checkPayloadSize, validateFormWrite, validateSigningWrite } from "./write-validation";
import type { FormDef } from "./types";

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

describe("form write validation", () => {
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