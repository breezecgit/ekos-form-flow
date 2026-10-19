import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/jobs/drive-backups")({
  server: { handlers: { POST: async ({ request }) => {
    const authFailure = await authenticateCronRequest(request);
    if (authFailure) return authFailure;
    try {
      const { processBackupBatch } = await import("@/lib/drive-backups.server");
      return Response.json(await processBackupBatch());
    } catch {
      return Response.json({ error: "Backup processing unavailable" }, { status: 503 });
    }
  } } },
});