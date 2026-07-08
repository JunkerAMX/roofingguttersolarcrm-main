
CREATE POLICY "job_photos_read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'job-photos' AND (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id::text = split_part(name, '/', 1)
      AND j.assigned_to = auth.uid()
  )
));

CREATE POLICY "job_photos_write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'job-photos' AND (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id::text = split_part(name, '/', 1)
      AND j.assigned_to = auth.uid()
  )
));

CREATE POLICY "job_photos_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'job-photos' AND public.has_role(auth.uid(), 'admin'));
