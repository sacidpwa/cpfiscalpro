
-- ============ Platform admins ============
CREATE TABLE public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _user) $$;

CREATE POLICY pa_read ON public.platform_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));
CREATE POLICY pa_admin_all ON public.platform_admins FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.claim_first_platform_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.platform_admins LIMIT 1) THEN RETURN false; END IF;
  INSERT INTO public.platform_admins (user_id, notes) VALUES (_uid, 'bootstrap');
  RETURN true;
END $$;

-- ============ Extend org access for platform admins ============
CREATE POLICY orgs_platform_admin_read ON public.organizations FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));
CREATE POLICY orgs_platform_admin_update ON public.organizations FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()));
CREATE POLICY orgs_platform_admin_delete ON public.organizations FOR DELETE TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY members_platform_admin_all ON public.organization_members FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- ============ Subscription plans ============
CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE,
  plan_name text NOT NULL DEFAULT 'Básico',
  mensualidad numeric(12,2) NOT NULL DEFAULT 0,
  timbres_factura_incluidos integer NOT NULL DEFAULT 50,
  timbres_nomina_incluidos integer NOT NULL DEFAULT 200,
  dia_corte integer NOT NULL DEFAULT 1,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY sp_member_read ON public.subscription_plans FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()) OR public.is_platform_admin(auth.uid()));
CREATE POLICY sp_admin_all ON public.subscription_plans FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE TRIGGER sp_updated_at BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Stamp usage log ============
CREATE TYPE public.stamp_kind AS ENUM ('factura', 'nomina', 'pago', 'egreso');

CREATE TABLE public.stamp_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  kind public.stamp_kind NOT NULL,
  costo integer NOT NULL DEFAULT 1,
  uuid_cfdi text,
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX stamp_usage_org_date ON public.stamp_usage_log (organization_id, created_at DESC);
GRANT SELECT ON public.stamp_usage_log TO authenticated;
GRANT ALL ON public.stamp_usage_log TO service_role;
ALTER TABLE public.stamp_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY sul_member_read ON public.stamp_usage_log FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()) OR public.is_platform_admin(auth.uid()));

-- ============ Incident types catalog ============
CREATE TABLE public.incident_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  descripcion text,
  paga boolean NOT NULL DEFAULT true,
  cuenta_falta boolean NOT NULL DEFAULT false,
  color text NOT NULL DEFAULT '#94a3b8',
  orden integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.incident_types TO authenticated;
GRANT ALL ON public.incident_types TO service_role;
ALTER TABLE public.incident_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY it_read_all ON public.incident_types FOR SELECT TO authenticated USING (true);

INSERT INTO public.incident_types (codigo, nombre, paga, cuenta_falta, color, orden) VALUES
  ('A',  'Asistencia',          true,  false, '#10b981', 1),
  ('F',  'Falta',                false, true,  '#ef4444', 2),
  ('R',  'Retardo',              true,  false, '#f59e0b', 3),
  ('PG', 'Permiso con goce',     true,  false, '#3b82f6', 4),
  ('PS', 'Permiso sin goce',     false, false, '#a78bfa', 5),
  ('V',  'Vacaciones',           true,  false, '#06b6d4', 6),
  ('I',  'Incapacidad',          true,  false, '#ec4899', 7),
  ('FE', 'Día festivo',          true,  false, '#facc15', 8),
  ('D',  'Descanso',             true,  false, '#64748b', 9);

-- ============ Attendance entries ============
CREATE TABLE public.attendance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  fecha date NOT NULL,
  incident_code text NOT NULL DEFAULT 'A',
  horas_extra_dobles numeric(5,2) NOT NULL DEFAULT 0,
  horas_extra_triples numeric(5,2) NOT NULL DEFAULT 0,
  minutos_retardo integer NOT NULL DEFAULT 0,
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (employee_id, fecha)
);
CREATE INDEX ae_org_fecha ON public.attendance_entries (organization_id, fecha);
CREATE INDEX ae_emp_fecha ON public.attendance_entries (employee_id, fecha);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_entries TO authenticated;
GRANT ALL ON public.attendance_entries TO service_role;
ALTER TABLE public.attendance_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY ae_read ON public.attendance_entries FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()) OR public.is_platform_admin(auth.uid()));
CREATE POLICY ae_write ON public.attendance_entries FOR ALL TO authenticated
  USING (
    public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'nomina'::app_role, 'recursos_humanos'::app_role])
    OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'nomina'::app_role, 'recursos_humanos'::app_role])
    OR public.is_platform_admin(auth.uid())
  );
CREATE TRIGGER ae_updated_at BEFORE UPDATE ON public.attendance_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
