import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { StatusChip, chipStatus } from "@/components/StatusChip";
import { listSales } from "@/lib/ekos.functions";
import { FORM_ORDER, FORM_TITLES } from "@/lib/forms/registry";
import { formatDate } from "@/lib/format";
import { WordDownloadLink } from "@/components/WordDownload";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Sales tracker | EKOS Group" },
      {
        name: "description",
        content: "Track every EKOS Group sale and the status of each form in the sales pack.",
      },
      { property: "og:title", content: "Sales tracker | EKOS Group" },
      {
        property: "og:description",
        content: "Track every EKOS Group sale and the status of each form in the sales pack.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Tracker,
});

function Tracker() {
  const listFn = useServerFn(listSales);
  const { data } = useQuery({ queryKey: ["sales"], queryFn: () => listFn() });
  const [search, setSearch] = useState("");
  const [park, setPark] = useState("");
  const [person, setPerson] = useState("");
  const [status, setStatus] = useState("");

  const subs = data?.submissions ?? [];

  const rows = useMemo(() => {
    return (data?.sales ?? []).filter((s) => {
      const q = search.trim().toLowerCase();
      if (
        q &&
        !`${s.customer_name} ${s.order_number}`.toLowerCase().includes(q)
      )
        return false;
      if (park && s.park_name !== park) return false;
      if (person && s.sales_person !== person) return false;
      if (status) {
        const has = FORM_ORDER.some(
          (f) => chipStatus(subs.find((x) => x.sale_id === s.id && x.form_type === f)) === status,
        );
        if (!has) return false;
      }
      return true;
    });
  }, [data, search, park, person, status, subs]);

  const parks = Array.from(new Set((data?.sales ?? []).map((s) => s.park_name).filter(Boolean)));
  const people = Array.from(
    new Set((data?.sales ?? []).map((s) => s.sales_person).filter(Boolean)),
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="ekos-title text-2xl">Sales tracker</h1>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Input
          placeholder="Search customer or order number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={park}
          onChange={(e) => setPark(e.target.value)}
        >
          <option value="">All parks</option>
          {parks.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={person}
          onChange={(e) => setPerson(e.target.value)}
        >
          <option value="">All sales people</option>
          {people.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {[
            "Not started",
            "Draft",
            "In Review",
            "In Review (Offsite)",
            "Awaiting customer signature",
            "Awaiting construction sign-off",
            "Awaiting Director & Witness signatures",
            "Disapproved",
            "Completed",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="mt-6 space-y-4">
        {rows.map((sale) => (
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
              {FORM_ORDER.map((formType) => {
                const sub = subs.find((s) => s.sale_id === sale.id && s.form_type === formType);
                return (
                  <div key={formType} className="rounded-lg border p-3">
                    <p className="text-xs font-semibold">{FORM_TITLES[formType]}</p>
                    <div className="mt-2">
                      <StatusChip status={chipStatus(sub)} />
                    </div>
                    {sub && formType === "written_statement" && (
                      <WordDownloadLink submissionId={sub.id} />
                    )}
                    {sub && (
                      <Link
                        to="/admin/submissions/$id"
                        params={{ id: sub.id }}
                        className="mt-2 inline-block text-xs text-brand underline"
                      >
                        View
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No sales found.</p>}
      </div>
    </main>
  );
}
