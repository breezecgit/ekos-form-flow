import { describe, expect, it } from "vitest";
import { computeHomeCost, HOME_COST_MODE, prepareHomeCost, prepareHomeCostDraft } from "./home-cost";
import { newHomeOrderForm, computeCostTotal, computeBalanceOnCompletion, computeCustomerPayment } from "./new-home-order";
import { unitSaleAgreementForm } from "./unit-sale-agreement";
import { validateFormWrite } from "./write-validation";

for (const form of [newHomeOrderForm, unitSaleAgreementForm]) {
  describe(`${form.type} incentive home cost`, () => {
    const source = { list_price: "300,000", incentives: ["Discount on home"], discount_home: "10,000" };
    const compute = form.steps.flatMap(s => s.fields).find(f => f.key === "cost_new_home")?.compute;
    it("£300,000 less £10,000 = £290,000, never £280,000", () => {
      expect(compute?.({ ...source, total_cost: "290,000" })).toBe("290,000");
    });
    it("changing the local discount to £15,000 produces £285,000 and flows through totals", () => {
      const values = { ...source, discount_home: "15,000", cost_new_home: computeHomeCost({ ...source, discount_home: "15,000" }), cost_deposit: "5,000", proceeds: "300,000" };
      const cost_total = computeCostTotal(values);
      const balance_on_completion = computeBalanceOnCompletion({ ...values, cost_total });
      expect(cost_total).toBe("285,000");
      expect(balance_on_completion).toBe("280,000");
      expect(computeCustomerPayment({ ...values, balance_on_completion })).toBe("-20,000");
    });
    it.each([["Discount on home", "discount_home"], ["Decking", "discount_decking"], ["Other", "discount_other"]])("deducts %s only while selected", (incentive, key) => {
      expect(compute?.({ list_price: "300,000", incentives: [incentive], [key]: "10,000" })).toBe("290,000");
      expect(compute?.({ list_price: "300,000", incentives: [], [key]: "10,000" })).toBe("300,000");
    });
    it("adds the three selected discounts and ignores blank/TBC discounts", () => {
      expect(compute?.({ list_price: "300,000", incentives: ["Discount on home", "Decking", "Other"], discount_home: "10,000", discount_decking: "2,000", discount_other: "3,000" })).toBe("285,000");
      expect(compute?.({ ...source, discount_home: "TBC", discount_decking: "", incentives: ["Discount on home", "Decking"] })).toBe("300,000");
    });
    it.each(["", "TBC"])("blank/TBC list price yields blank (%s)", list_price => {
      expect(compute?.({ ...source, list_price })).toBe("");
    });
    it("repairs a proven pristine old prefill from changed local sources", () => {
      expect(prepareHomeCost(form.type, { ...source, discount_home: "15,000", cost_new_home: "290,000" }, "290,000")).toMatchObject({ cost_new_home: "285,000", [HOME_COST_MODE]: "auto" });
    });
    it("preserves ambiguous historical saves and explicit manual overrides", () => {
      expect(prepareHomeCost(form.type, { ...source, cost_new_home: "275,000" })).toMatchObject({ cost_new_home: "275,000", [HOME_COST_MODE]: "manual" });
      expect(prepareHomeCost(form.type, { ...source, cost_new_home: "290,000", [HOME_COST_MODE]: "manual" }, "290,000")["cost_new_home"]).toBe("290,000");
    });
    it("persists an auto mode which recalculates on subsequent saves", () => {
      const values = prepareHomeCost(form.type, source);
      validateFormWrite(form, values, { mode: "rep", isDirector: false }, "draft");
      expect(prepareHomeCost(form.type, { ...values, discount_home: "15,000" })["cost_new_home"]).toBe("285,000");
    });
    it("repairs dependent automatic draft totals but preserves manual totals", () => {
      const old = { ...source, discount_home: "15,000", cost_new_home: "290,000", cost_total: "290,000", cost_deposit: "5,000", balance_on_completion: "285,000", proceeds: "300,000", customer_payment_required: "-15,000" };
      expect(prepareHomeCostDraft(form, old, "290,000")).toMatchObject({ cost_new_home: "285,000", cost_total: "285,000", balance_on_completion: "280,000", customer_payment_required: "-20,000" });
      expect(prepareHomeCostDraft(form, { ...old, cost_total: "275,000" }, "290,000")["cost_total"]).toBe("275,000");
    });
  });
}

it("does not alter Reservation answers", () => {
  const values = { list_price: "300,000", total_cost: "290,000" };
  expect(prepareHomeCost("reservation", values)).toBe(values);
});