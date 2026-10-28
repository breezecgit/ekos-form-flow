import { expect, it, vi } from "vitest";
import JSZip from "jszip";
import { buildWrittenStatementDocx } from "./written-statement-docx";
import { allFields } from "../forms/types";
import { getForm } from "../forms/registry";

it("exports a legacy Written Statement to Word without acceptance boxes, retaining occupier and Director fields", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("No logo in isolated test")));
  try {
    const blob = await buildWrittenStatementDocx({ orderNumber: "EKOS-TEST", values: {
      customer_name: "Hidden Customer Test", party_customer_name: "Written Statement Test", status: "In Review", accept_terms: true, accept_extras: true,
      occupier_one_name: "Test Occupier", director_name: "Test Director",
    } });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const document = zip.file("word/document.xml");
    if (!document) throw new Error("Word document is missing");
    const xml = await document.async("string");
    for (const f of allFields(getForm("reservation")).filter((f) => ["accept_terms", "accept_extras"].includes(f.key))) {
      expect(xml).not.toContain(f.label);
      expect(xml).not.toContain(f.key);
    }
    expect(xml).toContain("Test Occupier");
    expect(xml).toContain("Test Director");
    expect(xml).toContain("Written Statement Test");
  } finally { vi.unstubAllGlobals(); }
});