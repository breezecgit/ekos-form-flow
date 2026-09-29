ALTER TABLE public.email_log ADD COLUMN IF NOT EXISTS intended_to text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.email_log ADD COLUMN IF NOT EXISTS intended_cc text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.email_log ADD COLUMN IF NOT EXISTS test_mode boolean NOT NULL DEFAULT false;
INSERT INTO public.app_settings (key, value) VALUES ('email_test_mode', '{"enabled":"true","recipient":"emma.frew@breezeconnection.co.uk"}'::jsonb) ON CONFLICT (key) DO NOTHING;