# EKOS Customer Sales Form — roadmap

## Current controlled remediation request
- [ ] Read-only backup/recovery investigation requested at 14:08 UTC: report actual evidence and access gaps, then await renewed owner confirmation; no migration, fixtures or configuration changes permitted.
- [ ] Apply owner-approved exact Section 5 direct-write restriction and verify with new fictional fixtures only — STOPPED at preflight: backup inventory/restore access not verified. Approval received 18 October 2026; fresh privileges/policies captured, SQL unchanged; no migration or record changes performed. Await owner confirmation from More → Database → Manage → Backups and export/recovery access.
- [x] Reinspect R1–R7 and hosted configuration; preview deletion identity, submitted-form action protection, write/signing validation, error checks and fail-closed Drive gate implemented; 86 isolated tests pass and build OK. Invalid signing link visually verified; auth public settings read.
- [ ] Prepare exact shared-boundary migration, compatibility and recovery proposal — awaiting owner approval before applying.
- [ ] Verify direct authenticated database writes, atomic signing and audit/owner controls with approved isolated fixtures — blocked on migration/fixture approval.
- [ ] Complete Forms 1–4 workflow coverage — blocked on approved normal corrections and safe integration boundary.
- [ ] Confirm owner identity, link policy, genuine missing park details and operational requirements — awaiting business input.
- [ ] Produce final criterion-by-criterion evidence and request publishing approval only after blockers are resolved.
- [x] Intermediate evidence and exact first shared direct-write SQL/compatibility/recovery proposal supplied; no hosted migration, workflow mutation, external integration call or publishing executed.

## Controlled production-readiness phases
- [x] Phase 1 review: fresh backend/dependency scans, current hosted policies/grants, security/secret review and dated findings report; 48 tests pass. Release blocked on direct write protection, mutable deletion identity, signing atomicity and owner-only email switch; shared-backend remediation needs explicit approval.
- [ ] Phase 2: reviewed release publishing and EKOS-00065 live Director/rep retest — blocked pending explicit approval and release-blocking findings.
- [ ] Phase 3: complete Forms 1–4 normal-workflow live coverage using approved fictional records — blocked pending Phase 2 and workflow approval; no permission bypasses.
- [ ] Phase 4: configuration read verified email test mode ON, Sheets OFF, Drive linked/configured without an OFF gate, signature path configured and missing park details; obtain business/manual decisions and approval for safe Drive controls.
- [x] Phase 5 provisional operations checklist documented implemented/unverified controls and proposed processes; operational evidence and named responsibilities remain required for final approval.
- [ ] Phase 6: consolidated release evidence and explicit go-live checklist — blocked pending required security, live workflow, configuration and operational approvals.

## Director editor release approval
- [x] Review preview Director editing and rep restrictions; 48 regression tests pass, including eight new server-action tests; Sadie's unchanged-answer Completed UI save and Ben's Completed/cross-owner denials verified.
- [x] Present exact release changes and Pass / Fail / Not Tested evidence in the dated release-review report; request explicit publishing approval.
- [ ] Publish only after approval — blocked pending the owner's approval.
- [ ] Retest EKOS-00065 live as Sadie and Ben: Completed save, own-sale restrictions, editable drafts, Forms 1–4 screens, required fields, conditionals, park autofill/lock and Save & Resume — blocked until approved publishing; use existing accounts/sale only, fictional data, test emails ON and production integrations unchanged.

## Published live smoke test
- [x] Verify live security and Completed edit protection with Ben Cook and Sadie on fictional EKOS-00065.
- [ ] Click through Forms 1–4 live — blocked: Sadie's editor correction is unpublished at the user's request.
- [x] Verify live signing, PDFs, emails, tracker and audit history without enabling production integrations.
- [x] Report executed results and remaining release actions.

## Email loading report
- [x] Replace endless loading on missing/inaccessible email destinations with a clear message and retry/navigation.
- [x] Verify review and resume links for existing forms and the deleted EKOS-00055; signed-in checks passed, 13 link/field tests passed and build OK.

## Current Sadie feedback
- [x] Omit Status Guide and Status fields from every review and completed PDF; all ten samples rendered and visually inspected (four affected forms plus Identification Checks, which has neither field); text checks confirm removal, 18 tests pass and build OK. Web forms unchanged; no emails sent.
- [x] Correct every guide section to visible sentence bullets; all seven sections expanded and photographed, Reservation PDF pages 3–4 and New Home Order page 5 rendered and inspected; 17 regression tests passed, build OK. No saved sale changes or emails sent.
- [x] TBC handover and optional Notes across matching fields
- [x] Shared guide introduction, always-visible access notice and consistent bullets
- [x] Working draft resume and review-email links (App base URL corrected)
- [x] PDF helper removal and redundant approval instructions removed; actual signatures retained
- [x] 17 focused tests; saved draft and review login destinations verified; sample PDFs for all five forms inspected; test sale deleted

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
