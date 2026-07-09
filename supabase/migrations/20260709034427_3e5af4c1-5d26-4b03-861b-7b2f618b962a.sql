
-- Messages per job
CREATE TABLE public.job_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);
CREATE INDEX job_messages_job_id_created_idx ON public.job_messages(job_id, created_at);
GRANT SELECT, INSERT, UPDATE ON public.job_messages TO authenticated;
GRANT ALL ON public.job_messages TO service_role;
ALTER TABLE public.job_messages ENABLE ROW LEVEL SECURITY;

-- Admin can see all; assignee can see messages on their jobs
CREATE POLICY "read job messages" ON public.job_messages FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_messages.job_id AND j.assigned_to = auth.uid())
);
CREATE POLICY "send job messages" ON public.job_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid() AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_messages.job_id AND j.assigned_to = auth.uid())
  )
);
CREATE POLICY "mark messages read" ON public.job_messages FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_messages.job_id AND j.assigned_to = auth.uid())
);

-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_created_idx ON public.notifications(user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own notifications" ON public.notifications FOR SELECT TO authenticated
USING (user_id = auth.uid());
CREATE POLICY "update own notifications" ON public.notifications FOR UPDATE TO authenticated
USING (user_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.job_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
