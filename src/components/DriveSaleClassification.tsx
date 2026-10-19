import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Switch } from "@/components/ui/switch";
import { getDriveSaleClassification, setDriveSaleClassification } from "@/lib/drive-backups.functions";
import { toast } from "sonner";

export function DriveSaleClassification({ submissionId }: { submissionId: string }) {
  const read = useServerFn(getDriveSaleClassification), save = useServerFn(setDriveSaleClassification);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["drive-sale", submissionId], queryFn: () => read({ data: { submissionId } }), retry: false });
  const mutation = useMutation({ mutationFn: (isTest: boolean) => save({ data: { submissionId, isTest } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["drive-sale", submissionId] }); qc.invalidateQueries({ queryKey: ["drive-backup", submissionId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!q.data) return null;
  return <label className="mt-4 flex items-center gap-3 text-sm">
    <Switch checked={q.data.isTest} disabled={q.data.automatic || mutation.isPending} onCheckedChange={v => mutation.mutate(v)} />
    Mark as test sale (exclude from Drive backup)
  </label>;
}