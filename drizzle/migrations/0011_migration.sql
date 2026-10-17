DROP POLICY IF EXISTS "ekos docs read" ON storage.objects;
DROP POLICY IF EXISTS "ekos docs insert" ON storage.objects;
DROP POLICY IF EXISTS "ekos docs update" ON storage.objects;

DROP POLICY IF EXISTS "audit insert" ON public.audit_log;
CREATE POLICY "audit insert" ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

DROP POLICY IF EXISTS "settings read" ON public.app_settings;
CREATE POLICY "settings read" ON public.app_settings FOR SELECT TO authenticated
  USING (public.is_director() OR key IN ('park_goals', 'park_value_goals'));