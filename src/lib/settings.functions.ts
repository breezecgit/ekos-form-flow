import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function assertDirector(userId: string) {
  const db = await admin();
  const { data } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "director")
    .maybeSingle();
  if (!data) throw new Error("Director access is required.");
}

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDirector(context.userId);
    const db = await admin();
    const [{ data: parks }, { data: people }, { data: settings }] = await Promise.all([
      db.from("parks").select("*").order("sort_order"),
      db.from("sales_people").select("*").order("sort_order"),
      db.from("app_settings").select("*"),
    ]);
    const map: Record<string, Record<string, string>> = {};
    for (const row of settings ?? []) {
      const value = (row.value ?? {}) as Record<string, unknown>;
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(value)) flat[k] = v == null ? "" : String(v);
      map[row.key] = flat;
    }
    return { parks: parks ?? [], salesPeople: people ?? [], settings: map };
  });

export const saveSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        parks: z.array(
          z.object({
            id: z.string().uuid(),
            address: z.string(),
            inbox_email: z.string(),
            brochure_url: z.string(),
            site_licence_url: z.string(),
            park_rules_url: z.string(),
            bank_account: z.string().optional(),
            sort_code: z.string().optional(),
            goldshield: z.string().optional(),
            company_name: z.string().optional(),
            company_number: z.string().optional(),
            phone: z.string().optional(),
            pitch_fee_review_date: z.string().optional(),
            manager_name: z.string().optional(),
            manager_phone: z.string().optional(),
            manager_email: z.string().optional(),
            rep_name: z.string().optional(),
          }),
        ),
        salesPeople: z.array(z.object({ name: z.string(), email: z.string() })),
        notifications: z.object({
          sales_email: z.string(),
          director_email: z.string(),
          construction_email: z.string(),
        }),
        driveFolderId: z.string(),
        driveFormFolders: z.record(z.string(), z.string()).optional(),
        sheets: z.object({ enabled: z.boolean(), spreadsheet_id: z.string() }).optional(),
        welcomePackUrl: z.string().optional(),
        appBaseUrl: z.string().url().optional().or(z.literal("")),
        directorSignatureDataUrl: z.string().optional(),
        emailTestMode: z
          .object({ enabled: z.boolean(), recipient: z.string().refine((v) => v.split(/[,;\s]+/).filter(Boolean).every((x) => z.string().email().safeParse(x).success) && /@/.test(v), "Enter one or more valid email addresses, separated by commas") })
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertDirector(context.userId);
    const db = await admin();

    for (const p of data.parks) {
      await db
        .from("parks")
        .update({
          address: p.address,
          inbox_email: p.inbox_email,
          brochure_url: p.brochure_url,
          site_licence_url: p.site_licence_url,
          park_rules_url: p.park_rules_url,
          ...(p.bank_account !== undefined ? { bank_account: p.bank_account } : {}),
          ...(p.sort_code !== undefined ? { sort_code: p.sort_code } : {}),
          ...(p.goldshield !== undefined ? { goldshield: p.goldshield } : {}),
          ...(p.company_name !== undefined ? { company_name: p.company_name } : {}),
          ...(p.company_number !== undefined ? { company_number: p.company_number } : {}),
          ...(p.phone !== undefined ? { phone: p.phone } : {}),
          ...(p.pitch_fee_review_date !== undefined ? { pitch_fee_review_date: p.pitch_fee_review_date } : {}),
          ...(p.manager_name !== undefined ? { manager_name: p.manager_name } : {}),
          ...(p.manager_phone !== undefined ? { manager_phone: p.manager_phone } : {}),
          ...(p.manager_email !== undefined ? { manager_email: p.manager_email } : {}),
          ...(p.rep_name !== undefined ? { rep_name: p.rep_name } : {}),
        })
        .eq("id", p.id);
    }

    const { data: existing } = await db.from("sales_people").select("id, name");
    const list = data.salesPeople
      .map((p) => ({ name: p.name.trim(), email: p.email.trim() }))
      .filter((p) => p.name);
    const keep = new Set(list.map((p) => p.name));
    for (const row of existing ?? []) {
      if (!keep.has(row.name)) await db.from("sales_people").delete().eq("id", row.id);
    }
    let order = 0;
    for (const p of list) {
      order += 1;
      await db
        .from("sales_people")
        .upsert({ name: p.name, email: p.email, sort_order: order }, { onConflict: "name" });
    }

    await db
      .from("app_settings")
      .upsert({ key: "notifications", value: data.notifications as never, updated_at: new Date().toISOString() });
    if (data.appBaseUrl) {
      await db.from("app_settings").upsert({
        key: "app_base_url",
        value: { url: data.appBaseUrl.replace(/\/+$/, "") } as never,
        updated_at: new Date().toISOString(),
      });
    }
    if (data.welcomePackUrl !== undefined) {
      const { data: cur } = await db.from("app_settings").select("value").eq("key", "links").maybeSingle();
      await db.from("app_settings").upsert({
        key: "links",
        value: { ...((cur?.value ?? {}) as Record<string, unknown>), welcome_pack_url: data.welcomePackUrl } as never,
        updated_at: new Date().toISOString(),
      });
    }
    await db.from("app_settings").upsert({
      key: "google_drive",
      value: { folder_id: data.driveFolderId, ...(data.driveFormFolders ?? {}) } as never,
      updated_at: new Date().toISOString(),
    });

    if (data.sheets) {
      await db.from("app_settings").upsert({
        key: "google_sheets",
        value: { enabled: data.sheets.enabled ? "true" : "false", spreadsheet_id: data.sheets.spreadsheet_id } as never,
        updated_at: new Date().toISOString(),
      });
    }

    if (data.directorSignatureDataUrl) {
      const base64 = data.directorSignatureDataUrl.split(",")[1] ?? "";
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const path = `settings/director-signature.png`;
      await db.storage.from("ekos-documents").upload(path, bytes, {
        contentType: "image/png",
        upsert: true,
      });
      await db.from("app_settings").upsert({
        key: "director_signature",
        value: {
          name: "Sadie Deveraux",
          title: "Director – authorised signatory of EKOS Group",
          image_path: path,
        } as never,
        updated_at: new Date().toISOString(),
      });
    }

    if (data.emailTestMode) {
      await db.from("app_settings").upsert({
        key: "email_test_mode",
        value: {
          enabled: data.emailTestMode.enabled ? "true" : "false",
          recipient: data.emailTestMode.recipient.split(/[,;\s]+/).filter(Boolean).join(", "),
        } as never,
        updated_at: new Date().toISOString(),
      });
    }

    return { ok: true };
  });

/** Staff list with their can_delete_sales permission (director only). */
export const listUserPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDirector(context.userId);
    const db = await admin();
    const [{ data: profiles }, { data: perms }] = await Promise.all([
      db.from("profiles").select("email, full_name").order("email"),
      db.from("user_permissions").select("email").eq("permission", "can_delete_sales"),
    ]);
    const set = new Set((perms ?? []).map((p) => p.email.toLowerCase()));
    return (profiles ?? []).map((p) => ({
      email: p.email,
      fullName: p.full_name,
      canDeleteSales: set.has(p.email.toLowerCase()),
    }));
  });

export const setDeletePermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ email: z.string().email(), enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertDirector(context.userId);
    const db = await admin();
    const email = data.email.toLowerCase();
    if (data.enabled) {
      await db.from("user_permissions").upsert({ email, permission: "can_delete_sales" }, { onConflict: "email,permission" });
    } else {
      await db.from("user_permissions").delete().eq("email", email).eq("permission", "can_delete_sales");
    }
    return { ok: true };
  });
