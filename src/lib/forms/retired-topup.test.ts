import { describe, expect, it } from "vitest";
import { withoutRetiredTopup } from "./retired-topup";

for (const type of ["new_home_order", "unit_sale_agreement"]) {
  describe(type, () => {
    it("repairs a QMP draft with saved Topup deductions", () => {
      const old = { sales_route: "QMP Assisted Move", cost_total: "285,845", cost_deposit: "5,000", customer_topup: "9,999", balance_on_completion: "270,846", proceeds: "300,000", customer_payment_required: "-29,154" };
      const next = withoutRetiredTopup(type, old);
      expect(next).not.toHaveProperty("customer_topup");
      expect(next["balance_on_completion"]).toBe("280,845");
      expect(next["customer_payment_required"]).toBe("-19,155");
      expect(old.customer_topup).toBe("9,999");
    });
    it("preserves Spring totals while removing the retired answer", () => {
      const next = withoutRetiredTopup(type, { sales_route: "Spring Managed Sale", customer_topup: "9,999", balance_on_completion: "274,845", customer_payment_required: "24,845" });
      expect(next).not.toHaveProperty("customer_topup");
      expect(next["balance_on_completion"]).toBe("274,845");
      expect(next["customer_payment_required"]).toBe("24,845");
    });
    it("preserves editable totals once the retired field is gone", () => {
      const values = { sales_route: "QMP Assisted Move", balance_on_completion: "123", customer_payment_required: "456" };
      expect(withoutRetiredTopup(type, values)).toBe(values);
    });
  });
}