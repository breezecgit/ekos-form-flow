import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { FormRunner } from "@/components/form-engine/FormRunner";
import { getForm } from "@/lib/forms/registry";
import { getSigningContext, submitCustomerSignature } from "@/lib/signing.functions";

export const Route = createFileRoute("/sign/$token")({
  head: () => ({
    meta: [
      { title: "Sign your form | EKOS Customer Sales Form" },
      {
        name: "description",
        content: "Securely review and sign your EKOS Group paperwork online.",
      },
      { property: "og:title", content: "Sign your form | EKOS Customer Sales Form" },
      {
        property: "og:description",
        content: "Securely review and sign your EKOS Group paperwork online.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SignPage,
});

function SignPage() {
  const { token } = Route.useParams();
  const contextFn = useServerFn(getSigningContext);
  const submitFn = useServerFn(submitCustomerSignature);
  const [done, setDone] = useState(false);

  const ctx = useQuery({
    queryKey: ["signing", token],
    queryFn: () => contextFn({ data: { token } }),
    retry: false,
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader publicPage />
      <main className="px-4 py-8">
        {ctx.isLoading && <p className="text-center text-muted-foreground">Loading…</p>}
        {(ctx.isError || (ctx.data && "error" in ctx.data)) && !done && (
          <div className="mx-auto max-w-lg rounded-xl border bg-card p-6 text-center">
            <h1 className="ekos-title text-xl">We couldn't open this link</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {ctx.data && "error" in ctx.data ? ctx.data.error : (ctx.error as Error)?.message} Please contact EKOS Group on sales@ekosgroup.co.uk.
            </p>
          </div>
        )}
        {done && (
          <div className="mx-auto max-w-lg rounded-xl border bg-card p-6 text-center">
            <h1 className="ekos-title text-xl">Thank you</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {ctx.data && !("error" in ctx.data) && ctx.data.kind === "director"
                ? "Thank you – the statement is now Completed. The signed copy has been emailed to the customer, the park, sales@ and you, and saved to Google Drive."
                : "Your signature has been received and sent to EKOS Group for final approval. You'll receive your completed copy by email."}
            </p>
          </div>
        )}
        {ctx.data && !("error" in ctx.data) && !done && (() => {
          const d = ctx.data;
          const def = getForm(d.formType);
          const kind = d.kind;
          const title =
            kind === "director"
              ? def.directorSigningTitle
              : kind === "customer"
                ? def.signingTitle
                : undefined;
          return (
            <FormRunner
              def={def}
              {...(title ? { title } : {})}
              ctx={{
                mode: kind === "construction" ? "construction" : kind === "director" ? "director" : "offsite",
                isDirector: false,
              }}
              initialValues={{
                order_number: d.orderNumber,
                customer_name: d.customerName,
                customer_email: d.customerEmail,
                park_name: d.parkName,
                status: kind === "customer" ? "In Review (Offsite)" : "In Review",
                ...(d.secondCustomer ? { second_customer: d.secondCustomer } : {}),
              }}
              parkLinks={{}}
              orderNumber={d.orderNumber}
              onlyGroup={
                kind === "construction"
                  ? "constructionSignature"
                  : kind === "director"
                    ? "directorSignature"
                    : "customerSignature"
              }
              submitLabel={kind === "customer" ? "Submit my signature" : "Submit Form"}
              headerExtra={
                kind === "director" ? (
                  <div className="mb-6 mt-4 space-y-3 rounded-lg border bg-muted/40 p-4 text-sm">
                    <p><strong>Customer:</strong> {d.customerName}</p>
                    <p><strong>Park:</strong> {d.parkName}</p>
                    <p>
                      Please sign with your witness present. Both the Director and the witness must sign
                      before this page can be submitted – submitting completes the statement.
                    </p>
                    {d.pdfUrl && (
                      <>
                        <iframe
                          title="Written Statement PDF"
                          src={d.pdfUrl}
                          className="h-[70vh] w-full rounded border bg-background"
                        />
                        <a className="text-brand underline" href={d.pdfUrl} target="_blank" rel="noreferrer">
                          Open the full PDF in a new tab
                        </a>
                      </>
                    )}
                  </div>
                ) : kind === "construction" ? (
                  <div className="mb-6 mt-4 space-y-3 rounded-lg border bg-muted/40 p-4 text-sm">
                    <p className="text-center font-heading text-lg font-semibold text-brand">
                      New Home Order Form Signatures (Construction Signatures)
                    </p>
                    <p><strong>Customer Email:</strong> {d.customerEmail}</p>
                    <p><strong>Status:</strong> In Review</p>
                    {d.pdfUrl && (
                      <p>
                        <a className="text-brand underline" href={d.pdfUrl} target="_blank" rel="noreferrer">
                          View the full form (PDF)
                        </a>
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mb-6 rounded-lg border bg-muted/40 p-4 text-sm">
                    <p><strong>Order Number:</strong> {d.orderNumber}</p>
                    <p><strong>Name:</strong> {d.customerName}</p>
                    <p><strong>Email:</strong> {d.customerEmail}</p>
                    <p><strong>Park:</strong> {d.parkName}</p>
                    {d.pdfUrl && (
                      <p className="mt-2">
                        <a className="text-brand underline" href={d.pdfUrl} target="_blank" rel="noreferrer">
                          View your full form (PDF)
                        </a>
                      </p>
                    )}
                  </div>
                )
              }
              onSubmit={async (values) => {
                try {
                  const res = await submitFn({ data: { token, values } });
                  if (res && "error" in res && res.error) {
                    await ctx.refetch();
                    return;
                  }
                  setDone(true);
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            />
          );
        })()}
      </main>
    </div>
  );
}
