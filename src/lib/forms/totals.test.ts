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
