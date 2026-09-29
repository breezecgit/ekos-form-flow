const STYLES: Record<string, string> = {
  "Not started": "bg-muted text-muted-foreground",
  Draft: "bg-muted text-foreground",
  "In Review": "bg-brand-light/15 text-brand",
  "In Review (Offsite)": "bg-brand-light/15 text-brand",
  "Awaiting customer signature": "bg-gold/20 text-gold",
  "Awaiting construction sign-off": "bg-gold/20 text-gold",
  "Awaiting Director & Witness signatures": "bg-gold/20 text-gold",
  Disapproved: "bg-destructive/15 text-destructive",
  Completed: "bg-brand text-brand-foreground",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
        STYLES[status] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {status}
    </span>
  );
}

/** Tracker chip: offsite forms show "Awaiting customer signature" until signed. */
export function chipStatus(sub?: {
  status: string;
  is_draft: boolean;
  customer_signed_at: string | null;
  form_type?: string;
  construction_signed_at?: string | null;
}): string {
  if (!sub) return "Not started";
  if (sub.status === "Draft" || (sub.is_draft && sub.status !== "Disapproved")) return "Draft";
  if (sub.status === "In Review (Offsite)" && !sub.customer_signed_at) {
    return "Awaiting customer signature";
  }
  if (
    sub.form_type === "new_home_order" &&
    !sub.construction_signed_at &&
    (sub.status === "In Review" || sub.status === "In Review (Offsite)")
  ) {
    return "Awaiting construction sign-off";
  }
  if (
    sub.form_type === "written_statement" &&
    sub.customer_signed_at &&
    (sub.status === "In Review" || sub.status === "In Review (Offsite)")
  ) {
    return "Awaiting Director & Witness signatures";
  }
  return sub.status;
}
