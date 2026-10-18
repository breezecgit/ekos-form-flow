import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import logo from "@/assets/ekos-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Staff login | EKOS Customer Sales Form" },
      {
        name: "description",
        content: "Sign in to the EKOS Group sales forms portal to create and review customer paperwork.",
      },
      { property: "og:title", content: "Staff login | EKOS Customer Sales Form" },
      {
        property: "og:description",
        content: "Sign in to the EKOS Group sales forms portal to create and review customer paperwork.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { redirect?: string } =>
    typeof s["redirect"] === "string" && s["redirect"].startsWith("/") && !s["redirect"].startsWith("//")
      ? { redirect: s["redirect"] }
      : {},
  component: AuthPage,
});

function goAfterLogin(redirect: string | undefined) {
  if (redirect) window.location.assign(redirect);
}

function AuthPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const { redirect } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      if (redirect) goAfterLogin(redirect);
      else router.navigate({ to: "/dashboard" });
    }
  }, [loading, session, router, redirect]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else if (redirect) goAfterLogin(redirect);
      else router.navigate({ to: "/dashboard" });
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: { full_name: fullName },
        },
      });
      if (error) setMessage(error.message);
      else setMessage("Account created. Check your inbox to confirm your email, then sign in.");
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-brand py-8 text-center">
        <img src={logo} alt="EKOS Group" className="mx-auto h-14 w-auto" />
      </div>
      <main className="mx-auto max-w-md px-4 py-10">
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="ekos-title text-2xl">
            {mode === "signin" ? "Staff login" : "Create your staff account"}
          </h1>
          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <div>
                <label className="ekos-label" htmlFor="fullName">
                  Full name
                </label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            )}
            <div>
              <label className="ekos-label" htmlFor="email">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="ekos-label" htmlFor="password">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            {message && <p className="text-sm text-destructive">{message}</p>}
            <Button type="submit" variant="gold" className="w-full" disabled={busy}>
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <p className="mt-4 text-xs text-muted-foreground">
            Accounts are by invitation only. Please contact EKOS Group if you need staff access.
          </p>
        </div>
      </main>
    </div>
  );
}
