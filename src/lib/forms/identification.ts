import type { FormDef, FormValues } from "./types";
import { fieldFromReservation, repSignatureFields, opts } from "./common";

const PHOTO_ID =
  "One form of photographic identification: either a valid passport or a valid UK driving licence.";
const ADDRESS_PROOF =
  "One form of proof of address: either a recent council tax statement, bank statement, or utility bill showing the Customer's current residential address.";

const secondYes = (v: FormValues) => v["second_customer"] === "Yes";

/** ID Checks has no customer signature and no status step: the rep submits
 *  straight into Director review (submitForm defaults to "In Review"). */
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
      fields: [...repSignatureFields()],
    },
  ],
};
