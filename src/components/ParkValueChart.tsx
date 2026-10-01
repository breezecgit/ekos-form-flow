// Value of sales in progress by park — same filters as the count chart,
// but bars show £ (from the Customer Reservation Form Total Cost) instead of numbers.
// Value goals live in app_settings under "park_value_goals" as { [parkName]: number }; directors edit them.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
  isDirector,
  assignedParks,
}: {
  sales: Sale[];
  submissions: ResSub[];
  isSaleComplete: (saleId: string) => boolean;
  isDirector: boolean;
  assignedParks: string[] | undefined;
}) {
  const qc = useQueryClient();
  const [rep, setRep] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const parksQ = useQuery({
    queryKey: ["parks-names"],
    queryFn: async () => {
      const { data } = await supabase.from("parks").select("name, rep_name, active, sort_order").order("sort_order");
      return (data ?? []).filter((p) => p.active).map((p) => ({ name: p.name, repName: p.rep_name ?? "" }));
    },
  });
  const goalsQ = useQuery({
    queryKey: ["park-value-goals"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "park_value_goals").maybeSingle();
      return ((data?.value ?? {}) as Record<string, number>) || {};
    },
  });
  const goals = goalsQ.data ?? {};
  const parks = (parksQ.data ?? []).filter((park) => !assignedParks || assignedParks.includes(park.name));
  const parkRep = useMemo(() => Object.fromEntries(parks.map((p) => [p.name, p.repName])), [parks]);
  const reps = useMemo(
    () =>
      Array.from(
        new Set([
          ...sales.map((s) => s.sales_person ?? "").filter(Boolean),
          ...parks.map((p) => p.repName).filter(Boolean),
        ]),
      ).sort(),
    [sales, parks],
  );
  const parkNames = parks.map((p) => p.name);
  // When a rep is selected, only show the parks they are responsible for.
  const visibleParks = rep ? parks.filter((p) => parkRep[p.name] === rep).map((p) => p.name) : parkNames;

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
  const data = visibleParks.map((park) => {
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
    const goal = Number(goals[park]) || 0;
    return { park, value, goal };
  });

  const startEdit = () => {
    setDraft(
      Object.fromEntries(parkNames.map((p) => [p, goals[p] ? String(goals[p]) : ""])),
    );
    setEditing(true);
  };
  const save = async () => {
    setSaving(true);
    const value: Record<string, number> = {};
    for (const [p, v] of Object.entries(draft)) {
      const n = parseInt(v.replace(/[^\d]/g, ""), 10);
      if (Number.isFinite(n) && n > 0) value[p] = n;
    }
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "park_value_goals", value, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) { toast.error("Could not save goals: " + error.message); return; }
    toast.success("Goals saved");
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["park-value-goals"] });
  };

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Value of Sales in Progress by Park</h2>
          <p className="text-sm text-muted-foreground">
            Bars show the £ value of sales in progress (Total Cost from the Customer Reservation Form){tbc ? ` · ${tbc} TBC not counted` : ""}; the gold bar beside each shows the park's goal.
          </p>
        </div>
        {isDirector && !editing && (
          <Button size="sm" variant="outline" onClick={startEdit}>Set goals</Button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        {isDirector && <label className="text-sm">
          <span className="block text-muted-foreground">Sales rep</span>
          <select className="mt-1 h-9 rounded-md border bg-background px-2" value={rep} onChange={(e) => setRep(e.target.value)}>
            <option value="">All reps</option>
            {reps.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>}
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

      {editing ? (
        <div className="mt-4">
          <p className="mb-3 text-sm text-muted-foreground">Enter the target £ value of sales in progress for each park (a whole number, e.g. 500000 for £500,000). Leave blank for no goal.</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {parkNames.map((p) => (
              <label key={p} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <span>{p}</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  className="h-8 w-28 rounded-md border bg-background px-2 text-right"
                  value={draft[p] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [p]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save goals"}</Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="park" angle={-35} textAnchor="end" interval={0} tick={{ fontSize: 11 }} height={70} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickFormatter={(v: number) => gbpShort(v)} />
              <Tooltip
                formatter={(v: number, name: string) => [formatMoney(v), name === "value" ? "In progress value" : "Goal"]}
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
              />
              <Bar dataKey="value" name="value" radius={[4, 4, 0, 0]}>
                {data.map((d) => (
                  <Cell key={d.park} fill={d.goal && d.value >= d.goal ? "var(--primary)" : "var(--accent-foreground)"} />
                ))}
              </Bar>
              <Bar dataKey="goal" name="goal" fill="var(--gold)" fillOpacity={0.45} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
