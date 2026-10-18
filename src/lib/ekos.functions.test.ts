import { beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the real action bodies; replace authentication/database/network boundaries only.
const fixture = vi.hoisted(() => ({
  userId: "ben-test",
  director: false,
  submission: {
    id: "00000000-0000-4000-8000-000000000065",
    sale_id: "fictional-sale",
    created_by: "ben-test",
    form_type: "reservation",
    status: "Completed",
    is_draft: false,
  },
  writes: [] as Array<{ table: string; patch: Record<string, unknown> }>,
  filters: [] as Array<{ table: string; key: string; value: unknown }>,
  audit: vi.fn(),
  resumeEmail: vi.fn(),
  email: "ben-test@example.invalid",
  grant: false,
  writeError: null as null | { message: string },
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: ((data: unknown) => unknown) | undefined;
    const builder = {
      middleware: () => builder,
      inputValidator: (validator: (data: unknown) => unknown) => { validate = validator; return builder; },
      handler: (handler: (input: unknown) => unknown) => (input?: { data: unknown }) => handler({
        data: validate ? validate(input?.data) : input?.data,
        context: { userId: fixture.userId, claims: { email: fixture.email } },
      }),
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { fixture.filters.push({ table, key, value }); return query; },
        order: () => query,
        in: () => query,
        ilike: (key: string, value: unknown) => { fixture.filters.push({ table, key, value }); return query; },
        update: (patch: Record<string, unknown>) => { fixture.writes.push({ table, patch }); return query; },
        maybeSingle: async () => ({ data: table === "form_submissions" ? fixture.submission : table === "user_roles" && fixture.director ? { role: "director" } : table === "user_permissions" && fixture.grant ? { id: "grant" } : null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: fixture.writeError }).then(resolve),
      };
      return query;
    },
  },
}));
vi.mock("@/lib/ekos.server", () => ({
  addAudit: fixture.audit,
  appOrigin: async () => "https://forms.ekosgroup.co.uk",
  sendResumeLinkEmail: fixture.resumeEmail,
}));

import { deleteSale, getMyPermissions, getSubmission, listSales, saveDraft, uploadFile } from "./ekos.functions";

beforeEach(() => {
  fixture.userId = "ben-test";
  fixture.director = false;
  fixture.submission.created_by = "ben-test";
  fixture.submission.status = "Completed";
  fixture.submission.is_draft = false;
  fixture.writes.length = 0;
  fixture.filters.length = 0;
  fixture.email = "ben-test@example.invalid";
  fixture.grant = false;
  fixture.writeError = null;
  vi.clearAllMocks();
});

describe("deletion authority and failed saves", () => {
  it("a rep claiming Sadie's email and holding a grant still cannot delete", async () => {
    fixture.email = "sadie@ekosgroup.co.uk"; fixture.grant = true;
    await expect(deleteSale({ data: { saleId: fixture.submission.id, confirmOrderNumber: "EKOS-FICTIONAL" } })).rejects.toThrow("permission");
    expect(fixture.writes).toEqual([]);
    expect(fixture.filters.some((f) => f.table === "sales")).toBe(false);
  });
  it("another Director cannot use Sadie's grant", async () => {
    fixture.director = true; fixture.grant = true;
    expect(await getMyPermissions()).toEqual({ canDeleteSales: false });
    expect(fixture.filters.some((f) => f.table === "profiles")).toBe(false);
  });
  it("Sadie's authenticated Director identity still needs the explicit grant", async () => {
    fixture.director = true; fixture.email = "sadie@ekosgroup.co.uk";
    expect(await getMyPermissions()).toEqual({ canDeleteSales: false });
    fixture.grant = true;
    expect(await getMyPermissions()).toEqual({ canDeleteSales: true });
  });
  it("failed draft persistence never reports success or sends a resume email", async () => {
    fixture.submission.status = "Draft"; fixture.writeError = { message: "fixture failure" };
    await expect(save()).rejects.toThrow("could not be saved");
    expect(fixture.audit).not.toHaveBeenCalled(); expect(fixture.resumeEmail).not.toHaveBeenCalled();
  });
  it("invalid draft fields are rejected before persistence", async () => {
    fixture.submission.status = "Draft";
    await expect(saveDraft({ data: { submissionId: fixture.submission.id, values: { created_by: "spoofed-owner" } } })).rejects.toThrow("Unexpected");
    expect(fixture.writes).toEqual([]);
  });
  it.each(["In Review", "In Review (Offsite)"])("submitted %s save attempts cannot reopen a rep form", async (status) => {
    fixture.submission.status = status;
    await expect(save()).rejects.toThrow("read-only");
    expect(fixture.writes).toEqual([]);
  });
});

const save = () => saveDraft({ data: { submissionId: fixture.submission.id, values: { customer_name: "Test Fictional Customer" }, emailLink: false } });

describe("Director editor action regression", () => {
  it("Director saves another owner's Completed form without reopening it", async () => {
    fixture.userId = "sadie-test";
    fixture.director = true;
    await save();
    expect(fixture.writes.find((write) => write.table === "form_submissions")?.patch).toMatchObject({
      status: "Completed", is_draft: false, data: { customer_name: "Test Fictional Customer" },
    });
    expect(fixture.filters).toContainEqual({ table: "user_roles", key: "user_id", value: "sadie-test" });
    expect(fixture.filters).toContainEqual({ table: "user_roles", key: "role", value: "director" });
    expect(fixture.audit).toHaveBeenCalledOnce();
  });
  it("rep cannot save their Completed form and performs no writes or emails", async () => {
    await expect(save()).rejects.toThrow("only be changed by the Director");
    expect(fixture.writes).toEqual([]);
    expect(fixture.audit).not.toHaveBeenCalled();
    expect(fixture.resumeEmail).not.toHaveBeenCalled();
  });
  it("rep can save their editable draft and receive a resume destination", async () => {
    fixture.submission.status = "Draft";
    fixture.submission.is_draft = true;
    const result = await save();
    expect(fixture.writes.find((write) => write.table === "form_submissions")?.patch).toMatchObject({ status: "Draft", is_draft: true });
    expect(result.resumeLink).toContain("redirect=");
    expect(decodeURIComponent(result.resumeLink)).toContain(`/forms/reservation/${fixture.submission.id}`);
  });
  it("rep cannot save another rep's draft", async () => {
    fixture.submission.created_by = "other-rep";
    fixture.submission.status = "Draft";
    await expect(save()).rejects.toThrow("do not have access");
    expect(fixture.writes).toEqual([]);
  });
  it("rep cannot read another rep's submission or obtain its file links", async () => {
    fixture.submission.created_by = "other-rep";
    await expect(getSubmission({ data: { submissionId: fixture.submission.id } })).rejects.toThrow("do not have access");
  });
  it("rep cannot upload to their Completed form", async () => {
    await expect(uploadFile({ data: { submissionId: fixture.submission.id, fieldKey: "test", fileName: "fictional.png", mimeType: "image/png", base64: "AA==" } })).rejects.toThrow("only be changed by the Director");
    expect(fixture.writes).toEqual([]);
  });
  it("rep sale listing is restricted to the authenticated owner", async () => {
    await listSales();
    expect(fixture.filters).toContainEqual({ table: "sales", key: "created_by", value: "ben-test" });
  });
  it("Director sale listing is not restricted to one owner", async () => {
    fixture.userId = "sadie-test";
    fixture.director = true;
    await listSales();
    expect(fixture.filters.some((filter) => filter.table === "sales" && filter.key === "created_by")).toBe(false);
  });
});