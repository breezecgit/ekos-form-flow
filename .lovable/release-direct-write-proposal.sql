-- REVIEW ONLY. Not applied. Requires explicit owner approval.
BEGIN;
REVOKE INSERT, UPDATE, DELETE ON public.sales, public.form_submissions,
  public.submission_files, public.audit_log FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "sales insert" ON public.sales;
DROP POLICY IF EXISTS "sales update" ON public.sales;
DROP POLICY IF EXISTS "subs insert" ON public.form_submissions;
DROP POLICY IF EXISTS "subs update" ON public.form_submissions;
DROP POLICY IF EXISTS "files write" ON public.submission_files;
DROP POLICY IF EXISTS "audit insert" ON public.audit_log;
GRANT SELECT ON public.sales, public.form_submissions, public.submission_files,
  public.audit_log TO authenticated;
GRANT ALL ON public.sales, public.form_submissions, public.submission_files,
  public.audit_log TO service_role;
COMMIT;