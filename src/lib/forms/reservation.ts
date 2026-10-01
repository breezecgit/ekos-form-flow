import { parseMoney } from "@/lib/format";
import type { FormDef, FormValues, OptionDef } from "./types";

export const PARK_OPTIONS = [
  "Carlton Manor",
  "Castle View",
  "Coastal Retreat",
  "Dales View",
  "Harvey's Nurseries",
  "Haveringland Hall",
  "Merry Hill",
  "Outhill View",
  "Sun Valley",
  "Walworth Retreat",
];

export const SALES_PEOPLE = [
  "Ben Cook",
  "Alison Dallimer",
  "Sadie Deveraux",
  "Melanie Davidson",
  "Jenna Fowler",
  "Chris Harris",
  "Claire McCulloch",
  "Jackie Hilditch",
  "Bryan Marquis",
  "Lisa Buchan",
  "Cheryl Smith",
  "Charlotte Simnett",
  "Angela Dobbs",
];

const opts = (values: string[]): OptionDef[] => values.map((v) => ({ value: v }));

export const TERMS_URL =
  "https://ekosgroup.co.uk/wp-content/uploads/2026/05/EKOS-Group-Master-Terms-Conditions-1.pdf";

export const STATUS_OPTIONS: OptionDef[] = [
  { value: "In Review", label: "Customer Signing Live" },
  { value: "In Review (Offsite)", label: "Customer Signing Offsite" },
  { value: "Completed", label: "Completed", directorOnly: true },
];

export const STATUS_GUIDE =
  "Status Guide: Customer Signing Live (In Review) – use when rep & customer have both signed form on site. Customer Signing Offsite (In Review (offsite)) – use when rep has signed & customer wants to sign at home or at later date. Completed – do not use – Director use only.";

const incentiveSelected = (values: FormValues, name: string) => {
  const v = values["incentives"];
  return Array.isArray(v) && v.includes(name);
};

const DISCOUNTS: Array<[string, string]> = [
  ["discount_home", "Discount on home"],
  ["discount_decking", "Decking"],
  ["discount_other", "Other"],
];

/** Total Cost = List Price minus the discount amounts that are showing. Blank if List Price is TBC/empty. */
export function computeTotalCost(values: FormValues): string {
  const list = parseMoney(values["list_price"]);
  if (list === null) return "";
  let total = list;
  for (const [key, incentive] of DISCOUNTS) {
    if (!incentiveSelected(values, incentive)) continue;
    const d = parseMoney(values[key]);
    if (d !== null) total -= d;
  }
  return total.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

/** Customer signature fields are hidden on the original form when off site. */
const onSiteOnly = (values: FormValues, ctx: { mode: string }) =>
  ctx.mode === "offsite" ||
  values["status"] === "In Review" ||
  Boolean(values["customer_one_signature"]);

export const reservationForm: FormDef = {
  type: "reservation",
  title: "Customer Reservation Form",
  steps: [
    {
      id: "step-1",
      fields: [
        { key: "park_name", label: "Park Name", type: "select", options: opts(PARK_OPTIONS) },
        { key: "park_address", parkField: "address", label: "Park Address", type: "text" },
        { key: "bank_account", parkField: "bank_account", label: "Bank Account", type: "text", half: true },
        { key: "sort_code", parkField: "sort_code", label: "Sort Code", type: "text", half: true },
        {
          key: "goldshield_registration",
          parkField: "goldshield",
          label: "Goldshield Registration Details",
          type: "text",
        },
        {
          key: "company_name",
          parkField: "company_name",
          label: "Limited Company Name / Bank Account Name",
          type: "text",
        },
        { key: "company_number", parkField: "company_number", label: "Limited Company Number", type: "text" },
        { key: "park_phone", parkField: "phone", label: "Phone Number", type: "tel" },
        { key: "park_email", parkField: "inbox_email", label: "Email", type: "email" },
        { key: "sales_person", label: "Sales Person", type: "select", options: opts(SALES_PEOPLE) },
      ],
    },
    {
      id: "step-2",
      heading: "Reserving Your New Home",
      fields: [
        { key: "customer_name", label: "Customer Name", type: "text" },
        { key: "customer_address", label: "Customer Address", type: "text" },
        { key: "customer_phone", label: "Customer Phone", type: "tel" },
        { key: "customer_email", label: "Customer Email", type: "email" },
        {
          key: "sales_route",
          label: "Sales Route",
          help: "Please note if your sale route changes your package may also change.",
          type: "select",
          options: opts([
            "Part Exchange",
            "Managed Sale",
            "Part Exchange or Managed Sale – TBC",
            "Cash",
            "TBC",
          ]),
        },
        { key: "deposit_date", label: "Date Deposit Taken", type: "date" },
        { key: "deposit_amount", label: "Deposit Amount", type: "money" },
        {
          key: "payment_method",
          label: "Payment Method",
          type: "select",
          options: opts(["Bank Transfer", "Card"]),
        },
        { key: "home_model", label: "Omar Home Name / Model", type: "text" },
        { key: "pitch_number", label: "Pitch Number", type: "text" },
        { key: "home_size", label: "Home Size", type: "text" },
        { key: "list_price", label: "List Price", type: "money" },
        { key: "monthly_pitch_fee", label: "Initial Monthly Pitch Fee", type: "money" },
        { key: "pitch_fee_review_date", parkField: "pitch_fee_review_date", label: "Annual Pitch Fee Review Date", type: "text" },
        {
          key: "incentives",
          label: "Your Incentives",
          sectionLabel: "Incentives",
          type: "multiselect",
          placeholder: "Choose your Incentives...",
          options: opts([
            "Free Site Fees for a Year",
            "Free Estate Agent and Solicitor Fees",
            "Free Utilities for a Year",
            "Discount on home",
            "Shed base and electric to shed",
            "Shed base and electric connected to shed",
            "Decking",
            "Other",
            "None",
          ]),
        },
        {
          key: "discount_home",
          label: "Discount on home - Discount Amount",
          type: "money",
          showIf: (v) => incentiveSelected(v, "Discount on home"),
        },
        {
          key: "discount_decking",
          label: "Decking - Discount Amount",
          type: "money",
          showIf: (v) => incentiveSelected(v, "Decking"),
        },
        {
          key: "discount_other",
          label: "Other - Discount Amount",
          type: "money",
          showIf: (v) => incentiveSelected(v, "Other"),
        },
        {
          key: "total_cost",
          label: "Total Cost",
          type: "money",
          compute: computeTotalCost,
          help: "Auto-calculated from the List Price minus any discounts. You can overwrite it.",
        },
        { key: "handover_date", label: "Handover Date (Completion Date)", type: "date" },
        { key: "notes", label: "Notes", type: "textarea" },
      ],
    },
    {
      id: "step-3",
      fields: [
        {
          key: "guide_content",
          type: "static",
          content: [
            { kind: "heading", text: "Our Helpful Guide to Your New Home" },
            { kind: "subheading", text: "What Comes as Standard with My New Home" },
            {
              kind: "bullets",
              items: [
                "Turf",
                "Bricking in of your new home",
                "Patio slabs (2 × 450mm slabs)",
                "2.4m hardcore base for decking",
                "Block paved driveway for two cars",
                "Red robin low level planting for plot division",
                "Brick steps or composite steps with handrails",
              ],
            },
            {
              kind: "note",
              text: "Please note: The cost of your new home is based on standard design and manufacture. Any extras incurred will be communicated and signed off separately",
            },
            { kind: "subheading", text: "Extras to Consider" },
            {
              kind: "bullets",
              items: [
                "Up and over steps with railings £500 per set of steps",
                "Shed base and electric to shed (for you to connect the electric once you have your shed in situ, you would need to erect the shed yourself) £850",
                "Shed base and electric to shed, this option includes us connecting the electric to the shed once you have erected yourself £1,250",
                "Decking base extension – hardcore base extension from 2.4M to 3M £2,000",
                "Any upgrades agreed with Omar",
                "Decking",
                "Fencing",
                "Wheelchair access with a ramp",
              ],
            },
            { kind: "subheading", text: "What Happens Next Guide" },
            {
              kind: "accordion",
              title: "Identification Checks",
              blocks: [
                {
                  kind: "paragraph",
                  text: "Two forms of identification will be required within the next two weeks:",
                },
                {
                  kind: "bullets",
                  items: [
                    "One form of photographic identification: either a valid passport or a valid UK driving licence.",
                    "One form of proof of address: either a recent council tax statement, bank statement, or utility bill showing the Customer's current residential address.",
                  ],
                },
              ],
            },
            {
              kind: "accordion",
              title: "Decking",
              blocks: [
                {
                  kind: "paragraph",
                  text: "We will copy you into an email introducing you to UK Sun Decks if you're interested in a decking quotation. If you purchase decking, this will be added onto your final payment with us.",
                },
              ],
            },
            {
              kind: "accordion",
              title: "Omar",
              blocks: [
                {
                  kind: "paragraph",
                  text: "We will copy you into an email introducing you to Omar to start designing your new home. If relevant, we will include an initial floor plan. Omar will agree a date with you either in person or via a video call to go through the design of your new home, including a full specification and choice of upgrades. Once you're comfortable with the specification, Omar will email you an order form detailing the cost of any upgrades. Your home will then go into build, and we will agree a move-in date for your new home.",
                },
              ],
            },
            {
              kind: "accordion",
              title: "Part Exchange or Managed Move",
              blocks: [
                {
                  kind: "paragraph",
                  text: "We will ask either Spring or Quick Move to contact you to arrange valuations and discuss the sale of your home. Once valuations have taken place, options will be presented for you to choose.",
                },
              ],
            },
            {
              kind: "accordion",
              title: "Before Build",
              blocks: [
                {
                  kind: "paragraph",
                  text: "When your home is ready to go into build, we will invite you to meet with us to sign off your order with Omar and to sign your New Home Order form with EKOS",
                },
                {
                  kind: "paragraph",
                  text: "Proof of funds will be required if paying partly or fully in cash, or if you're selling your own home privately.",
                },
              ],
            },
            {
              kind: "accordion",
              title: "On Move-In Day",
              blocks: [
                {
                  kind: "bullets",
                  items: [
                    "You will sign your written statement.",
                    "You will receive your welcome pack and keys.",
                    "Provide insurance documentation for your new home to EKOS.",
                    "Provide next of kin details to EKOS in case of emergencies.",
                    "You will sign your Unit Sale Agreement.",
                  ],
                },
                {
                  kind: "paragraph",
                  text: "Until the completion date, we're unable to grant access to the property due to health, safety, and insurance requirements. However, we can provide photos and take any measurements you may need.",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "step-4",
      heading: "Important Information",
      fields: [
        {
          key: "important_links",
          type: "links",
          links: [
            {
              label: "Your Draft Written Statement",
              url: "https://ekosgroup.co.uk/wp-content/uploads/2026/07/Your-Written-Statement-Draft-1.pdf",
            },
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
      ],
    },
    {
      id: "step-5",
      heading: "Finalising Your Reservation",
      fields: [
        { key: "rep_name", label: "Sales Person's Full Name", type: "text" },
        { key: "rep_signature", label: "Sales Person's Signature", type: "signature" },
        {
          key: "rep_sign_date",
          label: "Sales Person's Date of signing",
          type: "date",
          defaultToday: true,
        },
      ],
    },
    {
      id: "step-6",
      fields: [
        {
          key: "status_guide",
          type: "static",
          content: [{ kind: "note", text: STATUS_GUIDE }],
        },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: STATUS_OPTIONS,
          showIf: (_v, ctx) => ctx.mode === "rep",
        },
        {
          key: "customer_one_name",
          label: "Customer One Full Name",
          type: "text",
          group: "customerSignature",
          showIf: onSiteOnly,
        },
        {
          key: "customer_one_signature",
          label: "Customer One Signature",
          type: "signature",
          group: "customerSignature",
          showIf: onSiteOnly,
        },
        {
          key: "customer_one_date",
          label: "Customer One Date of signing",
          type: "date",
          defaultToday: true,
          group: "customerSignature",
          showIf: onSiteOnly,
        },
        {
          key: "second_customer",
          label: "Is there a second customer?",
          type: "radio",
          options: opts(["Yes", "No"]),
          group: "customerSignature",
          showIf: onSiteOnly,
        },
        {
          key: "customer_two_name",
          label: "Customer Two Full Name",
          type: "text",
          group: "customerSignature",
          showIf: (v, ctx) => onSiteOnly(v, ctx) && v["second_customer"] === "Yes",
        },
        {
          key: "customer_two_signature",
          label: "Customer Two Signature",
          type: "signature",
          group: "customerSignature",
          showIf: (v, ctx) => onSiteOnly(v, ctx) && v["second_customer"] === "Yes",
        },
        {
          key: "customer_two_date",
          label: "Customer Two Date of signing",
          type: "date",
          defaultToday: true,
          group: "customerSignature",
          showIf: (v, ctx) => onSiteOnly(v, ctx) && v["second_customer"] === "Yes",
        },
        {
          key: "accept_terms",
          label: "I have read and agree to the Terms and Conditions",
          type: "checkbox",
          group: "customerSignature",
          showIf: onSiteOnly,
        },
        {
          key: "accept_extras",
          label:
            "I understand that the cost of my new home may increase should I choose extras, I agree to pay these costs in full. These will be agreed and signed for separately",
          type: "checkbox",
          group: "customerSignature",
          showIf: onSiteOnly,
        },
        {
          key: "authorised_signatory_note",
          type: "static",
          content: [
            {
              kind: "note",
              text: "Orders are not valid until they have been approved and signed by an authorised signatory of EKOS Group",
            },
          ],
        },
      ],
    },
  ],
};
