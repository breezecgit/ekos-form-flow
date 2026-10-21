import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { FormRunner } from "@/components/form-engine/FormRunner";
import { useAuth } from "@/hooks/useAuth";
import { getBootstrap, getSubmission, saveDraft, submitForm } from "@/lib/ekos.functions";
import { FORM_TITLES, getForm, hasForm } from "@/lib/forms/registry";
import type { FormValues } from "@/lib/forms/types";
import { canOpenFormEditor } from "@/lib/security-rules";
import { AmendmentsPanel } from "@/components/AmendmentsPanel";

export const Route = createFileRoute("/forms/$formType/$submissionId")({
  head: () => ({
    meta: [
      { title: "Sales form | EKOS Customer Sales Form" },
      {
        name: "description",
        content: "Complete an EKOS Group customer sales form, save a draft, or submit for review.",
      },
      { property: "og:title", content: "Sales form | EKOS Customer Sales Form" },
      {
        property: "og:description",
        content: "Complete an EKOS Group customer sales form, save a draft, or submit for review.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FormPage,
});

function FormPage() {
  const { formType, submissionId } = Route.useParams();
  const router = useRouter();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading && !session) router.navigate({
        to: "/auth",
        search: { redirect: window.location.pathname + window.location.search },
      });
  }, [loading, session, router]);

  const bootstrapFn = useServerFn(getBootstrap);
  const getFn = useServerFn(getSubmission);
  const saveFn = useServerFn(saveDraft);
  const submitFn = useServerFn(submitForm);

  const me = useQuery({
    queryKey: ["bootstrap"],
    queryFn: () => bootstrapFn(),
    enabled: Boolean(session),
  });
  const sub = useQuery({
    queryKey: ["submission", submissionId],
    queryFn: () => getFn({ data: { submissionId } }),
    enabled: Boolean(session),
    retry: false,
  });

  if (!hasForm(formType)) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader isDirector={me.data?.isDirector} email={me.data?.email} />
        <main className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="ekos-title text-2xl">{FORM_TITLES[formType] ?? "Form"}</h1>
          <p className="mt-4 text-muted-foreground">
            This form is coming next. The Customer Reservation Form is ready to use now.
          </p>
        </main>
      </div>
    );
  }

  const def = getForm(formType);

  if (sub.isError) {
    const missing = sub.error.message.includes("Submission not found");
    return (
      <div className="min-h-screen bg-background">
        <AppHeader isDirector={me.data?.isDirector} email={me.data?.email} />
        <main className="mx-auto max-w-2xl px-4 py-12 text-center" role="alert">
          <h1 className="ekos-title text-2xl">{missing ? "This form is no longer available" : "This form couldn’t be opened"}</h1>
          <p className="mt-4 text-muted-foreground">
            {missing ? "The sale or form linked in this email has been deleted. Check your dashboard for your current sales." : "Check that you have access to this form, or try again. Contact EKOS if it still cannot be opened."}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            {!missing && <Button variant="outline" onClick={() => sub.refetch()}>Try again</Button>}
            <Button variant="brand" onClick={() => router.navigate({ to: "/dashboard" })}>View dashboard</Button>
          </div>
        </main>
      </div>
    );
  }

  if (sub.isLoading || !sub.data) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader isDirector={me.data?.isDirector} email={me.data?.email} />
        <p className="p-8 text-center text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const submission = sub.data.submission;
  if (submission.form_type !== formType) {
    return <div className="min-h-screen bg-background"><AppHeader isDirector={me.data?.isDirector} email={me.data?.email} /><main className="mx-auto max-w-2xl px-4 py-12 text-center" role="alert"><h1 className="ekos-title text-2xl">This link does not match the form</h1><Button className="mt-6" variant="brand" onClick={() => router.navigate({ to: "/dashboard" })}>View dashboard</Button></main></div>;
  }
  const values = (submission.data ?? {}) as FormValues;
  const park = sub.data.parks.find((p) => p.name === values["park_name"]);
  const parkLinks = {
    brochure_url: park?.brochure_url ?? "",
    site_licence_url: park?.site_licence_url ?? "",
    park_rules_url: park?.park_rules_url ?? "",
    welcome_pack_url: sub.data.welcomePackUrl,
  };

  const locked = !canOpenFormEditor(submission.status, submission.is_draft, Boolean(me.data?.isDirector));

  return (
    <div className="min-h-screen bg-background">
      <AppHeader isDirector={me.data?.isDirector} email={me.data?.email} />
      <main className="px-4 py-8">
        {locked ? (
          <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 text-center">
            <h1 className="ekos-title text-2xl">{def.title}</h1>
            <p className="mt-3 text-muted-foreground">
              This form has been submitted ({submission.status}) and can no longer be edited.
            </p>
            {sub.data.pdfUrl && (
              <p className="mt-4">
                <a className="text-brand underline" href={sub.data.pdfUrl} target="_blank" rel="noreferrer">
                  View the PDF
                </a>
              </p>
            )}
            {submission.status === "Completed" && (
              <div className="text-left">
                <AmendmentsPanel submissionId={submissionId} status={submission.status} originalPdfUrl="" />
              </div>
            )}
            {sub.data.offsiteLink && (
              <p className="mt-2 break-all text-xs text-muted-foreground">
                Off-site signing link: {sub.data.offsiteLink}
              </p>
            )}
          </div>
        ) : (
          <FormRunner
            def={def}
            ctx={{
              mode: "rep",
              isDirector: Boolean(me.data?.isDirector),
              submissionId,
              ...(sub.data.statement ? { templates: sub.data.statement.sections } : {}),
            }}
            initialValues={values}
            parkLinks={parkLinks}
            parks={sub.data.parks as unknown as Array<Record<string, unknown>>}
            orderNumber={submission.order_number}
            headerExtra={
              submission.status === "Disapproved" && submission.disapproval_note ? (
                <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                  <strong>Changes requested:</strong> {submission.disapproval_note}
                </div>
              ) : null
            }
            onSaveDraft={async (v) => {
              const res = await saveFn({ data: { submissionId, values: v } });
              toast.success("Draft saved – we've emailed you the resume link.", {
                description: res.resumeLink,
              });
            }}
            onSubmit={async (v) => {
              const res = await submitFn({ data: { submissionId, values: v } });
              toast.success(
                res.status === "In Review (Offsite)"
                  ? "Submitted. The customer has been emailed their signing link."
                  : formType === "written_statement"
                    ? "Submitted. Sadie has been emailed the Director & Witness signing link."
                    : "Submitted. Sadie has been emailed to review it.",
              );
              router.navigate({ to: "/dashboard" });
            }}
          />
        )}
      </main>
    </div>
  );
}
