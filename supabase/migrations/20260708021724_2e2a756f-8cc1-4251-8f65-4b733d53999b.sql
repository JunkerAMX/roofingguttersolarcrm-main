
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'worker');
CREATE TYPE public.job_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
CREATE TYPE public.checklist_input_type AS ENUM ('checkbox', 'photo_before', 'photo_after', 'payment_trigger', 'note');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- Profile policies
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- User roles policies (read-only to users; admins manage via server fn/service role)
CREATE POLICY "user_roles_self_read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Updated-at helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile + first-user-becomes-admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE admin_count INT;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  SELECT COUNT(*) INTO admin_count FROM public.user_roles WHERE role = 'admin';
  IF admin_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'worker');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ CONTACTS ============
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  highlevel_contact_id TEXT UNIQUE,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts_auth_read" ON public.contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "contacts_admin_write" ON public.contacts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_contacts_updated BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ JOB TYPES ============
CREATE TABLE public.job_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.job_types TO authenticated;
GRANT ALL ON public.job_types TO service_role;
ALTER TABLE public.job_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_types_read" ON public.job_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "job_types_admin" ON public.job_types FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ CHECKLIST TEMPLATES & ITEMS ============
CREATE TABLE public.checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type_id UUID NOT NULL REFERENCES public.job_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.checklist_templates TO authenticated;
GRANT ALL ON public.checklist_templates TO service_role;
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates_read" ON public.checklist_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "templates_admin" ON public.checklist_templates FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT,
  input_type public.checklist_input_type NOT NULL DEFAULT 'checkbox',
  required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.checklist_items TO authenticated;
GRANT ALL ON public.checklist_items TO service_role;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items_read" ON public.checklist_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "items_admin" ON public.checklist_items FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ JOBS ============
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  job_type_id UUID NOT NULL REFERENCES public.job_types(id),
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status public.job_status NOT NULL DEFAULT 'scheduled',
  price_cents INT,
  currency TEXT NOT NULL DEFAULT 'AUD',
  scheduled_for TIMESTAMPTZ,
  due_date DATE,
  notes TEXT,
  highlevel_appointment_id TEXT UNIQUE,
  highlevel_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs_worker_read" ON public.jobs FOR SELECT TO authenticated USING (assigned_to = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "jobs_worker_update" ON public.jobs FOR UPDATE TO authenticated USING (assigned_to = auth.uid() OR public.has_role(auth.uid(), 'admin')) WITH CHECK (assigned_to = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "jobs_admin_all" ON public.jobs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_jobs_updated BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_jobs_assigned ON public.jobs(assigned_to, due_date);

-- ============ JOB CHECKLIST PROGRESS ============
CREATE TABLE public.job_checklist_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  checklist_item_id UUID NOT NULL REFERENCES public.checklist_items(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  input_type public.checklist_input_type NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, checklist_item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_checklist_progress TO authenticated;
GRANT ALL ON public.job_checklist_progress TO service_role;
ALTER TABLE public.job_checklist_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "progress_read" ON public.job_checklist_progress FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND (j.assigned_to = auth.uid() OR public.has_role(auth.uid(), 'admin')))
);
CREATE POLICY "progress_write" ON public.job_checklist_progress FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND (j.assigned_to = auth.uid() OR public.has_role(auth.uid(), 'admin')))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND (j.assigned_to = auth.uid() OR public.has_role(auth.uid(), 'admin')))
);

-- ============ JOB PHOTOS ============
CREATE TABLE public.job_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  checklist_item_id UUID REFERENCES public.checklist_items(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_photos TO authenticated;
GRANT ALL ON public.job_photos TO service_role;
ALTER TABLE public.job_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photos_read" ON public.job_photos FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND (j.assigned_to = auth.uid() OR public.has_role(auth.uid(), 'admin')))
);
CREATE POLICY "photos_write" ON public.job_photos FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND (j.assigned_to = auth.uid() OR public.has_role(auth.uid(), 'admin')))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND (j.assigned_to = auth.uid() OR public.has_role(auth.uid(), 'admin')))
);

-- ============ APP SETTINGS ============
CREATE TABLE public.app_settings (
  id INT PRIMARY KEY DEFAULT 1,
  company_name TEXT NOT NULL DEFAULT 'Roofing.Gutter.Solar',
  default_currency TEXT NOT NULL DEFAULT 'AUD',
  highlevel_payment_webhook_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = 1)
);
GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_read" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings_admin" ON public.app_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.app_settings (id) VALUES (1);

-- ============ SEED GUTTER CLEANING ============
INSERT INTO public.job_types (slug, name) VALUES ('gutter-cleaning', 'Gutter Cleaning');

WITH jt AS (SELECT id FROM public.job_types WHERE slug = 'gutter-cleaning'),
tpl AS (
  INSERT INTO public.checklist_templates (job_type_id, name)
  SELECT id, 'Standard Gutter Cleaning' FROM jt RETURNING id
)
INSERT INTO public.checklist_items (template_id, position, title, input_type) VALUES
  ((SELECT id FROM tpl), 1, 'Introduce yourself to the customer', 'checkbox'),
  ((SELECT id FROM tpl), 2, 'Take before photos', 'photo_before'),
  ((SELECT id FROM tpl), 3, 'Position ladder securely (place protection so gutters are not scratched)', 'checkbox'),
  ((SELECT id FROM tpl), 4, 'Take before photos of the gutters', 'photo_before'),
  ((SELECT id FROM tpl), 5, 'Remove all leaves and debris from gutters', 'checkbox'),
  ((SELECT id FROM tpl), 6, 'Use a hose or plumber''s snake to clear blocked downpipes', 'checkbox'),
  ((SELECT id FROM tpl), 7, 'Collect and dispose of all debris, then rinse the surrounding area', 'checkbox'),
  ((SELECT id FROM tpl), 8, 'Take after photos of the gutters', 'photo_after'),
  ((SELECT id FROM tpl), 9, 'Mark this job as done', 'payment_trigger'),
  ((SELECT id FROM tpl), 10, 'Collect payment via link sent to client''s phone', 'checkbox');
