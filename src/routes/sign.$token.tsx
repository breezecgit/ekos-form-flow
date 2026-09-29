import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import logo from "@/assets/ekos-logo.png";
import { FormRunner } from "@/components/form-engine/FormRunner";
import { getForm } from "@/lib/forms/registry";
import { getSigningContext, submitCustomerSignature } from "@/lib/signing.functions";

export const Route = createFileRoute("/sign/$token")({
  head: () => ({
    meta: [
      { title: "Sign your EKOS Group form" },
      {
        name: "description",
        content: "Securely review and sign your EKOS Group paperwork online.",
      },
      { property: "og:title", content: "Sign your EKOS Group form" },
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
      <div className="bg-brand py-8 text-center">
        <img src={logo} alt="EKOS Group" className="mx-auto h-14 w-auto brightness-0 invert" />
      </div>
      <main className="px-4 py-8">
        {ctx.isLoading && <p className="text-center text-muted-foreground">Loading…</p>}
        {ctx.isError && (
          <div className="mx-auto max-w-lg rounded-xl border bg-card p-6 text-center">
            <h1 className="ekos-title text-xl">We couldn't open this link</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {(ctx.error as Error).message} Please contact EKOS Group on sales@ekosgroup.co.uk.
            </p>
          </div>
        )}
        {done && (
          <div className="mx-auto max-w-lg rounded-xl border bg-card p-6 text-center">
            <h1 className="ekos-title text-xl">Thank you</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Your signature has been received and sent to EKOS Group for final approval. You'll
              receive your completed copy by email.
            </p>
          </div>
        )}
        {ctx.data && !done && (
          <FormRunner
            def={getForm(ctx.data.formType)}
            ctx={{ mode: "offsite", isDirector: false }}
            initialValues={{
              order_number: ctx.data.orderNumber,
              customer_name: ctx.data.customerName,
              customer_email: ctx.data.customerEmail,
              park_name: ctx.data.parkName,
              status: "In Review (Offsite)",
            }}
            parkLinks={{}}
            orderNumber={ctx.data.orderNumber}
            onlyCustomerSignature
            submitLabel="Submit my signature"
            headerExtra={
              <div className="mb-6 rounded-lg border bg-muted/40 p-4 text-sm">
                <p>
                  <strong>Order Number:</strong> {ctx.data.orderNumber}
                </p>
                <p>
                  <strong>Name:</strong> {ctx.data.customerName}
                </p>
                <p>
                  <strong>Email:</strong> {ctx.data.customerEmail}
                </p>
                <p>
                  <strong>Park:</strong> {ctx.data.parkName}
                </p>
                {ctx.data.pdfUrl && (
                  <p className="mt-2">
                    <a
                      className="text-brand underline"
                      href={ctx.data.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View your full form (PDF)
                    </a>
                  </p>
                )}
              </div>
            }
            onSubmit={async (values) => {
              await submitFn({ data: { token, values } });
              setDone(true);
            }}
          />
        )}
      </main>
    </div>
  );
}
