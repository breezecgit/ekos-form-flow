import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listEmailLog } from "@/lib/ekos.functions";

export const Route = createFileRoute("/admin/emails")({
  head: () => ({
    meta: [
      { title: "Email log | EKOS Group" },
      { name: "description", content: "Every email the EKOS sales forms portal has sent." },
      { property: "og:title", content: "Email log | EKOS Group" },
      {
        property: "og:description",
        content: "Every email the EKOS sales forms portal has sent.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EmailLog,
});

function EmailLog() {
  const fn = useServerFn(listEmailLog);
  const { data } = useQuery({ queryKey: ["email-log"], queryFn: () => fn() });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="ekos-title text-2xl">Email log</h1>
      <div className="mt-4 overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">Sent</th>
              <th className="p-3">To</th>
              <th className="p-3">Subject</th>
              <th className="p-3">Type</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((row) => (
              <tr key={row.id} className="border-t align-top">
                <td className="p-3 whitespace-nowrap">
                  {new Date(row.created_at).toLocaleString("en-GB")}
                </td>
                <td className="p-3">{row.to_addresses.join(", ")}</td>
                <td className="p-3">{row.subject}</td>
                <td className="p-3">{row.template}</td>
                <td className="p-3">
                  {row.status}
                  {row.error && (
                    <span className="block text-xs text-muted-foreground">{row.error}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(data ?? []).length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">No emails yet.</p>
        )}
      </div>
    </main>
  );
}
