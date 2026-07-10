ALTER TABLE public.jobs REPLICA IDENTITY FULL;
ALTER TABLE public.job_checklist_progress REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.job_checklist_progress; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;