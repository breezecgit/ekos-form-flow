-- PROPOSED (not applied): form amendments after Completion.
-- Additive only: one new table + indexes. No existing table, grant or policy changes.
-- Writes are service-role only (server actions verify the Director role);
-- Directors can read; customers never read this table directly – they use a signing_tokens link (kind 'amendment').
-- Rollback: DROP TABLE public.form_amendments; (removes amendment records only; original forms/PDFs untouched).

CREATE TABLE public.form_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.form_submissions(id) ON DELETE CASCADE,
  amendment_number integer NOT NULL CHECK (amendment_number > 0),
  reason text NOT NULL,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  values_before jsonb NOT NULL,
  values_after jsonb NOT NULL,
  status text NOT NULL DEFAULT 'Awaiting customer signature'
    CHECK (status IN ('Awaiting customer signature','Awaiting approval','Completed','Cancelled')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  customer_signature text,
  customer_signed_name text,
  customer_signed_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  pdf_path text,
  cancelled_by uuid,
  cancelled_at timestamptz,
  cancel_reason text,
  UNIQUE (submission_id, amendment_number)
);

-- Only one open amendment per form.
CREATE UNIQUE INDEX form_amendments_one_open
  ON public.form_amendments(submission_id)
  WHERE status IN ('Awaiting customer signature','Awaiting approval');

GRANT SELECT ON public.form_amendments TO authenticated;
GRANT ALL ON public.form_amendments TO service_role;

ALTER TABLE public.form_amendments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "amendments director read" ON public.form_amendments
  FOR SELECT TO authenticated USING (public.is_director());
