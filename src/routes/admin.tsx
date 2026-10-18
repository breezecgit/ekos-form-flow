import { Outlet, createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { getBootstrap } from "@/lib/ekos.functions";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const router = useRouter();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading && !session) router.navigate({
        to: "/auth",
        search: { redirect: window.location.pathname + window.location.search },
      });
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
      {me.isError ? (
        <main className="mx-auto max-w-2xl px-4 py-12 text-center" role="alert">
          <h1 className="ekos-title text-2xl">Your account couldn’t be loaded</h1>
          <p className="mt-4 text-muted-foreground">{me.error.message}</p>
          <Button className="mt-6" variant="brand" onClick={() => me.refetch()}>Try again</Button>
        </main>
      ) : !me.data ? (
        <p className="p-8 text-center text-muted-foreground">Loading…</p>
      ) : !me.data.isDirector ? (
        <p className="p-8 text-center text-muted-foreground">
          This area is for the Director only.
        </p>
      ) : (
        <Outlet />
      )}
    </div>
  );
}
