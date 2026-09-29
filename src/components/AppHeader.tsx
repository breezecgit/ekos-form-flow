import { Link, useRouter } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import logo from "@/assets/ekos-logo.png";
import { supabase } from "@/integrations/supabase/client";

const SITE = "https://ekosgroup.co.uk";
const NAV: Array<{ label: string; href: string; dropdown?: boolean }> = [
  { label: "Our Parks", href: `${SITE}/our-parks/`, dropdown: true },
  { label: "About Us", href: `${SITE}/about-us/`, dropdown: true },
  { label: "Your Move", href: `${SITE}/your-move/`, dropdown: true },
  { label: "Events", href: `${SITE}/events/` },
  { label: "Contact Us", href: `${SITE}/contact-us/` },
];

/**
 * Header matching ekosgroup.co.uk: full-width dark green bar, roundel logo in a
 * rounded tab hanging below the bar, centred caps nav. Staff menu on the right
 * (omitted on the public signing pages).
 */
export function AppHeader({
  isDirector,
  email,
  publicPage = false,
}: {
  isDirector?: boolean | undefined;
  email?: string | undefined;
  publicPage?: boolean;
}) {
  const router = useRouter();
  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  };

  const logoImg = <img src={logo} alt="EKOS Group" className="h-16 w-16 object-contain" />;

  return (
    <header className="relative z-20 bg-ekos-nav text-brand-foreground">
      <div className="mx-auto flex h-20 max-w-[1140px] items-center gap-6 px-4">
        <div className="relative h-20 w-28 shrink-0">
          <div className="absolute left-0 top-2 flex h-28 w-28 items-center justify-center rounded-b-3xl rounded-t-xl bg-ekos-nav">
            {publicPage ? (
              <a href={SITE}>{logoImg}</a>
            ) : (
              <Link to="/dashboard">{logoImg}</Link>
            )}
          </div>
        </div>
        <nav className="hidden flex-1 items-center justify-center gap-7 lg:flex">
          {NAV.map((n) => (
            <a
              key={n.label}
              href={n.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 font-heading text-[13px] font-medium uppercase tracking-[0.14em] opacity-95 hover:text-gold"
            >
              {n.label}
              {n.dropdown && <ChevronDown className="h-3.5 w-3.5" />}
            </a>
          ))}
        </nav>
        {!publicPage && (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[13px] lg:ml-0">
            <Link to="/dashboard" className="opacity-90 hover:text-gold">
              My dashboard
            </Link>
            {isDirector && (
              <>
                <Link to="/admin" className="opacity-90 hover:text-gold">Tracker</Link>
                <Link to="/admin/settings" className="opacity-90 hover:text-gold">Settings</Link>
                <Link to="/admin/emails" className="opacity-90 hover:text-gold">Email log</Link>
              </>
            )}
            {email && <span className="hidden text-xs opacity-70 xl:inline">{email}</span>}
            <button type="button" onClick={signOut} className="ekos-btn px-3 py-1.5 text-[13px]">
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
