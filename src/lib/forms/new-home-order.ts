import { parseMoney } from "@/lib/format";
import type { FormDef, FormValues, OptionDef } from "./types";
import {
  MOVE_IN_BLOCKS,
  REQUIRED_OPTS,
  STANDARD_BLOCKS,
  customerSignatureFields,
  fieldFromReservation,
  importantLinksField,
  opts,
  parkDetailsFields,
} from "./common";

const route = (v: FormValues) => String(v["sales_route"] ?? "");
const incentive = (v: FormValues, name: string) =>
  Array.isArray(v["incentives"]) && (v["incentives"] as string[]).includes(name);
const req = (v: FormValues, key: string) => v[key] === "Required";

const copyMoney = (key: string) => (v: FormValues) => {
  const n = parseMoney(v[key]);
  return n === null ? "" : n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
};

const COST_KEYS = [
  "cost_new_home",
  "cost_decking",
  "cost_omar_extras",
  "cost_steps",
  "cost_shed",
  "cost_decking_base",
  "cost_other",
];

/** Step 4 Total Cost = sum of every cost box above it. */
export function computeCostTotal(v: FormValues): string {
  let total = 0;
  let any = false;
  for (const k of COST_KEYS) {
    const n = parseMoney(v[k]);
    if (n !== null) {
      total += n;
      any = true;
    }
  }
  return any ? total.toLocaleString("en-GB", { maximumFractionDigits: 2 }) : "";
}

const num = (v: FormValues, key: string) => parseMoney(v[key]) ?? 0;
const fmt = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 2 });

/** Balance on completion = Total Cost − Deposit − (route-applicable) Estate Agent Fees,
 *  Legal Fee Contribution and Customer Top Up. Hidden, blank or TBC counts as 0. */
export function computeBalanceOnCompletion(v: FormValues): string {
  const r = route(v);
  let n = num(v, "cost_total") - num(v, "cost_deposit");
  if (r === "Spring Managed Sale") n -= num(v, "estate_agent_fees") + num(v, "legal_fee_contribution");
  if (r === "QMP Assisted Move") n -= num(v, "customer_topup");
  return fmt(n);
}

/** Customer Payment Required = Balance − Proceeds. Negative = equity released to the customer. */
export function computeCustomerPayment(v: FormValues): string {
  return fmt(num(v, "balance_on_completion") - num(v, "proceeds"));
}

const STEPS_OPTS: OptionDef[] = [
  { value: "Brick", image: "brick_composite" },
  { value: "Composite", image: "composite" },
];
const HANDRAIL_OPTS: OptionDef[] = [
  { value: "Metal", image: "brick_metal" },
  { value: "Composite", image: "brick_composite" },
];
const UP_OVER_OPTS: OptionDef[] = [
  { value: "Required", image: "up_over" },
  { value: "Not Required", image: "blank" },
];

export const newHomeOrderForm: FormDef = {
  type: "new_home_order",
  title: "New Home Order Form",
  steps: [
    { id: "step-1", fields: parkDetailsFields() },
    {
      id: "step-2",
      heading: "Reserving Your New Home",
      fields: [
        fieldFromReservation("customer_name"),
        fieldFromReservation("customer_address"),
        { ...fieldFromReservation("customer_email"), placeholder: "Email Address" },
        fieldFromReservation("customer_phone"),
        {
          key: "sales_route",
          label: "Sales Route",
          help: "Please note if your sale route changes your package may also change.",
          type: "select",
          options: opts([
            "Part Exchange",
            "Spring Managed Sale",
            "QMP Assisted Move",
            "Part Exchange or Managed Sale – TBC",
            "Cash",
            "TBC",
          ]),
        },
        fieldFromReservation("deposit_date"),
        fieldFromReservation("deposit_amount"),
        fieldFromReservation("payment_method"),
        fieldFromReservation("home_model"),
        fieldFromReservation("pitch_number"),
        {
          key: "new_home_address",
          label: "Full Address for Your New Home",
          type: "text",
          showIf: (v) => route(v) === "Spring Managed Sale",
        },
        fieldFromReservation("home_size"),
        fieldFromReservation("list_price"),
        fieldFromReservation("monthly_pitch_fee"),
        fieldFromReservation("pitch_fee_review_date"),
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
            "Decking Base Extension",
            "Other",
            "None",
          ]),
        },
        {
          key: "discount_home",
          label: "Discount on home - Discount Amount",
          type: "money",
          showIf: (v) => incentive(v, "Discount on home"),
        },
        {
          key: "discount_decking",
          label: "Decking - Discount Amount",
          type: "money",
          showIf: (v) => incentive(v, "Decking"),
        },
        {
          key: "discount_other",
          label: "Other - Discount Amount",
          type: "money",
          showIf: (v) => incentive(v, "Other"),
        },
        fieldFromReservation("handover_date"),
        fieldFromReservation("notes"),
      ],
    },
    {
      id: "step-3",
      heading: "Finalising Customisations and Extras",
      fields: [
        { key: "standard_content", type: "static", content: STANDARD_BLOCKS },
        {
          key: "customisation_heading",
          type: "static",
          content: [
            { kind: "subheading", text: "Customisation of My Home" },
            { kind: "subheading", text: "Choosing my Steps and Handrails" },
          ],
        },
        { key: "steps_front", label: "Steps Front", type: "radio", options: STEPS_OPTS, half: true },
        { key: "steps_back", label: "Steps Back", type: "radio", options: STEPS_OPTS, half: true },
        { key: "handrails_front", label: "Handrails Front", type: "radio", options: HANDRAIL_OPTS, half: true },
        { key: "handrails_back", label: "Handrails Back", type: "radio", options: HANDRAIL_OPTS, half: true },
        {
          key: "extras_heading",
          type: "static",
          content: [
            { kind: "subheading", text: "My Extras" },
            { kind: "subheading", text: "Decking" },
          ],
        },
        {
          key: "include_decking",
          label: "Would you like to include decking?",
          type: "radio",
          options: opts(["Yes", "No"]),
        },
        {
          key: "decking_cost",
          label: "Decking Cost",
          type: "money",
          defaultValue: "0",
          showIf: (v) => v["include_decking"] === "Yes",
        },
        {
          key: "decking_plan",
          label: "Decking Plan",
          type: "file",
          showIf: (v) => v["include_decking"] === "Yes",
        },
        { key: "omar_extras", label: "£", pdfLabel: "Omar Extras", sectionLabel: "Omar Extras", type: "money" },
        {
          key: "up_over_front",
          label: "Up and over steps - Front (£500)",
          type: "radio",
          options: UP_OVER_OPTS,
          sectionLabel: "Upgrading my Steps",
          half: true,
        },
        {
          key: "up_over_back",
          label: "Up and over steps - Back (£500)",
          type: "radio",
          options: UP_OVER_OPTS,
          half: true,
        },
        {
          key: "shed_basic",
          label:
            "Shed base and electric to shed (for you to connect the electric once you have your shed in situ, you would need to erect the shed yourself) (£850)",
          type: "radio",
          options: REQUIRED_OPTS,
          sectionLabel: "Shed Base and Electrics",
        },
        {
          key: "shed_connected",
          label:
            "Shed base and electric to shed, this option includes us connecting the electric to the shed once you have erected yourself (£1,250)",
          type: "radio",
          options: REQUIRED_OPTS,
        },
        {
          key: "decking_base_extension",
          label: "Hardcore base extension from 2.4M to 3M (£2,000)",
          type: "radio",
          options: REQUIRED_OPTS,
          sectionLabel: "Decking Base Extension",
        },
        { key: "pitch_plan", label: "My Pitch Plan", type: "file", sectionLabel: "My Pitch Plan" },
        {
          key: "spec_check_sheet",
          label: "Check Sheet - Spec Sign Off",
          type: "file",
          sectionLabel: "Check Sheet - Spec Sign Off",
        },
        { key: "special_requests", label: "Special Requests", type: "textarea", sectionLabel: "Special Requests", required: false },
      ],
    },
    {
      id: "step-4",
      heading: "Approving Costs for my Home to go into Build",
      fields: [
        { key: "cost_new_home", label: "Cost of my New Home from EKOS (before customisation or extras)", type: "money" },
        { key: "cost_decking", label: "Decking Cost", type: "money", compute: copyMoney("decking_cost") },
        { key: "cost_omar_extras", label: "Omar Extras", type: "money", compute: copyMoney("omar_extras") },
        {
          key: "cost_steps",
          label: "Upgrading Steps",
          type: "money",
          compute: (v) => (500 * [req(v, "up_over_front"), req(v, "up_over_back")].filter(Boolean).length).toLocaleString("en-GB"),
        },
        {
          key: "cost_shed",
          label: "Shed base and Electrics",
          type: "money",
          compute: (v) => ((req(v, "shed_basic") ? 850 : 0) + (req(v, "shed_connected") ? 1250 : 0)).toLocaleString("en-GB"),
        },
        {
          key: "cost_decking_base",
          label: "Decking Base Extension",
          type: "money",
          compute: (v) => (req(v, "decking_base_extension") ? 2000 : 0).toLocaleString("en-GB"),
        },
        { key: "cost_other", label: "Other Costs", type: "money" },
        {
          key: "cost_total",
          label: "Total Cost",
          type: "money",
          help: "Auto-calculated from the costs above. You can overwrite it.",
          compute: computeCostTotal,
        },
        { key: "cost_deposit", label: "Deposit Amount", type: "money", compute: copyMoney("deposit_amount") },
        {
          key: "customer_topup",
          label: "Customer Topup",
          type: "money",
          showIf: (v) => route(v) === "QMP Assisted Move",
        },
        {
          key: "estate_agent_fees",
          label: "Estate Agent Fees",
          type: "money",
          showIf: (v) => route(v) === "Spring Managed Sale",
        },
        {
          key: "legal_fee_contribution",
          label: "Legal Fee Contribution",
          type: "money",
          showIf: (v) => route(v) === "Spring Managed Sale",
        },
        {
          key: "balance_on_completion",
          label: "Balance to be paid on completion",
          type: "money",
          help: "Auto-calculated from the costs above. You can overwrite it.",
          compute: computeBalanceOnCompletion,
        },
        {
          key: "proceeds",
          label: "Proceeds from either Part exchange, Managed Sale or Assisted Move",
          type: "money",
        },
        {
          key: "customer_payment_required",
          label: "Customer Payment Required",
          type: "money",
          help: "Auto-calculated (balance minus proceeds). A negative figure means equity released to the customer. You can overwrite it.",
          compute: computeCustomerPayment,
        },
      ],
    },
    {
      id: "step-5",
      heading: "Important Information",
      fields: [
        { key: "move_in_content", type: "static", content: MOVE_IN_BLOCKS },
        {
          key: "proof_of_funds",
          label: "I agree",
          help: "Sales Person to confirm that proof of funds has been shown if partly or fully paying in cash or selling their own home privately.",
          type: "checkbox",
        },
        importantLinksField(),
      ],
    },
    {
      id: "step-6",
      heading: "Signing off my Home to go into Build",
      fields: [
        fieldFromReservation("rep_name"),
        fieldFromReservation("rep_sign_date"),
        fieldFromReservation("rep_signature"),
      ],
    },
    { id: "step-7", fields: customerSignatureFields() },
  ],
};
