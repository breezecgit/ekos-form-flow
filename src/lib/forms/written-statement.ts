import type { ContentBlock, FieldDef, FormDef, FormValues, RenderContext } from "./types";
import { customerSignatureFields, fieldFromReservation, opts, repSignatureFields } from "./common";

const text = (key: string): FieldDef => ({ key: `ws_${key}`, type: "static", templateKey: key });

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

/** Occupier signatures show on site, on the customer signing page, and once signed. */
const occupierVisible = (v: FormValues, ctx: RenderContext) => {
  if (ctx.mode === "offsite") return true;
  if (ctx.mode === "rep") return v["status"] === "In Review";
  return v["status"] === "In Review" || Boolean(v["occupier_one_signature"]);
};
const secondOccupier = (v: FormValues, ctx: RenderContext) =>
  occupierVisible(v, ctx) && v["second_occupier"] === "Yes";

/** Director & witness: only on Sadie's signing page, and in the PDF once signed. */
const directorVisible = (v: FormValues, ctx: RenderContext) =>
  ctx.mode === "director" || Boolean(v["director_signature"]);

const acceptance = customerSignatureFields().filter(
  (f) => f.key === "accept_terms" || f.key === "accept_extras",
);

const sig = (f: FieldDef): FieldDef => ({ ...f, pdfSection: "signatures" });

export const writtenStatementForm: FormDef = {
  type: "written_statement",
  title: "Your Written Statement",
  signingTitle: "Your Written Statement Signatures",
  directorSigningTitle: "Your Written Statement – Director & Witness Signatures",
  pdfLayout: "grouped",
  steps: [
    {
      id: "step-1",
      fields: [
        { ...fieldFromReservation("park_name"), label: "Select Park", lockIfSet: true },
        text("intro"),
        text("part1"),
      ],
    },
    {
      id: "step-2",
      fields: [
        text("part2_intro"),
        { key: "park_company_name", parkField: "company_name", label: "Park Limited Company Name", type: "text" },
        { key: "park_registered_number", parkField: "company_number", label: "Registered Number", type: "text" },
        text("part2_address"),
        { key: "party_customer_name", label: "Customer Name", type: "text" },
        text("part2_start"),
        { key: "agreement_start_date", label: "3. The agreement will begin on", type: "date" },
        text("part2_pitch"),
        {
          key: "new_home_address",
          parkField: "address",
          label:
            "4. The particulars of the land on which you will be entitled to station your mobile home are (Property Address):",
          type: "text",
        },
        text("part2_plan"),
        { key: "pitch_plan", label: "Your pitch plan is attached here", type: "file" },
        text("part2_interest"),
        text("part2_fee"),
        { key: "pitch_fee_from", label: "7. The pitch fee will be payable from:", type: "date" },
        text("part2_monthly"),
        { key: "monthly_pitch_fee", label: "The pitch fee is:", type: "money" },
        {
          key: "services_included",
          label: "The following services are included in the pitch fee:",
          type: "text",
          defaultValue: "Sewage",
        },
        {
          key: "pitch_fee_review_date",
          label: "8. The pitch fee will be reviewed on the following date each year:",
          type: "text",
          parkField: "pitch_fee_review_date",
          defaultValue: "1st January",
        },
        text("part2_additional"),
        {
          key: "additional_charges",
          label: "An additional charge will be made for the following matters:",
          type: "textarea",
          placeholder: "List additional charges",
          defaultValue: "Electricity, Gas, Water, Council Tax, WiFi / Broadband",
        },
        text("part2_home"),
        { key: "home_model", label: "Model:", type: "text", placeholder: "Enter model" },
        { key: "serial_number", label: "Serial No:", type: "text", placeholder: "Enter serial number" },
        { key: "year_of_manufacture", label: "Year of manufacture:", type: "text", placeholder: "Enter year" },
        text("part2_max"),
        { key: "home_length", label: "Length (Feet):", type: "text", placeholder: "Length", half: true },
        { key: "home_width", label: "Width (Feet):", type: "text", placeholder: "Width", half: true },
      ],
    },
    {
      id: "step-3",
      fields: [text("annex_intro"), text("annex")],
    },
    {
      id: "step-4",
      fields: [
        { key: "customer_name", label: "Customer Name", type: "text" },
        { key: "customer_email", label: "Customer Email", type: "email", placeholder: "Email Address" },
        { key: "customer_phone", label: "Customer Phone", type: "tel" },
        { ...fieldFromReservation("park_name"), key: "park_name_confirm", label: "Park Name", lockIfSet: true },
        fieldFromReservation("sales_person"),
        ...repSignatureFields().map(sig),
        {
          key: "status_guide",
          type: "static",
          pdfHide: true,
          content: STATUS_GUIDE_BLOCKS,
        },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: [
            { value: "In Review", label: "Customer Signing Live" },
            { value: "In Review (Offsite)", label: "Customer Signing Offsite" },
          ],
          showIf: (_v, ctx) => ctx.mode === "rep",
          pdfHide: true,
        },
        sig({
          key: "occupier_one_signature",
          label: "Signed (Occupier)",
          type: "signature",
          sectionLabel: "Occupier One",
          group: "customerSignature",
          showIf: occupierVisible,
        }),
        sig({ key: "occupier_one_name", label: "Name", type: "text", group: "customerSignature", showIf: occupierVisible }),
        sig({
          key: "occupier_one_date",
          label: "Date",
          type: "date",
          defaultToday: true,
          group: "customerSignature",
          showIf: occupierVisible,
        }),
        sig({
          key: "second_occupier",
          label: "Add Second Occupier?",
          type: "radio",
          options: opts(["Yes", "No"]),
          group: "customerSignature",
          showIf: occupierVisible,
        }),
        sig({
          key: "occupier_two_signature",
          label: "Signed (Occupier)",
          type: "signature",
          sectionLabel: "Occupier Two",
          group: "customerSignature",
          showIf: secondOccupier,
        }),
        sig({ key: "occupier_two_name", label: "Name", type: "text", group: "customerSignature", showIf: secondOccupier }),
        sig({
          key: "occupier_two_date",
          label: "Date",
          type: "date",
          defaultToday: true,
          group: "customerSignature",
          showIf: secondOccupier,
        }),
        ...acceptance.map((f) => sig({ ...f, showIf: occupierVisible })),
      ],
    },
    {
      id: "director",
      fields: [
        sig({
          key: "director_signature",
          label: "Signed (Director)",
          type: "signature",
          sectionLabel: "Director",
          group: "directorSignature",
          showIf: directorVisible,
        }),
        sig({
          key: "director_name",
          label: "Name",
          type: "text",
          defaultValue: "Sadie Deveraux",
          group: "directorSignature",
          showIf: directorVisible,
        }),
        sig({
          key: "director_date",
          label: "Date",
          type: "date",
          defaultToday: true,
          group: "directorSignature",
          showIf: directorVisible,
        }),
        sig({
          key: "witness_signature",
          label: "Signed (Witness)",
          type: "signature",
          sectionLabel: "Witness",
          group: "directorSignature",
          showIf: directorVisible,
        }),
        sig({ key: "witness_name", label: "Name", type: "text", group: "directorSignature", showIf: directorVisible }),
        sig({
          key: "witness_address",
          label: "Address of Witness",
          type: "textarea",
          group: "directorSignature",
          showIf: directorVisible,
        }),
        sig({
          key: "witness_date",
          label: "Date",
          type: "date",
          defaultToday: true,
          group: "directorSignature",
          showIf: directorVisible,
        }),
      ],
    },
  ],
};
