import { describe, expect, it } from "vitest";
import { getForm } from "./registry";
import { validateUpload } from "./upload-validation";
import type { FormDef } from "./types";
const def: FormDef = { type: "fixture", title: "Fictional", steps: [{ id: "one", fields: [{ key: "document", type: "file" }] }] };
describe("upload boundary validation", () => {
  it("rejects fields that are not upload fields", () => { expect(() => validateUpload(getForm("reservation"), "customer_name", "application/pdf", btoa("%PDF-1.7"))).toThrow("does not accept"); });
  it.each(["", "%%%", "A", "AA="])("rejects malformed base64 %s", (value) => { expect(() => validateUpload(def, "document", "application/pdf", value)).toThrow(); });
  it("rejects MIME spoofing", () => { expect(() => validateUpload(def, "document", "image/png", btoa("%PDF-1.7"))).toThrow("contents"); });
  it("accepts a bounded PDF header", () => { expect(validateUpload(def, "document", "application/pdf", btoa("%PDF-1.7")).length).toBe(8); });
});