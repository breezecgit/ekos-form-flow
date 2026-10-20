import { describe, expect, it } from "vitest";
import { computeTotalCost } from "./reservation";
import { computeCostTotal } from "./new-home-order";

describe("Reservation Total Cost", () => {
  it("£299,995 − £10,000 = £289,995", () => {
    expect(
      computeTotalCost({ list_price: "299,995", incentives: ["Discount on home"], discount_home: "10000" }),
    ).toBe("289,995");
  });
  it("no discount selected → list price", () => {
    expect(computeTotalCost({ list_price: "299995", discount_home: "10000", incentives: [] })).toBe("299,995");
  });
  it("TBC → blank", () => {
    expect(computeTotalCost({ list_price: "TBC" })).toBe("");
  });
});

describe("NHO / Unit Sale Total Cost", () => {
  it("sums every cost box", () => {
    expect(
      computeCostTotal({
        cost_new_home: "250,000",
        cost_decking: "3000",
        cost_omar_extras: "1500",
        cost_steps: "1,000",
        cost_shed: "850",
        cost_decking_base: "2000",
        cost_other: "500",
      }),
    ).toBe("258,850");
  });
});

import { computeBalanceOnCompletion, computeCustomerPayment, newHomeOrderForm } from "./new-home-order";
import { formatMoney } from "@/lib/format";
import { needsConstruction } from "@/lib/ekos.server";
import { unitSaleAgreementForm } from "./unit-sale-agreement";

describe("NHO balance and customer payment (Sadie's figures)", () => {
  const spring = { sales_route: "Spring Managed Sale", cost_total: "285,845", cost_deposit: "5,000", estate_agent_fees: "5000", legal_fee_contribution: "1000", customer_topup: "9999" };
  it("Spring: £285,845 − £5,000 − £5,000 − £1,000 = £274,845 (hidden top up ignored)", () => {
    expect(computeBalanceOnCompletion(spring)).toBe("274,845");
  });
  it("QMP subtracts deposit only, ignoring saved Topup and Spring fees", () => {
    expect(computeBalanceOnCompletion({ sales_route: "QMP Assisted Move", cost_total: "100,000", cost_deposit: "5,000", customer_topup: "2,000", estate_agent_fees: "5000", legal_fee_contribution: "1000" })).toBe("95,000");
  });
  it("QMP treats a TBC deposit as zero, still ignoring saved Topup", () => {
    expect(computeBalanceOnCompletion({ sales_route: "QMP Assisted Move", cost_total: "100,000", cost_deposit: "TBC", customer_topup: "2,000" })).toBe("100,000");
  });
  for (const form of [newHomeOrderForm, unitSaleAgreementForm]) {
    it(`${form.title}: Topup is not an active field on any route`, () => {
      expect(form.steps.flatMap((step) => step.fields).some((field) => field.key === "customer_topup")).toBe(false);
    });
    it(`${form.title}: QMP balance ignores legacy Topup`, () => {
      const balance = form.steps.flatMap((step) => step.fields).find((field) => field.key === "balance_on_completion");
      expect(balance?.compute?.({ sales_route: "QMP Assisted Move", cost_total: "285,845", cost_deposit: "5,000", customer_topup: "9,999" })).toBe("280,845");
    });
  }
  it("£274,845 − £250,000 = £24,845", () => {
    expect(computeCustomerPayment({ balance_on_completion: "274,845", proceeds: "250,000" })).toBe("24,845");
  });
  it("equity release: £274,845 − £300,000 = -£25,155", () => {
    const n = computeCustomerPayment({ balance_on_completion: "274,845", proceeds: "300000" });
    expect(n).toBe("-25,155");
    expect(formatMoney(n)).toBe("-£25,155");
  });
  it("Special Requests is optional", () => {
    const f = newHomeOrderForm.steps.flatMap((s) => s.fields).find((x) => x.key === "special_requests");
    expect(f?.required).toBe(false);
  });
  it("no Operations/construction sign-off step remains", () => {
    expect(newHomeOrderForm.steps.some((s) => s.id === "construction")).toBe(false);
    expect(needsConstruction("new_home_order")).toBe(false);
  });
});
