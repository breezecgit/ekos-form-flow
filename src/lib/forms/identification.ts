import type { ContentBlock, FieldDef, FormDef, FormValues } from "./types";
import { customerSignatureFields, fieldFromReservation, repSignatureFields } from "./common";
import { opts } from "./common";

const PHOTO_ID =
  "One form of photographic identification: either a valid passport or a valid UK driving licence.";
const ADDRESS_PROOF =
  "One form of proof of address: either a recent council tax statement, bank statement, or utility bill showing the Customer's current residential address.";

const secondYes = (v: FormValues) => v["second_customer"] === "Yes";

const STATUS_GUIDE_BLOCKS: ContentBlock[] = [
  { kind: "note", text: "Status Guide:" },
  {
    kind: "bullets",
    items: [
      "Customer Signing Live – use when rep & customer have both signed form on site.",
      "Customer Signing Offsite – use when rep has signed & customer wants to sign at home or at later date.",
      "Completed – do not use – Director use only.",
    ],
  },
];

/** Customer signature step without its own "second customer?" question (asked on step 1). */
function signatureFields(): FieldDef[] {
  return customerSignatureFields()
    .filter((f) => f.key !== "second_customer")
    .map((f) =>
      f.key === "status_guide"
        ? { ...f, content: STATUS_GUIDE_BLOCKS }
        : f,
    );
}

export const identificationForm: FormDef = {
  type: "identification",
  title: "Identification Checks",
  steps: [
    {
      id: "step-1",
      fields: [
        fieldFromReservation("sales_person"),
        { ...fieldFromReservation("park_name"), lockIfSet: true },
        {
          key: "customer_name",
          label: "Customer One Name",
          type: "text",
          sectionLabel: "Customer One",
        },
        {
          key: "customer_email",
          label: "Customer Email",
          type: "email",
          placeholder: "Email Address",
        },
        { key: "customer_phone", label: "Customer Phone", type: "tel" },
        {
          key: "customer_one_photo_id",
          label: PHOTO_ID,
          type: "file",
        },
        {
          key: "customer_one_address_proof",
          label: ADDRESS_PROOF,
          type: "file",
        },
        {
          key: "second_customer",
          label: "Is there a second customer?",
          type: "radio",
          options: opts(["Yes", "No"]),
        },
        {
          key: "customer_two_id_name",
          label: "Customer Two Name",
          type: "text",
          sectionLabel: "Customer Two",
          showIf: secondYes,
        },
        {
          key: "customer_two_photo_id",
          label: PHOTO_ID,
          type: "file",
          showIf: secondYes,
        },
        {
          key: "customer_two_address_proof",
          label: ADDRESS_PROOF,
          type: "file",
          showIf: secondYes,
        },
      ],
    },
    {
      id: "step-2",
      fields: [...repSignatureFields(), ...signatureFields()],
    },
  ],
};
