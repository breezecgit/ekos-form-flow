-- READ-ONLY CAPTURE: hosted definitions observed 18 October 2026, 14:04 UTC.
-- Not applied. Not an approved rollback. Restoring vulnerable grants requires separate approval.
-- RLS enabled, not forced, on each of the four tables; owner postgres.
-- No explicit column ACLs or memberships for anon/authenticated/service_role returned.
-- Each role has schema USAGE. service_role has BYPASSRLS, is not superuser.
-- Identical explicit privileges on each of the four tables:
-- anon, authenticated, postgres, service_role: DELETE, INSERT, MAINTAIN,
-- REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE; no grant option.
-- sandbox_exec: INSERT, SELECT; no grant option.
-- No PUBLIC table ACL entry returned.
-- The approved SQL revokes INSERT/UPDATE/DELETE ONLY; it does not revoke
-- TRUNCATE, REFERENCES, TRIGGER or MAINTAIN. This is not comprehensive lockdown.
-- Re-read after owner's 14:14 UTC request: same ACLs, eleven policies and RLS flags.
-- Executable Section 5 SQL SHA-256:
-- 638ad2c9554da678d6716b7f90612e75a9faaa313a296eaeb65ce8f1a732f681
-- Administrator-reported snapshot: 2026-10-18 08:27:21 UTC, successful/restorable.
-- Snapshot ACL/RLS recovery coverage not independently confirmed.

-- Exact pre-change grant reconstruction from aclexplode; NOT executed:
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sales, public.form_submissions, public.submission_files, public.audit_log TO anon, authenticated, postgres, service_role;
GRANT INSERT, SELECT ON TABLE public.sales, public.form_submissions, public.submission_files, public.audit_log TO sandbox_exec;

CREATE POLICY "sales insert" ON public.sales AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "sales read" ON public.sales AS PERMISSIVE FOR SELECT TO authenticated USING ((created_by = auth.uid()) OR is_director());
CREATE POLICY "sales update" ON public.sales AS PERMISSIVE FOR UPDATE TO authenticated USING ((created_by = auth.uid()) OR is_director());
CREATE POLICY "subs insert" ON public.form_submissions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "subs read" ON public.form_submissions AS PERMISSIVE FOR SELECT TO authenticated USING ((created_by = auth.uid()) OR is_director());
CREATE POLICY "subs update" ON public.form_submissions AS PERMISSIVE FOR UPDATE TO authenticated USING ((created_by = auth.uid()) OR is_director());
CREATE POLICY "files read" ON public.submission_files AS PERMISSIVE FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM form_submissions s WHERE s.id = submission_files.submission_id AND ((s.created_by = auth.uid()) OR is_director())));
CREATE POLICY "files write" ON public.submission_files AS PERMISSIVE FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM form_submissions s WHERE s.id = submission_files.submission_id AND ((s.created_by = auth.uid()) OR is_director()))) WITH CHECK (EXISTS (SELECT 1 FROM form_submissions s WHERE s.id = submission_files.submission_id AND ((s.created_by = auth.uid()) OR is_director())));
CREATE POLICY "audit insert" ON public.audit_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());
CREATE POLICY "audit read" ON public.audit_log AS PERMISSIVE FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM form_submissions s WHERE s.id = audit_log.submission_id AND ((s.created_by = auth.uid()) OR is_director())));
CREATE POLICY "audit read deleted sales" ON public.audit_log AS PERMISSIVE FOR SELECT TO authenticated USING ((submission_id IS NULL) AND is_director());