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
- Email test mode: enforced inside sendEmail (fails safe to ON; only an explicit "false" setting disables it) so no caller can bypass it. Test recipients are a list (default Emma + Eilidh at breezeconnection.co.uk).
- Email links: every link is built from the Settings "App base URL" (app_base_url), never the request origin, because the editor preview needs a Lovable login.
- Staff email links go through the login page with an encoded internal return path so drafts and reviews reopen after sign-in.
- PDF generation uses director rendering context to preserve captured signatures, excludes field hints, and omits staff approval instructions from completed copies without removing actual signatures.
- Park autofill: form fields declare parkField (a parks column); FormRunner fills them on park change (overwrite) and on load (empty only). parks.inbox_email is the single park inbox/Email source.
- Sale deletion: gated by public.user_permissions (email, 'can_delete_sales'), checked server-side in deleteSale; keyed by email so accounts can be pre-granted. Drive/Sheets copies are never touched.
- Tracker and dashboard share SaleFormCell (status chip + Start/Open via startNextForm) so they cannot drift.
- Rep dashboard scope combines sale ownership with park rep assignment from parks.rep_name; Sadie's director dashboard stays unrestricted, so chart totals cannot show unrelated parks.
