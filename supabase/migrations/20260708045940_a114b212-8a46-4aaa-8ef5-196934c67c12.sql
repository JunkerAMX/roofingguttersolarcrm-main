CREATE TABLE public.worker_polygons (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  points jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_polygons TO authenticated;
GRANT ALL ON public.worker_polygons TO service_role;

ALTER TABLE public.worker_polygons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage polygons"
  ON public.worker_polygons FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "workers read own polygon"
  ON public.worker_polygons FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER worker_polygons_updated_at
  BEFORE UPDATE ON public.worker_polygons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();