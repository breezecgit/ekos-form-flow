import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { z } from "zod";

export const Route = createFileRoute("/api/public/jobs/drive-backups")({
  server: { handlers: { POST: async ({ request }) => {
    const authFailure = await authenticateCronRequest(request);
    if (authFailure) return authFailure;
    const input = z.object({ kind: z.literal("drive-backups") }).safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ error: "Invalid backup request" }, { status: 400 });
    try {
      const { processBackupBatch } = await import("@/lib/drive-backups.server");
      return Response.json(await processBackupBatch());
    } catch {
      return Response.json({ error: "Backup processing unavailable" }, { status: 503 });
    }
  } } },
});