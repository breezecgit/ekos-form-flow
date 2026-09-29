import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { STATEMENT_V1 } from "@/lib/forms/written-statement-text";

const FORM = "written_statement";

/** Current (or a pinned) version of the Written Statement wording. Seeds v1 on first use. */
export async function getStatementTemplate(
  version?: number,
): Promise<{ version: number; sections: Record<string, string> }> {
  let q = supabaseAdmin
    .from("statement_templates")
    .select("version, sections")
    .eq("form_type", FORM)
    .order("version", { ascending: false })
    .limit(1);
  if (version) q = q.eq("version", version);
  const { data } = await q;
  const row = data?.[0];
  if (row) {
    return { version: row.version, sections: { ...STATEMENT_V1, ...(row.sections as Record<string, string>) } };
  }
  if (version) return getStatementTemplate();
  await supabaseAdmin
    .from("statement_templates")
    .upsert(
      { form_type: FORM, version: 1, sections: STATEMENT_V1, note: "Initial wording" },
      { onConflict: "form_type,version", ignoreDuplicates: true },
    );
  return { version: 1, sections: { ...STATEMENT_V1 } };
}

export async function templatesForSubmission(formType: string, values: Record<string, unknown>) {
  if (formType !== FORM) return undefined;
  const pinned = Number(values["statement_version"] ?? 0) || undefined;
  return getStatementTemplate(pinned);
}
