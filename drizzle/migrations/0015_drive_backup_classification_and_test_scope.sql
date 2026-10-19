ALTER TABLE public.drive_backup_sales ADD COLUMN test_folder_id text;
ALTER TABLE public.drive_backup_sales ADD COLUMN test_expires_at timestamptz;
ALTER TABLE public.drive_backup_sales ADD CONSTRAINT drive_backup_test_scope CHECK ((test_folder_id IS NULL AND test_expires_at IS NULL) OR (test_folder_id IS NOT NULL AND test_expires_at IS NOT NULL));
INSERT INTO public.drive_backup_sales(sale_id,classification,confirmed_by) SELECT id,'test',created_by FROM public.sales ON CONFLICT(sale_id) DO UPDATE SET classification='test';
CREATE FUNCTION public.drive_backup_classify_sale() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN INSERT INTO public.drive_backup_sales(sale_id,classification,confirmed_by) VALUES(NEW.id,CASE WHEN coalesce(NEW.customer_name,'') ~* '(test|fictional|claude)' THEN 'test' ELSE 'live' END,NEW.created_by) ON CONFLICT(sale_id) DO NOTHING;
 ELSIF coalesce(NEW.customer_name,'') ~* '(test|fictional|claude)' THEN UPDATE public.drive_backup_sales SET classification='test' WHERE sale_id=NEW.id AND NOT (test_folder_id IS NOT NULL AND test_expires_at>now()); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.drive_backup_classify_sale() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.drive_backup_classify_sale() TO service_role;
CREATE TRIGGER drive_backup_sale_classification AFTER INSERT OR UPDATE OF customer_name ON public.sales FOR EACH ROW EXECUTE FUNCTION public.drive_backup_classify_sale();
CREATE OR REPLACE FUNCTION public.drive_backup_claim_job(p_owner uuid) RETURNS SETOF public.drive_backup_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.drive_backup_worker WHERE owner=p_owner AND lease_until>now()) THEN RAISE EXCEPTION 'worker_lease_required'; END IF;
 RETURN QUERY UPDATE public.drive_backup_jobs j SET status='running',attempts=j.attempts+1,lease_until=now()+interval '4 minutes'
 WHERE j.id=(SELECT q.id FROM public.drive_backup_jobs q JOIN public.form_submissions s ON s.id=q.submission_id JOIN public.sales sale ON sale.id=s.sale_id JOIN public.drive_backup_sales bs ON bs.sale_id=s.sale_id
 WHERE bs.classification='live' AND ((bs.test_folder_id IS NOT NULL AND bs.test_expires_at>now()) OR (bs.test_folder_id IS NULL AND coalesce(sale.customer_name,'') !~* '(test|fictional|claude)' AND EXISTS(SELECT 1 FROM public.app_settings WHERE key='drive_backup' AND value->'enabled'='true'::jsonb AND value->>'root_folder_id'='14Df5SRJ1B_EfowB22LfO82piSDl88zr_')))
 AND ((q.status IN ('pending','failed') AND q.next_attempt_at<=now()) OR (q.status='running' AND q.lease_until<now())) ORDER BY q.created_at FOR UPDATE OF q SKIP LOCKED LIMIT 1) RETURNING j.*;
END $$;
REVOKE ALL ON FUNCTION public.drive_backup_claim_job(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.drive_backup_claim_job(uuid) TO service_role;