import { useRouter } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusChip, chipStatus } from "@/components/StatusChip";
import { startNextForm } from "@/lib/ekos.functions";
import { FORM_TITLES } from "@/lib/forms/registry";

type Sub = Parameters<typeof chipStatus>[0];

/** One form in a sale: status chip + Start/Open. Shared by the dashboard and tracker. */
export function SaleFormCell({
  saleId,
  formType,
  sub,
  children,
}: {
  saleId: string;
  formType: string;
  sub?: NonNullable<Sub> & { id: string };
  children?: ReactNode;
}) {
  const router = useRouter();
  const nextFn = useServerFn(startNextForm);
  const open = useMutation({
    mutationFn: () => nextFn({ data: { saleId, formType } }),
    onSuccess: (res) =>
      router.navigate({
        to: "/forms/$formType/$submissionId",
        params: { formType, submissionId: res.submissionId },
      }),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs font-semibold">{FORM_TITLES[formType]}</p>
      <div className="mt-2">
        <StatusChip status={chipStatus(sub)} />
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="mt-2 px-0 text-xs"
        disabled={open.isPending}
        onClick={() => open.mutate()}
      >
        {sub ? "Open" : "Start"}
      </Button>
      {children}
    </div>
  );
}
