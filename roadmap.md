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

## Later messages
- Form 4: Unit Sale Agreement & Welcome Pack
- Form 5: Your Written Statement (different completion flow)
- EKOS Customer Order Form Amendments

## Blocked / needs the user
- Google Drive: connected account needs EDIT access to the EKOS Forms folder
- Resend API key + verified sending domain for sales@ekosgroup.co.uk
- Per-park Brochure / Site Licence / Park Rules URLs (blank = "link to follow")
- Construction team notification email (needed for New Home Order Form sign-off emails)
- Sadie's signature image upload (Admin > Settings)

## Constraint
- No Zapier: all automations live in this app.
