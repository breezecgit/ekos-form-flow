import { Link, useRouter } from "@tanstack/react-router";
import logo from "@/assets/ekos-logo.png";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export function AppHeader({
  isDirector,
  email,
}: {
  isDirector?: boolean | undefined;
  email?: string | undefined;
}) {
  const router = useRouter();
  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  };

  return (
    <header className="bg-brand text-brand-foreground">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
        <Link to="/dashboard" className="flex items-center gap-3">
          <img src={logo} alt="EKOS Group" className="h-10 w-auto" />
        </Link>
        <nav className="flex flex-1 flex-wrap items-center gap-4 text-sm">
          <Link to="/dashboard" className="opacity-90 hover:opacity-100">
            My dashboard
          </Link>
          {isDirector && (
            <>
              <Link to="/admin" className="opacity-90 hover:opacity-100">
                Tracker
              </Link>
              <Link to="/admin/settings" className="opacity-90 hover:opacity-100">
                Settings
              </Link>
              <Link to="/admin/emails" className="opacity-90 hover:opacity-100">
                Email log
              </Link>
            </>
          )}
        </nav>
        {email && <span className="text-xs opacity-75">{email}</span>}
        <Button size="sm" variant="gold" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </header>
  );
}
