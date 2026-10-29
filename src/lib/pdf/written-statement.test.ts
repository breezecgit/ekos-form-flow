import { expect, it, vi } from "vitest";
import { PDFDocument, PDFPage } from "pdf-lib";
import { generateFormPdf } from "./generate.server";
import { writtenStatementForm } from "../forms/written-statement";
import { statementSignatures, TEST_SIGNATURE } from "../forms/written-statement.test-fixture";

it("prints Written Statement answers inline, one signatures section, witnesses in order and pitch plans last", async () => {
  const text = vi.spyOn(PDFPage.prototype, "drawText");
  const images = vi.spyOn(PDFPage.prototype, "drawImage");
  try {
    const values = { ...statementSignatures(), park_company_name: "Inline Company Test", park_registered_number: "Inline Number Test",
      party_customer_name: "Inline Party Test", agreement_start_date: "2026-10-28", new_home_address: "Inline Address Test",
      park_name: "Hidden Selected Park Test",
      pitch_plan: [{ name: "Test pitch.png" }], additional_charges: "Inline Charges Test", home_model: "Inline Model Test",
      customer_name: "Cover Customer Test", customer_email: "hidden@example.invalid", customer_phone: "Hidden Phone Test",
      park_name_confirm: "Hidden Confirm Park Test", sales_person: "Hidden Sales Person Test", rep_name: "Hidden Rep Test", rep_signature: TEST_SIGNATURE };
    const templates = Object.fromEntries(writtenStatementForm.steps.flatMap((s) => s.fields).filter((f) => f.templateKey).map((f) => [f.templateKey ?? "", `Clause ${f.templateKey}`]));
    const bytes = await generateFormPdf({ def: writtenStatementForm, values, ctx: { mode: "director", isDirector: true, templates },
      orderNumber: "EKOS-TEST", park: "Test Park", customerName: values.customer_name, parkLinks: {},
      attachments: [{ fileName: "Test pitch.png", mimeType: "image/png", bytes: Uint8Array.from(atob(TEST_SIGNATURE.split(",")[1] ?? ""), (c) => c.charCodeAt(0)) }] });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
    const printed = text.mock.calls.map(([t]) => t).join("\n");
    const sequence = ["Clause part2_intro", "Inline Company Test", "Inline Number Test", "Clause part2_address",
      "Clause part2_start", "3. The agreement will begin on", "Clause part2_pitch", "Inline Address Test", "Clause part2_plan",
      "Test pitch.png (attached at the end of this document)", "Clause part2_additional", "Inline Charges Test", "Clause part2_home",
      "Inline Model Test", "Clause annex", "Signatures", "Occupier One", "Test occupier_one", "Witness to Occupier One",
      "Test occupier_one_witness", "Test address occupier_one_witness", "Occupier Two", "Test occupier_two", "Witness to Occupier Two",
      "Test occupier_two_witness", "Test address occupier_two_witness", "Director", "Test director", "Test witness", "Attached document: Test pitch.png"];
    let previous = -1;
    for (const part of sequence) { const position = printed.indexOf(part, previous + 1); expect(position, part).toBeGreaterThan(previous); previous = position; }
    expect(text.mock.calls.filter(([t]) => t === "Signatures")).toHaveLength(1);
    expect(printed).not.toContain("Customer and Home Details");
    for (const value of [values.customer_email, values.customer_phone, values.park_name_confirm, values.park_name, values.sales_person, values.rep_name, "Add Second Occupier?", "Order Number", "EKOS-", "Select Park"]) expect(printed).not.toContain(value);
    expect(printed).toContain("Park: Test Park");
    expect(printed).toContain("Customer: Cover Customer Test");
    expect(images).toHaveBeenCalledTimes(8); // cover, six signatures, pitch plan
  } finally { text.mockRestore(); images.mockRestore(); }
});