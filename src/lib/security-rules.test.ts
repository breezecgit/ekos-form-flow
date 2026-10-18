import { describe, expect, it } from "vitest";
import { assertCustomerEmail, assertEditable, canOpenFormEditor, canResend, parseSubmitStatus } from "./security-rules";

describe("submit status", () => {
  it("accepts the three allowed statuses", () => {
    expect(parseSubmitStatus("In Review (Offsite)")).toBe("In Review (Offsite)");
    expect(parseSubmitStatus(undefined)).toBe("In Review");
  });
  it("refuses any other status", () => {
    expect(() => parseSubmitStatus("Disapproved")).toThrow();
    expect(() => parseSubmitStatus("Draft")).toThrow();
  });
});

describe("completed forms", () => {
  it.each(["In Review", "In Review (Offsite)"])("reps cannot mutate submitted %s forms through actions", (status) => {
    expect(() => assertEditable(status, false)).toThrow("read-only");
  });
  it("a rep can correct a Disapproved form", () => {
    expect(() => assertEditable("Disapproved", false)).not.toThrow();
  });
  it("the Director can open the Completed form editor", () => {
    expect(canOpenFormEditor("Completed", false, true)).toBe(true);
  });
  it("reps cannot open the Completed form editor", () => {
    expect(canOpenFormEditor("Completed", false, false)).toBe(false);
  });
  it("a stale draft flag never unlocks a Completed form for a rep", () => {
    expect(canOpenFormEditor("Completed", true, false)).toBe(false);
  });
  it("reps can edit their draft forms", () => {
    expect(canOpenFormEditor("Draft", true, false)).toBe(true);
  });
  it("reps cannot reopen submitted off-site signing forms", () => {
    expect(canOpenFormEditor("In Review (Offsite)", false, false)).toBe(false);
  });
  it.each(["In Review", "In Review (Offsite)", "Disapproved"])("the Director can edit %s forms", (status) => {
    expect(canOpenFormEditor(status, false, true)).toBe(true);
  });
  it("reps cannot reopen submitted review forms", () => {
    expect(canOpenFormEditor("In Review", false, false)).toBe(false);
  });
  it("reps can open a Disapproved form for corrections", () => {
    expect(canOpenFormEditor("Disapproved", false, false)).toBe(true);
  });
  it("reps cannot change a completed form", () => {
    expect(() => assertEditable("Completed", false)).toThrow();
  });
  it("the director can", () => {
    expect(() => assertEditable("Completed", true)).not.toThrow();
    expect(() => assertEditable("Draft", false)).not.toThrow();
  });
});

describe("customer email", () => {
  it("requires one valid address", () => {
    expect(assertCustomerEmail(" a@b.co ")).toBe("a@b.co");
    expect(() => assertCustomerEmail("a@b.co, c@d.co")).toThrow();
    expect(() => assertCustomerEmail("")).toThrow();
  });
});

describe("resend", () => {
  it("reps cannot resend completion, director or construction emails", () => {
    expect(canResend("completion", "Completed", false)).toBe(false);
    expect(canResend("director", "In Review", false)).toBe(false);
    expect(canResend("construction", "In Review", false)).toBe(false);
  });
  it("reps can resend the off-site email only while awaiting off-site signing", () => {
    expect(canResend("offsite", "In Review (Offsite)", false)).toBe(true);
    expect(canResend("offsite", "Completed", false)).toBe(false);
  });
  it("the director can resend anything", () => {
    expect(canResend("completion", "Completed", true)).toBe(true);
  });
});
