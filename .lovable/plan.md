# Additional Google Drive backups for EKOS sales files

## PDF fix comes first
The PDF storage failure is fixed in the preview: the long dash in the customer-name filename was rejected by storage. PDFs now use a safe internal filename without changing file-access restrictions.

Verified: a full seven-screen New Home Order with two PNG uploads and on-site signatures submitted successfully; Director approval also saved its completed PDF. Automatic review and completion emails were accepted in test mode. All 134 automated tests passed, including shared PDF storage checks for all five forms. The new test sale was deleted; EKOS-00074 is untouched.

**Publishing the PDF fix still needs your explicit approval.** Approving this backup plan does not publish the app or enable production email.

## Connection and setup
The existing **Breeze’s Google Drive** connection is already linked. A read-only Google check confirmed that it can edit and add files to **Security for EKOS Customer Sales Process**, your chosen folder. No file has been copied there.

Use this supported managed Google connection first: credentials are already stored securely, and Google authorization is managed by Lovable. Emma does not need to send an API key or service-account JSON in chat.

A dedicated EKOS Google account is preferable if Breeze’s account should not retain access to customer documents. Share the chosen folder with that account as **Editor** and connect it through Lovable’s Google Drive settings before enabling backups. Do not request broader Drive access unless a real permission failure establishes it is needed.

A service account is not the default: the supplied folder appears to be in ordinary Drive, and service accounts cannot generally own new files there without a storage-capable user or Shared Drive arrangement. If Emma requires a service account, confirm a Google Workspace Shared Drive and suitable access first; enter its credential only through **Project Settings → Secrets**, never chat. The currently verified managed connection avoids needing that private key.

## What will change
- Add backup copies for every uploaded attachment and every generated PDF across all five forms, including customer signing, Director/witness signing and completion.
- Leave the app’s current storage paths, upload checks and staff-access restrictions unchanged.
- Reuse this structure:

```text
Security for EKOS Customer Sales Process/
  Carlton Manor/
    EKOS-00074 – John Smith/
      New Home Order Form – EKOS-00074 – [UTC date/time] – [version].pdf
      New Home Order Form – EKOS-00074 – Pitch Plan – [original filename]
```

**Assumption:** “files” in the requested structure means the files themselves, not another literal `files` folder; this matches the example. PDFs and attachments will sit together in the sale folder.

- Identify sale folders by sale ID internally, so correcting a customer name reuses the folder rather than creating another one.
- Preserve each regenerated PDF as a separate version. Retries reuse the same version and do not duplicate it.
- Keep backups private by inheriting the destination’s existing sharing; never create public links or change folder permissions.
- Drive operations run outside submission/approval handling. A Drive outage never prevents the form, its PDF or its approval email from completing.
- Record pending/success/failed backups. Directors see a small **Drive backup failed – retry** action on the submission page. Reps cannot start retries or backfills.
- Retry failures durably, including recovery after interrupted work. No dependence on someone keeping a browser tab open.

## Existing sales backfill
Provide a Director-only preview of the proposed backfill: sales, available files and exclusions. Copy only explicitly confirmed current live sales in resumable batches.

**Emma must confirm how test sales are identified, or approve an explicit list of live order numbers.** Customer names are not a reliable test/live rule. Unknown sales are skipped, not guessed. EKOS-00074 is excluded as a known test sale.

The backfill copies only versions still present in app storage; previously overwritten PDFs cannot be reconstructed as historical originals. Existing Drive copies will not be deleted or silently replaced.

## Technical implementation
- Add a separate backup module and proposed database change, independent of the paused atomic-signing migration. Do not apply either without separate approval.
- Persist immutable PDF-version bytes in a separate private backup staging area before a later regeneration can replace `form.pdf`; retain the original app PDF path. Attachments use their existing immutable storage objects.
- Create a service-role-write-only backup journal with explicit grants/RLS, version IDs, source references, retries, leases and provider file IDs. An approved database trigger/outbox records upload and PDF-version events atomically with their metadata; a reconciliation path detects app-stored objects if enqueue/staging fails without turning that failure into a form failure.
- Serialize folder creation through durable leases and unique park/sale mappings. Search existing Drive folders before creating; use stable app properties and preallocated Drive IDs to reconcile an ambiguous upload/create response without duplicating files.
- Validate submission/sale ownership and source-path scope on the server; backup status/retry/backfill functions require a verified Director role. Do not expose private source paths or provider errors to unauthorised callers.
- Use a bounded background processor awakened by queued work. Arm retry callbacks only while work remains and disarm on drain; do not add a permanent high-frequency polling job. Proposed callback authentication uses the existing managed scheduling helper.
- Keep the new destination separately gated and disabled until approved. Do not enable or write to the legacy Drive folders or Sheets. Email test mode stays ON.

## Verification and approvals
Before activation, test with synthetic files in an explicitly approved isolated test folder, not customer ID documents in the production backup folder:
- All five forms: PDF generation and finalisation enqueue the correct version.
- PNG/JPG/PDF attachments: copied to the correct sale; multiple files retained.
- Drive outage: submission/approval and approval email still succeed; visible failure and retry recover.
- Concurrent park/sale creation and timeout-after-upload: no duplicate folders or files.
- Regeneration: both PDF versions retained; repeat retry does not create another copy.
- Rep/anonymous retry and cross-sale requests denied; private sharing unchanged.
- Backfill: test/unknown sales skipped, reruns resumable and idempotent.

Report automated/mocked, isolated Drive and hosted/live evidence separately. Do not claim inbox delivery from an email acceptance log.

### Decisions needed from Emma
1. Approve publishing the already-tested PDF fix separately.
2. Approve this preview implementation plan and choose the existing Breeze connection or a dedicated EKOS account.
3. Supply or approve a separate empty Drive test folder for synthetic-file checks.
4. Confirm the live/test classification or live-order allowlist for backfill.

After preview implementation, present the exact backup database changes, rollback and test evidence for approval before applying them, enabling backups or starting the live-sales backfill. HubSpot work is not included.