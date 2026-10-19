import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusChip, chipStatus } from "@/components/StatusChip";
import { getSubmission, listSales, resendEmails, setStatus } from "@/lib/ekos.functions";
import { DeleteSaleButton } from "@/components/DeleteSaleButton";
import { useRouter } from "@tanstack/react-router";
import { getForm, hasForm } from "@/lib/forms/registry";
import { allFields, isVisible } from "@/lib/forms/types";
import type { FormValues } from "@/lib/forms/types";
import { formatDate, formatMoney } from "@/lib/format";
import { WordDownloadButton } from "@/components/WordDownload";

export const Route = createFileRoute("/admin/submissions/$id")({
  head: () => ({
    meta: [
      { title: "Submission | EKOS Customer Sales Form" },
      {
        name: "description",
        content: "Review a submitted EKOS Group sales form, its PDF, audit history and status.",
      },
      { property: "og:title", content: "Submission | EKOS Customer Sales Form" },
      {
        property: "og:description",
        content: "Review a submitted EKOS Group sales form, its PDF, audit history and status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SubmissionDetail,
});

function SubmissionDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getSubmission);
  const statusFn = useServerFn(setStatus);
  const resendFn = useServerFn(resendEmails);
  const [note, setNote] = useState("");
  const router = useRouter();
  const listFn = useServerFn(listSales);
  const salesQ = useQuery({ queryKey: ["sales"], queryFn: () => listFn() });

  const q = useQuery({
    queryKey: ["submission", id],
    queryFn: () => getFn({ data: { submissionId: id } }),
    retry: false,
  });

  const change = useMutation({
    mutationFn: (vars: { status: "Completed" | "Disapproved"; note?: string }) =>
      statusFn({ data: { submissionId: id, ...vars } }),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["submission", id] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      toast.success(
        vars.status === "Completed"
          ? "Marked complete – signature merged, emails sent and copied to Google Drive."
          : "Disapproved – the sales rep has been emailed.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resend = useMutation({
    mutationFn: (kind: "review" | "offsite" | "completion" | "director") =>
      resendFn({ data: { submissionId: id, kind } }),
    onSuccess: () => toast.success("Email sent."),
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isError) {
    const missing = q.error.message.includes("Submission not found");
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center" role="alert">
        <h1 className="ekos-title text-2xl">{missing ? "This form is no longer available" : "This form couldn’t be opened"}</h1>
        <p className="mt-4 text-muted-foreground">
          {missing ? "The sale or form linked in this email has been deleted. Check the tracker for your current sales." : q.error.message}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {!missing && <Button variant="outline" onClick={() => q.refetch()}>Try again</Button>}
          <Button variant="brand" onClick={() => router.navigate({ to: "/admin" })}>View tracker</Button>
        </div>
      </main>
    );
  }

  if (!q.data) return <p className="p-8 text-center text-muted-foreground">Loading…</p>;

  const s = q.data.submission;
  const values = (s.data ?? {}) as FormValues;
  const def = hasForm(s.form_type) ? getForm(s.form_type) : null;
  const ctx = { mode: "rep" as const, isDirector: true };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="rounded-xl border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="ekos-title text-2xl">{def?.title ?? s.form_type}</h1>
            <p className="text-sm text-muted-foreground">
              {s.order_number} · {String(values["customer_name"] ?? "")} ·{" "}
              {String(values["park_name"] ?? "")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusChip status={chipStatus(s)} />
            {(() => {
              const sale = salesQ.data?.sales.find((x) => x.id === s.sale_id);
              if (!sale) return null;
              const types = (salesQ.data?.submissions ?? [])
                .filter((x) => x.sale_id === sale.id)
                .map((x) => x.form_type);
              return (
                <DeleteSaleButton
                  sale={sale}
                  formTypes={types}
                  onDeleted={() => router.navigate({ to: "/admin" })}
                />
              );
            })()}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {q.data.pdfUrl && (
            <a href={q.data.pdfUrl} target="_blank" rel="noreferrer">
              <Button variant="brand" size="sm">
                View / download PDF
              </Button>
            </a>
          )}
          {q.data.offsiteLink && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(q.data.offsiteLink);
                toast.success("Off-site signing link copied.");
              }}
            >
              Copy off-site signing link
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => resend.mutate("review")}>
            Resend review email
          </Button>
          {s.status === "In Review (Offsite)" && !s.customer_signed_at && (
            <Button size="sm" variant="outline" onClick={() => resend.mutate("offsite")}>
              Resend customer signing email
            </Button>
          )}
          {s.form_type === "written_statement" && (
            <>
              <WordDownloadButton submissionId={s.id} />
              {q.data.directorLink && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(q.data.directorLink);
                    toast.success("Director & Witness signing link copied.");
                  }}
                >
                  Copy Director &amp; Witness signing link
                </Button>
              )}
              {s.customer_signed_at && s.status !== "Completed" && (
                <Button size="sm" variant="outline" onClick={() => resend.mutate("director")}>
                  Resend Director &amp; Witness email
                </Button>
              )}
            </>
          )}
          <Button size="sm" variant="outline" onClick={() => resend.mutate("completion")}>
            Resend completion email
          </Button>
        </div>

        {s.status !== "Completed" && (
          <div className="mt-6 rounded-lg border p-4">
            <h2 className="ekos-title text-lg">Director decision</h2>
            <Textarea
              className="mt-3"
              placeholder="Note for the sales rep (required when disapproving)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {s.form_type === "written_statement" ? (
                <p className="text-sm text-muted-foreground">
                  This statement is completed when you and your witness sign on the Director &amp; Witness
                  signing page (link emailed to you once the customer has signed).
                </p>
              ) : (
              <Button
                variant="gold"
                disabled={change.isPending}
                onClick={() => change.mutate({ status: "Completed" })}
              >
                {change.isPending ? "Working…" : "Approve & mark Completed"}
              </Button>
              )}
              <Button
                variant="destructive"
                disabled={change.isPending || !note.trim()}
                onClick={() => change.mutate({ status: "Disapproved", note })}
              >
                Disapprove
              </Button>
            </div>
          </div>
        )}
      </div>

      {def && (
        <section className="mt-6 rounded-xl border bg-card p-6">
          <h2 className="ekos-title text-lg">Answers</h2>
          <dl className="mt-3 divide-y">
            {allFields(def)
              .filter((f) => f.type !== "static" && f.type !== "links" && isVisible(f, values, ctx))
              .map((f) => (
                <div key={f.key} className="grid gap-1 py-2 sm:grid-cols-3">
                  <dt className="text-sm font-semibold">{f.label}</dt>
                  <dd className="text-sm sm:col-span-2">{renderValue(f.type, values[f.key])}</dd>
                </div>
              ))}
          </dl>
        </section>
      )}

      <section className="mt-6 rounded-xl border bg-card p-6">
        <h2 className="ekos-title text-lg">Audit history</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {q.data.audit.map((a) => (
            <li key={a.id} className="border-b pb-2">
              <span className="text-muted-foreground">
                {new Date(a.created_at).toLocaleString("en-GB")}
              </span>{" "}
              — {a.action}
              {a.actor_label ? ` by ${a.actor_label}` : ""}
              {a.note ? ` · ${a.note}` : ""}
            </li>
          ))}
          {q.data.audit.length === 0 && <li className="text-muted-foreground">No entries yet.</li>}
        </ul>
      </section>
    </main>
  );
}

function renderValue(type: string, value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  if (type === "signature" && typeof value === "string" && value.startsWith("data:image")) {
    return <img src={value} alt="Signature" className="h-16 w-auto" />;
  }
  if (type === "money") return formatMoney(value);
  if (type === "date") return formatDate(value);
  if (type === "checkbox") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}
