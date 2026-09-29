ALTER TABLE public.email_log ADD COLUMN IF NOT EXISTS cc_addresses text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.email_log ADD COLUMN IF NOT EXISTS html text NOT NULL DEFAULT '';
ALTER TABLE public.sales_people ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS drive_folders jsonb NOT NULL DEFAULT '{}'::jsonb;