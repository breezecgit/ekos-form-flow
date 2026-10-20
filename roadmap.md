# EKOS Customer Sales Form — roadmap

## Confirmed Topup removal — 20 October
- [ ] Remove Topup from shared NHO/Unit Sale fields and ignore saved Topup in balance calculations; retain Spring deductions and Balance − Proceeds.
- [ ] Verify fictional QMP and Spring sales in both forms, approval and PDFs; delete only those fixtures, keep email test mode ON, do not publish.

## Sadie's 20 October NHO testing
- [x] Read-only published history: EKOS-00077 Completed at 09:28 UTC but PDF still from 09:26 and no completion email; EKOS-00080 completion email accepted at 10:20 UTC to Emma/Sadie only. Original runtime exception is outside available log retention; exact underlying exception unverified.
- [x] Shared preview completion builds final signed PDF once, emails before optional integrations, retries reported send failures with document idempotency key and exposes exhausted failures; direct Completed submissions also invoke completion.
- [x] Require new-home address for every NHO and Unit Sale sales route; preserve TBC. Twelve route/validation tests pass; QMP browser and actual NHO PDF/approval readback verified.
- [x] Previous Topup decision superseded by Sadie's confirmed complete removal on 20 October.
- [x] Fictional EKOS-00082 NHO upload/submission/Director approval, signed PDF readback and accepted test-only completion email verified; Unit Sale address carries TBC. Removed fictional sale/forms and six app files; no Drive/Sheets copies. Nothing published; inbox receipt unverified.

## Additional Drive backups — Emma, 19 October 2026
- [x] Emma's 18:21 approval: backup-only proposal applied transactionally as 0014_drive_backup_journal (migration tool owns transaction). Hosted five-table RLS/service-role-only grants and three RPC execute boundaries verified. 156 regression tests pass; Breeze connection retained; no publishing.
- [x] 19 October 18:30 UTC: actual Drive transfer in approved `_TEST – delete` subtree passed: generated New Home Order PDF (31,058 bytes) and fictional PNG (1,949 bytes), park/order folders, byte-exact SHA-256 readback, replay without duplicates. Deleted test subtree; all five objects return 404. Used isolated in-memory database/storage and root-remapped worker copy, not a hosted form submission. 22 backup regression tests pass; no hosted records/settings changed or publishing.
- [x] Hosted fictional EKOS-00076 via preview UI: seven-step New Home Order, two PNGs, on-site signature, submit and Director completion; app storage/journal/real Drive readback passed. Early uploads exposed Unknown Park mapping defect; fixed by deferring until park/customer recorded; authenticated scheduled-handler retry copied all three sources. Subsequent approval PDFs copied automatically with distinct versions. Fixture/app files/Drive subtree deleted; 68 original test sales retained.
- [x] Listed all 68 current sales for Emma in CSV, grouped by tentative appearance; no live allowlist or backfill executed. EKOS-00054 “dsd” explicitly uncertain, not verified live.
- [x] Approved plan; provider and generated-app read-only checks confirm Breeze’s connected account can edit/add files in the chosen folder. No credentials needed and no copies made.
- [x] Gated preview snapshots/journal processor, proposed upload/PDF triggers, Director status/retry/backfill controls and authenticated callback implemented. 156 unit/mocked tests pass; isolated fictional SQL rehearsal passes permission, enqueue, live/test and worker-exclusivity checks. Build OK.
- [x] Emma explicitly approved permanent ten-minute safety net (144 callbacks/day). Managed authenticated schedule created; worker bounded to eight jobs/90 seconds, Request.waitUntil immediate work/cron response. Real hosted queue exercised through localhost preview callback, anonymous refused, empty drain 0.94s. Production timed delivery remains unverified until publishing; nothing published.
- [x] Gate ON after hosted test; all 68 original sales classified TEST, new rows default live with case-insensitive test/fictional/claude exclusion and Director toggle. Email test mode ON, Sheets OFF. 167 tests pass; server-only journal rights retained.
- [x] No backfill: explicitly disabled per Emma; all 68 existing sales including EKOS-00054 remain excluded.
- [ ] Publish and verify actual ten-minute production delivery — awaits Emma's publishing approval; cron currently targets the published version, not the new preview code.

## Urgent published PDF storage failure — 19 October 2026
- [x] Reproduce the provider rejection without modifying EKOS-00074: customer-name en dash produces StorageApiError 400 Invalid key; ASCII equivalent succeeds.
- [x] Separate generated PDF storage key from readable filename; preserve upload restrictions and add provider-error logging.
- [x] All 134 unit/mocked tests pass, including each of five forms' review/director PDF storage. Actual preview UI: EKOS-00075 seven-step New Home Order with two PNGs and on-site signature submitted, PDF read back, automatic review email accepted only to approved test recipients; Director approval retained stored merged PDF and sent test completion email. Deleted only new EKOS-00075 and its files. Inbox receipt and other four full UI workflows not tested in this turn.
- [x] Emma reports PDF fix now published and verified live (19 October 18:21). No additional PDF/live re-submission performed this turn; EKOS-00074 untouched.

## Parallel readiness request — 18 October 2026
- [x] Rehearse exact Section 5 and captured ACL/RLS/data reconstruction in disposable local PostgreSQL; provider snapshot recovery remains unverified, shared migration paused.
- [x] Implement safe preview email routing pinned ON/approved recipient allowlist, Settings disable rejection and checked writes, upload boundary validation, signing read guards and thrown-error Drive denial.
- [x] Run 109 passing mocked/unit tests and actual hosted read-only Ben/Sadie/anonymous and cross-owner file checks; local transactional signing prototype passes 12-request concurrency and rollback/retry.
- [x] Fresh backend/dependency scans and hosted auth/park checks completed; stale application deep scan and unavailable infrastructure scan disclosed.
- [x] Short action report and concrete recovery next steps provided; nothing published or changed in hosted records/settings.
- [ ] Integrate atomic signing RPC plus durable side-effect retry/audit transaction — requires separate shared migration approval and verified recovery safeguard; prototype alone does not fix published signing.
- [ ] Complete owner-only hosted settings write gate — owner identity/authority and separate policy migration approval required; preview delivery pinned ON meanwhile.
- [ ] Complete Forms 1–4 all-screen/action/PDF/signature workflows — needs isolated backend/app destination or separately approved safe fictional fixtures; existing fixture incomplete and no stored corrections performed.

## Current controlled remediation request
- [x] Read-only backup/recovery investigation: backend healthy, test mode ON, Sheets OFF, Drive enabled flag absent; actual backup inventory/restore authority inaccessible. Evidence/access gaps and recovery procedure documented; no migration, fixtures or configuration changes performed.
- [ ] Complete recovery coverage evidence: administrator reports successful restore-capable backup 18 October 2026 08:27:21 UTC; explicit grants/RLS backup recovery coverage remains unverified.
- [ ] Apply conditionally reauthorised exact Section 5 restriction and test new fictional fixtures only — STOPPED: grants/RLS snapshot recovery coverage unverified. Fresh grants/policies and service-role rights re-read; approved executable SQL matches exactly. No migration or record changes performed.
- [x] Document precise Section 5 hosted permission/workflow verification and narrow recovery procedure; source compatibility review complete, all post-migration checks NOT TESTED pending recovery gate.
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
