import { describe, expect, it } from "vitest";
import { prefillFromEarlierForms } from "./prefill";
import { writtenStatementForm } from "./written-statement";

const sale = { park_name: "Test Park", customer_name: "Sale Customer Test", customer_email: "", customer_phone: "", sales_person: "" };

describe("Written Statement carry-over", () => {
  it("fills Property Address from the earlier form's Full Address for Your New Home, not the park", () => {
    const out = prefillFromEarlierForms(writtenStatementForm, "written_statement", sale, [
      { form_type: "reservation", data: { customer_name: "Reservation Customer Test", address: "Park Office Road" } },
      { form_type: "new_home_order", data: { new_home_address: "12 Test Pitch, Test Park" }, is_draft: false },
    ]);
    expect(out["new_home_address"]).toBe("12 Test Pitch, Test Park");
    expect(out["party_customer_name"]).toBe("Reservation Customer Test");
  });
  it("leaves Property Address blank when no earlier form exists, and names the party from the sale", () => {
    const out = prefillFromEarlierForms(writtenStatementForm, "written_statement", sale, []);
    expect(out["new_home_address"]).toBeUndefined();
    expect(out["party_customer_name"]).toBe("Sale Customer Test");
  });
});
