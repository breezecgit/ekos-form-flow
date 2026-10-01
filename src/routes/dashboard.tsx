import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { StatusChip, chipStatus } from "@/components/StatusChip";
import { formatMoney, parseMoney } from "@/lib/format";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { createSale, getBootstrap, listSales } from "@/lib/ekos.functions";
import { FORM_ORDER, FORM_TITLES } from "@/lib/forms/registry";

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

        {sales.data && (
          <Overview
            sales={sales.data.sales}
            submissions={submissions}
            isDirector={Boolean(me.data?.isDirector)}
          />
        )}

      </main>
    </div>
  );
}

type SaleRow = { id: string; order_number: string; customer_name: string; park_name: string };
type SubRow = {
  id: string;
  sale_id: string;
  form_type: string;
  status: string;
  is_draft: boolean;
  customer_signed_at: string | null;
  construction_signed_at: string | null;
  created_at?: string;
  submitted_at?: string | null;
  updated_at?: string;
  total_cost?: string | null;
};

const REVIEW_STATES = new Set([
  "In Review",
  "In Review (Offsite)",
  "Awaiting Director & Witness signatures",
]);

function Overview({
  sales,
  submissions,
  isDirector,
}: {
  sales: SaleRow[];
  submissions: SubRow[];
  isDirector: boolean;
}) {
  const [park, setPark] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const parks = useMemo(
    () => Array.from(new Set(sales.map((s) => s.park_name).filter(Boolean))).sort(),
    [sales],
  );
  const saleById = useMemo(() => new Map(sales.map((s) => [s.id, s])), [sales]);

  // Orders = submitted Customer Reservation Forms, dated by when the form was filled in.
  const orders = useMemo(
    () =>
      submissions
        .filter((s) => s.form_type === "reservation" && !s.is_draft)
        .filter((s) => {
          const sale = saleById.get(s.sale_id);
          if (!sale) return false;
          if (park && sale.park_name !== park) return false;
          const d = (s.submitted_at ?? s.created_at ?? "").slice(0, 10);
          if (from && d < from) return false;
          if (to && d > to) return false;
          return true;
        }),
    [submissions, saleById, park, from, to],
  );
  const total = orders.reduce((sum, s) => sum + (parseMoney(s.total_cost) ?? 0), 0);
  const tbc = orders.filter((s) => parseMoney(s.total_cost) === null).length;

  const parkSaleIds = new Set(
    sales.filter((s) => !park || s.park_name === park).map((s) => s.id),
  );
  const stages = new Map<string, { formType: string; status: string; count: number }>();
  for (const s of submissions) {
    if (!parkSaleIds.has(s.sale_id)) continue;
    const st = chipStatus(s);
    if (st === "Completed") continue;
    const key = `${s.form_type}|${st}`;
    const cur = stages.get(key) ?? { formType: s.form_type, status: st, count: 0 };
    cur.count++;
    stages.set(key, cur);
  }
  const stageList = Array.from(stages.values()).sort(
    (a, b) => FORM_ORDER.indexOf(a.formType as never) - FORM_ORDER.indexOf(b.formType as never),
  );

  const toReview = submissions.filter(
    (s) => parkSaleIds.has(s.sale_id) && REVIEW_STATES.has(chipStatus(s)),
  );

  return (
    <section className="mt-6 space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <label className="text-sm">
          <span className="block text-muted-foreground">Park</span>
          <select
            className="mt-1 h-9 rounded-md border bg-background px-2"
            value={park}
            onChange={(e) => setPark(e.target.value)}
          >
            <option value="">All parks</option>
            {parks.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-muted-foreground">From</span>
          <input type="date" className="mt-1 h-9 rounded-md border bg-background px-2" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="block text-muted-foreground">To</span>
          <input type="date" className="mt-1 h-9 rounded-md border bg-background px-2" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        {(park || from || to) && (
          <Button size="sm" variant="outline" onClick={() => { setPark(""); setFrom(""); setTo(""); }}>
            Clear
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <div className="text-sm text-muted-foreground">Total sales {park ? `· ${park}` : "· all parks"}</div>
          <div className="mt-1 text-3xl font-semibold text-brand">{formatMoney(total) || "£0"}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            From Total Cost on submitted Customer Reservation Forms{tbc ? ` · ${tbc} TBC not counted` : ""}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <div className="text-sm text-muted-foreground">Total orders {park ? `· ${park}` : "· all parks"}</div>
          <div className="mt-1 text-3xl font-semibold text-brand">{orders.length}</div>
          <div className="mt-1 text-xs text-muted-foreground">Submitted Customer Reservation Forms in this period</div>
        </div>
      </div>

      {isDirector && (
        <div className="rounded-xl border bg-card p-4">
          <h2 className="ekos-title text-lg">Incomplete actions – needs your review ({toReview.length})</h2>
          {toReview.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nothing waiting for review.</p>
          ) : (
            <ul className="mt-3 divide-y">
              {toReview.map((s) => {
                const sale = saleById.get(s.sale_id);
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <div className="text-sm">
                      <span className="font-semibold text-brand">{sale?.order_number}</span>{" "}
                      · {FORM_TITLES[s.form_type]} · {sale?.customer_name || "—"} · {sale?.park_name || "—"}{" "}
                      <StatusChip status={chipStatus(s)} />
                    </div>
                    <Button asChild size="sm" variant="gold">
                      <Link to="/admin/submissions/$id" params={{ id: s.id }}>Review</Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className="rounded-xl border bg-card p-4">
        <h2 className="ekos-title text-lg">Orders in process</h2>
        {stageList.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No forms in process.</p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {stageList.map((st) => (
              <div key={st.formType + st.status} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                <div className="text-sm">
                  <div className="font-medium">{FORM_TITLES[st.formType]}</div>
                  <StatusChip status={st.status} />
                </div>
                <span className="text-2xl font-semibold text-brand">{st.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
