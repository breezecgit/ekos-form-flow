import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { chipStatus, statusLabel } from "@/components/StatusChip";
import { SaleFormCell } from "@/components/SaleFormCell";
import { DeleteSaleButton } from "@/components/DeleteSaleButton";
import { listSales } from "@/lib/ekos.functions";
import { FORM_ORDER, FORM_TITLES } from "@/lib/forms/registry";
import { formatDate, shortDate } from "@/lib/format";
import { WordDownloadLink } from "@/components/WordDownload";
import { saleStage } from "@/lib/sale-stage";

function stageLabel(s: string | null) {
  if (!s) return "Not started";
  if (s === "Completed") return "Completed";
  return FORM_TITLES[s as keyof typeof FORM_TITLES] ?? s;
}

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Sales tracker | EKOS Customer Sales Form" },
      {
        name: "description",
        content: "Track every EKOS Group sale and the status of each form in the sales pack.",
      },
      { property: "og:title", content: "Sales tracker | EKOS Customer Sales Form" },
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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const subs = data?.submissions ?? [];

  const rows = useMemo(() => {
    const fromStart = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toEnd = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
    return (data?.sales ?? []).filter((s) => {
      const q = search.trim().toLowerCase();
      if (
        q &&
        !`${s.customer_name} ${s.order_number}`.toLowerCase().includes(q)
      )
        return false;
      if (park && s.park_name !== park) return false;
      if (person && s.sales_person !== person) return false;
      if (fromStart !== null || toEnd !== null) {
        const t = timeline(s, subs);
        const started = new Date(t.started).getTime();
        const lastUpdate = new Date(t.lastUpdate).getTime();
        // Show the sale if its life overlaps the selected range.
        if (fromStart !== null && lastUpdate < fromStart) return false;
        if (toEnd !== null && started > toEnd) return false;
      }
      if (status && saleStage(s.id, subs) !== status) return false;
      return true;
    });
  }, [data, search, park, person, status, from, to, subs]);

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
          <option value="">All stages</option>
          {[...FORM_ORDER, "Completed"].map((s) => (
            <option key={s} value={s}>
              {stageLabel(s)}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Date range</span>
        <input
          type="date"
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label="From date"
        />
        <span className="text-sm text-muted-foreground">to</span>
        <input
          type="date"
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label="To date"
        />
        {(from || to) && (
          <button
            type="button"
            className="text-sm text-brand underline"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            Clear
          </button>
        )}
        <span className="text-xs text-muted-foreground">
          Shows sales that were active between these dates
        </span>
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
              {(() => {
                const t = timeline(sale, subs);
                return (
                  <>
                    <span className="text-sm text-muted-foreground">
                      Started: <span className="text-foreground">{shortDate(t.started)}</span>
                    </span>
                    <span className="text-sm text-muted-foreground">
                      Last update: <span className="text-foreground">{shortDate(t.lastUpdate)}</span>
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {t.complete ? "Completed in" : "Days running"}:{" "}
                      <span className="font-medium text-foreground">
                        {t.days} {t.days === 1 ? "day" : "days"}
                      </span>
                    </span>
                  </>
                );
              })()}
              <span className="ml-auto">
                <DeleteSaleButton
                  sale={sale}
                  formTypes={FORM_ORDER.filter((f) =>
                    subs.some((x) => x.sale_id === sale.id && x.form_type === f),
                  )}
                />
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-semibold not-italic text-brand">
                Stage: {stageLabel(saleStage(sale.id, subs))}
              </span>{" "}
              <span className="italic">{timeline(sale, subs).summary}</span>
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {FORM_ORDER.map((formType) => {
                const sub = subs.find((s) => s.sale_id === sale.id && s.form_type === formType);
                return (
                  <SaleFormCell key={formType} saleId={sale.id} formType={formType} sub={sub}>
                    {sub && formType === "written_statement" && (
                      <WordDownloadLink submissionId={sub.id} />
                    )}
                    {sub && (
                      <Link
                        to="/admin/submissions/$id"
                        params={{ id: sub.id }}
                        className="ml-3 mt-2 inline-block text-xs text-brand underline"
                      >
                        View
                      </Link>
                    )}
                  </SaleFormCell>
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

type TSub = {
  sale_id: string;
  form_type: string;
  status: string;
  is_draft: boolean;
  customer_signed_at: string | null;
  construction_signed_at?: string | null;
  updated_at: string;
  created_at: string;
  submitted_at?: string | null;
};

const DAY = 86_400_000;

/** Sale timeline: start, last update, days running (frozen once every form is Completed), summary. */
function timeline(sale: { id: string; created_at: string }, all: TSub[]) {
  const subs = all.filter((s) => s.sale_id === sale.id);
  const started = sale.created_at;
  const latest = subs.reduce<TSub | null>(
    (a, s) => (!a || s.updated_at > a.updated_at ? s : a),
    null,
  );
  const lastUpdate = latest?.updated_at ?? started;
  const complete =
    FORM_ORDER.every((f) => subs.find((s) => s.form_type === f)?.status === "Completed");
  const end = complete ? new Date(lastUpdate).getTime() : Date.now();
  const days = Math.max(0, Math.floor((end - new Date(started).getTime()) / DAY));
  let summary = "No forms started yet.";
  if (complete) {
    summary = "All forms completed.";
  } else if (latest) {
    const st = chipStatus(latest);
    const title = FORM_TITLES[latest.form_type as keyof typeof FORM_TITLES] ?? latest.form_type;
    switch (st) {
      case "Draft":
        summary = `${title} saved as a draft.`;
        break;
      case "In Review":
        summary = `${title} was submitted but awaits Director review.`;
        break;
      case "In Review (Offsite)":
        summary = `${title} moved to "Customer Signing Offsite".`;
        break;
      case "Awaiting customer signature":
        summary = `${title} is waiting for the customer to sign.`;
        break;
      case "Awaiting Director & Witness signatures":
        summary = `${title} is waiting for Director & Witness signatures.`;
        break;
      case "Disapproved":
        summary = `${title} was disapproved.`;
        break;
      case "Completed":
        summary = `${title} is completed.`;
        break;
      default:
        summary = `${title} status: ${statusLabel(st)}.`;
    }
  }
  return { started, lastUpdate, days, complete, summary };
}
