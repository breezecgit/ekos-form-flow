import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CloudUpload, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getDriveBackupStatus, retryDriveBackup } from "@/lib/drive-backups.functions";

export function DriveBackupStatus({ submissionId }: { submissionId: string }) {
  const getStatus = useServerFn(getDriveBackupStatus), retry = useServerFn(retryDriveBackup);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["drive-backup", submissionId], queryFn: () => getStatus({ data: { submissionId } }), retry: false });
  const action = useMutation({ mutationFn: () => retry({ data: { submissionId } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["drive-backup", submissionId] }); toast.success("Backup retry queued."); },
    onError: () => toast.error("Drive backup could not be retried."),
  });
  if (!q.data?.enabled) return null;
  return <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
    <CloudUpload className="h-4 w-4" aria-hidden="true" />
    {q.data.failed || q.data.unavailable ? <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate()}>
      <RotateCw className="mr-2 h-3 w-3" />Drive backup failed – retry
    </Button> : <span>{q.data.pending ? "Drive backup pending" : q.data.done ? "Drive backup saved" : "Drive backup awaiting live-sale confirmation"}</span>}
  </div>;
}