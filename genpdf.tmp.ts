import { generateFormPdf } from "./src/lib/pdf/generate.server";
import { getForm } from "./src/lib/forms/registry";
import { writeFileSync } from "fs";
const def = getForm("new_home_order")!;
const values: Record<string, unknown> = {
  park_name: "Carlton Manor", park_address: "Carlton Manor, Norfolk", sales_person: "Ben Cook",
  customer_name: "Jane Sample", customer_email: "jane@example.com", customer_phone: "07123456789",
  sales_route: "Spring Managed Sale", deposit_amount: "1000", list_price: "200000",
  steps_front: "Brick", steps_back: "Composite", handrails_front: "Metal", handrails_back: "Composite",
  decking_choice: "Yes", decking_cost: "5000", total_cost: "205000",
  sales_person_name: "Ben Cook", sales_person_sign_date: "2026-09-29",
};
const bytes = await generateFormPdf({ def, values, ctx: { mode: "onsite", isDirector: false } as never, orderNumber: "EKOS-00099", park: "Carlton Manor", customerName: "Jane Sample", parkLinks: {} as never });
writeFileSync("/tmp/sample.pdf", bytes);
console.log("ok", bytes.length);
