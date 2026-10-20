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
- PDF generation uses director rendering context to preserve captured signatures; the shared field filter excludes workflow status fields from every copy and other approval instructions from completed copies so review and completed outputs cannot drift.
- Generated PDFs use a fixed form.pdf storage key under the submission UUID, separate from their readable download filename, so customer text cannot invalidate storage keys.
- Additional Drive backups use a separate fail-closed gate, immutable app-storage snapshots and a service-role-only journal; leased workers run through Request.waitUntil after uploads/PDFs and an authenticated bounded scheduled drain, never inline with submissions. Isolated test destinations are expiring service-only sale scopes verified against the approved Drive parent before writing.
- Park autofill: form fields declare parkField (a parks column); FormRunner fills them on park change (overwrite) and on load (empty only). parks.inbox_email is the single park inbox/Email source.
- Sale deletion requires server-verified Director role, authenticated Sadie identity and the email-keyed permission; editable profile fields never establish authority. Drive/Sheets copies are never touched.
- Form editor access uses the shared canOpenFormEditor rule: submitted forms stay read-only for reps while the Director can edit, matching server-side Completed-form protection.
- Unit tests use the dedicated Vitest configuration without application RPC transforms, so server action tests execute real handler bodies with mocked external boundaries.
- Tracker and dashboard share SaleFormCell (status chip + Start/Open via startNextForm) so they cannot drift.
- Rep dashboard scope combines sale ownership with park rep assignment from parks.rep_name; Sadie's director dashboard stays unrestricted, so chart totals cannot show unrelated parks.
- Guide accordions render literal bullet glyphs independently of CSS list markers, and PDF text preserves the WinAnsi bullet glyph; this prevents resets or character cleaning from hiding bullets.
- Shared write-validation checks payload types and visible required fields at server boundaries, with partial drafts allowed, so browser validation is not the authority.
- Drive writes require an explicit enabled setting at both orchestration and external-call boundaries; missing or unreadable settings fail closed so configured destinations cannot enable test writes.
- Upload validation lives in a shared client-safe module and checks form field identity, decoded bounds and file header before storage writes; metadata validation alone cannot establish file content.
- Settings mutations share a checked-write boundary so partial save failures are visible and never reported as all-success.
- Signing side effects move to an idempotent job journal keyed by link+job (prepared in signing-transaction.server.ts); activate only with the approved consume_signing_token RPC, because a missing RPC would break signing.
- Completion builds the final signed PDF once and emails it before optional integrations; bounded email retries reuse a document-specific provider idempotency key and surface exhausted failures rather than claiming delivery.
