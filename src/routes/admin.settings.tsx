import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SignaturePad } from "@/components/SignaturePad";
import { getSettings, saveSettings } from "@/lib/settings.functions";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [
      { title: "Settings | EKOS Group" },
      {
        name: "description",
        content:
          "Manage parks, sales people, notification emails, document links, the Director signature and the Google Drive folder.",
      },
      { property: "og:title", content: "Settings | EKOS Group" },
      {
        property: "og:description",
        content:
          "Manage parks, sales people, notification emails, document links, the Director signature and the Google Drive folder.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

interface ParkRow {
  id: string;
  name: string;
  address: string;
  inbox_email: string;
  brochure_url: string;
  site_licence_url: string;
  park_rules_url: string;
}

function SettingsPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getSettings);
  const saveFn = useServerFn(saveSettings);
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => getFn() });

  const [parks, setParks] = useState<ParkRow[]>([]);
  const [people, setPeople] = useState("");
  const [salesEmail, setSalesEmail] = useState("");
  const [directorEmail, setDirectorEmail] = useState("");
  const [constructionEmail, setConstructionEmail] = useState("");
  const [driveFolder, setDriveFolder] = useState("");
  const [welcomePack, setWelcomePack] = useState("");
  const [signature, setSignature] = useState("");

  useEffect(() => {
    if (!data) return;
    setParks(
      data.parks.map((p) => ({
        id: p.id,
        name: p.name,
        address: p.address ?? "",
        inbox_email: p.inbox_email ?? "",
        brochure_url: p.brochure_url ?? "",
        site_licence_url: p.site_licence_url ?? "",
        park_rules_url: p.park_rules_url ?? "",
      })),
    );
    setPeople(data.salesPeople.map((p) => p.name).join("\n"));
    const n = data.settings["notifications"] ?? {};
    setSalesEmail(String(n["sales_email"] ?? ""));
    setDirectorEmail(String(n["director_email"] ?? ""));
    setConstructionEmail(String(n["construction_email"] ?? ""));
    setDriveFolder(String(data.settings["google_drive"]?.["folder_id"] ?? ""));
    setWelcomePack(
      String(data.settings["links"]?.["welcome_pack_url"] ?? "") ||
        "https://ekosgroup.co.uk/ekos-welcome-pack",
    );
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          parks: parks.map(({ id, address, inbox_email, brochure_url, site_licence_url, park_rules_url }) => ({
            id,
            address,
            inbox_email,
            brochure_url,
            site_licence_url,
            park_rules_url,
          })),
          salesPeople: people.split("\n").map((p) => p.trim()).filter(Boolean),
          notifications: {
            sales_email: salesEmail,
            director_email: directorEmail,
            construction_email: constructionEmail,
          },
          driveFolderId: driveFolder,
          welcomePackUrl: welcomePack,
          directorSignatureDataUrl: signature || undefined,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Settings saved.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setPark = (id: string, key: keyof ParkRow, value: string) =>
    setParks((prev) => prev.map((p) => (p.id === id ? { ...p, [key]: value } : p)));

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="ekos-title text-2xl">Settings</h1>

      <section className="mt-6 rounded-xl border bg-card p-6">
        <h2 className="ekos-title text-lg">Parks</h2>
        <p className="text-sm text-muted-foreground">
          Leave a link blank and the form shows “(link to follow)”.
        </p>
        <div className="mt-4 space-y-5">
          {parks.map((p) => (
            <div key={p.id} className="rounded-lg border p-4">
              <p className="font-semibold text-brand">{p.name}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Park address" value={p.address} onChange={(v) => setPark(p.id, "address", v)} />
                <Field label="Park inbox email" value={p.inbox_email} onChange={(v) => setPark(p.id, "inbox_email", v)} />
                <Field label="Brochure URL" value={p.brochure_url} onChange={(v) => setPark(p.id, "brochure_url", v)} />
                <Field label="Site Licence URL" value={p.site_licence_url} onChange={(v) => setPark(p.id, "site_licence_url", v)} />
                <Field label="Park Rules URL" value={p.park_rules_url} onChange={(v) => setPark(p.id, "park_rules_url", v)} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-xl border bg-card p-6">
        <h2 className="ekos-title text-lg">Sales people</h2>
        <p className="text-sm text-muted-foreground">One name per line.</p>
        <textarea
          className="mt-3 min-h-48 w-full rounded-md border bg-background p-3 text-sm"
          value={people}
          onChange={(e) => setPeople(e.target.value)}
        />
      </section>

      <section className="mt-6 rounded-xl border bg-card p-6">
        <h2 className="ekos-title text-lg">Notification emails</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Sales inbox" value={salesEmail} onChange={setSalesEmail} />
          <Field label="Director" value={directorEmail} onChange={setDirectorEmail} />
          <Field label="Construction team" value={constructionEmail} onChange={setConstructionEmail} />
        </div>
      </section>

      <section className="mt-6 rounded-xl border bg-card p-6">
        <h2 className="ekos-title text-lg">Director signature</h2>
        <p className="text-sm text-muted-foreground">
          Signed as “Sadie Deveraux — Director – authorised signatory of EKOS Group”. This is merged
          into every PDF on completion.
        </p>
        <div className="mt-3">
          <SignaturePad value={signature} onChange={setSignature} />
        </div>
      </section>

      <section className="mt-6 rounded-xl border bg-card p-6">
        <h2 className="ekos-title text-lg">Document links</h2>
        <Field
          label="Welcome Pack link (Unit Sale Agreement & Welcome Pack)"
          value={welcomePack}
          onChange={setWelcomePack}
        />
      </section>

      <section className="mt-6 rounded-xl border bg-card p-6">
        <h2 className="ekos-title text-lg">Google Drive</h2>
        <Field label="Folder ID" value={driveFolder} onChange={setDriveFolder} />
      </section>

      <div className="mt-6">
        <Button variant="gold" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="ekos-label">{label}</label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
