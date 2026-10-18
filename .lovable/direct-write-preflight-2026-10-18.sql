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