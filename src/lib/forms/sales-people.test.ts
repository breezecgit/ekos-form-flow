import { describe, expect, it } from "vitest";
import { SALES_PEOPLE, reservationForm } from "./reservation";
import { allFields } from "./types";
import { FORM_ORDER, getForm } from "./registry";
import { validateFormWrite } from "./write-validation";

const ctx = { mode: "rep" as const, isDirector: false };

describe("retired sales person option", () => {
  it("no longer offers Chris Harris in the sales person list", () => {
    expect(SALES_PEOPLE).not.toContain("Chris Harris");
  });

  it.each([...FORM_ORDER])("offers no Chris Harris option on %s", (type) => {
    const field = allFields(getForm(type)).find((f) => f.key === "sales_person");
    expect(field?.options?.some((o) => o.value === "Chris Harris")).toBe(false);
  });

  it("still accepts an unchanged saved Chris Harris answer", () => {
    expect(() =>
      validateFormWrite(
        reservationForm,
        { sales_person: "Chris Harris" },
        ctx,
        "draft",
        { sales_person: "Chris Harris" },
      ),
    ).not.toThrow();
  });

  it("refuses a new Chris Harris selection", () => {
    expect(() =>
      validateFormWrite(reservationForm, { sales_person: "Chris Harris" }, ctx, "draft"),
    ).toThrow("Sales Person");
  });
});
