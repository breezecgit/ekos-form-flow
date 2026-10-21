import { describe, expect, it } from "vitest";
import { isAmendmentOpen } from "./amendment-tag";

describe("Amendment in progress tag", () => {
  it("shows while awaiting customer signature", () => expect(isAmendmentOpen("Awaiting customer signature")).toBe(true));
  it("shows while awaiting approval", () => expect(isAmendmentOpen("Awaiting approval")).toBe(true));
  it("hides once Completed", () => expect(isAmendmentOpen("Completed")).toBe(false));
  it("hides once Cancelled", () => expect(isAmendmentOpen("Cancelled")).toBe(false));
});
