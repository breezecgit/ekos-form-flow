import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import approved from "../forms/approved-statement-v2.json";
import { writtenStatementForm } from "../forms/written-statement";
import { STATEMENT_V1, STATEMENT_V2 } from "../forms/written-statement-text";
import { statementSignatures } from "../forms/written-statement.test-fixture";
import { generateFormPdf } from "./generate.server";

const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
function extract(bytes: Uint8Array): string {
  const dir = mkdtempSync(join(tmpdir(), "ekos-wording-"));
  try {
    const path = join(dir, "statement.pdf"); writeFileSync(path, bytes);
    return execFileSync("pdftotext", ["-layout", path, "-"], { encoding: "utf8" });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

it("locks full extracted PDF wording and exact approved Part 2 label/value order", async () => {
  expect(STATEMENT_V2).toEqual(approved);
  const values = { ...statementSignatures(false), director_signature: "", witness_signature: "",
    park_name: "Test Park", park_company_name: "Test Company", park_registered_number: "TEST123",
    agreement_start_date: "2026-10-28", new_home_address: "1 Test Pitch", pitch_plan: [{ name: "Test Plan.pdf" }],
    pitch_fee_from: "2026-10-28", monthly_pitch_fee: "250", services_included: "Sewage", pitch_fee_review_date: "1 January",
    additional_charges: "Test Charges", home_model: "Test Model", serial_number: "TEST456", year_of_manufacture: "2026",
    home_length: "40", home_width: "20", customer_name: "Cover Test Customer", party_customer_name: "Party Name Value",
    customer_email: "hidden@example.invalid", customer_phone: "Hidden Phone", sales_person: "Hidden Sales Person",
    accept_terms: true, accept_extras: true };
  const plan = await PDFDocument.create(); const page = plan.addPage();
  page.drawText("EMBEDDED PITCH PLAN TEST", { font: await plan.embedFont(StandardFonts.Helvetica) });
  const bytes = await generateFormPdf({ def: writtenStatementForm, values, ctx: { mode: "director", isDirector: true },
    orderNumber: "EKOS-WORDING", park: "Test Park", customerName: values.customer_name, parkLinks: {},
    attachments: [{ fileName: "Test Plan.pdf", mimeType: "application/pdf", bytes: await plan.save() }] });
  const extracted = extract(bytes).split(/\r?\n/).filter((line) => !line.includes("Your Written Statement") && !line.includes("EKOS-WORDING")).join("\n");
  const body = extracted.slice(extracted.indexOf("WRITTEN STATEMENT"), extracted.indexOf("Signatures"));
  const part2 = `PART 2
Particulars of the agreement
1. The Mobile Homes Act 1983 will apply to the agreement.
Parties to the agreement
2. The parties to the agreement will be
Park Limited Company Name Test Company
Registered Number TEST123
c/o LT Management Services Ltd
31 Haverscroft Industrial Estate, New Road, Attleborough, Norfolk, NR17 1YE
Party Name Value
Start date
3. The agreement will begin on: 28/10/2026
Particulars of the pitch
4. The particulars of the land on which you will be entitled to station your mobile home are:
Property Address 1 Test Pitch
5. A plan showing
(a) the size and location of the pitch.
(b) the size of the base on which the mobile home is to be stationed; and
(c) measurements between identifiable fixed points on the site and the pitch and base.
Your pitch plan is attached here – Test Plan.pdf (attached at the end of this document)
Site owner’s interest
6. In Perpetuity
Pitch fee
7. The pitch fee will be payable from: 28/10/2026
The pitch fee will be payable monthly.
The pitch fee is: £250
The following services are included in the pitch fee: Sewage
Review of pitch fee
8. The pitch fee will be reviewed on the following date each year: 1 January
This date is the review date.
Additional charges
An additional charge will be made for the following matters: Test Charges
Details of the mobile home
Manufacturer: Omar
Model: Test Model
Serial No: TEST456
Year of manufacture: 2026
Maximum number of people permitted to occupy the home: 2
Length (Feet): 40
Width (Feet): 20`;
  expect(normalize(body)).toBe(normalize([approved.intro, approved.part1, part2, approved.annex_intro, approved.annex].join("\n")));
  expect(normalize(body)).toContain(normalize("NR17 1YE\nParty Name Value\nStart date"));
  for (const removed of ["Customer Name", "Customer name", "hidden@example.invalid", "Hidden Phone", "Hidden Sales Person", "not signed", "I have read and agree", "I understand that the cost"]) expect(extracted).not.toContain(removed);
  expect(extracted.match(/To be signed by EKOS Group/g)).toHaveLength(1);
  expect(extracted.indexOf("EMBEDDED PITCH PLAN TEST")).toBeGreaterThan(extracted.indexOf("To be signed by EKOS Group"));
});

it("keeps version-one legal text unchanged, including deliberately uncorrected wording", () => {
  expect(STATEMENT_V1["annex"]).toContain("(b)then,");
  expect(STATEMENT_V2["annex"]).toContain("(b) then,");
  expect(STATEMENT_V2["annex"]).toContain("notice of proposed gift");
  expect(STATEMENT_V2["annex"]).toContain("paragraph 10 of Part 2");
  expect(STATEMENT_V2["annex"]).toContain("Owner’s estate or interest\n1. (1)");
});

it("refuses a Written Statement when a pitch plan cannot be embedded rather than issuing a text-only substitute", async () => {
  await expect(generateFormPdf({ def: writtenStatementForm, values: statementSignatures(false), ctx: { mode: "director", isDirector: true },
    orderNumber: "EKOS-TEST", park: "Test Park", customerName: "Test", parkLinks: {},
    attachments: [{ fileName: "Broken.pdf", mimeType: "application/pdf", bytes: new Uint8Array([1, 2, 3]) }] })).rejects.toThrow("could not be embedded");
});