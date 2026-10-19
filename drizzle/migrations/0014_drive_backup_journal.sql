-- Approved .lovable/proposed-drive-backups.sql; transaction managed by migration tool.
CREATE TABLE public.drive_backup_sales (
  sale_id uuid PRIMARY KEY REFERENCES public.sales(id) ON DELETE CASCADE,
  classification text NOT NULL CHECK (classification IN ('live','test')),
  confirmed_by uuid NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.drive_backup_sales TO service_role;
REVOKE ALL ON public.drive_backup_sales FROM anon, authenticated;
ALTER TABLE public.drive_backup_sales ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.drive_backup_versions (
  id uuid PRIMARY KEY,
  submission_id uuid NOT NULL REFERENCES public.form_submissions(id) ON DELETE CASCADE,
  source_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.drive_backup_versions TO service_role;
REVOKE ALL ON public.drive_backup_versions FROM anon, authenticated;
ALTER TABLE public.drive_backup_versions ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.drive_backup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.form_submissions(id) ON DELETE CASCADE,
  source_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('pdf','attachment')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','failed','done')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  drive_file_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT ALL ON public.drive_backup_jobs TO service_role;
REVOKE ALL ON public.drive_backup_jobs FROM anon, authenticated;
ALTER TABLE public.drive_backup_jobs ENABLE ROW LEVEL SECURITY;
CREATE INDEX drive_backup_jobs_due ON public.drive_backup_jobs(status,next_attempt_at);
CREATE TABLE public.drive_backup_folders (
  folder_key text PRIMARY KEY,
  parent_id text NOT NULL,
  drive_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.drive_backup_folders TO service_role;
REVOKE ALL ON public.drive_backup_folders FROM anon, authenticated;
ALTER TABLE public.drive_backup_folders ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.drive_backup_worker (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  owner uuid,
  lease_until timestamptz
);
GRANT ALL ON public.drive_backup_worker TO service_role;
REVOKE ALL ON public.drive_backup_worker FROM anon, authenticated;
ALTER TABLE public.drive_backup_worker ENABLE ROW LEVEL SECURITY;
INSERT INTO public.drive_backup_worker(singleton) VALUES(true);
CREATE FUNCTION public.drive_backup_enqueue() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE src text; label text; typ text;
BEGIN
  IF TG_TABLE_NAME = 'drive_backup_versions' THEN
    src := NEW.source_path; label := NEW.file_name; typ := 'pdf';
  ELSE
    src := NEW.storage_path; label := NEW.file_name; typ := 'attachment';
  END IF;
  INSERT INTO public.drive_backup_jobs(submission_id,source_path,file_name,kind)
    VALUES(NEW.submission_id,src,label,typ) ON CONFLICT(source_path) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Drive backup enqueue failed for submission %', NEW.submission_id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.drive_backup_enqueue() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.drive_backup_enqueue() TO service_role;
CREATE TRIGGER drive_backup_new_pdf AFTER INSERT ON public.drive_backup_versions
 FOR EACH ROW EXECUTE FUNCTION public.drive_backup_enqueue();
CREATE TRIGGER drive_backup_new_attachment AFTER INSERT ON public.submission_files
 FOR EACH ROW EXECUTE FUNCTION public.drive_backup_enqueue();
CREATE FUNCTION public.drive_backup_claim(p_owner uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed integer;
BEGIN
 UPDATE public.drive_backup_worker SET owner=p_owner,lease_until=now()+interval '4 minutes'
 WHERE singleton AND (lease_until IS NULL OR lease_until < now());
 GET DIAGNOSTICS changed = ROW_COUNT;
 RETURN changed=1;
END $$;
REVOKE ALL ON FUNCTION public.drive_backup_claim(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.drive_backup_claim(uuid) TO service_role;
CREATE FUNCTION public.drive_backup_claim_job(p_owner uuid) RETURNS SETOF public.drive_backup_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.drive_backup_worker WHERE owner=p_owner AND lease_until>now()) THEN
   RAISE EXCEPTION 'worker_lease_required';
 END IF;
 RETURN QUERY UPDATE public.drive_backup_jobs j SET status='running',attempts=j.attempts+1,lease_until=now()+interval '4 minutes'
 WHERE j.id=(SELECT q.id FROM public.drive_backup_jobs q
 JOIN public.form_submissions s ON s.id=q.submission_id
 JOIN public.drive_backup_sales bs ON bs.sale_id=s.sale_id AND bs.classification='live'
 WHERE ((q.status IN ('pending','failed') AND q.next_attempt_at<=now()) OR
       (q.status='running' AND q.lease_until<now()))
 ORDER BY q.created_at FOR UPDATE OF q SKIP LOCKED LIMIT 1)
 RETURNING j.*;
END $$;
REVOKE ALL ON FUNCTION public.drive_backup_claim_job(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.drive_backup_claim_job(uuid) TO service_role;