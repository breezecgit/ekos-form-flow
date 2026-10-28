import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getSubmission } from "@/lib/ekos.functions";
import type { FormValues } from "@/lib/forms/types";

function useWordDownload(submissionId: string) {
  const getFn = useServerFn(getSubmission);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const res = await getFn({ data: { submissionId } });
      const { buildWrittenStatementDocx } = await import("@/lib/word/written-statement-docx");
      const values = (res.submission.data ?? {}) as FormValues;
      const plans = Array.isArray(values["pitch_plan"]) ? values["pitch_plan"] as { name: string; path: string; mime: string }[] : [];
      const pitchPlans = await Promise.all(plans.map(async (plan) => {
        const url = res.fileUrls[plan.path];
        if (!url) throw new Error("The pitch plan could not be included. Please retry.");
        if (!["image/png", "image/jpeg"].includes(plan.mime)) return { name: plan.name, mime: plan.mime, url };
        const response = await fetch(url);
        if (!response.ok) throw new Error("The pitch plan could not be included. Please retry.");
        return { name: plan.name, mime: plan.mime, bytes: new Uint8Array(await response.arrayBuffer()) };
      }));
      const blob = await buildWrittenStatementDocx({
        values,
        templates: res.statement?.sections ?? null,
        orderNumber: res.submission.order_number,
        pitchPlans,
      });
      const name = [values["customer_name"], values["park_name"], res.submission.order_number]
        .filter(Boolean)
        .join(" - ");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Your Written Statement - ${name}.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}

export function WordDownloadButton({ submissionId }: { submissionId: string }) {
  const { run, busy } = useWordDownload(submissionId);
  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={run}>
      {busy ? "Preparing…" : "Download Word version (.docx)"}
    </Button>
  );
}

export function WordDownloadLink({ submissionId }: { submissionId: string }) {
  const { run, busy } = useWordDownload(submissionId);
  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="mt-2 mr-3 inline-block text-xs text-brand underline"
    >
      {busy ? "Preparing…" : "Download Word version (.docx)"}
    </button>
  );
}
