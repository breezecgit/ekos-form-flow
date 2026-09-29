import type { FieldDef, FormDef } from "./types";
import { customerSignatureFields, opts, parkDetailsFields, repSignatureFields, fieldFromReservation } from "./common";
import { newHomeOrderForm } from "./new-home-order";
import { TERMS_URL } from "./reservation";

export const DEFAULT_WELCOME_PACK_URL = "https://ekosgroup.co.uk/ekos-welcome-pack";

const nho = (id: string) => newHomeOrderForm.steps.find((s) => s.id === id)!.fields;
const nhoField = (key: string): FieldDef => ({
  ...newHomeOrderForm.steps.flatMap((s) => s.fields).find((f) => f.key === key)!,
});

const COUNTRIES = [
  "United Kingdom (UK)",
  "Ireland",
  "France",
  "Spain",
  "Portugal",
  "Germany",
  "Netherlands",
  "Belgium",
  "Italy",
  "United States (US)",
  "Canada",
  "Australia",
  "New Zealand",
  "South Africa",
  "Other",
];

export const unitSaleAgreementForm: FormDef = {
  type: "unit_sale_agreement",
  title: "Unit Sale Agreement & Welcome Pack",
  signingTitle: "Unit Sale Agreement & Welcome Pack Signatures",
  steps: [
    {
      id: "step-1",
      fields: [
        ...parkDetailsFields(),
        { key: "manager_name", label: "Park Manager / Regional Manager", type: "text" },
        { key: "manager_phone", label: "Phone Number", type: "tel" },
        { key: "manager_email", label: "Email", type: "email" },
      ],
    },
    {
      id: "step-2",
      heading: "Unit Sale Agreement",
      fields: [
        fieldFromReservation("customer_name"),
        fieldFromReservation("customer_phone"),
        fieldFromReservation("customer_email"),
        {
          key: "sales_route",
          label: "Sales Route",
          type: "select",
          options: opts(["Part Exchange", "Spring Managed Sale", "QMP Assisted Move", "Cash"]),
        },
        fieldFromReservation("deposit_date"),
        fieldFromReservation("deposit_amount"),
        fieldFromReservation("payment_method"),
        fieldFromReservation("home_model"),
        fieldFromReservation("pitch_number"),
        { key: "new_home_address", label: "Full Address for Your New Home", type: "text" },
        fieldFromReservation("home_size"),
        { key: "serial_number", label: "Serial Number", type: "text" },
        fieldFromReservation("monthly_pitch_fee"),
        fieldFromReservation("pitch_fee_review_date"),
        nhoField("incentives"),
        nhoField("discount_home"),
        nhoField("discount_decking"),
        nhoField("discount_other"),
        fieldFromReservation("handover_date"),
        fieldFromReservation("notes"),
      ],
    },
    {
      id: "step-3",
      heading: "Confirming Customisations",
      fields: nho("step-3")
        .filter((f) => f.key !== "spec_check_sheet")
        .map((f) => ({ ...f })),
    },
    {
      id: "step-4",
      heading: "Confirmation of Final Costs",
      fields: nho("step-4").map((f) =>
        f.key === "estate_agent_fees" ? { ...f, label: "Estate Agents Fees" } : { ...f },
      ),
    },
    {
      id: "step-5",
      heading: "Important Information",
      fields: [
        {
          key: "usa_links",
          type: "links",
          links: [
            { label: "Welcome Pack", parkKey: "welcome_pack_url" },
            {
              label: "Protecting You With the Mobile Homes Act",
              url: "https://www.gov.uk/government/publications/park-homes-know-your-rights/park-homes-know-your-rights",
            },
            { label: "Our Brochure for Further Information", parkKey: "brochure_url" },
            { label: "Our Site Licence", parkKey: "site_licence_url" },
            { label: "Our Park Rules", parkKey: "park_rules_url" },
            { label: "Terms & Conditions", url: TERMS_URL },
          ],
        },
        { key: "goldshield_certificate", label: "Goldshield Warranty Certificate", type: "file" },
        { key: "insurance_documents", label: "Insurance documentation for your new home", type: "file" },
        { key: "nok_name", label: "Name", type: "text", sectionLabel: "Next of Kin Details" },
        { key: "nok_relationship", label: "Relationship", type: "text" },
        { key: "nok_email", label: "Email", type: "email", placeholder: "Email Address" },
        { key: "nok_phone", label: "Phone", type: "tel", placeholder: "Mobile Number" },
        { key: "nok_address_1", label: "Address Line 1", type: "text", half: true },
        { key: "nok_address_2", label: "Address Line 2", type: "text", half: true },
        { key: "nok_city", label: "City", type: "text", half: true },
        { key: "nok_county", label: "County", type: "text", half: true },
        { key: "nok_postcode", label: "Post Code", type: "text", half: true },
        {
          key: "nok_country",
          label: "Country",
          type: "select",
          options: opts(COUNTRIES),
          defaultValue: "United Kingdom (UK)",
          half: true,
        },
      ],
    },
    {
      id: "step-6",
      heading: "Taking Ownership of My New Home",
      fields: repSignatureFields(),
    },
    { id: "step-7", fields: customerSignatureFields() },
  ],
};
