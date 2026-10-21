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
    const { after, changes } = prepareAmendment(newHomeOrderForm, signed, { ...signed, include_decking: "Yes", decking_cost: "4,000" });
    expect(after["cost_total"]).toBe("294,000");
    expect(after["balance_on_completion"]).toBe("289,000");
    const byKey = Object.fromEntries(changes.map((c) => [c.key, c]));
    expect(byKey["decking_cost"]?.next).toBe("£4,000");
    expect(byKey["cost_total"]).toMatchObject({ previous: "£290,000", next: "£294,000" });
    expect(byKey["balance_on_completion"]).toMatchObject({ previous: "£285,000", next: "£289,000" });
  });

  it("skips the computed totals-step Decking Cost row when it mirrors the extras-step answer", () => {
    const { changes } = prepareAmendment(newHomeOrderForm, signed, { ...signed, include_decking: "Yes", decking_cost: "4,000" });
    const deckingRows = changes.filter((c) => c.label === "Decking Cost");
    expect(deckingRows).toHaveLength(1);
    expect(deckingRows[0]?.key).toBe("decking_cost");
    expect(changes.some((c) => c.key === "cost_decking")).toBe(false);
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

describe("amendment option-cost recalculation", () => {
  // Signed with both sheds Required but a typed-over Shed cost of £2,500.
  const withShed = settle({ ...signed, shed_basic: "Required", shed_connected: "Required" });
  const overridden: FormValues = { ...withShed, cost_shed: "2,500" };
  overridden["cost_total"] = "292,500";
  overridden["balance_on_completion"] = "287,500";
  overridden["customer_payment_required"] = "287,500";

  it("changed selection recalculates a previously overridden cost and its totals", () => {
    const edited = { ...overridden, shed_basic: "Not Required", shed_connected: "Not Required" };
    const { after, changes } = prepareAmendment(newHomeOrderForm, overridden, edited);
    expect(after["cost_shed"]).toBe("0");
    expect(after["cost_total"]).toBe("290,000");
    expect(after["balance_on_completion"]).toBe("285,000");
    expect(after["customer_payment_required"]).toBe("285,000");
    const keys = changes.map((c) => c.key);
    for (const k of ["cost_shed", "cost_total", "balance_on_completion", "customer_payment_required"]) expect(keys).toContain(k);
  });

  it("unchanged selection keeps the manual override", () => {
    const edited = { ...overridden, deposit_amount: "6,000" };
    const after = applyKnockOnTotals(newHomeOrderForm, overridden, edited);
    expect(after["cost_shed"]).toBe("2,500");
  });

  it("keeps Sadie's own figure typed over the recalculated cost", () => {
    const edited = { ...overridden, shed_basic: "Not Required", shed_connected: "Not Required", cost_shed: "300" };
    const after = applyKnockOnTotals(newHomeOrderForm, overridden, edited);
    expect(after["cost_shed"]).toBe("300");
    expect(after["cost_total"]).toBe("290,300");
  });
});

describe("amend screen override handling", () => {
  const withShed = settle({ ...signed, shed_basic: "Required", decking_base_extension: "Not Required" });
  const v: FormValues = { ...withShed, cost_shed: "2,100", cost_decking_base: "2,000" };
  v["cost_total"] = "294,100"; v["balance_on_completion"] = "289,100"; v["customer_payment_required"] = "289,100";

  it("typed-over costs start as overrides", async () => {
    const { initialAmendOverrides } = await import("./amendments");
    const o = initialAmendOverrides(newHomeOrderForm, v);
    expect(o.has("cost_shed")).toBe(true);
    expect(o.has("cost_decking_base")).toBe(true);
    expect(o.has("cost_total")).toBe(false);
  });

  it("changing the shed releases only the shed override", async () => {
    const { initialAmendOverrides, releaseOverridesOnSelectionChange } = await import("./amendments");
    const o = initialAmendOverrides(newHomeOrderForm, v);
    releaseOverridesOnSelectionChange(newHomeOrderForm, v, { ...v, shed_basic: "Not Required" }, o, "shed_basic");
    expect(o.has("cost_shed")).toBe(false);
    expect(o.has("cost_decking_base")).toBe(true);
  });
});
