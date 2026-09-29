import { Outlet, createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { getBootstrap } from "@/lib/ekos.functions";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const router = useRouter();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading && !session) router.navigate({ to: "/auth" });
  }, [loading, session, router]);

  const bootstrapFn = useServerFn(getBootstrap);
  const me = useQuery({
    queryKey: ["bootstrap"],
    queryFn: () => bootstrapFn(),
    enabled: Boolean(session),
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader isDirector={me.data?.isDirector} email={me.data?.email} />
      {me.data?.emailTestMode.enabled && (
        <div className="bg-warning px-4 py-2 text-center text-sm font-semibold text-warning-foreground">
          Email test mode is ON – all emails go to {me.data.emailTestMode.recipient}
        </div>
      )}
      {me.data && !me.data.isDirector ? (
        <p className="p-8 text-center text-muted-foreground">
          This area is for the Director only.
        </p>
      ) : (
        <Outlet />
      )}
    </div>
  );
}
