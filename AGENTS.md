<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Email test mode is pinned ON at the send boundary until verified owner authorization is implemented; configured recipients are intersected with the approved test allowlist so direct settings edits cannot route production email.
- Email links: every link is built from the Settings "App base URL" (app_base_url), never the request origin, because the editor preview needs a Lovable login.
- Staff email links go through the login page with an encoded internal return path so drafts and reviews reopen after sign-in.
- PDFs render in director context to keep signatures; one shared field filter drops workflow/approval fields so review and completed copies cannot drift.
- Written Statement uses ordered-signatures PDF layout and the same field order in Word; pdfHide is honored by both exports, keeping statement inputs inline and signatures before attachments without changing other forms.
- Generated PDFs use a fixed form.pdf storage key under the submission UUID, separate from their readable download filename, so customer text cannot invalidate storage keys.
- Drive backups use a fail-closed gate, immutable snapshots and a service-role-only journal drained by leased workers (waitUntil + authenticated schedule), never inline; test destinations are expiring sale scopes verified against the approved parent.
- Park autofill: form fields declare parkField (a parks column); FormRunner fills them on park change (overwrite) and on load (empty only). parks.inbox_email is the single park inbox/Email source.
- Sale deletion requires server-verified Director role, authenticated Sadie identity and the email-keyed permission; editable profile fields never establish authority. Drive/Sheets copies are never touched.
- Form editor access uses the shared canOpenFormEditor rule: submitted forms stay read-only for reps while the Director can edit, matching server-side Completed-form protection.
- Unit tests use the dedicated Vitest configuration without application RPC transforms, so server action tests execute real handler bodies with mocked external boundaries.
- Tracker and dashboard share SaleFormCell/StatusChip; the "Amendment in progress" tag is a display-only listSales flag, so open amendments never move sales or change counts.
- Rep dashboard scope combines sale ownership with park rep assignment from parks.rep_name; Sadie's director dashboard stays unrestricted, so chart totals cannot show unrelated parks.
- Guide bullets are literal glyphs (screen and WinAnsi PDF) so CSS resets or text cleaning cannot hide them.
- Shared write-validation checks payload types and visible required fields at server boundaries, with partial drafts allowed, so browser validation is not the authority.
- Drive writes require an explicit enabled setting at both orchestration and external-call boundaries; missing or unreadable settings fail closed so configured destinations cannot enable test writes.
- Upload validation lives in a shared client-safe module and checks form field identity, decoded bounds and file header before storage writes; metadata validation alone cannot establish file content.
- Settings mutations share a checked-write boundary so partial save failures are visible and never reported as all-success.
- Signing side effects move to an idempotent job journal keyed by link+job (prepared in signing-transaction.server.ts); activate only with the approved consume_signing_token RPC, because a missing RPC would break signing.
- Completion builds the final signed PDF once and emails it before optional integrations; bounded email retries reuse a document-specific provider idempotency key and surface exhausted failures rather than claiming delivery.
- Retired form answers use shared client-safe withoutRetiredAnswers normalization on reads, writes, signing and PDF/Word rendering so form-specific legacy keys cannot print or fail strict field validation; other forms retain their answers.
- Home-cost computation reuses Reservation discount logic; NHO/Unit Sale persist auto/manual provenance in answers, and unmarked saved values are preserved unless pristine prefill is established, because historical saves lack field-level override provenance.
- Amendments of Completed forms live in a separate form_amendments record (change list, before/after snapshots, own token kind "amendment" and amendment-{n}.pdf key); submission data changes only on approval and form.pdf is never overwritten, so the original signed record stays intact.
- Amendment permissions use the shared amendmentPermissions rule (form access starts, starter or Director cancels/resends, Director alone approves); an approved NHO amendment carries changes onto the Unit Sale Agreement via planUsaUpdate (update unsigned + fresh link, or auto-amend Completed) and never fails the NHO approval, so the two forms cannot drift silently.
- Amendments recalculate option-driven costs (shed, decking, steps, decking base) and their totals when the selection changes, even over a signed manual figure; unchanged selections keep overrides and Sadie's amend-screen figures always win, so amendments reflect the customer's new choices.
