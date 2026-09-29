import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useState } from "react";
import { listEmailLog } from "@/lib/ekos.functions";

export const Route = createFileRoute("/admin/emails")({
  head: () => ({
    meta: [
      { title: "Email log | EKOS Customer Sales Form" },
      { name: "description", content: "Every email the EKOS sales forms portal has sent." },
      { property: "og:title", content: "Email log | EKOS Customer Sales Form" },
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
  const [open, setOpen] = useState<string | null>(null);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="ekos-title text-2xl">Email log</h1>
      <div className="mt-4 overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">Sent</th>
              <th className="p-3">From / To / CC</th>
              <th className="p-3">Subject</th>
              <th className="p-3">Type</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((row) => (
              <Fragment key={row.id}>
              <tr className="border-t align-top">
                <td className="p-3 whitespace-nowrap">
                  {new Date(row.created_at).toLocaleString("en-GB")}
                </td>
                <td className="p-3 text-xs">
                  {row.test_mode && (
                    <span className="mb-1 inline-block rounded bg-warning px-2 py-0.5 text-[10px] font-bold text-warning-foreground">
                      TEST MODE
                    </span>
                  )}
                  <span className="block text-muted-foreground">{row.from_address}</span>
                  <span className="block"><strong>{row.test_mode ? "Actually sent to:" : "To:"}</strong> {row.to_addresses.join(", ")}</span>
                  {row.cc_addresses?.length > 0 && (
                    <span className="block"><strong>CC:</strong> {row.cc_addresses.join(", ")}</span>
                  )}
                  {row.test_mode && (
                    <>
                      <span className="block"><strong>Intended To:</strong> {row.intended_to.join(", ") || "–"}</span>
                      <span className="block"><strong>Intended CC:</strong> {row.intended_cc.join(", ") || "–"}</span>
                    </>
                  )}
                </td>
                <td className="p-3">{row.subject}</td>
                <td className="p-3">{row.template}</td>
                <td className="p-3">
                  {row.status}
                  {row.error && (
                    <span className="block text-xs text-muted-foreground">{row.error}</span>
                  )}
                </td>
                <td className="p-3">
                  {row.html && (
                    <button
                      className="text-sm font-medium text-brand underline"
                      onClick={() => setOpen(open === row.id ? null : row.id)}
                    >
                      {open === row.id ? "Hide" : "Preview"}
                    </button>
                  )}
                </td>
              </tr>
              {open === row.id && (
                <tr key={`${row.id}-p`} className="border-t">
                  <td colSpan={6} className="bg-muted/30 p-3">
                    <iframe title="Email preview" srcDoc={row.html} className="h-[700px] w-full rounded border bg-background" />
                  </td>
                </tr>
              )}
              </Fragment>
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
