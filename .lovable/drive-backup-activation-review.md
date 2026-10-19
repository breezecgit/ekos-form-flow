# Drive backup activation review — 19 October 2026

## Implemented in preview
- `src/lib/ekos.server.ts`: fixed PDF key remains `submissions/{id}/form.pdf`; after each successful save, the shared backup hook can stage those exact bytes under a distinct immutable version key. All five forms and their signing/completion paths use this builder.
- `src/lib/drive-backups.server.ts`: separately gated staging, one-job leased processor, stable Drive file IDs stored before provider writes, reusable park/sale mapping, versioned filenames, persisted retry deadlines, failed-job journal and Director-scoped repair of staged/file objects.
- `src/lib/drive-backup-rules.ts`: approved destination, source-scope validation, version naming, known test exclusions and retry rules.
- `src/lib/drive-backups.functions.ts`: verified Director-only status/retry, backfill preview, explicit live-order confirmation, resumable existing-object backfill and controlled worker invocation.
- `src/components/DriveBackupStatus.tsx`: small pending/saved/failed status and retry option. Hidden while disabled.
- `src/components/DriveBackfillPanel.tsx`: review exact live orders before queuing; known tests refused. No backfill was run.
- `src/routes/admin.submissions.$id.tsx`: adds the two controls and removes the misleading claim that completion has already copied to Drive.
- `src/routes/api/public/jobs/drive-backups.ts`: managed-authenticated bounded worker callback; anonymous request verified HTTP 401.
- `src/lib/ekos.server.test.ts` plus three new backup test files: 156 total unit/mocked tests passed; no provider writes from tests.
- `AGENTS.md`: architecture rule for gated, immutable, independently processed copies.

## Proposed hosted resources — NOT APPLIED
`.lovable/proposed-drive-backups.sql` is a separate transactional proposal, not Migration C. It adds five service-role-only tables:
- `drive_backup_sales`: explicit live/test classification.
- `drive_backup_versions`: immutable PDF source metadata.
- `drive_backup_jobs`: status, reserved provider ID, attempts, retry deadline and lease.
- `drive_backup_folders`: stable park/sale folder mappings.
- `drive_backup_worker`: exclusive processor lease.

It adds two enqueue triggers (version insert, attachment metadata insert) and three service-role-only functions (enqueue, worker claim, job claim). No anon/authenticated access is granted; RLS is enabled on every new table. Trigger enqueue failures retain the legitimate uploaded-file metadata and are repaired by Director reconciliation rather than blocking uploads.

No setting, bucket, live schedule or permissions were changed. The existing private `ekos-documents` bucket also holds private immutable staging objects; it remains private and is not exposed by staff attachment-link generation. No new bucket is required.

## Evidence
**Actual provider read-only evidence:** Breeze’s Google Drive can edit/add children to “Security for EKOS Customer Sales Process”. Both the chat connection and the generated-app credential path returned that result. Credentials already exist securely; no service-account key is needed for this connection.

**Actual isolated database rehearsal:** applied the exact proposed SQL to a throwaway local database containing only fictional rows. Verified PDF/upload enqueue, service-role rights, rep/anonymous access denial, exclusive worker claim, refusal to process unknown/test sales and live-classified job claim. The local server was then stopped. This is not hosted migration or Drive-transfer evidence.

**Automated/mocked:** 156 tests passed. New tests cover approved root, source ownership/traversal, immutable versions for five forms, disabled/wrong-destination denial, staging failures that do not reject PDF saving, rep refusal on details/retry/worker, known-test refusal and Director gate-off denial.

**Actual preview:** Director submission page and backfill review control render; disabled Drive retry remains hidden. No sale was mutated. Anonymous processor callback returned 401. Latest harness build is OK.

**Not tested:** real Drive folder creation/upload, timeout-after-upload reconciliation against Google, permission inheritance, concurrent Google creation, enabled journal/retry UI, hosted triggers, full provider-outage form workflow, automatic scheduled retry and live-sales backfill. These require the approvals below. No customer files were copied to Drive.

## Activation sequence and remaining implementation gate
1. Emma separately approves publishing the tested PDF fix; plan approval did not authorise publishing.
2. Confirm use of Breeze’s connected Google account or connect a dedicated EKOS account. Existing account needs no new credentials. For a dedicated user account, share the folder as Editor and authorise Google Drive through Lovable. For a service account, first confirm a suitable Shared Drive arrangement; use only the secure secret form, never chat.
3. Approve a separate empty synthetic-test destination. Current code allows only the approved production root; isolated provider testing needs a reviewed test-only destination configuration before any writes.
4. Approve this exact separate database proposal after fresh hosted preflight and recovery review. Do not bundle it with the unapproved signing migration.
5. Configure/verify wake-on-enqueue and bounded retry scheduling with the managed callback tools **after permission to create schedules**. The callback and durable retry deadlines are implemented, but no automatic scheduler has been created. Until that activation work is complete, jobs require an authorised manual worker invocation; automatic retry is not yet operational. Do not enable backups before this is resolved.
6. Confirm current live sales by explicit order allowlist. Unknown and known test sales are skipped; newly created sales also need live classification. Do not infer live status from a name or email.
7. Enable only the separate `drive_backup` setting with the approved root after synthetic tests pass. Legacy `google_drive` remains disabled; Google Sheets remains OFF; email test mode remains ON.
8. Run backfill in reviewed small batches from currently stored objects. Never regenerate a historical PDF and call it the original. Monitor pending/failed counts and reconcile before advancing.

## Known recovery limitations
- If staging upload itself fails, the current app PDF is retained, but an overwritten earlier version cannot later be reconstructed from its original bytes. Such failure is logged; successful staging with failed metadata is recoverable through Director repair. No claim of guaranteed backup of an unstaged historical version is made.
- Reconciliation currently processes up to 1,000 staging objects for one submission; larger histories need paginated repair before activation at that scale.
- Source deletion while a backup is pending can make it unavailable. App sale deletion remains unchanged and never deletes existing Drive copies. Pending staging-retention/deletion policy needs owner review.
- Backfill can only copy originals still present in app storage; prior overwritten versions are unavailable.
- A Google timeout is reconciled using stable preallocated IDs/app properties. This is implemented but still needs actual isolated Google verification; do not call it a proven provider guarantee yet.

## Narrow rollback
First set the new backup gate OFF and stop/disarm the backup processor callbacks. Forms continue using app storage and email workflows. Preserve the backup tables, version objects and Drive copies for inspection; remove only the two new enqueue triggers if needed. Do not restore vulnerable grants, touch Migration C, delete customer data or delete Drive files. Retry/backfill metadata is separate from sales/form status so rollback does not reopen or change a form.

Publishing, hosted migration, schedule creation, enabling Drive and backfill each still require their relevant explicit approval. This is preview implementation evidence, not production readiness.