import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { downloadDraftPdf } from "@/lib/ekos.functions";
import type { FormValues } from "@/lib/forms/types";

function downloadBase64(base64: string, fileName: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Director-only. The server rejects anyone else regardless of visibility. */
export function DraftPdfButton({
  submissionId,
  getValues,
  className,
}: {
  submissionId: string;
  getValues?: () => FormValues;
  className?: string;
}) {
  const fn = useServerFn(downloadDraftPdf);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className={className}
      onClick={async () => {
        setBusy(true);
        try {
          const values = getValues?.();
          const res = await fn({ data: { submissionId, ...(values ? { values } : {}) } });
          downloadBase64(res.base64, res.fileName);
          toast.success("Draft PDF downloaded.");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "The draft PDF could not be created.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Preparing draft…" : "Download draft PDF"}
    </button>
  );
}
