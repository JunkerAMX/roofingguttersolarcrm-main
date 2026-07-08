
CREATE TABLE public.worker_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  postcode text,
  suburb text,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_areas TO authenticated;
GRANT ALL ON public.worker_areas TO service_role;

ALTER TABLE public.worker_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage worker areas" ON public.worker_areas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Workers view own areas" ON public.worker_areas
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER worker_areas_updated_at
  BEFORE UPDATE ON public.worker_areas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX worker_areas_user_id_idx ON public.worker_areas(user_id);
