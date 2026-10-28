import { expect, it, vi } from "vitest";
import JSZip from "jszip";
import { buildWrittenStatementDocx } from "./written-statement-docx";
import { allFields } from "../forms/types";
import { getForm } from "../forms/registry";
import { writtenStatementForm } from "../forms/written-statement";
import { statementSignatures } from "../forms/written-statement.test-fixture";

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

it("keeps Word clauses and answers inline, hides step-4 details and embeds each occupier witness image", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("No logo in isolated test")));
  try {
    const templates = Object.fromEntries(allFields(writtenStatementForm).filter((f) => f.templateKey).map((f) => [f.templateKey ?? "", `Clause ${f.templateKey}`]));
    const values = { ...statementSignatures(), park_company_name: "Inline Company Test", party_customer_name: "Inline Party Test",
      new_home_address: "Inline Address Test", home_model: "Inline Model Test", customer_name: "Hidden Customer Test",
      customer_email: "hidden@example.invalid", rep_name: "Hidden Rep Test", sales_person: "Hidden Sales Person Test" };
    const blob = await buildWrittenStatementDocx({ orderNumber: "EKOS-TEST", values, templates });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const document = zip.file("word/document.xml");
    if (!document) throw new Error("Missing Word document");
    const xml = await document.async("string");
    const sequence = ["Clause part2_intro", "Inline Company Test", "Clause part2_address", "Inline Party Test", "Clause part2_pitch",
      "Inline Address Test", "Clause part2_home", "Inline Model Test", "Clause annex", "Signatures", "Occupier One", "Test occupier_one",
      "Witness to Occupier One", "Test occupier_one_witness", "Test address occupier_one_witness", "Occupier Two", "Test occupier_two",
      "Witness to Occupier Two", "Test occupier_two_witness", "Test address occupier_two_witness", "Director", "Test director", "Test witness"];
    let previous = -1;
    for (const part of sequence) { const position = xml.indexOf(part, previous + 1); expect(position, part).toBeGreaterThan(previous); previous = position; }
    for (const value of [values.customer_name, values.customer_email, values.rep_name, values.sales_person, "Add Second Occupier?", "Customer and Home Details"]) expect(xml).not.toContain(value);
    expect(xml.match(/<w:drawing>/g)).toHaveLength(6);
    expect(xml.match(/>Signatures<\/w:t>/g)).toHaveLength(1);
  } finally { vi.unstubAllGlobals(); }
});