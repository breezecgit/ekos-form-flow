CREATE TABLE public.statement_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_type text NOT NULL DEFAULT 'written_statement',
  version integer NOT NULL,
  sections jsonb NOT NULL,
  note text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_type, version)
);
GRANT SELECT, INSERT ON public.statement_templates TO authenticated;
GRANT ALL ON public.statement_templates TO service_role;
ALTER TABLE public.statement_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates read" ON public.statement_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "templates insert" ON public.statement_templates FOR INSERT TO authenticated WITH CHECK (public.is_director());
COMMENT ON TABLE public.statement_templates IS 'Versioned legal wording (e.g. Written Statement). Insert-only: every edit is a new version.';