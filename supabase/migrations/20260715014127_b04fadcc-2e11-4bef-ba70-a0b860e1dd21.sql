
-- 1) Restrict contacts read: admins, or workers assigned to a job linked to the contact
DROP POLICY IF EXISTS "contacts_auth_read" ON public.contacts;
CREATE POLICY "contacts_auth_read" ON public.contacts
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.contact_id = contacts.id
      AND j.assigned_to = auth.uid()
  )
);

-- 2) Add UPDATE policy for job-photos scoped to admin or assigned worker
DROP POLICY IF EXISTS "job_photos_update" ON storage.objects;
CREATE POLICY "job_photos_update" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'job-photos' AND (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id::text = split_part(name, '/', 1)
      AND j.assigned_to = auth.uid()
  )
))
WITH CHECK (bucket_id = 'job-photos' AND (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id::text = split_part(name, '/', 1)
      AND j.assigned_to = auth.uid()
  )
));

-- 3) Revoke EXECUTE on SECURITY DEFINER trigger function from callers; only trigger context needs it
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
