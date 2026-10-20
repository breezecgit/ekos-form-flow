import { describe, expect, it } from "vitest";
import { newHomeOrderForm } from "./new-home-order";
import { unitSaleAgreementForm } from "./unit-sale-agreement";
import { findField, isVisible } from "./types";
import { validateFields } from "./validate";

const routes = ["Part Exchange", "Spring Managed Sale", "QMP Assisted Move", "Part Exchange or Managed Sale – TBC", "Cash", "TBC"];
const ctx = { mode: "rep" as const, isDirector: false };
describe.each([newHomeOrderForm, unitSaleAgreementForm])("$title new-home address", (form) => {
  it.each(routes)("%s requires the address and accepts TBC", (sales_route) => {
    const field = findField(form, "new_home_address");
    if (!field) throw new Error("Missing address field");
    expect(isVisible(field, { sales_route }, ctx)).toBe(true);
    expect(validateFields([field], { sales_route, new_home_address: "" }, ctx)).toHaveProperty("new_home_address");
    expect(validateFields([field], { sales_route, new_home_address: "TBC" }, ctx)).toEqual({});
  });
});