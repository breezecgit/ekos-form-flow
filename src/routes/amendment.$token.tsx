import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { SignaturePad } from "@/components/SignaturePad";
import { Input } from "@/components/ui/input";
import { getAmendmentSigning, signFormAmendment } from "@/lib/amendments.functions";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/amendment/$token")({
  head: () => ({
    meta: [
      { title: "Sign your amendment | EKOS Customer Sales Form" },
      { name: "description", content: "Securely review and sign a change to your EKOS Group paperwork." },
      { property: "og:title", content: "Sign your amendment | EKOS Customer Sales Form" },
      { property: "og:description", content: "Securely review and sign a change to your EKOS Group paperwork." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AmendmentSignPage,
});

function AmendmentSignPage() {
  const { token } = Route.useParams();
  const getFn = useServerFn(getAmendmentSigning);
  const signFn = useServerFn(signFormAmendment);
  const [signature, setSignature] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const q = useQuery({ queryKey: ["amendment-signing", token], queryFn: () => getFn({ data: { token } }), retry: false });

  const card = (children: React.ReactNode) => (
    <div className="mx-auto max-w-lg rounded-xl border bg-card p-6 text-center">{children}</div>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader publicPage />
      <main className="px-4 py-8">
        {q.isLoading && <p className="text-center text-muted-foreground">Loading…</p>}
        {done && card(<><h1 className="ekos-title text-xl">Thank you</h1><p className="mt-3 text-sm text-muted-foreground">Your signature has been received for EKOS Group's final approval.</p></>)}
        {!done && (q.isError || (q.data && "error" in q.data)) && card(
          <>
            <h1 className="ekos-title text-xl">We couldn't open this link</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {q.data && "error" in q.data ? q.data.error : "Please try again later."} Please contact EKOS Group on sales@ekosgroup.co.uk.
            </p>
          </>,
        )}
        {!done && q.data && !("error" in q.data) && (() => {
          const d = q.data;
          return (
            <div className="mx-auto w-full max-w-3xl space-y-6">
              <div className="text-center">
                <h1 className="ekos-form-title">Amendment {d.amendmentNumber} to {d.formName}</h1>
                <p className="mt-2 text-sm font-semibold text-gold">Order Number {d.orderNumber}</p>
              </div>
              <section>
                <h2 className="ekos-subheading">Reason for amendment</h2>
                <p className="mt-2 whitespace-pre-wrap">{d.reason}</p>
              </section>
              <section>
                <h2 className="ekos-subheading">Changes</h2>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="p-2">Item</th><th className="p-2">Previous</th><th className="p-2">New</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.changes.map((c, i) => (
                        <tr key={i} className="border-b align-top">
                          <td className="p-2 font-medium">{c.label}</td>
                          <td className="p-2 text-muted-foreground">{c.previous}</td>
                          <td className="p-2 font-semibold">{c.next}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <p className="font-semibold">
                All other details remain as per the original signed {d.formName} dated {formatDate(d.originalSignedDate)}.
              </p>
              {d.originalPdfUrl && (
                <p><a className="text-brand underline" href={d.originalPdfUrl} target="_blank" rel="noreferrer">View the original signed {d.formName} (PDF)</a></p>
              )}
              <section className="space-y-3">
                <h2 className="ekos-subheading">Your signature</h2>
                <label htmlFor="amend-name" className="block text-sm font-semibold">Full name <span className="text-destructive">*</span></label>
                <Input id="amend-name" value={name} onChange={(e) => setName(e.target.value)} />
                <SignaturePad value={signature} onChange={setSignature} disabled={busy} />
              </section>
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={busy}
                  className="ekos-btn px-[25px] py-3 disabled:opacity-50"
                  onClick={async () => {
                    if (!name.trim() || !signature) { toast.error("Please type your full name and sign before submitting."); return; }
                    setBusy(true);
                    try {
                      await signFn({ data: { token, signature, name } });
                      setDone(true);
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Your signature could not be submitted.");
                    } finally { setBusy(false); }
                  }}
                >
                  {busy ? "Please wait…" : "Sign amendment"}
                </button>
              </div>
            </div>
          );
        })()}
      </main>
    </div>
  );
}
