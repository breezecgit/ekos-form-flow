import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { SaleFormCell } from "@/components/SaleFormCell";
import { useAuth } from "@/hooks/useAuth";
import { createSale, getBootstrap, listSales } from "@/lib/ekos.functions";
import { FORM_ORDER, FORM_TITLES } from "@/lib/forms/registry";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "My sales | EKOS Customer Sales Form" },
      {
        name: "description",
        content: "Start a new sale, continue an existing sale and pick up saved drafts.",
      },
      { property: "og:title", content: "My sales | EKOS Customer Sales Form" },
      {
        property: "og:description",
        content: "Start a new sale, continue an existing sale and pick up saved drafts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !session) router.navigate({
        to: "/auth",
        search: { redirect: window.location.pathname + window.location.search },
      });
  }, [loading, session, router]);

  const bootstrapFn = useServerFn(getBootstrap);
  const listFn = useServerFn(listSales);
  const createFn = useServerFn(createSale);

  const me = useQuery({
    queryKey: ["bootstrap"],
    queryFn: () => bootstrapFn(),
    enabled: Boolean(session),
  });
  const sales = useQuery({
    queryKey: ["sales"],
    queryFn: () => listFn(),
    enabled: Boolean(session),
  });

  const newSale = useMutation({
    mutationFn: () => createFn(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      router.navigate({
        to: "/forms/$formType/$submissionId",
        params: { formType: "reservation", submissionId: res.submissionId },
      });
    },
  });

  const submissions = sales.data?.submissions ?? [];
  const drafts = submissions.filter((s) => s.is_draft);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader isDirector={me.data?.isDirector} email={me.data?.email} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="ekos-title text-2xl">My sales</h1>
          <Button variant="gold" onClick={() => newSale.mutate()} disabled={newSale.isPending}>
            {newSale.isPending ? "Starting…" : "Start new sale"}
          </Button>
        </div>

        {drafts.length > 0 && (
          <section className="mt-8">
            <h2 className="ekos-title text-lg">My drafts</h2>
            <ul className="mt-3 space-y-2">
              {drafts.map((d) => {
                const sale = sales.data?.sales.find((s) => s.id === d.sale_id);
                return (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3"
                  >
                    <div className="text-sm">
                      <span className="font-semibold">{FORM_TITLES[d.form_type]}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {sale?.order_number} · {sale?.customer_name || "New customer"}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="resume"
                      onClick={() =>
                        router.navigate({
                          to: "/forms/$formType/$submissionId",
                          params: { formType: d.form_type, submissionId: d.id },
                        })
                      }
                    >
                      Resume
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="mt-8">
          <h2 className="ekos-title text-lg">Continue a sale</h2>
          {sales.isLoading && <p className="mt-3 text-sm text-muted-foreground">Loading…</p>}
          {sales.data?.sales.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              No sales yet. Use “Start new sale” to begin a Customer Reservation Form.
            </p>
          )}
          <div className="mt-3 space-y-4">
            {(sales.data?.sales ?? []).map((sale) => (
              <div key={sale.id} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="font-semibold text-brand">{sale.order_number}</span>
                  <span>{sale.customer_name || "—"}</span>
                  <span className="text-sm text-muted-foreground">{sale.park_name || "—"}</span>
                  <span className="text-sm text-muted-foreground">{sale.sales_person || "—"}</span>
                  <span className="text-sm text-muted-foreground">
                    {sale.deposit_date ? formatDate(sale.deposit_date) : ""}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {FORM_ORDER.map((formType) => (
                    <SaleFormCell
                      key={formType}
                      saleId={sale.id}
                      formType={formType}
                      sub={submissions.find(
                        (s) => s.sale_id === sale.id && s.form_type === formType,
                      )}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
