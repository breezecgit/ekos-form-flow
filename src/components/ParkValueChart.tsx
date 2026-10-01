// Value of sales in progress by park — same filters as the count chart,
// but bars show £ (from the Customer Reservation Form Total Cost) instead of numbers.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, parseMoney } from "@/lib/format";

type Sale = { id: string; park_name: string; sales_person?: string; created_at?: string };
type ResSub = { sale_id: string; form_type: string; is_draft: boolean; total_cost?: string | null };

const gbpShort = (n: number) => {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}m`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${n}`;
};

export function ParkValueChart({
  sales,
  submissions,
  isSaleComplete,
}: {
  sales: Sale[];
  submissions: ResSub[];
  isSaleComplete: (saleId: string) => boolean;
}) {
  const [rep, setRep] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const parksQ = useQuery({
    queryKey: ["parks-names"],
    queryFn: async () => {
      const { data } = await supabase.from("parks").select("name, active, sort_order").order("sort_order");
      return (data ?? []).filter((p) => p.active).map((p) => p.name);
    },
  });
  const parks = parksQ.data ?? [];
  const reps = useMemo(
    () => Array.from(new Set(sales.map((s) => s.sales_person ?? "").filter(Boolean))).sort(),
    [sales],
  );

  // Total Cost per sale, from its submitted Customer Reservation Form.
  const valueBySale = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const s of submissions) {
      if (s.form_type !== "reservation" || s.is_draft) continue;
      m.set(s.sale_id, parseMoney(s.total_cost));
    }
    return m;
  }, [submissions]);

  let tbc = 0;
  const data = parks.map((park) => {
    let value = 0;
    for (const s of sales) {
      if (s.park_name !== park) continue;
      if (rep && s.sales_person !== rep) continue;
      const d = (s.created_at ?? "").slice(0, 10);
      if (from && d < from) continue;
      if (to && d > to) continue;
      if (isSaleComplete(s.id)) continue;
      const v = valueBySale.get(s.id);
      if (v === null || v === undefined) tbc += 1;
      else value += v;
    }
    return { park, value };
  });

  return (
    <div className="rounded-xl border bg-card p-4">
      <div>
        <h2 className="text-lg font-semibold">Value of sales in progress by park</h2>
        <p className="text-sm text-muted-foreground">
          Bars show the £ value of sales in progress (Total Cost from the Customer Reservation Form){tbc ? ` · ${tbc} TBC not counted` : ""}.
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-muted-foreground">Sales rep</span>
          <select className="mt-1 h-9 rounded-md border bg-background px-2" value={rep} onChange={(e) => setRep(e.target.value)}>
            <option value="">All reps</option>
            {reps.map((r) => <option key={r} value={r}>{r}</option>)}
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
        {(rep || from || to) && (
          <button
            className="h-9 rounded-md border px-3 text-sm hover:bg-muted"
            onClick={() => { setRep(""); setFrom(""); setTo(""); }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="mt-4 h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="park" angle={-35} textAnchor="end" interval={0} tick={{ fontSize: 11 }} height={70} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickFormatter={(v: number) => gbpShort(v)} />
            <Tooltip
              formatter={(v: number) => [formatMoney(v), "In progress value"]}
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
            />
            <Bar dataKey="value" name="value" fill="var(--accent-foreground)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
