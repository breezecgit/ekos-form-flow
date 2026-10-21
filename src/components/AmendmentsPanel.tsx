import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  approveFormAmendment,
  cancelFormAmendment,
  listFormAmendments,
  resendFormAmendmentEmail,
} from "@/lib/amendments.functions";
import { formatDate } from "@/lib/format";

/** Director-only amendments list + actions for one Completed form. */
export function AmendmentsPanel({ submissionId, status, originalPdfUrl }: { submissionId: string; status: string; originalPdfUrl: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const listFn = useServerFn(listFormAmendments);
  const approveFn = useServerFn(approveFormAmendment);
  const cancelFn = useServerFn(cancelFormAmendment);
  const resendFn = useServerFn(resendFormAmendmentEmail);
  const q = useQuery({ queryKey: ["amendments", submissionId], queryFn: () => listFn({ data: { submissionId } }) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["amendments", submissionId] });
    qc.invalidateQueries({ queryKey: ["submission", submissionId] });
  };
  const act = useMutation({
    mutationFn: async (a: { kind: "approve" | "cancel" | "resend"; id: string }) => {
      if (a.kind === "approve") return approveFn({ data: { amendmentId: a.id } });
      if (a.kind === "resend") return resendFn({ data: { amendmentId: a.id } });
      const note = window.prompt("Reason for cancelling this amendment (optional):") ?? "";
      return cancelFn({ data: { amendmentId: a.id, note } });
    },
    onSuccess: (_r, a) => {
      toast.success(a.kind === "approve" ? "Amendment approved – the PDF has been emailed." : a.kind === "resend" ? "Amendment email resent." : "Amendment cancelled.");
      refresh();
    },
    onError: (e) => { toast.error(e instanceof Error ? e.message : "That didn't work. Please retry."); refresh(); },
  });

  const list = q.data?.amendments ?? [];
  const open = list.some((a) => a.status === "Awaiting customer signature" || a.status === "Awaiting approval");
  if (status !== "Completed" && !list.length) return null;

  return (
    <section className="mt-6 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold text-brand">Amendments</h2>
        {status === "Completed" && q.data?.available !== false && (
          <Button size="sm" variant="brand" disabled={open} title={open ? "Finish or cancel the open amendment first" : undefined}
            onClick={() => router.navigate({ to: "/amend/$submissionId", params: { submissionId } })}>
            Amend form
          </Button>
        )}
      </div>
      {q.data?.available === false && (
        <p className="mt-2 text-sm text-muted-foreground">Amendments are not switched on yet – the database update still needs approval.</p>
      )}
      {originalPdfUrl && (
        <p className="mt-2 text-sm"><a className="text-brand underline" href={originalPdfUrl} target="_blank" rel="noreferrer">Original signed PDF</a></p>
      )}
      {list.length === 0 && q.data?.available !== false && <p className="mt-2 text-sm text-muted-foreground">No amendments.</p>}
      <ul className="mt-3 space-y-3">
        {list.map((a) => (
          <li key={a.id} className="rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong>Amendment {a.number}</strong>
              <span className="text-muted-foreground">{formatDate(a.createdAt.slice(0, 10))} · {a.status}</span>
            </div>
            <p className="mt-1"><span className="font-semibold">Reason:</span> {a.reason}</p>
            <ul className="mt-1 list-none text-muted-foreground">
              {a.changes.map((c, i) => <li key={i}>{c.label}: {c.previous} → {c.next}</li>)}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              {a.pdfUrl && <a href={a.pdfUrl} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">Amendment {a.number} PDF</Button></a>}
              {a.status === "Awaiting approval" && !q.data?.canApprove && <span className="self-center text-muted-foreground">Waiting for the Director to approve.</span>}
              {a.status === "Awaiting approval" && q.data?.canApprove && <Button size="sm" variant="brand" disabled={act.isPending} onClick={() => act.mutate({ kind: "approve", id: a.id })}>Approve & sign amendment</Button>}
              {a.status === "Awaiting customer signature" && a.canManage && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ kind: "resend", id: a.id })}>Resend amendment email</Button>}
              {a.canManage && (a.status === "Awaiting customer signature" || a.status === "Awaiting approval") && (
                <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ kind: "cancel", id: a.id })}>Cancel amendment</Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
