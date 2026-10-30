import { describe, expect, it } from "vitest";
import { prefillFromEarlierForms } from "./prefill";
import { writtenStatementForm } from "./written-statement";
import { reservationForm } from "./reservation";

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

import { newHomeOrderForm } from "./new-home-order";
import { unitSaleAgreementForm } from "./unit-sale-agreement";
import { refreshDraftFromPrefill } from "./prefill";
import { isRequired } from "./types";

describe("latest submitted value wins", () => {
  const rows = [
    { form_type: "reservation", data: { sales_route: "Part Exchange" }, is_draft: false, submitted_at: "2026-10-01T10:00:00Z" },
    { form_type: "new_home_order", data: { sales_route: "Spring Managed Sale" }, is_draft: false, submitted_at: "2026-10-05T10:00:00Z" },
  ];
  it("Unit Sale Agreement takes the New Home Order's newer Sales Route", () => {
    const out = prefillFromEarlierForms(unitSaleAgreementForm, "unit_sale_agreement", sale, rows);
    expect(out["sales_route"]).toBe("Spring Managed Sale");
  });
  it("open draft with stale carried value is refreshed, typed value kept", () => {
    const prefill = { sales_route: "Spring Managed Sale" };
    expect(refreshDraftFromPrefill({ sales_route: "Part Exchange" }, prefill, rows).data["sales_route"]).toBe("Spring Managed Sale");
    const typed = refreshDraftFromPrefill({ sales_route: "Customer Own Sale" }, prefill, rows);
    expect(typed.data["sales_route"]).toBe("Customer Own Sale");
    expect(typed.changed).toBe(false);
  });
  it("NHO decking plan is optional when decking is required", () => {
    const f = newHomeOrderForm.steps.flatMap((s) => s.fields).find((x) => x.key === "decking_plan");
    if (!f) throw new Error("Missing decking plan field");
    expect(isRequired(f)).toBe(false);
  });
});

describe.each([newHomeOrderForm, unitSaleAgreementForm])("$title handover prefill", (form) => {
  it("does not carry an earlier TBC into a new form", () => {
    const out = prefillFromEarlierForms(form, form.type, sale, [{ form_type: "reservation", data: { handover_date: "TBC" } }]);
    expect(out).not.toHaveProperty("handover_date");
  });
  it("still carries an actual handover date", () => {
    const out = prefillFromEarlierForms(form, form.type, sale, [{ form_type: "reservation", data: { handover_date: "2026-11-20" } }]);
    expect(out["handover_date"]).toBe("2026-11-20");
  });
  it("does not clear the rep's saved TBC during draft refresh", () => {
    const rows = [{ form_type: "reservation", data: { handover_date: "TBC" } }];
    const prefill = prefillFromEarlierForms(form, form.type, sale, rows);
    expect(refreshDraftFromPrefill({ ...prefill, handover_date: "TBC" }, prefill, rows)).toEqual({ data: { ...prefill, handover_date: "TBC" }, changed: false });
  });
});

it("leaves Reservation handover TBC carry-over unchanged", () => {
  expect(prefillFromEarlierForms(reservationForm, "reservation", sale, [{ form_type: "new_home_order", data: { handover_date: "TBC" } }])["handover_date"]).toBe("TBC");
});
