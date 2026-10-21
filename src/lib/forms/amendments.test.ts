import { describe, expect, it } from "vitest";
import { applyKnockOnTotals, buildChangeList, NO_CHANGES_MESSAGE, prepareAmendment } from "./amendments";
import { newHomeOrderForm } from "./new-home-order";
import { reservationForm } from "./reservation";
import { HOME_COST_MODE } from "./home-cost";
import type { FormValues } from "./types";

const computeFields = newHomeOrderForm.steps.flatMap((s) => s.fields).filter((f) => f.compute);
function settle(v: FormValues): FormValues {
  const out = { ...v };
  for (let i = 0; i < 2; i++) for (const f of computeFields) out[f.key] = f.compute!(out);
  return out;
}

const signed = settle({
  sales_route: "Cash",
  list_price: "300,000",
  incentives: ["Discount on home"],
  discount_home: "10,000",
  deposit_amount: "5,000",
  decking_cost: "",
  [HOME_COST_MODE]: "auto",
  customer_signature: "data:image/png;base64,AAA",
  status: "Completed",
});

describe("amendment change list", () => {
  it("signed baseline is £290,000 home cost and £285,000 balance", () => {
    expect(signed["cost_new_home"]).toBe("290,000");
    expect(signed["balance_on_completion"]).toBe("285,000");
  });

  it("adding decking cost lists the decking answer plus knock-on Total Cost and Balance", () => {
    const { after, changes } = prepareAmendment(newHomeOrderForm, signed, { ...signed, decking_cost: "4,000" });
    expect(after["cost_total"]).toBe("294,000");
    expect(after["balance_on_completion"]).toBe("289,000");
    const byKey = Object.fromEntries(changes.map((c) => [c.key, c]));
    expect(byKey["decking_cost"]?.next).toBe("£4,000");
    expect(byKey["cost_total"]).toMatchObject({ previous: "£290,000", next: "£294,000" });
    expect(byKey["balance_on_completion"]).toMatchObject({ previous: "£285,000", next: "£289,000" });
  });

  it("changing the discount recalculates Cost of my New Home through to the balance", () => {
    const { changes } = prepareAmendment(newHomeOrderForm, signed, { ...signed, discount_home: "15,000" });
    const keys = changes.map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(["discount_home", "cost_new_home", "cost_total", "balance_on_completion"]));
    expect(changes.find((c) => c.key === "cost_new_home")?.next).toBe("£285,000");
  });

  it("keeps a total that Sadie typed directly in the amendment", () => {
    const after = applyKnockOnTotals(newHomeOrderForm, signed, { ...signed, decking_cost: "4,000", cost_total: "293,500" });
    expect(after["cost_total"]).toBe("293,500");
  });

  it("blocks an amendment with no changes", () => {
    expect(() => prepareAmendment(newHomeOrderForm, signed, { ...signed })).toThrow(NO_CHANGES_MESSAGE);
  });

  it("never lists signatures, Status or Status Guide", () => {
    const changes = buildChangeList(newHomeOrderForm, signed, {
      ...signed,
      customer_signature: "data:image/png;base64,BBB",
      status: "In Review",
      status_guide: "x",
    });
    expect(changes).toEqual([]);
  });

  it("works on the Reservation form too", () => {
    const changes = buildChangeList(reservationForm, { customer_name: "A Fictional" }, { customer_name: "B Fictional" });
    expect(changes).toEqual([expect.objectContaining({ key: "customer_name", previous: "A Fictional", next: "B Fictional" })]);
  });
});
