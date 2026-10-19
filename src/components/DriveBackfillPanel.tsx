import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { CloudUpload, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { previewDriveBackfill, enqueueDriveBackfill } from "@/lib/drive-backups.functions";

export function DriveBackfillPanel() {
  const [orders, setOrders] = useState("");
  const [reviewed, setReviewed] = useState<Array<{ id: string; order_number: string; customer_name: string; park_name: string; excluded: boolean }> | null>(null);
  const preview = useServerFn(previewDriveBackfill), enqueue = useServerFn(enqueueDriveBackfill);
  const numbers = () => [...new Set(orders.split(/[\s,;]+/).filter(Boolean))];
  const check = useMutation({ mutationFn: () => preview({ data: { orderNumbers: numbers() } }),
    onSuccess: setReviewed, onError: () => toast.error("The backfill preview could not be read."),
  });
  const copy = useMutation({ mutationFn: () => enqueue({ data: { orderNumbers: numbers(), confirmLiveSales: true } }),
    onSuccess: () => { toast.success("Live-sales backups queued."); setReviewed(null); },
    onError: () => toast.error("Backups are disabled or the approved sales could not be queued."),
  });
  return <details className="mt-4 border-t pt-3 text-sm">
    <summary className="cursor-pointer font-semibold">Existing live-sales backups</summary>
    <div className="mt-3 flex flex-wrap gap-2">
      <Input aria-label="Live order numbers" placeholder="EKOS-00001, EKOS-00002" value={orders} onChange={e => { setOrders(e.target.value); setReviewed(null); }} className="max-w-sm" />
      <Button variant="outline" size="sm" disabled={check.isPending || !orders.trim()} onClick={() => check.mutate()}><Search className="mr-2 h-4 w-4" />Review sales</Button>
    </div>
    {reviewed && <div className="mt-3 space-y-2">
      <ul>{reviewed.map(s => <li key={s.id}>{s.order_number} · {s.customer_name} · {s.park_name}{s.excluded ? " · Test sale — excluded" : ""}</li>)}</ul>
      <Button size="sm" variant="outline" disabled={copy.isPending || reviewed.length !== numbers().length || reviewed.some(s => s.excluded)} onClick={() => copy.mutate()}>
        <CloudUpload className="mr-2 h-4 w-4" />Confirm these are live sales and queue backups
      </Button>
    </div>}
  </details>;
}