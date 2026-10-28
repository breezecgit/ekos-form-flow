import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { STATEMENT_V1, STATEMENT_V2 } from "@/lib/forms/written-statement-text";

const FORM = "written_statement";

/** Immutable pinned wording; reads never create or alter legal templates. */
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
  const { data, error } = await q;
  if (error) throw new Error("The Written Statement wording could not be loaded. Please retry.");
  const row = data?.[0];
  if (row) {
    return { version: row.version, sections: { ...(row.version === 1 ? STATEMENT_V1 : STATEMENT_V2), ...(row.sections as Record<string, string>) } };
  }
  if (version === 1) return { version: 1, sections: { ...STATEMENT_V1 } };
  if (version && version !== 2) throw new Error("The saved Written Statement wording version could not be found.");
  return { version: 2, sections: { ...STATEMENT_V2 } };
}

export async function templatesForSubmission(formType: string, values: Record<string, unknown>) {
  if (formType !== FORM) return undefined;
  const pinned = Number(values["statement_version"] ?? 0) || undefined;
  return getStatementTemplate(pinned);
}
