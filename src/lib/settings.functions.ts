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
        directorSignatureDataUrl: z.string().optional(),
        emailTestMode: z
          .object({ enabled: z.boolean(), recipient: z.string().email() })
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
    if (data.welcomePackUrl !== undefined) {
      await db.from("app_settings").upsert({
        key: "links",
        value: { welcome_pack_url: data.welcomePackUrl } as never,
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
          recipient: data.emailTestMode.recipient.trim(),
        } as never,
        updated_at: new Date().toISOString(),
      });
    }

    return { ok: true };
  });
