CREATE TABLE public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  permission text not null,
  created_at timestamptz not null default now(),
  unique (email, permission)
);
GRANT SELECT ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "perms read" ON public.user_permissions FOR SELECT TO authenticated
  USING (public.is_director() OR lower(email) = lower(coalesce(auth.jwt()->>'email','')));
INSERT INTO public.user_permissions (email, permission) VALUES
  ('emma.frew@breezeconnection.co.uk','can_delete_sales'),
  ('eilidh@breezeconnection.co.uk','can_delete_sales');
CREATE POLICY "audit read deleted sales" ON public.audit_log FOR SELECT TO authenticated
  USING (submission_id IS NULL AND public.is_director());