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

  const del = useMutation({
    mutationFn: () => delFn({ data: { saleId: sale.id, confirmOrderNumber: typed } }),
    onSuccess: (r) => {
      toast.success(`Sale ${r.orderNumber} deleted`);
      setStep(0);
      setTyped("");
      qc.invalidateQueries({ queryKey: ["sales"] });
      onDeleted?.();
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
          if (!o) {
            setStep(0);
            setTyped("");
          }
        }}
      >
        <DialogContent>
          {step === 1 ? (
            <>
              <DialogHeader>
                <DialogTitle>Delete this sale?</DialogTitle>
                <DialogDescription>
                  This permanently deletes the sale and all its forms, signatures and uploaded files
                  from this system. It cannot be undone.
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
                    <ul className="list-disc pl-4">
                      {formTypes.map((f) => (
                        <li key={f}>{FORM_TITLES[f] ?? f}</li>
                      ))}
                    </ul>
                  ) : (
                    "None"
                  )}
                </dd>
              </dl>
              <DialogFooter>
                <Button variant="outline" onClick={() => setStep(0)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={() => setStep(2)}>
                  Continue
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Type the order number to confirm</DialogTitle>
                <DialogDescription>
                  Type <strong>{sale.order_number}</strong> exactly to permanently delete this sale.
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
