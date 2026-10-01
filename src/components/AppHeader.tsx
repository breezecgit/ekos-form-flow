import { Link, useRouter } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import logo from "@/assets/ekos-logo.png";
import { supabase } from "@/integrations/supabase/client";

const SITE = "https://ekosgroup.co.uk";
type Sub = [string, string];
const NAV: Array<{ label: string; href: string; items?: Sub[] }> = [
  {
    label: "Our Parks",
    href: `${SITE}/our-parks/`,
    items: [
      ["Carlton Manor – Lowestoft, Suffolk", "carlton-manor"],
      ["Castle View Court – Pevensey, East Sussex", "castle-view-court"],
      ["Coastal Retreat – Weston-Super-Mare, Somerset", "coastal-retreat"],
      ["Dales View – Barnoldswick, Lancashire", "dales-view"],
      ["Happy Valley – Laleston, Bridgend", "happy-valley"],
      ["Harvey’s Nurseries – Emmer Green, Reading", "harveys-nurseries"],
      ["Haveringland Hall – Cawston, Norwich", "haveringland-hall"],
      ["Merry Hill – Norwich, Norfolk", "merry-hill"],
      ["Outhill View – Studley, Warwickshire", "outhill-view"],
      ["Sun Valley – St Austell, Cornwall", "sun-valley"],
      ["Walworth Retreat – Darlington, County Durham", "walworth-retreat"],
      ["Widemouth Sands – Widemouth Bay Bude", "widemouth-sands"],
    ],
  },
  {
    label: "About Us",
    href: `${SITE}/about-us/`,
    items: [["Blog", "blog"], ["In The News", "in-the-news"], ["FAQ’s", "faqs"]],
  },
  {
    label: "Your Move",
    href: `${SITE}/your-move/`,
    items: [
      ["House Types", "ekos-house-types"],
      ["Park Homes For Sale", "residential-park-homes-for-sale"],
      ["Part Exchange", "part-exchange"],
      ["Managed Move", "managed-move"],
      ["Our Offers", "our-offers"],
    ],
  },
  { label: "Events", href: `${SITE}/events/` },
  { label: "Contact Us", href: `${SITE}/contact/` },
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
    <>
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
            <div key={n.label} className="group relative flex h-20 items-center">
              <a
                href={n.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 whitespace-nowrap font-heading text-[11px] font-medium uppercase tracking-[0.12em] opacity-95 hover:text-gold"
              >
                {n.label}
                {n.items && <ChevronDown className="h-3.5 w-3.5" />}
              </a>
              {n.items && (
                <div className="invisible absolute left-1/2 top-full z-30 min-w-[280px] -translate-x-1/2 bg-ekos-nav py-2 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100">
                  {n.items.map(([label, slug]) => (
                    <a
                      key={slug}
                      href={`${SITE}/${slug}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block whitespace-nowrap px-5 py-2 text-[12px] hover:text-gold"
                    >
                      {label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
        {!publicPage && (
          <div className="flex items-center gap-4 whitespace-nowrap">
            {email && (
              <span className="max-w-[220px] truncate text-[12px] text-gold" title={email}>
                {email}
              </span>
            )}
            <Link to="/dashboard" className="py-1 font-heading text-[11px] font-medium uppercase tracking-[0.12em] opacity-95 hover:text-gold">
              Dashboard
            </Link>
            {isDirector && (
              <>
                <Link to="/admin" className="py-1 font-heading text-[11px] font-medium uppercase tracking-[0.12em] opacity-95 hover:text-gold">
                  Tracker
                </Link>
                <Link to="/admin/settings" className="py-1 font-heading text-[11px] font-medium uppercase tracking-[0.12em] opacity-95 hover:text-gold">
                  Settings
                </Link>
                <Link to="/admin/emails" className="py-1 font-heading text-[11px] font-medium uppercase tracking-[0.12em] opacity-95 hover:text-gold">
                  Emails
                </Link>
              </>
            )}
            <button type="button" onClick={signOut} className="ekos-btn px-3 py-1.5 text-[13px]">
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
    {/* clears the logo tab that hangs below the bar */}
    <div aria-hidden className="h-16" />
    </>

  );
}
