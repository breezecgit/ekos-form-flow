import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteSale, getMyPermissions } from "@/lib/ekos.functions";
import { FORM_TITLES } from "@/lib/forms/registry";
import { Checkbox } from "@/components/ui/checkbox";
import { deletionWarnings } from "@/lib/forms/signatures";

export function useCanDeleteSales() {
  const fn = useServerFn(getMyPermissions);
  const q = useQuery({ queryKey: ["my-permissions"], queryFn: () => fn() });
  return Boolean(q.data?.canDeleteSales);
}

/** Red "Delete sale" button with a two-step confirmation. Hidden unless the user has can_delete_sales. */
export function DeleteSaleButton({
  sale,
  formTypes,
  onDeleted,
}: {
  sale: { id: string; order_number: string; customer_name: string; park_name: string };
  formTypes: string[];
  onDeleted?: () => void;
}) {
  const allowed = useCanDeleteSales();
  const qc = useQueryClient();
  const delFn = useServerFn(deleteSale);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [typed, setTyped] = useState("");
  const [ticked, setTicked] = useState<string[] | null>(null);
  const chosen = ticked ?? formTypes;
  const whole = formTypes.length === 0 || formTypes.every((f) => chosen.includes(f));
  const warnings = whole ? [] : deletionWarnings(formTypes, chosen);
  const reset = () => {
    setStep(0);
    setTyped("");
    setTicked(null);
  };

  const del = useMutation({
    mutationFn: () =>
      delFn({ data: { saleId: sale.id, confirmOrderNumber: typed, ...(whole ? {} : { formTypes: chosen }) } }),
    onSuccess: (r) => {
      toast.success(r.wholeSale ? `Sale ${r.orderNumber} deleted` : `Deleted from ${r.orderNumber}: ${r.formsDeleted.join(", ")}`);
      reset();
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["submission"] });
      if (r.wholeSale) onDeleted?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!allowed) return null;
  const matches = typed.trim() === sale.order_number;

  return (
    <>
      <Button size="sm" variant="destructive" onClick={() => setStep(1)}>
        Delete sale
      </Button>
      <Dialog
        open={step > 0}
        onOpenChange={(o) => {
          if (!o) reset();
        }}
      >
        <DialogContent>
          {step === 1 ? (
            <>
              <DialogHeader>
                <DialogTitle>Delete this sale or some of its forms?</DialogTitle>
                <DialogDescription>
                  Untick any form you want to keep. Ticked forms, with their signatures and uploaded
                  files, are permanently deleted from this system. If every form is ticked the whole
                  sale is deleted. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="font-semibold">Order number</dt>
                <dd>{sale.order_number}</dd>
                <dt className="font-semibold">Customer</dt>
                <dd>{sale.customer_name || "—"}</dd>
                <dt className="font-semibold">Park</dt>
                <dd>{sale.park_name || "—"}</dd>
                <dt className="font-semibold">Forms</dt>
                <dd>
                  {formTypes.length ? (
                    <ul className="space-y-1">
                      {formTypes.map((f) => (
                        <li key={f} className="flex items-center gap-2">
                          <Checkbox
                            id={`del-${sale.id}-${f}`}
                            checked={chosen.includes(f)}
                            onCheckedChange={(c) =>
                              setTicked(c ? [...chosen.filter((x) => x !== f), f] : chosen.filter((x) => x !== f))
                            }
                          />
                          <label htmlFor={`del-${sale.id}-${f}`}>{FORM_TITLES[f] ?? f}</label>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    "None"
                  )}
                </dd>
              </dl>
              {warnings.length > 0 && (
                <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                  {warnings.map((w) => {
                    const [t, later] = w.split(":");
                    return (
                      <p key={w}>
                        Warning: {FORM_TITLES[t!] ?? t} is being deleted but{" "}
                        {later!.split(",").map((l) => FORM_TITLES[l] ?? l).join(", ")} will be kept. Answers
                        already carried into the kept form stay as they are.
                      </p>
                    );
                  })}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setStep(0)}>
                  Cancel
                </Button>
                <Button variant="destructive" disabled={formTypes.length > 0 && chosen.length === 0} onClick={() => setStep(2)}>
                  Continue
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Type the order number to confirm</DialogTitle>
                <DialogDescription>
                  Type <strong>{sale.order_number}</strong> exactly to permanently delete{" "}
                  {whole ? "this sale" : chosen.map((f) => FORM_TITLES[f] ?? f).join(", ")}.
                </DialogDescription>
              </DialogHeader>
              <Input
                aria-label="Order number"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={sale.order_number}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setStep(0)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={!matches || del.isPending}
                  onClick={() => del.mutate()}
                >
                  {del.isPending ? "Deleting…" : "Delete permanently"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
