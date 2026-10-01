import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Sale = { id: string; park_name: string; sales_person?: string; created_at?: string };

/** Park goals live in app_settings under "park_goals" as { [parkName]: number }. Directors edit them here. */
export function ParkGoalsChart({
  sales,
  isSaleComplete,
  isDirector,
}: {
  sales: Sale[];
  isSaleComplete: (saleId: string) => boolean;
  isDirector: boolean;
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
      const { data } = await supabase.from("parks").select("name, active, sort_order").order("sort_order");
      return (data ?? []).filter((p) => p.active).map((p) => p.name);
    },
  });
  const goalsQ = useQuery({
    queryKey: ["park-goals"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "park_goals").maybeSingle();
      return ((data?.value ?? {}) as Record<string, number>) || {};
    },
  });
  const goals = goalsQ.data ?? {};
  const parks = parksQ.data ?? [];
  const reps = useMemo(
    () => Array.from(new Set(sales.map((s) => s.sales_person ?? "").filter(Boolean))).sort(),
    [sales],
  );

  const data = parks.map((park) => {
    const count = sales.filter((s) => {
      if (s.park_name !== park) return false;
      if (rep && s.sales_person !== rep) return false;
      const d = (s.created_at ?? "").slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return !isSaleComplete(s.id);
    }).length;
    const goal = Number(goals[park]) || 0;
    return { park, count, goal };
  });

  const startEdit = () => {
    setDraft(Object.fromEntries(parks.map((p) => [p, goals[p] ? String(goals[p]) : ""])));
    setEditing(true);
  };
  const save = async () => {
    setSaving(true);
    const value: Record<string, number> = {};
    for (const [p, v] of Object.entries(draft)) {
      const n = parseInt(v, 10);
      if (Number.isFinite(n) && n > 0) value[p] = n;
    }
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "park_goals", value, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) { toast.error("Could not save goals: " + error.message); return; }
    toast.success("Goals saved");
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["park-goals"] });
  };

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Sales in progress by park</h2>
          <p className="text-sm text-muted-foreground">Bars show sales in progress; the line beside each shows the park's goal.</p>
        </div>
        {isDirector && !editing && (
          <Button size="sm" variant="outline" onClick={startEdit}>Set goals</Button>
        )}
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
          <Button size="sm" variant="outline" onClick={() => { setRep(""); setFrom(""); setTo(""); }}>Clear</Button>
        )}
      </div>

      {editing ? (
        <div className="mt-4">
          <p className="mb-3 text-sm text-muted-foreground">Enter the target number of sales for each park. Leave blank for no goal.</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {parks.map((p) => (
              <label key={p} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <span>{p}</span>
                <input
                  type="number"
                  min={0}
                  className="h-8 w-20 rounded-md border bg-background px-2 text-right"
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
            <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="park" angle={-35} textAnchor="end" interval={0} tick={{ fontSize: 11 }} height={70} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: number, name: string) => [v, name === "count" ? "In progress" : "Goal"]}
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
              />
              <Bar dataKey="count" name="count" radius={[4, 4, 0, 0]}>
                {data.map((d) => (
                  <Cell key={d.park} fill={d.goal && d.count >= d.goal ? "var(--primary)" : "var(--accent-foreground)"} />
                ))}
              </Bar>
              <Bar dataKey="goal" name="goal" fill="var(--muted-foreground)" fillOpacity={0.3} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
