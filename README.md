# EKOS Customer Sales Forms

Project name: EKOS Customer Sales Form

We are rebuilding EKOS Group's (UK residential park homes) customer sales paperwork system as a standalone web app. Today it runs as 5 Fluent Forms on their WordPress site (ekosgroup.co.uk). The new app must reproduce those forms EXACTLY (same wording, field order, labels, options, steps) and run all the back-end automations. I'll send the forms one at a time. In THIS message: build the foundation, the shared form engine, all the automations, and Form 1 (Customer Reservation Form). Later messages add Forms 2–5 on the same engine.

Use Lovable Cloud (database, auth, storage, edge functions).

=== BRANDING (match ekosgroup.co.uk) ===
- Logo: https://ekosgroup.co.uk/wp-content/uploads/2024/04/EKOS_Logo-Design-03.webp (download into the project)
- Dark green #07362E (header bar, headings, progress bar fill). Gold #C18F4C (Next / Submit buttons). Save & Resume button #B19166, white text.
- Headings in Futura (fallback: "Jost", sans-serif from Google Fonts). Body in system sans-serif.
- Form layout like the live site: centred white card, form title as a large centred dark-green heading, step progress bar "Step 1 of 6 – 16%", labels bold above inputs, red asterisk on required fields, £ prefix inside price inputs, Previous / Next buttons at the bottom of each step, Save & Resume button on every step.
- Mobile-friendly (reps use iPads on site).

=== USERS & ROLES ===
- Staff login (email + password). Roles: "rep" (sales reps) and "director" (Sadie – sadie@ekosgroup.co.uk). Director can see and edit everything; reps see submissions they created.
- Customers never log in – they use secure tokenised links for off-site signing.

=== DATA MODEL ===
- A "Sale" groups the 5 forms for one customer. Each sale gets an auto-generated Order Number (format EKOS-00001, incrementing). Park is chosen once on the first form of the sale and CARRIES OVER to every later form – it is never chosen by the customer.
- Each form submission: form type, sale id, order number, all field values (JSON), uploaded files, signatures (PNG), status, audit history (who/when/status changes), draft flag, generated PDF path.
- Settings table (editable by director in an Admin > Settings page): parks list, sales people list, notification emails (sales@ekosgroup.co.uk, sadie@ekosgroup.co.uk, construction team email – blank for now), per-park link URLs for Brochure / Site Licence / Park Rules (blank = TBC), Sadie's stored signature image, Google Drive folder id.

=== THE 5 FORMS (in this order) ===
1. Customer Reservation Form (at deposit stage)
2. Identification Checks (within 2 weeks after deposit)
3. New Home Order Form (before home goes into build)
4. Unit Sale Agreement & Welcome Pack (on completion)
5. Your Written Statement (signed on completion / move-in day)
Plus: an "EKOS Customer Order Form Amendments" form (Customer Code, Amendment, Sales Person's Full Name, Sales Person's Signature, Sales Person's Date of Signing, Submit Form) usable against any form.

=== RULES THAT APPLY TO EVERY FORM (build these into the shared engine so a fix on one form is a fix on all) ===
1. The PDF must match the web page EXACTLY: every word, every static text block, every link (clickable in the PDF), every field and its answer, every uploaded document (images embedded, PDFs appended as pages), in the same order, with no boxes missing. It's a contract – if it's not on the PDF the customer has no record of it.
2. The form title appears at the top of every PDF (plus EKOS logo, order number, park, customer name).
3. File naming: PDF file = "Form Name_Park_Customer Name_Order Number.pdf". Google Drive copy = "Customer Name - Park Name - Order Number.pdf".
4. No empty boxes: ALL visible fields are mandatory on Submit (conditional fields only when shown – e.g. discount boxes are only required if that incentive is selected). Reps type "TBC" if waiting on info, or use Save & Resume. Show a helper line under the form title: "All boxes are mandatory – type TBC if you're waiting on information, or use Save & Resume to finish later."
5. Every form has Save & Resume and Submit, identical styling on all forms. Save & Resume saves a draft (no validation) and gives the rep a resume link (also emailed to the rep); drafts appear in the rep's dashboard.
6. £ prefix on every price field, on every form. Price fields accept numbers or "TBC"; display as £299,995.
7. Discount maths: if a discount is entered, Total Cost auto-calculates as List Price minus the discount amount(s) (e.g. £299,995 − £10,000 = £289,995). The rep can overwrite it. It must NEVER show the discount amount as the total.
8. Status values: "In Review", "In Review (Offsite)", "Completed". Reps can only submit with In Review or In Review (Offsite). "Completed" is Sadie's step only – hide/disable it for reps (keep the Status Guide wording on the form).
9. On submission Sadie gets a "Review (& Signature) Required" email containing: link to the PDF, link to the tracker entry, and link to the staff login.
10. When Sadie changes status to "Completed" in the back end, her stored signature (with her name "Sadie Deveraux", title "Director – authorised signatory of EKOS Group" and date) merges into the PDF automatically in a dedicated EKOS signature block at the end, and the completion emails go out (rule 14). The Written Statement works differently – I'll describe it in its own message.
11. Sadie can also mark "Disapproved" with a note: the rep is emailed, the form reopens for edits, and it "stays here until edits are complete" – when the rep resubmits it goes back to Sadie for review.
12. ON SITE vs OFF SITE:
   - On site ("In Review"): rep and customer complete the form together; the customer ticks the T&Cs and signs on the day on the customer signature step.
   - Off site ("In Review (Offsite)"): the rep completes and signs; the customer signature fields are NOT required on the original form. On submit the customer is emailed the PDF with a note of their order number and a secure link to the off-site signature page. That page pre-fills order number, customer name, email and park (read-only – no park drop-down), shows a "View your full form (PDF)" link, and asks for: Customer One Full Name, Customer One Signature, Customer One Date of signing, "Is there a second customer?" Yes/No → Customer Two Full Name / Signature / Date, then the two acceptance checkboxes. On the off-site page all signature fields and checkboxes are MANDATORY. On submit the customer's signatures MERGE BACK into the original submission and PDF, and Sadie gets the Review (& Signature) Required email.
   - The rep never agrees to T&Cs. The T&Cs tick and the "I understand / I agree" box sit only on the customer signature step/page. The customer must accept the T&Cs before their signature can be submitted (on site and off site).
13. Signatures on every form: sales rep signature, 1 or 2 customer signatures (depending on "Is there a second customer?"), and Sadie's signature added on completion. Use a signature pad ("Sign Here", with Clear button). All signatures render in the PDF with name and date.
14. EMAILS: every email is sent FROM sales@ekosgroup.co.uk (never admin@, never per-park). Use Resend (set up the integration and tell me what DNS/API key is needed). On completion the SAME branded customer email (EKOS logo, green/gold, "Your [Form Name] is complete – please find your signed copy attached", order number) goes to: the customer email, the park inbox email entered in Step 1 (e.g. carltonmanor@…) which is how the rep receives it, sales@ekosgroup.co.uk and sadie@ekosgroup.co.uk. It attaches the merged PDF with all signatures.
15. The final merged PDF is saved to the EKOS Google Drive folder (folder id 1Q4nN9KEZigJadDPT5F28sr2xE_CVIMSu – store in settings) using the Drive naming format. Set up the Google Drive connection; if it needs me to connect an account, tell me. Also keep every PDF in Cloud storage.
16. Step with the links page ("Important Information") stays so the rep can talk the customer through the links on site – nothing is agreed on that page. All those links must also be clickable in the PDF.

=== BACK END (Admin) ===
- Tracker dashboard: one row per Sale (order number, customer, park, sales person, deposit date), with a status chip for each of the 5 forms (Not started / Draft / In Review / In Review (Offsite) / Awaiting customer signature / Disapproved / Completed). Filter by park, sales person, status; search by customer/order number.
- Submission detail: view all answers in form order, view/download PDF, change status (Completed / Disapproved + note), view audit log, resend emails, copy off-site signing link.
- Reps' dashboard: "Start new sale" (opens Reservation Form), "Continue a sale" (pick an existing sale to start its next form – park and customer details prefill), my drafts.
- Email log table so we can see every email sent.

=== FORM 1: CUSTOMER RESERVATION FORM – build exactly as below ===
Title: "Customer Reservation Form". 6 steps.

STEP 1 (no heading)
- Park Name (dropdown): Carlton Manor | Castle View | Coastal Retreat | Dales View | Harvey's Nurseries | Haveringland Hall | Merry Hill | Outhill View | Sun Valley | Walworth Retreat
- Park Address (text)
- Bank Account (text) and Sort Code (text) – side by side, two columns
- Goldshield Registration Details (text)
- Limited Company Name / Bank Account Name (text)
- Limited Company Number (text)
- Phone Number (phone)
- Email (email) ← this is the park inbox used for notifications
- Sales Person (dropdown): Ben Cook | Alison Dallimer | Sadie Deveraux | Melanie Davidson | Jenna Fowler | Chris Harris | Claire McCulloch | Jackie Hilditch | Bryan Marquis | Lisa Buchan | Cheryl Smith | Charlotte Simnett | Angela Dobbs
[Save & Resume] [Next]

STEP 2 – heading "Reserving Your New Home"
- Customer Name
- Customer Address
- Customer Phone (phone)
- Customer Email (email)
- Sales Route (Please note if your sale route changes your package may also change.) (dropdown): Part Exchange | Managed Sale | Part Exchange or Managed Sale – TBC | Cash | TBC
- Date Deposit Taken (date picker, dd/mm/yyyy)
- Deposit Amount (£)
- Payment Method (dropdown): Bank Transfer | Card
- Omar Home Name / Model
- Pitch Number
- Home Size
- List Price (£)
- Initial Monthly Pitch Fee (£)
- Annual Pitch Fee Review Date (text)
- sub-heading "Incentives"
- Your Incentives (multi-select, placeholder "Choose your Incentives..."): Free Site Fees for a Year | Free Estate Agent and Solicitor Fees | Free Utilities for a Year | Discount on home | Shed base and electric to shed | Shed base and electric connected to shed | Decking | Other | None
   - "Discount on home - Discount Amount" (£) – only shows if "Discount on home" selected
   - "Decking - Discount Amount" (£) – only if "Decking" selected
   - "Other - Discount Amount" (£) – only if "Other" selected
- Total Cost (£) – auto-calculated per rule 7 (List Price minus discounts), editable
- Handover Date (Completion Date) (date)
- Notes (textarea)
[Save & Resume] [Previous] [Next]

STEP 3 – static content, reproduce word for word with the same headings and bullet lists:
Heading: "Our Helpful Guide to Your New Home"
Sub-heading: "What Comes as Standard with My New Home"
• Turf
• Bricking in of your new home
• Patio slabs (2 × 450mm slabs)
• 2.4m hardcore base for decking
• Block paved driveway for two cars
• Red robin low level planting for plot division
• Brick steps or composite steps with handrails
Please note: The cost of your new home is based on standard design and manufacture. Any extras incurred will be communicated and signed off separately
Sub-heading: "Extras to Consider"
• Up and over steps with railings £500 per set of steps
• Shed base and electric to shed (for you to connect the electric once you have your shed in situ, you would need to erect the shed yourself) £850
• Shed base and electric to shed, this option includes us connecting the electric to the shed once you have erected yourself £1,250
• Decking base extension – hardcore base extension from 2.4M to 3M £2,000
• Any upgrades agreed with Omar
• Decking
• Fencing
• Wheelchair access with a ramp
Sub-heading: "What Happens Next Guide"
Identification Checks
Two forms of identification will be required within the next two weeks:
• One form of photographic identification: either a valid passport or a valid UK driving licence.
• One form of proof of address: either a recent council tax statement, bank statement, or utility bill showing the Customer's current residential address.
Decking
We will copy you into an email introducing you to UK Sun Decks if you're interested in a decking quotation. If you purchase decking, this will be added onto your final payment with us.
Omar
We will copy you into an email introducing you to Omar to start designing your new home. If relevant, we will include an initial floor plan. Omar will agree a date with you either in person or via a video call to go through the design of your new home, including a full specification and choice of upgrades. Once you're comfortable with the specification, Omar will email you an order form detailing the cost of any upgrades. Your home will then go into build, and we will agree a move-in date for your new home.
Part Exchange or Managed Move
We will ask either Spring or Quick Move to contact you to arrange valuations and discuss the sale of your home. Once valuations have taken place, options will be presented for you to choose.
Before Build
When your home is ready to go into build, we will invite you to meet with us to sign off your order with Omar and to sign your New Home Order form with EKOS
Proof of funds will be required if paying partly or fully in cash, or if you're selling your own home privately.
On Move-In Day
• You will sign your written statement.
• You will receive your welcome pack and keys.
• Provide insurance documentation for your new home to EKOS.
• Provide next of kin details to EKOS in case of emergencies.
• You will sign your Unit Sale Agreement.
Until the completion date, we're unable to grant access to the property due to health, safety, and insurance requirements. However, we can provide photos and take any measurements you may need.
[Save & Resume] [Previous] [Next]

STEP 4 – heading "Important Information" – a list of links (open in new tab; also clickable in PDF):
• Your Draft Written Statement → https://ekosgroup.co.uk/wp-content/uploads/2026/07/Your-Written-Statement-Draft-1.pdf
• Protecting You With the Mobile Homes Act → https://www.gov.uk/government/publications/park-homes-know-your-rights/park-homes-know-your-rights
• Our Brochure for Further Information → per-park URL from Settings (show "(link to follow)" if blank)
• Our Site Licence → per-park URL from Settings
• Our Park Rules → per-park URL from Settings
• Terms & Conditions → https://ekosgroup.co.uk/wp-content/uploads/2026/05/EKOS-Group-Master-Terms-Conditions-1.pdf
Nothing is agreed on this page.
[Save & Resume] [Previous] [Next]

STEP 5 – heading "Finalising Your Reservation"
- Sales Person's Full Name
- Sales Person's Signature (signature pad)
- Sales Person's Date of signing (date, default today)
[Save & Resume] [Previous] [Next]

STEP 6 – customer signature step
- Status Guide (static text): "Status Guide: In Review – use when rep & customer have both signed form on site. In Review (offsite) – use when rep has signed & customer wants to sign at home or at later date. Completed – do not use – Director use only."
- Status (dropdown): In Review | In Review (Offsite) | Completed (Completed disabled for reps)
- If Status = In Review (on site), show and REQUIRE:
  - Customer One Full Name, Customer One Signature, Customer One Date of signing
  - Is there a second customer? (Yes / No) → if Yes: Customer Two Full Name, Customer Two Signature, Customer Two Date of signing
  - Checkbox: "I have read and agree to the Terms and Conditions" (Terms and Conditions links to the T&Cs PDF)
  - Checkbox: "I understand that the cost of my new home may increase should I choose extras, I agree to pay these costs in full. These will be agreed and signed for separately"
  - Submit is blocked until both boxes are ticked.
- If Status = In Review (Offsite): hide the customer signature fields and checkboxes (they'll be completed on the off-site signing page, rule 12).
- Static text at the bottom: "Orders are not valid until they have been approved and signed by an authorised signatory of EKOS Group"
[Save & Resume] [Previous] [Submit Form]

=== AUTOMATION FLOW FOR THE RESERVATION FORM (the same pattern will apply to the other forms) ===
1. Sales rep drafts the form before the customer arrives → Save Draft (Save & Resume).
2. Customer + sales rep complete it.
3a. Customer on site → signs on step 6 → rep chooses "In Review" → Submit.
3b. Customer wants to review & sign at home → rep chooses "In Review (Offsite)" → Submit → system emails the customer the PDF with their order number and the off-site signing link (pre-fills order number, full name, email; customer adds signature(s), date and ticks acceptances) → signatures merge back into the original form.
4. Completed form with signatures is emailed to Sadie for sign-off approval ("Review (& Signature) Required"). PDF named per rule 3; a copy is saved in Cloud storage.
5a. Sadie approves → status Completed → her signature merges into the PDF → branded completion email with the merged PDF to customer, park inbox (rep), sales@ and sadie@ → merged PDF saved to Google Drive as "Customer Name - Park Name - Order Number".
5b. Sadie disapproves → stays with the rep until edits are complete → resubmitted to Sadie.
6. Once the Reservation is Completed, the tracker shows "Identification Checks" as the next form for that sale.

Please build all of this now, seed the parks and sales people into Settings, and create a way for me to set the first director account (sadie@ekosgroup.co.uk). Test the Reservation Form end to end (on-site and off-site paths) including PDF generation. When done, list anything that needs credentials or setup from me (Resend domain/API key, Google Drive connection).

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://ekos-form-flow.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/bcc818c5-4e07-4ebe-94b2-ee00eb74094c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
