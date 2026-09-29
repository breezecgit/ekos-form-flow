import { createFileRoute, Link } from "@tanstack/react-router";
import logo from "@/assets/ekos-logo.png";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EKOS Group Customer Sales Forms" },
      {
        name: "description",
        content:
          "Staff portal for EKOS Group park home sales paperwork: reservations, identification checks, order forms and written statements.",
      },
      { property: "og:title", content: "EKOS Group Customer Sales Forms" },
      {
        property: "og:description",
        content:
          "Staff portal for EKOS Group park home sales paperwork: reservations, identification checks, order forms and written statements.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <div className="bg-brand py-10 text-center">
        <img src={logo} alt="EKOS Group" className="mx-auto h-16 w-auto brightness-0 invert" />
      </div>
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="ekos-title text-3xl">Customer Sales Forms</h1>
        <p className="mt-4 text-muted-foreground">
          The EKOS Group sales paperwork portal. Staff sign in to start a reservation, continue a
          sale, or review submissions.
        </p>
        <div className="mt-8">
          <Link to="/auth">
            <Button variant="gold" size="lg">
              Staff login
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
