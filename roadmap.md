# EKOS Customer Sales Form — roadmap

## Done
- Lovable Cloud enabled (database, auth, storage)
- Schema: profiles, user_roles (rep/director), parks, sales_people, app_settings, sales (EKOS-00001 order numbers), form_submissions, submission_files, audit_log, signing_tokens, email_log
- Storage bucket `ekos-documents`
- Parks + sales people + settings seeded
- Google Drive connector linked

## In progress (this message)
- Branding / design system + EKOS logo + Jost headings
- Shared form engine (steps, progress bar, validation, Save & Resume, signature pad, £ fields, discount maths)
- Form 1: Customer Reservation Form (6 steps)
- PDF generation mirroring the web form exactly
- Emails (Resend) + Google Drive upload + email log
- Off-site customer signing page (tokenised)
- Rep dashboard + Admin tracker / submission detail / settings
- Director bootstrap for sadie@ekosgroup.co.uk

## Later messages
- Form 2: Identification Checks
- Form 3: New Home Order Form
- Form 4: Unit Sale Agreement & Welcome Pack
- Form 5: Your Written Statement (different completion flow)
- EKOS Customer Order Form Amendments

## Blocked / needs the user
- Resend API key + verified sending domain for sales@ekosgroup.co.uk
- Per-park Brochure / Site Licence / Park Rules URLs (blank = "link to follow")
- Construction team notification email
- Sadie's signature image upload (Admin > Settings)
