# EKOS Customer Sales Form — roadmap

## Done
- Lovable Cloud enabled (database, auth, storage)
- Schema: profiles, user_roles (rep/director), parks, sales_people, app_settings, sales (EKOS-00001 order numbers), form_submissions, submission_files, audit_log, signing_tokens, email_log
- Storage bucket `ekos-documents`
- Parks + sales people + settings seeded
- Google Drive connector linked

## Done (Form 1 + platform, tested end to end)
- Branding / design system + EKOS logo + Jost headings
- Shared form engine (steps, progress bar, validation, Save & Resume, signature pad, £ fields, discount maths)
- Form 1: Customer Reservation Form (6 steps)
- PDF generation mirroring the web form exactly
- Emails (Resend) + Google Drive upload + email log
- Off-site customer signing page (tokenised)
- Rep dashboard + Admin tracker / submission detail / settings
- Director bootstrap for sadie@ekosgroup.co.uk

## Done (Forms 2 + 3)
- Identification Checks (ID uploads embedded in PDF) – tested on/off site + Completed
- New Home Order Form incl. Construction sign-off page – tested on/off site + Completed
- Form 4: Unit Sale Agreement & Welcome Pack – tested on/off site + Completed

## Later messages
- [x] Form 5: Your Written Statement (customer → Sadie + witness, Word export) — done
- EKOS Customer Order Form Amendments

## Done (automations)
- Live EKOS automations rebuilt in-app: lookup tables, 5 branded emails, Drive per-customer folders + stage PDFs, Google tracker sheet sync (off by default), email log preview

## Done (Sadie feedback)
- Written Statement single-PDF layout checked; email links via App base URL; tracker deep-link after login; "Send test of every email" button
- Dashboard: Sadie sees all parks and sales; reps see only their assigned parks and sales they created.
- Resend connected and ekosgroup.co.uk verified — mail from sales@ekosgroup.co.uk delivers (Sadie received a test on 13 Oct 2026). Test mode still ON: all emails go to Emma, Eilidh and Sadie only.

## Blocked / needs the user
- Publish the app (email links point at the published address)
- Google Drive: connected account needs EDIT access to the EKOS Forms folder
- Per-park Brochure / Site Licence / Park Rules URLs (blank = "link to follow")
- Sadie's signature image upload (Admin > Settings)

## Constraint
- No Zapier: all automations live in this app.

## Go-live checklist addition
- [ ] Give Sadie the can_delete_sales permission and remove it from the test accounts (Admin → Settings → User permissions).
