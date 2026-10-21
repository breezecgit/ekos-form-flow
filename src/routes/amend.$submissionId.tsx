import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { FormRunner } from "@/components/form-engine/FormRunner";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { getBootstrap, getSubmission } from "@/lib/ekos.functions";
import { startFormAmendment } from "@/lib/amendments.functions";
import { getForm } from "@/lib/forms/registry";
import type { FormValues } from "@/lib/forms/types";

export const Route = createFileRoute("/amend/$submissionId")({
  head: () => ({
    meta: [
      { title: "Amend a completed form | EKOS Customer Sales Form" },
      { name: "description", content: "Director-only amendment of a completed EKOS Group sales form." },
      { property: "og:title", content: "Amend a completed form | EKOS Customer Sales Form" },
      { property: "og:description", content: "Director-only amendment of a completed EKOS Group sales form." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AmendPage,
});

function AmendPage() {
  const { submissionId } = Route.useParams();
  const router = useRouter();
  const { session, loading } = useAuth();
  const [reason, setReason] = useState("");
  const reasonRef = useRef(reason);
  reasonRef.current = reason;

  useEffect(() => {
    if (!loading && !session) router.navigate({ to: "/auth", search: { redirect: window.location.pathname } });
  }, [loading, session, router]);

  const bootstrapFn = useServerFn(getBootstrap);
  const getFn = useServerFn(getSubmission);
  const startFn = useServerFn(startFormAmendment);
  const me = useQuery({ queryKey: ["bootstrap"], queryFn: () => bootstrapFn(), enabled: Boolean(session) });
  const sub = useQuery({ queryKey: ["submission", submissionId], queryFn: () => getFn({ data: { submissionId } }), enabled: Boolean(session), retry: false });

  const shell = (body: React.ReactNode) => (
    <div className="min-h-screen bg-background">
      <AppHeader isDirector={me.data?.isDirector} email={me.data?.email} />
      <main className="px-4 py-8">{body}</main>
    </div>
  );
  if (sub.isError) return shell(<p className="text-center text-muted-foreground" role="alert">This form couldn’t be opened.</p>);
  if (!sub.data || !me.data) return shell(<p className="text-center text-muted-foreground">Loading…</p>);
  if (!me.data.isDirector) return shell(<p className="text-center text-muted-foreground" role="alert">Only the Director can amend completed forms.</p>);
  const s = sub.data.submission;
  if (s.status !== "Completed") return shell(<p className="text-center text-muted-foreground" role="alert">Only Completed forms can be amended.</p>);

  const def = getForm(s.form_type);
  const values = (s.data ?? {}) as FormValues;
  const park = sub.data.parks.find((p) => p.name === values["park_name"]);

  return shell(
    <FormRunner
      def={def}
      title={`Amend: ${def.title}`}
      ctx={{ mode: "rep", isDirector: true, submissionId, ...(sub.data.statement ? { templates: sub.data.statement.sections } : {}) }}
      initialValues={values}
      parkLinks={{
        brochure_url: park?.brochure_url ?? "",
        site_licence_url: park?.site_licence_url ?? "",
        park_rules_url: park?.park_rules_url ?? "",
        welcome_pack_url: sub.data.welcomePackUrl,
      }}
      parks={sub.data.parks as unknown as Array<Record<string, unknown>>}
      orderNumber={s.order_number}
      submitLabel={s.form_type === "identification" ? "Save amendment for approval" : "Save amendment & send to customer"}
      headerExtra={
        <div className="mx-auto mt-6 max-w-3xl space-y-2 rounded-lg border border-gold/50 bg-muted/40 p-4 text-sm">
          <p>
            Change any answers below. Only the changed answers (and any totals that change as a result) are sent to the customer to sign.
            The original signed form and PDF stay exactly as they are.
          </p>
          <label htmlFor="amend-reason" className="block font-semibold text-brand">
            Reason for amendment <span className="text-destructive">*</span>
          </label>
          <Textarea id="amend-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer added a shed" />
        </div>
      }
      onSubmit={async (v) => {
        if (reasonRef.current.trim().length < 3) throw new Error("Please give a reason for the amendment (at the top of the form).");
        const res = await startFn({ data: { submissionId, values: v, reason: reasonRef.current } });
        toast.success(
          res.status === "Awaiting customer signature"
            ? `Amendment ${res.number} saved – the customer has been emailed a link to sign it.`
            : `Amendment ${res.number} saved and waiting for your approval.`,
        );
        router.navigate({ to: "/admin/submissions/$id", params: { id: submissionId } });
      }}
    />,
  );
}
