import type { ContentBlock, FieldDef, OptionDef } from "./types";
import { reservationForm } from "./reservation";

/**
 * Pieces shared between forms. They are taken straight from the Reservation
 * Form definition so the wording is guaranteed identical everywhere.
 */

export const opts = (values: string[]): OptionDef[] => values.map((v) => ({ value: v }));
export const REQUIRED_OPTS = opts(["Required", "Not Required"]);

const byStep = (id: string) => reservationForm.steps.find((s) => s.id === id)!.fields;

/** Reservation Step 1 (park details) with the park locked once it is set. */
export function parkDetailsFields(): FieldDef[] {
  return byStep("step-1").map((f) =>
    f.key === "park_name" ? { ...f, lockIfSet: true } : { ...f },
  );
}

export function fieldFromReservation(key: string): FieldDef {
  const f = reservationForm.steps.flatMap((s) => s.fields).find((x) => x.key === key);
  if (!f) throw new Error(`Unknown reservation field ${key}`);
  return { ...f };
}

const guide: ContentBlock[] = byStep("step-3")[0]!.content ?? [];

/** "What Comes as Standard" sub-heading, the 7 bullets and the note. */
export const STANDARD_BLOCKS: ContentBlock[] = (() => {
  const i = guide.findIndex(
    (b) => b.kind === "subheading" && b.text === "What Comes as Standard with My New Home",
  );
  return guide.slice(i, i + 3);
})();

/** Shared move-in section and its always-visible access notice. */
export const MOVE_IN_BLOCKS: ContentBlock[] = guide.filter(
  (b) => (b.kind === "accordion" && b.title === "On Move-In Day") || b.kind === "bold",
);

/** The six Important Information links. */
export function importantLinksField(): FieldDef {
  return { ...byStep("step-4").find((f) => f.key === "important_links")! };
}

/** Reservation customer-signature step (status guide, status, signatures, T&Cs, note). */
export function customerSignatureFields(): FieldDef[] {
  return byStep("step-6").map((f) => ({ ...f }));
}

export function repSignatureFields(): FieldDef[] {
  return byStep("step-5").map((f) => ({ ...f }));
}
