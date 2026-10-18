-- PROPOSAL ONLY – NOT APPLIED. Requires separate written approval and a verified
-- recovery position before it is run against the hosted database.
-- Atomic single-use signing + audit, and a durable side-effect job journal.

CREATE TABLE IF NOT EXISTS public.submission_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.form_submissions(id),
  kind text NOT NULL,                     -- pdf | drive | email:<template> | sheet
  idempotency_key text NOT NULL UNIQUE,   -- e.g. <token>:<kind>
  status text NOT NULL DEFAULT 'pending', -- pending | running | done | failed
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.submission_jobs TO service_role;
ALTER TABLE public.submission_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs director read" ON public.submission_jobs
  FOR SELECT TO authenticated USING (public.is_director());
GRANT SELECT ON public.submission_jobs TO authenticated;

CREATE OR REPLACE FUNCTION public.consume_signing_token(
  p_token text, p_values jsonb, p_actor_label text, p_jobs text[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.signing_tokens; s public.form_submissions; now_ts timestamptz := now(); j text;
BEGIN
  SELECT * INTO t FROM public.signing_tokens WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'token_invalid'; END IF;
  IF t.used_at IS NOT NULL THEN RAISE EXCEPTION 'token_used'; END IF;
  IF t.expires_at <= now_ts THEN RAISE EXCEPTION 'token_expired'; END IF;
  IF t.kind NOT IN ('customer_offsite','construction','director') THEN RAISE EXCEPTION 'token_invalid'; END IF;
  SELECT * INTO s FROM public.form_submissions WHERE id = t.submission_id FOR UPDATE;
  IF NOT FOUND OR s.form_type = 'identification' THEN RAISE EXCEPTION 'token_invalid'; END IF;
  IF s.status = 'Completed' THEN RAISE EXCEPTION 'form_completed'; END IF;
  IF t.kind = 'customer_offsite' AND s.customer_signed_at IS NOT NULL THEN RAISE EXCEPTION 'token_used'; END IF;
  IF t.kind = 'construction' AND s.construction_signed_at IS NOT NULL THEN RAISE EXCEPTION 'token_used'; END IF;
  IF t.kind = 'director' AND s.customer_signed_at IS NULL THEN RAISE EXCEPTION 'customer_first'; END IF;

  UPDATE public.form_submissions SET
    data = coalesce(data,'{}'::jsonb) || coalesce(p_values,'{}'::jsonb),
    customer_signed_at = CASE WHEN t.kind='customer_offsite' THEN now_ts ELSE customer_signed_at END,
    construction_signed_at = CASE WHEN t.kind='construction' THEN now_ts ELSE construction_signed_at END,
    status = CASE WHEN t.kind='director' THEN 'Completed' ELSE status END,
    is_draft = CASE WHEN t.kind='director' THEN false ELSE is_draft END,
    updated_at = now_ts
  WHERE id = s.id;
  UPDATE public.signing_tokens SET used_at = now_ts WHERE token = t.token;
  INSERT INTO public.audit_log (submission_id, actor_label, action, from_status, to_status)
  VALUES (s.id, left(coalesce(p_actor_label,'Signer'),200),
          CASE t.kind WHEN 'construction' THEN 'Construction team signed'
                      WHEN 'director' THEN 'Director and witness signed – Completed'
                      ELSE 'Customer signed off site' END,
          CASE WHEN t.kind='director' THEN s.status END,
          CASE WHEN t.kind='director' THEN 'Completed' END);
  FOREACH j IN ARRAY coalesce(p_jobs,'{}') LOOP
    INSERT INTO public.submission_jobs (submission_id, kind, idempotency_key)
    VALUES (s.id, j, t.token || ':' || j) ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;
  RETURN jsonb_build_object('submission_id', s.id, 'kind', t.kind, 'from_status', s.status);
END $$;
REVOKE ALL ON FUNCTION public.consume_signing_token(text, jsonb, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_signing_token(text, jsonb, text, text[]) TO service_role;

-- Owner identity for the email test-mode switch (row inserted only after Emma's
-- identity is verified; writable by service_role only).
CREATE TABLE IF NOT EXISTS public.app_owners (
  user_id uuid PRIMARY KEY, email text NOT NULL, verified_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_owners TO service_role;
ALTER TABLE public.app_owners ENABLE ROW LEVEL SECURITY;
