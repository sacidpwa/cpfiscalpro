-- Consolidated migration script for 33 files

-- === 20260604030822_b3f0bf4c-50e3-4c82-902b-316ebef00ec3.sql ===

-- ============ ENUMS ============
CREATE TYPE app_role AS ENUM ('owner','admin','contador','nomina','lector');
CREATE TYPE journal_type AS ENUM ('ingreso','egreso','diario');
CREATE TYPE journal_status AS ENUM ('borrador','confirmada','cancelada');
CREATE TYPE account_nature AS ENUM ('deudora','acreedora');
CREATE TYPE payroll_periodicity AS ENUM ('semanal','catorcenal','quincenal','mensual');
CREATE TYPE payroll_period_status AS ENUM ('abierto','calculado','pagado','cerrado');
CREATE TYPE employee_status AS ENUM ('activo','baja','suspendido');
CREATE TYPE concept_type AS ENUM ('percepcion','deduccion');
CREATE TYPE import_status AS ENUM ('pendiente','procesando','completado','error');
CREATE TYPE import_kind AS ENUM ('coi_cuentas','coi_polizas','noi_empleados','noi_movimientos');

-- ============ UTILS ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_self_read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_self_upsert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto crear profile en signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ ORGANIZATIONS ============
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfc TEXT NOT NULL,
  razon_social TEXT NOT NULL,
  nombre_comercial TEXT,
  regimen_fiscal TEXT,
  codigo_postal TEXT,
  direccion TEXT,
  logo_url TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Mexico_City',
  moneda TEXT NOT NULL DEFAULT 'MXN',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX organizations_rfc_unique ON public.organizations(UPPER(rfc));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_org_updated BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ORG MEMBERS (roles) ============
CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'lector',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Security definer helpers
CREATE OR REPLACE FUNCTION public.is_org_member(_org UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = _org AND user_id = _user)
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org UUID, _user UUID, _roles app_role[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org AND user_id = _user AND role = ANY(_roles)
  )
$$;

CREATE OR REPLACE FUNCTION public.user_org_ids(_user UUID)
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.organization_members WHERE user_id = _user
$$;

-- Policies for organizations
CREATE POLICY "orgs_member_read" ON public.organizations FOR SELECT TO authenticated
USING (public.is_org_member(id, auth.uid()));
CREATE POLICY "orgs_create_any_auth" ON public.organizations FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);
CREATE POLICY "orgs_owner_update" ON public.organizations FOR UPDATE TO authenticated
USING (public.has_org_role(id, auth.uid(), ARRAY['owner','admin']::app_role[]));
CREATE POLICY "orgs_owner_delete" ON public.organizations FOR DELETE TO authenticated
USING (public.has_org_role(id, auth.uid(), ARRAY['owner']::app_role[]));

-- Policies for org_members
CREATE POLICY "members_read_own_orgs" ON public.organization_members FOR SELECT TO authenticated
USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "members_admin_insert" ON public.organization_members FOR INSERT TO authenticated
WITH CHECK (
  -- creator can self-add as owner during org creation
  (user_id = auth.uid() AND role = 'owner' AND NOT public.is_org_member(organization_id, auth.uid()))
  OR public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::app_role[])
);
CREATE POLICY "members_admin_update" ON public.organization_members FOR UPDATE TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::app_role[]));
CREATE POLICY "members_admin_delete" ON public.organization_members FOR DELETE TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::app_role[]));

-- ============ ACCOUNTS (catálogo) ============
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  codigo_agrupador TEXT,
  naturaleza account_nature NOT NULL DEFAULT 'deudora',
  nivel INT NOT NULL DEFAULT 1,
  parent_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  acumulativa BOOLEAN NOT NULL DEFAULT false,
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, codigo)
);
CREATE INDEX accounts_org_idx ON public.accounts(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_accounts_updated BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "accounts_read" ON public.accounts FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "accounts_write" ON public.accounts FOR INSERT TO authenticated
WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','contador']::app_role[]));
CREATE POLICY "accounts_update" ON public.accounts FOR UPDATE TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','contador']::app_role[]));
CREATE POLICY "accounts_delete" ON public.accounts FOR DELETE TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::app_role[]));

-- ============ PERIODS ============
CREATE TABLE public.periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ejercicio INT NOT NULL,
  mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  cerrado BOOLEAN NOT NULL DEFAULT false,
  fecha_cierre DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, ejercicio, mes)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.periods TO authenticated;
GRANT ALL ON public.periods TO service_role;
ALTER TABLE public.periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "periods_read" ON public.periods FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "periods_write" ON public.periods FOR ALL TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','contador']::app_role[]))
WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','contador']::app_role[]));

-- ============ JOURNAL ENTRIES (pólizas) ============
CREATE TABLE public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tipo journal_type NOT NULL,
  numero INT NOT NULL,
  fecha DATE NOT NULL,
  concepto TEXT NOT NULL,
  estatus journal_status NOT NULL DEFAULT 'borrador',
  total_cargo NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_abono NUMERIC(18,2) NOT NULL DEFAULT 0,
  referencia TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, tipo, numero, fecha)
);
CREATE INDEX journal_entries_org_fecha_idx ON public.journal_entries(organization_id, fecha);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;
GRANT ALL ON public.journal_entries TO service_role;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_je_updated BEFORE UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "je_read" ON public.journal_entries FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "je_write" ON public.journal_entries FOR ALL TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','contador']::app_role[]))
WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','contador']::app_role[]));

CREATE TABLE public.journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id),
  concepto TEXT,
  cargo NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (cargo >= 0),
  abono NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (abono >= 0),
  orden INT NOT NULL DEFAULT 0
);
CREATE INDEX journal_lines_entry_idx ON public.journal_lines(entry_id);
CREATE INDEX journal_lines_account_idx ON public.journal_lines(account_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_lines TO authenticated;
GRANT ALL ON public.journal_lines TO service_role;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jl_read" ON public.journal_lines FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "jl_write" ON public.journal_lines FOR ALL TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','contador']::app_role[]))
WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','contador']::app_role[]));

-- ============ EMPLOYEES ============
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  numero TEXT NOT NULL,
  nombre TEXT NOT NULL,
  apellido_paterno TEXT,
  apellido_materno TEXT,
  rfc TEXT,
  curp TEXT,
  nss TEXT,
  fecha_nacimiento DATE,
  fecha_alta DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_baja DATE,
  puesto TEXT,
  departamento TEXT,
  salario_diario NUMERIC(12,2) NOT NULL DEFAULT 0,
  sdi NUMERIC(12,2) NOT NULL DEFAULT 0,
  periodicidad payroll_periodicity NOT NULL DEFAULT 'quincenal',
  forma_pago TEXT DEFAULT 'transferencia',
  banco TEXT,
  clabe TEXT,
  email TEXT,
  telefono TEXT,
  estatus employee_status NOT NULL DEFAULT 'activo',
  tipo_regimen TEXT DEFAULT 'sueldos_salarios',
  riesgo_puesto NUMERIC(8,5) DEFAULT 0.54355,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, numero)
);
CREATE INDEX employees_org_idx ON public.employees(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "emp_read" ON public.employees FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "emp_write" ON public.employees FOR ALL TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','nomina']::app_role[]))
WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','nomina']::app_role[]));

-- ============ PAYROLL CONCEPTS ============
CREATE TABLE public.payroll_concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  clave_sat TEXT NOT NULL,
  clave_propia TEXT,
  descripcion TEXT NOT NULL,
  tipo concept_type NOT NULL,
  gravado_isr BOOLEAN NOT NULL DEFAULT true,
  integra_sbc BOOLEAN NOT NULL DEFAULT true,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, clave_sat, tipo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_concepts TO authenticated;
GRANT ALL ON public.payroll_concepts TO service_role;
ALTER TABLE public.payroll_concepts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pc_read" ON public.payroll_concepts FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "pc_write" ON public.payroll_concepts FOR ALL TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','nomina']::app_role[]))
WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','nomina']::app_role[]));

-- ============ PAYROLL PERIODS / RECEIPTS ============
CREATE TABLE public.payroll_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ejercicio INT NOT NULL,
  numero INT NOT NULL,
  periodicidad payroll_periodicity NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  fecha_pago DATE NOT NULL,
  dias INT NOT NULL,
  estatus payroll_period_status NOT NULL DEFAULT 'abierto',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, ejercicio, periodicidad, numero)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_periods TO authenticated;
GRANT ALL ON public.payroll_periods TO service_role;
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pp_read" ON public.payroll_periods FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "pp_write" ON public.payroll_periods FOR ALL TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','nomina']::app_role[]))
WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','nomina']::app_role[]));

CREATE TABLE public.payroll_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payroll_period_id UUID NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  dias_pagados NUMERIC(8,4) NOT NULL,
  sueldo_diario NUMERIC(12,2) NOT NULL,
  sdi NUMERIC(12,2) NOT NULL,
  total_percepciones NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_deducciones NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_gravado NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_exento NUMERIC(14,2) NOT NULL DEFAULT 0,
  isr NUMERIC(14,2) NOT NULL DEFAULT 0,
  subsidio NUMERIC(14,2) NOT NULL DEFAULT 0,
  imss_obrero NUMERIC(14,2) NOT NULL DEFAULT 0,
  neto_pagar NUMERIC(14,2) NOT NULL DEFAULT 0,
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(payroll_period_id, employee_id)
);
CREATE INDEX pr_org_idx ON public.payroll_receipts(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_receipts TO authenticated;
GRANT ALL ON public.payroll_receipts TO service_role;
ALTER TABLE public.payroll_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pr_read" ON public.payroll_receipts FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "pr_write" ON public.payroll_receipts FOR ALL TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','nomina']::app_role[]))
WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','nomina']::app_role[]));

CREATE TABLE public.payroll_receipt_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES public.payroll_receipts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  concepto_clave TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  tipo concept_type NOT NULL,
  importe_gravado NUMERIC(14,2) NOT NULL DEFAULT 0,
  importe_exento NUMERIC(14,2) NOT NULL DEFAULT 0
);
CREATE INDEX prl_receipt_idx ON public.payroll_receipt_lines(receipt_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_receipt_lines TO authenticated;
GRANT ALL ON public.payroll_receipt_lines TO service_role;
ALTER TABLE public.payroll_receipt_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prl_read" ON public.payroll_receipt_lines FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "prl_write" ON public.payroll_receipt_lines FOR ALL TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','nomina']::app_role[]))
WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','nomina']::app_role[]));

-- ============ TAX TABLES (globales, lectura pública para autenticados) ============
CREATE TABLE public.tax_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ejercicio INT NOT NULL,
  tipo TEXT NOT NULL, -- isr_mensual, isr_semanal, isr_quincenal, isr_catorcenal, subsidio_mensual, subsidio_semanal, subsidio_quincenal, subsidio_catorcenal
  limite_inferior NUMERIC(14,2) NOT NULL,
  limite_superior NUMERIC(14,2),
  cuota_fija NUMERIC(14,2) NOT NULL DEFAULT 0,
  porcentaje NUMERIC(8,4) NOT NULL DEFAULT 0,
  orden INT NOT NULL DEFAULT 0
);
CREATE INDEX tax_tables_lookup ON public.tax_tables(ejercicio, tipo, orden);
GRANT SELECT ON public.tax_tables TO authenticated;
GRANT ALL ON public.tax_tables TO service_role;
ALTER TABLE public.tax_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tt_read_auth" ON public.tax_tables FOR SELECT TO authenticated USING (true);

CREATE TABLE public.fiscal_params (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ejercicio INT NOT NULL,
  clave TEXT NOT NULL, -- uma_diaria, salario_minimo, tope_imss
  valor NUMERIC(14,4) NOT NULL,
  vigente_desde DATE,
  UNIQUE(ejercicio, clave, vigente_desde)
);
GRANT SELECT ON public.fiscal_params TO authenticated;
GRANT ALL ON public.fiscal_params TO service_role;
ALTER TABLE public.fiscal_params ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fp_read_auth" ON public.fiscal_params FOR SELECT TO authenticated USING (true);

-- ============ IMPORT JOBS ============
CREATE TABLE public.import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind import_kind NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT,
  status import_status NOT NULL DEFAULT 'pendiente',
  rows_total INT DEFAULT 0,
  rows_ok INT DEFAULT 0,
  rows_error INT DEFAULT 0,
  log JSONB DEFAULT '[]'::jsonb,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_jobs TO authenticated;
GRANT ALL ON public.import_jobs TO service_role;
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ij_read" ON public.import_jobs FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "ij_write" ON public.import_jobs FOR ALL TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','contador','nomina']::app_role[]))
WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','contador','nomina']::app_role[]));


-- === 20260604030835_23f283e9-2f2f-432a-9cae-bbcc05e67a09.sql ===

REVOKE EXECUTE ON FUNCTION public.is_org_member(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_org_role(UUID, UUID, app_role[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_org_ids(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;


-- === 20260605000232_5a29db55-7343-4dab-bcc2-a1047d684c71.sql ===
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'recursos_humanos';

-- === 20260605000308_b9674faa-b1b1-4b13-becb-bbbf4f667a98.sql ===

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


-- === 20260605000320_2e2449b3-b029-4c45-bc89-a4bd68c32f6d.sql ===

REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_first_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_first_platform_admin() TO authenticated, service_role;


-- === 20260605012852_3d4a586f-5485-41e7-a1d3-0018c5d1deeb.sql ===
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.app_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_org_ids(uuid) TO authenticated, service_role;

-- === 20260605013012_b0251e2d-9082-4385-bb23-24fa4ec99ff4.sql ===
CREATE OR REPLACE FUNCTION public.is_org_member(_org uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = _org
      AND user_id = _user
  )
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org uuid, _user uuid, _roles public.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = _org
      AND user_id = _user
      AND role = ANY(_roles)
  )
$$;

CREATE OR REPLACE FUNCTION public.user_org_ids(_user uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = _user
$$;

REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.app_role[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_org_ids(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.app_role[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_org_ids(uuid) TO service_role;

-- === 20260605013135_712e5b19-1786-4124-b2da-9d0e4ce986a6.sql ===
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins
    WHERE user_id = _user
  )
$$;

REVOKE EXECUTE ON FUNCTION public.claim_first_platform_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_first_platform_admin() TO service_role;

-- === 20260605013749_9ce0fa6a-3d71-48a6-9a55-6d7047f26740.sql ===
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins
    WHERE user_id = _user
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.app_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_org_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;

-- === 20260605040258_8b6fac07-90d2-4017-8a90-63aeb8653e97.sql ===
DELETE FROM public.employees;

-- === 20260605044110_408122ba-2be7-49a8-990a-50899ae5f269.sql ===
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS empresa text;

-- === 20260605044757_8c4f74bc-6a79-46a1-bf3f-ba6c1d4aea7c.sql ===
ALTER TABLE public.attendance_entries ADD COLUMN IF NOT EXISTS extra_codes text[] NOT NULL DEFAULT '{}';

-- === 20260605045710_ff98de27-705a-4184-b74c-a392dc486e2d.sql ===

-- Sembrar tarifas fiscales 2026 (sin actualización SAT vigente, se clonan de 2025)
INSERT INTO public.tax_tables (ejercicio, tipo, orden, limite_inferior, limite_superior, cuota_fija, porcentaje)
SELECT 2026, tipo, orden, limite_inferior, limite_superior, cuota_fija, porcentaje
FROM public.tax_tables
WHERE ejercicio = 2025
  AND NOT EXISTS (SELECT 1 FROM public.tax_tables t2 WHERE t2.ejercicio = 2026);

INSERT INTO public.fiscal_params (ejercicio, clave, valor, vigente_desde)
SELECT 2026, clave, valor, '2026-01-01'::date
FROM public.fiscal_params
WHERE ejercicio = 2025
  AND NOT EXISTS (SELECT 1 FROM public.fiscal_params f2 WHERE f2.ejercicio = 2026 AND f2.clave = public.fiscal_params.clave);


-- === 20260605053641_2b190de1-4e30-4ac7-9131-625e8dc78507.sql ===

CREATE TABLE public.org_billing_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE,
  facturapi_org_id text,
  facturapi_test_key text,
  facturapi_live_key text,
  environment text NOT NULL DEFAULT 'test' CHECK (environment IN ('test','live')),
  csd_uploaded_at timestamptz,
  csd_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_billing_config TO authenticated;
GRANT ALL ON public.org_billing_config TO service_role;

ALTER TABLE public.org_billing_config ENABLE ROW LEVEL SECURITY;

-- Solo owner/admin pueden leer (los server fns igualmente usan service_role)
CREATE POLICY obc_read ON public.org_billing_config
  FOR SELECT TO authenticated
  USING (
    has_org_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
    OR is_platform_admin(auth.uid())
  );

CREATE POLICY obc_write ON public.org_billing_config
  FOR ALL TO authenticated
  USING (
    has_org_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
    OR is_platform_admin(auth.uid())
  )
  WITH CHECK (
    has_org_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
    OR is_platform_admin(auth.uid())
  );

CREATE TRIGGER trg_obc_updated_at
  BEFORE UPDATE ON public.org_billing_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- === 20260605053657_a1596cb7-84ac-42a1-8a74-f866e3977151.sql ===

REVOKE SELECT ON public.org_billing_config FROM authenticated;
DROP POLICY IF EXISTS obc_read ON public.org_billing_config;


-- === 20260605054330_cf1be7ba-d446-441a-9b85-777ed868e51a.sql ===

UPDATE public.fiscal_params SET valor = 117.55,    vigente_desde = '2026-02-01' WHERE ejercicio = 2026 AND clave = 'uma_diaria';
UPDATE public.fiscal_params SET valor = 3573.49,   vigente_desde = '2026-02-01' WHERE ejercicio = 2026 AND clave = 'uma_mensual';
UPDATE public.fiscal_params SET valor = 42881.86,  vigente_desde = '2026-02-01' WHERE ejercicio = 2026 AND clave = 'uma_anual';
UPDATE public.fiscal_params SET valor = 2938.75,   vigente_desde = '2026-02-01' WHERE ejercicio = 2026 AND clave = 'tope_sbc_imss';
UPDATE public.fiscal_params SET valor = 315.04,    vigente_desde = '2026-01-01' WHERE ejercicio = 2026 AND clave = 'salario_minimo_general';
UPDATE public.fiscal_params SET valor = 470.54,    vigente_desde = '2026-01-01' WHERE ejercicio = 2026 AND clave = 'salario_minimo_frontera';


-- === 20260605060234_14baca79-5dd5-43a5-a9a9-c924fa1e84b9.sql ===
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS cp_fiscal TEXT,
  ADD COLUMN IF NOT EXISTS regimen_fiscal_receptor TEXT DEFAULT '605';

CREATE TABLE IF NOT EXISTS public.cfdi_stamps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  kind TEXT NOT NULL,
  reference_id UUID NOT NULL,
  facturapi_id TEXT,
  uuid_sat TEXT,
  serie TEXT,
  folio TEXT,
  fecha_timbrado TIMESTAMP WITH TIME ZONE,
  xml_path TEXT,
  pdf_path TEXT,
  ambiente TEXT NOT NULL DEFAULT 'test',
  estatus TEXT NOT NULL DEFAULT 'pendiente',
  error_message TEXT,
  payload JSONB,
  total NUMERIC,
  timbrado_por UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT cfdi_stamps_kind_check CHECK (kind IN ('nomina', 'factura')),
  CONSTRAINT cfdi_stamps_ambiente_check CHECK (ambiente IN ('test', 'live')),
  CONSTRAINT cfdi_stamps_estatus_check CHECK (estatus IN ('pendiente', 'timbrado', 'error', 'cancelado'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cfdi_stamps TO authenticated;
GRANT ALL ON public.cfdi_stamps TO service_role;

ALTER TABLE public.cfdi_stamps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cfdi_stamps_read"
ON public.cfdi_stamps
FOR SELECT
TO authenticated
USING (public.is_org_member(organization_id, auth.uid()) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "cfdi_stamps_insert"
ON public.cfdi_stamps
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'nomina'::app_role, 'contador'::app_role])
  OR public.is_platform_admin(auth.uid())
);

CREATE POLICY "cfdi_stamps_update"
ON public.cfdi_stamps
FOR UPDATE
TO authenticated
USING (
  public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'nomina'::app_role, 'contador'::app_role])
  OR public.is_platform_admin(auth.uid())
)
WITH CHECK (
  public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'nomina'::app_role, 'contador'::app_role])
  OR public.is_platform_admin(auth.uid())
);

CREATE POLICY "cfdi_stamps_delete"
ON public.cfdi_stamps
FOR DELETE
TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]) OR public.is_platform_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS cfdi_stamps_org_created_idx ON public.cfdi_stamps (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cfdi_stamps_reference_idx ON public.cfdi_stamps (reference_id, kind);
CREATE UNIQUE INDEX IF NOT EXISTS cfdi_stamps_unique_timbrado_idx ON public.cfdi_stamps (reference_id, kind) WHERE estatus = 'timbrado';

DROP TRIGGER IF EXISTS cfdi_stamps_updated_at ON public.cfdi_stamps;
CREATE TRIGGER cfdi_stamps_updated_at
BEFORE UPDATE ON public.cfdi_stamps
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

NOTIFY pgrst, 'reload schema';

-- === 20260605213253_cf334d43-23e7-4a72-aea0-acd222e73a3c.sql ===
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS infonavit_cuota_mensual numeric NOT NULL DEFAULT 0;

-- === 20260606034518_3d0b834e-1542-493e-b218-4f718dd5ec84.sql ===

-- CUSTOMERS
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  rfc text NOT NULL,
  razon_social text NOT NULL,
  nombre_comercial text,
  regimen_fiscal text NOT NULL DEFAULT '616',
  uso_cfdi_default text NOT NULL DEFAULT 'G03',
  codigo_postal text NOT NULL,
  email text,
  telefono text,
  calle text,
  num_exterior text,
  num_interior text,
  colonia text,
  municipio text,
  estado text,
  pais text NOT NULL DEFAULT 'MEX',
  moneda text NOT NULL DEFAULT 'MXN',
  dias_credito integer NOT NULL DEFAULT 0,
  forma_pago_default text,
  metodo_pago_default text NOT NULL DEFAULT 'PUE',
  notas text,
  activo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, rfc)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY customers_read ON public.customers FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_platform_admin(auth.uid()));

CREATE POLICY customers_write ON public.customers FOR ALL TO authenticated
  USING (has_org_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'contador'::app_role,'nomina'::app_role]) OR is_platform_admin(auth.uid()))
  WITH CHECK (has_org_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'contador'::app_role,'nomina'::app_role]) OR is_platform_admin(auth.uid()));

CREATE TRIGGER customers_set_updated BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_customers_org ON public.customers(organization_id);
CREATE INDEX idx_customers_rfc ON public.customers(organization_id, rfc);

-- PRODUCTS
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  clave text NOT NULL,
  descripcion text NOT NULL,
  tipo text NOT NULL DEFAULT 'producto' CHECK (tipo IN ('producto','servicio')),
  clave_prod_serv text NOT NULL,
  clave_unidad text NOT NULL,
  unidad text,
  precio_unitario numeric(14,4) NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'MXN',
  iva_tasa numeric(6,4) NOT NULL DEFAULT 0.16,
  iva_tipo text NOT NULL DEFAULT 'tasa' CHECK (iva_tipo IN ('tasa','exento','no_aplica')),
  ieps_tasa numeric(6,4) NOT NULL DEFAULT 0,
  ret_iva_tasa numeric(6,4) NOT NULL DEFAULT 0,
  ret_isr_tasa numeric(6,4) NOT NULL DEFAULT 0,
  objeto_imp text NOT NULL DEFAULT '02',
  sku text,
  activo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, clave)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY products_read ON public.products FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_platform_admin(auth.uid()));

CREATE POLICY products_write ON public.products FOR ALL TO authenticated
  USING (has_org_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'contador'::app_role,'nomina'::app_role]) OR is_platform_admin(auth.uid()))
  WITH CHECK (has_org_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'contador'::app_role,'nomina'::app_role]) OR is_platform_admin(auth.uid()));

CREATE TRIGGER products_set_updated BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_products_org ON public.products(organization_id);
CREATE INDEX idx_products_clave ON public.products(organization_id, clave);


-- === 20260606194121_e5e8e75a-d57a-4243-9297-060990ee1058.sql ===

CREATE TABLE public.payroll_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  payroll_period_id uuid NOT NULL,
  sent_by uuid,
  from_email text,
  summary_to text[],
  summary_cc text[],
  total_recipients integer NOT NULL DEFAULT 0,
  total_sent integer NOT NULL DEFAULT 0,
  total_skipped integer NOT NULL DEFAULT 0,
  total_failed integer NOT NULL DEFAULT 0,
  sin_email integer NOT NULL DEFAULT 0,
  summary_sent boolean NOT NULL DEFAULT false,
  summary_error text,
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payroll_email_logs_period_idx ON public.payroll_email_logs (payroll_period_id, created_at DESC);

GRANT SELECT, INSERT ON public.payroll_email_logs TO authenticated;
GRANT ALL ON public.payroll_email_logs TO service_role;

ALTER TABLE public.payroll_email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY pel_read ON public.payroll_email_logs
  FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_platform_admin(auth.uid()));

CREATE POLICY pel_insert ON public.payroll_email_logs
  FOR INSERT TO authenticated
  WITH CHECK (has_org_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'nomina'::app_role, 'contador'::app_role]) OR is_platform_admin(auth.uid()));


-- === 20260607040102_86a50c6a-7bc8-44fe-bf82-b3711cff1a15.sql ===

CREATE TYPE public.org_request_status AS ENUM ('pendiente','aprobada','rechazada');

CREATE TABLE public.organization_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL,
  rfc text NOT NULL,
  razon_social text NOT NULL,
  regimen_fiscal text,
  codigo_postal text,
  motivo text,
  status public.org_request_status NOT NULL DEFAULT 'pendiente',
  admin_notes text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.organization_requests TO authenticated;
GRANT ALL ON public.organization_requests TO service_role;

ALTER TABLE public.organization_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_req_self_read ON public.organization_requests
  FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR public.is_platform_admin(auth.uid()));

CREATE POLICY org_req_self_insert ON public.organization_requests
  FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());

CREATE POLICY org_req_admin_update ON public.organization_requests
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TRIGGER trg_org_req_updated
  BEFORE UPDATE ON public.organization_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_org_req_status ON public.organization_requests(status);
CREATE INDEX idx_org_req_requested_by ON public.organization_requests(requested_by);


-- === 20260607040607_86528737-a2cf-49e5-8b56-217b8a9dc5a3.sql ===

INSERT INTO public.incident_types (codigo, nombre, descripcion, paga, cuenta_falta, color, orden)
VALUES ('SUS', 'Suspensión', 'Suspensión laboral sin goce de sueldo', false, true, '#9333ea', 10)
ON CONFLICT DO NOTHING;


-- === 20260607043746_20b15833-57e5-4701-bec2-fcb900429930.sql ===
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS dia_pago integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS fecha_inicio date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento date,
  ADD COLUMN IF NOT EXISTS estatus text NOT NULL DEFAULT 'activa',
  ADD COLUMN IF NOT EXISTS metodo_pago_preferido text NOT NULL DEFAULT 'transferencia',
  ADD COLUMN IF NOT EXISTS notas_admin text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscription_plans_estatus_check'
  ) THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_estatus_check CHECK (estatus IN ('activa', 'suspendida', 'cancelada'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscription_plans_dia_pago_check'
  ) THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_dia_pago_check CHECK (dia_pago BETWEEN 1 AND 28);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscription_plans_metodo_pago_preferido_check'
  ) THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_metodo_pago_preferido_check CHECK (metodo_pago_preferido IN ('transferencia', 'efectivo', 'stripe', 'tarjeta', 'otro'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.org_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  modulo text NOT NULL,
  activo boolean NOT NULL DEFAULT false,
  costo_mensual numeric NOT NULL DEFAULT 0,
  activado_por uuid,
  activado_en timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT org_modules_modulo_check CHECK (modulo IN ('nomina', 'facturacion', 'contabilidad', 'asistencias', 'bancos', 'declaraciones')),
  CONSTRAINT org_modules_costo_mensual_check CHECK (costo_mensual >= 0),
  CONSTRAINT org_modules_org_modulo_unique UNIQUE (organization_id, modulo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_modules TO authenticated;
GRANT ALL ON public.org_modules TO service_role;
ALTER TABLE public.org_modules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_modules_read ON public.org_modules;
CREATE POLICY org_modules_read ON public.org_modules
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()) OR public.is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS org_modules_admin_all ON public.org_modules;
CREATE POLICY org_modules_admin_all ON public.org_modules
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.subscription_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  ejercicio integer NOT NULL,
  mes integer NOT NULL,
  monto_base numeric NOT NULL DEFAULT 0,
  surcharge numeric NOT NULL DEFAULT 0,
  monto_total numeric NOT NULL DEFAULT 0,
  fecha_emision date NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento date NOT NULL,
  fecha_pago date,
  estatus text NOT NULL DEFAULT 'pendiente',
  metodo_pago text NOT NULL DEFAULT 'transferencia',
  comprobante_url text,
  stripe_payment_intent text,
  notas text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT subscription_invoices_mes_check CHECK (mes BETWEEN 1 AND 12),
  CONSTRAINT subscription_invoices_montos_check CHECK (monto_base >= 0 AND surcharge >= 0 AND monto_total >= 0),
  CONSTRAINT subscription_invoices_estatus_check CHECK (estatus IN ('pendiente', 'pagada', 'vencida', 'cancelada')),
  CONSTRAINT subscription_invoices_metodo_pago_check CHECK (metodo_pago IN ('transferencia', 'efectivo', 'stripe', 'tarjeta', 'otro')),
  CONSTRAINT subscription_invoices_org_period_unique UNIQUE (organization_id, ejercicio, mes)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_invoices TO authenticated;
GRANT ALL ON public.subscription_invoices TO service_role;
ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscription_invoices_read ON public.subscription_invoices;
CREATE POLICY subscription_invoices_read ON public.subscription_invoices
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()) OR public.is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS subscription_invoices_admin_all ON public.subscription_invoices;
CREATE POLICY subscription_invoices_admin_all ON public.subscription_invoices
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.tax_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  ejercicio integer NOT NULL,
  mes integer,
  tipo text NOT NULL,
  estatus text NOT NULL DEFAULT 'pendiente',
  fecha_limite date NOT NULL,
  fecha_presentacion date,
  monto_pagar numeric NOT NULL DEFAULT 0,
  monto_a_favor numeric NOT NULL DEFAULT 0,
  linea_captura text,
  acuse_path text,
  acuse_pago_path text,
  notas text,
  uploaded_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tax_filings_mes_check CHECK (mes IS NULL OR mes BETWEEN 1 AND 12),
  CONSTRAINT tax_filings_tipo_check CHECK (tipo IN ('isr_mensual', 'iva_mensual', 'diot', 'isr_anual', 'retenciones_sueldos', 'retenciones_honorarios', 'informativa_nomina')),
  CONSTRAINT tax_filings_estatus_check CHECK (estatus IN ('pendiente', 'en_revision', 'presentada', 'con_observaciones')),
  CONSTRAINT tax_filings_montos_check CHECK (monto_pagar >= 0 AND monto_a_favor >= 0),
  CONSTRAINT tax_filings_org_period_type_unique UNIQUE (organization_id, ejercicio, mes, tipo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_filings TO authenticated;
GRANT ALL ON public.tax_filings TO service_role;
ALTER TABLE public.tax_filings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tax_filings_read ON public.tax_filings;
CREATE POLICY tax_filings_read ON public.tax_filings
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()) OR public.is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS tax_filings_admin_all ON public.tax_filings;
CREATE POLICY tax_filings_admin_all ON public.tax_filings
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP TRIGGER IF EXISTS update_org_modules_updated_at ON public.org_modules;
CREATE TRIGGER update_org_modules_updated_at
  BEFORE UPDATE ON public.org_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscription_invoices_updated_at ON public.subscription_invoices;
CREATE TRIGGER update_subscription_invoices_updated_at
  BEFORE UPDATE ON public.subscription_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_tax_filings_updated_at ON public.tax_filings;
CREATE TRIGGER update_tax_filings_updated_at
  BEFORE UPDATE ON public.tax_filings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- === 20260611191423_a74613ce-1608-4e59-b967-3a60042e0a06.sql ===
ALTER TABLE public.cfdi_stamps DROP CONSTRAINT IF EXISTS cfdi_stamps_kind_check;
ALTER TABLE public.cfdi_stamps ADD CONSTRAINT cfdi_stamps_kind_check CHECK (kind = ANY (ARRAY['nomina'::text, 'factura'::text, 'ingreso'::text]));

-- === 20260611211027_12bce88f-e7c8-497e-b3a9-0cee1397db1e.sql ===

-- 1) Permitir 'pago' y 'traslado' en cfdi_stamps.kind
ALTER TABLE public.cfdi_stamps DROP CONSTRAINT IF EXISTS cfdi_stamps_kind_check;
ALTER TABLE public.cfdi_stamps ADD CONSTRAINT cfdi_stamps_kind_check
  CHECK (kind = ANY (ARRAY['nomina'::text, 'factura'::text, 'ingreso'::text, 'pago'::text, 'traslado'::text]));

-- 2) Vehículos (catálogo)
CREATE TABLE public.vehicles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  config_vehicular TEXT NOT NULL,
  placa_vm TEXT NOT NULL,
  anio_modelo INTEGER NOT NULL,
  perm_sct TEXT,
  num_permiso_sct TEXT,
  peso_bruto_vehicular NUMERIC(10,3),
  asegura_resp_civil TEXT,
  poliza_resp_civil TEXT,
  tipo_remolque TEXT,
  placa_remolque TEXT,
  alias TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicles select org" ON public.vehicles FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "vehicles write org" ON public.vehicles FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','contador']::app_role[]))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','contador']::app_role[]));
CREATE TRIGGER trg_vehicles_updated BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_vehicles_org ON public.vehicles(organization_id);

-- 3) Operadores / choferes (catálogo)
CREATE TABLE public.operators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rfc TEXT NOT NULL,
  nombre TEXT NOT NULL,
  num_licencia TEXT NOT NULL,
  curp TEXT,
  residencia_fiscal TEXT,
  num_reg_id_trib TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operators TO authenticated;
GRANT ALL ON public.operators TO service_role;
ALTER TABLE public.operators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operators select org" ON public.operators FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "operators write org" ON public.operators FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','contador']::app_role[]))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','contador']::app_role[]));
CREATE TRIGGER trg_operators_updated BEFORE UPDATE ON public.operators
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_operators_org ON public.operators(organization_id);


-- === 20260612004029_ad4f7612-3cf8-4c6e-8927-cf87dfb9af7a.sql ===

CREATE TABLE public.customer_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  clave_prod_serv TEXT NOT NULL,
  no_identificacion TEXT,
  descripcion TEXT NOT NULL,
  clave_unidad TEXT NOT NULL DEFAULT 'H87',
  unidad TEXT,
  precio_unitario NUMERIC(14,4) NOT NULL DEFAULT 0,
  objeto_imp TEXT NOT NULL DEFAULT '02',
  iva_tasa NUMERIC(6,4) NOT NULL DEFAULT 0.16,
  iva_tipo TEXT NOT NULL DEFAULT 'tasa',
  ieps_tasa NUMERIC(6,4) NOT NULL DEFAULT 0,
  ret_iva_tasa NUMERIC(6,4) NOT NULL DEFAULT 0,
  ret_isr_tasa NUMERIC(6,4) NOT NULL DEFAULT 0,
  moneda TEXT NOT NULL DEFAULT 'MXN',
  times_used INTEGER NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX customer_items_unique
  ON public.customer_items(customer_id, clave_prod_serv, md5(descripcion), precio_unitario);
CREATE INDEX customer_items_by_customer ON public.customer_items(customer_id);
CREATE INDEX customer_items_by_org ON public.customer_items(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_items TO authenticated;
GRANT ALL ON public.customer_items TO service_role;

ALTER TABLE public.customer_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_items_read ON public.customer_items
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()) OR public.is_platform_admin(auth.uid()));

CREATE POLICY customer_items_write ON public.customer_items
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'contador'::app_role,'nomina'::app_role]) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'contador'::app_role,'nomina'::app_role]) OR public.is_platform_admin(auth.uid()));

CREATE TRIGGER update_customer_items_updated_at
  BEFORE UPDATE ON public.customer_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- === 20260612043215_e6ca8a94-27d5-47fd-b978-dfea3e5425a6.sql ===
DROP INDEX IF EXISTS public.cfdi_stamps_unique_timbrado_idx;
CREATE UNIQUE INDEX IF NOT EXISTS cfdi_stamps_unique_facturapi_idx
ON public.cfdi_stamps (organization_id, facturapi_id)
WHERE facturapi_id IS NOT NULL;

-- === 20260612043300_1f0f85f6-33ba-4d57-ad1e-8d578d37e3d5.sql ===
CREATE UNIQUE INDEX IF NOT EXISTS cfdi_stamps_unique_reference_timbrado_idx
ON public.cfdi_stamps (reference_id, kind, ambiente)
WHERE estatus = 'timbrado' AND kind <> 'ingreso';

-- === 20260612050129_e00e47a0-a8d2-44fe-ae66-db5ac9a64d7c.sql ===
UPDATE public.cfdi_stamps
SET payload = jsonb_set(
  COALESCE(payload, '{}'::jsonb),
  '{request,payment_method}',
  '"PPD"'::jsonb,
  true
)
WHERE folio = '3' AND kind = 'ingreso' AND facturapi_id = '6a2b72d32c929f5b7ff44c36';

-- === 20260613044822_437b2d83-b2dd-4ea3-ba74-b96c0c49dc60.sql ===

CREATE TABLE public.imss_patrones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  registro_patronal TEXT NOT NULL,
  rfc_patron TEXT NOT NULL,
  razon_social TEXT NOT NULL,
  curp_patron TEXT,
  prima_riesgo NUMERIC(8,5) NOT NULL DEFAULT 0.50000,
  prima_riesgo_vigencia DATE,
  clase_riesgo TEXT,
  fraccion TEXT,
  modalidad TEXT DEFAULT '40',
  domicilio TEXT,
  cp TEXT,
  municipio TEXT,
  estado TEXT,
  zona_salario TEXT DEFAULT 'general',
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.imss_patrones TO authenticated;
GRANT ALL ON public.imss_patrones TO service_role;
ALTER TABLE public.imss_patrones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage patrones" ON public.imss_patrones FOR ALL TO authenticated
  USING (public.is_org_member(organization_id, auth.uid())) WITH CHECK (public.is_org_member(organization_id, auth.uid()));
CREATE TRIGGER trg_imss_patrones_updated BEFORE UPDATE ON public.imss_patrones FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_imss_patrones_org ON public.imss_patrones(organization_id);

CREATE TABLE public.imss_movimientos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patron_id UUID NOT NULL REFERENCES public.imss_patrones(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  fecha_movimiento DATE NOT NULL,
  fecha_fin DATE,
  dias INT,
  sdi_anterior NUMERIC(12,2),
  sdi_nuevo NUMERIC(12,2),
  motivo_baja TEXT,
  tipo_incapacidad TEXT,
  ramo_incapacidad TEXT,
  folio_idse TEXT,
  estatus TEXT NOT NULL DEFAULT 'pendiente_envio',
  observaciones TEXT,
  archivo_url TEXT,
  enviado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.imss_movimientos TO authenticated;
GRANT ALL ON public.imss_movimientos TO service_role;
ALTER TABLE public.imss_movimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage movimientos" ON public.imss_movimientos FOR ALL TO authenticated
  USING (public.is_org_member(organization_id, auth.uid())) WITH CHECK (public.is_org_member(organization_id, auth.uid()));
CREATE TRIGGER trg_imss_movimientos_updated BEFORE UPDATE ON public.imss_movimientos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_imss_mov_emp ON public.imss_movimientos(employee_id);
CREATE INDEX idx_imss_mov_org_fecha ON public.imss_movimientos(organization_id, fecha_movimiento DESC);
CREATE INDEX idx_imss_mov_patron ON public.imss_movimientos(patron_id);

CREATE TABLE public.imss_bimestres (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patron_id UUID NOT NULL REFERENCES public.imss_patrones(id) ON DELETE CASCADE,
  ejercicio INT NOT NULL,
  bimestre INT NOT NULL CHECK (bimestre BETWEEN 1 AND 6),
  estatus TEXT NOT NULL DEFAULT 'abierto',
  total_imss_mes1 NUMERIC(14,2) DEFAULT 0,
  total_imss_mes2 NUMERIC(14,2) DEFAULT 0,
  total_rcv NUMERIC(14,2) DEFAULT 0,
  total_infonavit NUMERIC(14,2) DEFAULT 0,
  total_bimestre NUMERIC(14,2) DEFAULT 0,
  calculado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (patron_id, ejercicio, bimestre)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.imss_bimestres TO authenticated;
GRANT ALL ON public.imss_bimestres TO service_role;
ALTER TABLE public.imss_bimestres ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage bimestres" ON public.imss_bimestres FOR ALL TO authenticated
  USING (public.is_org_member(organization_id, auth.uid())) WITH CHECK (public.is_org_member(organization_id, auth.uid()));
CREATE TRIGGER trg_imss_bimestres_updated BEFORE UPDATE ON public.imss_bimestres FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.imss_bimestre_detalle (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bimestre_id UUID NOT NULL REFERENCES public.imss_bimestres(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  sbc NUMERIC(12,2) NOT NULL,
  dias_mes1 INT NOT NULL DEFAULT 0,
  dias_mes2 INT NOT NULL DEFAULT 0,
  ausencias_mes1 INT DEFAULT 0,
  ausencias_mes2 INT DEFAULT 0,
  incap_mes1 INT DEFAULT 0,
  incap_mes2 INT DEFAULT 0,
  efm_cf_mes1 NUMERIC(12,2) DEFAULT 0, efm_cf_mes2 NUMERIC(12,2) DEFAULT 0,
  efm_exc_mes1 NUMERIC(12,2) DEFAULT 0, efm_exc_mes2 NUMERIC(12,2) DEFAULT 0,
  efm_din_mes1 NUMERIC(12,2) DEFAULT 0, efm_din_mes2 NUMERIC(12,2) DEFAULT 0,
  gmp_mes1 NUMERIC(12,2) DEFAULT 0, gmp_mes2 NUMERIC(12,2) DEFAULT 0,
  rt_mes1 NUMERIC(12,2) DEFAULT 0, rt_mes2 NUMERIC(12,2) DEFAULT 0,
  iv_mes1 NUMERIC(12,2) DEFAULT 0, iv_mes2 NUMERIC(12,2) DEFAULT 0,
  guard_mes1 NUMERIC(12,2) DEFAULT 0, guard_mes2 NUMERIC(12,2) DEFAULT 0,
  retiro NUMERIC(12,2) DEFAULT 0,
  cv NUMERIC(12,2) DEFAULT 0,
  infonavit NUMERIC(12,2) DEFAULT 0,
  total_imss_mes1 NUMERIC(12,2) DEFAULT 0,
  total_imss_mes2 NUMERIC(12,2) DEFAULT 0,
  total_rcv NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.imss_bimestre_detalle TO authenticated;
GRANT ALL ON public.imss_bimestre_detalle TO service_role;
ALTER TABLE public.imss_bimestre_detalle ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage bimestre detalle" ON public.imss_bimestre_detalle FOR ALL TO authenticated
  USING (public.is_org_member(organization_id, auth.uid())) WITH CHECK (public.is_org_member(organization_id, auth.uid()));
CREATE INDEX idx_imss_det_bim ON public.imss_bimestre_detalle(bimestre_id);

CREATE TABLE public.imss_pagos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bimestre_id UUID NOT NULL REFERENCES public.imss_bimestres(id) ON DELETE CASCADE,
  concepto TEXT NOT NULL,
  importe NUMERIC(14,2) NOT NULL,
  linea_captura TEXT,
  fecha_vencimiento DATE,
  fecha_pago DATE,
  referencia TEXT,
  comprobante_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.imss_pagos TO authenticated;
GRANT ALL ON public.imss_pagos TO service_role;
ALTER TABLE public.imss_pagos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage pagos imss" ON public.imss_pagos FOR ALL TO authenticated
  USING (public.is_org_member(organization_id, auth.uid())) WITH CHECK (public.is_org_member(organization_id, auth.uid()));
CREATE TRIGGER trg_imss_pagos_updated BEFORE UPDATE ON public.imss_pagos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS umf TEXT,
  ADD COLUMN IF NOT EXISTS patron_id UUID REFERENCES public.imss_patrones(id) ON DELETE SET NULL;

INSERT INTO public.fiscal_params (ejercicio, clave, valor) VALUES
  (2026, 'imss_efm_cf_patron', 20.40),
  (2026, 'imss_efm_exc_patron', 1.10),
  (2026, 'imss_efm_exc_obrero', 0.40),
  (2026, 'imss_efm_din_patron', 0.70),
  (2026, 'imss_efm_din_obrero', 0.25),
  (2026, 'imss_gmp_patron', 1.05),
  (2026, 'imss_gmp_obrero', 0.375),
  (2026, 'imss_iv_patron', 1.75),
  (2026, 'imss_iv_obrero', 0.625),
  (2026, 'imss_guard_patron', 1.00),
  (2026, 'imss_retiro_patron', 2.00),
  (2026, 'imss_cv_patron', 3.150),
  (2026, 'imss_cv_obrero', 1.125)
ON CONFLICT (ejercicio, clave, vigente_desde) DO NOTHING;


-- === 20260613054323_456ffc6c-3c84-4c67-8f47-ca3b4106dbed.sql ===

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS sexo text,
  ADD COLUMN IF NOT EXISTS entidad_nacimiento text,
  ADD COLUMN IF NOT EXISTS ocupacion text,
  ADD COLUMN IF NOT EXISTS infonavit_credito text,
  ADD COLUMN IF NOT EXISTS infonavit_tipo_descuento text,
  ADD COLUMN IF NOT EXISTS infonavit_factor_descuento numeric,
  ADD COLUMN IF NOT EXISTS infonavit_fecha_inicio date;

ALTER TABLE public.imss_patrones
  ADD COLUMN IF NOT EXISTS actividad_economica text,
  ADD COLUMN IF NOT EXISTS area_geografica text,
  ADD COLUMN IF NOT EXISTS subdelegacion_clave text,
  ADD COLUMN IF NOT EXISTS subdelegacion text,
  ADD COLUMN IF NOT EXISTS delegacion text,
  ADD COLUMN IF NOT EXISTS representante_legal text,
  ADD COLUMN IF NOT EXISTS telefono text;

CREATE TABLE IF NOT EXISTS public.imss_primas_rt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patron_id uuid NOT NULL REFERENCES public.imss_patrones(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ejercicio integer NOT NULL,
  mes integer NOT NULL DEFAULT 3,
  prima numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patron_id, ejercicio)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imss_primas_rt TO authenticated;
GRANT ALL ON public.imss_primas_rt TO service_role;

ALTER TABLE public.imss_primas_rt ENABLE ROW LEVEL SECURITY;

CREATE POLICY "primas_rt_select" ON public.imss_primas_rt FOR SELECT
  TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "primas_rt_mut" ON public.imss_primas_rt FOR ALL
  TO authenticated USING (public.is_org_member(organization_id, auth.uid()))
  WITH CHECK (public.is_org_member(organization_id, auth.uid()));


-- === 20260613055902_08f0b645-1d7a-4596-abb5-721eaa1eaba9.sql ===

CREATE TABLE public.imss_mensuales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patron_id UUID NOT NULL REFERENCES public.imss_patrones(id) ON DELETE CASCADE,
  ejercicio INT NOT NULL,
  mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  estatus TEXT NOT NULL DEFAULT 'calculado',
  total_efm NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_gmp NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_iv NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_guarderias NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_rt NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_mes NUMERIC(14,2) NOT NULL DEFAULT 0,
  calculado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (patron_id, ejercicio, mes)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imss_mensuales TO authenticated;
GRANT ALL ON public.imss_mensuales TO service_role;

ALTER TABLE public.imss_mensuales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members manage mensuales"
ON public.imss_mensuales FOR ALL TO authenticated
USING (public.is_org_member(organization_id, auth.uid()))
WITH CHECK (public.is_org_member(organization_id, auth.uid()));

CREATE TRIGGER update_imss_mensuales_updated_at
BEFORE UPDATE ON public.imss_mensuales
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.imss_mensual_detalle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mensual_id UUID NOT NULL REFERENCES public.imss_mensuales(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  sbc NUMERIC(12,2) NOT NULL DEFAULT 0,
  dias_cot INT NOT NULL DEFAULT 0,
  ausencias INT NOT NULL DEFAULT 0,
  incapacidades INT NOT NULL DEFAULT 0,
  efm_cf NUMERIC(12,2) NOT NULL DEFAULT 0,
  efm_exc NUMERIC(12,2) NOT NULL DEFAULT 0,
  efm_din NUMERIC(12,2) NOT NULL DEFAULT 0,
  gmp NUMERIC(12,2) NOT NULL DEFAULT 0,
  iv NUMERIC(12,2) NOT NULL DEFAULT 0,
  guarderias NUMERIC(12,2) NOT NULL DEFAULT 0,
  rt NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imss_mensual_detalle TO authenticated;
GRANT ALL ON public.imss_mensual_detalle TO service_role;

ALTER TABLE public.imss_mensual_detalle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members manage mensual detalle"
ON public.imss_mensual_detalle FOR ALL TO authenticated
USING (public.is_org_member(organization_id, auth.uid()))
WITH CHECK (public.is_org_member(organization_id, auth.uid()));


-- === 20260624052739_e72a9e7f-6097-4bee-bea3-5e8ace458a06.sql ===

-- 1) Extend import_kind enum with new COI sources
ALTER TYPE public.import_kind ADD VALUE IF NOT EXISTS 'coi_movimientos';
ALTER TYPE public.import_kind ADD VALUE IF NOT EXISTS 'coi_saldos';
ALTER TYPE public.import_kind ADD VALUE IF NOT EXISTS 'coi_departamentos';
ALTER TYPE public.import_kind ADD VALUE IF NOT EXISTS 'coi_diarios';
ALTER TYPE public.import_kind ADD VALUE IF NOT EXISTS 'coi_monedas';
ALTER TYPE public.import_kind ADD VALUE IF NOT EXISTS 'coi_asocsat';
ALTER TYPE public.import_kind ADD VALUE IF NOT EXISTS 'coi_ejercicios';
ALTER TYPE public.import_kind ADD VALUE IF NOT EXISTS 'coi_raw';
ALTER TYPE public.import_kind ADD VALUE IF NOT EXISTS 'noi_raw';

-- 2) Unique index on journal_lines so upsert by (entry_id, orden) works
CREATE UNIQUE INDEX IF NOT EXISTS journal_lines_entry_orden_key
  ON public.journal_lines(entry_id, orden);

-- ============================================================
-- 3) New typed tables for COI complementary data
-- ============================================================

-- cost_centers / DEPTOS
CREATE TABLE IF NOT EXISTS public.cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nombre text NOT NULL,
  responsable text,
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, codigo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_centers TO authenticated;
GRANT ALL ON public.cost_centers TO service_role;
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cost_centers org members" ON public.cost_centers
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()))
  WITH CHECK (public.is_org_member(organization_id, auth.uid()));
CREATE TRIGGER cost_centers_updated_at BEFORE UPDATE ON public.cost_centers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- journal_types_catalog / DIARIOS  (name avoids clash with existing enum 'journal_type')
CREATE TABLE IF NOT EXISTS public.journal_types_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nombre text NOT NULL,
  naturaleza text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, codigo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_types_catalog TO authenticated;
GRANT ALL ON public.journal_types_catalog TO service_role;
ALTER TABLE public.journal_types_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "journal_types_catalog org members" ON public.journal_types_catalog
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()))
  WITH CHECK (public.is_org_member(organization_id, auth.uid()));
CREATE TRIGGER journal_types_catalog_updated_at BEFORE UPDATE ON public.journal_types_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- currencies / MONEDAS
CREATE TABLE IF NOT EXISTS public.currencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nombre text NOT NULL,
  simbolo text,
  tipo_cambio numeric(18,6) NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, codigo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.currencies TO authenticated;
GRANT ALL ON public.currencies TO service_role;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "currencies org members" ON public.currencies
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()))
  WITH CHECK (public.is_org_member(organization_id, auth.uid()));
CREATE TRIGGER currencies_updated_at BEFORE UPDATE ON public.currencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- sat_account_map / ASOCSAT
CREATE TABLE IF NOT EXISTS public.sat_account_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_codigo text NOT NULL,
  codigo_agrupador text NOT NULL,
  nombre_sat text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, account_codigo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sat_account_map TO authenticated;
GRANT ALL ON public.sat_account_map TO service_role;
ALTER TABLE public.sat_account_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sat_account_map org members" ON public.sat_account_map
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()))
  WITH CHECK (public.is_org_member(organization_id, auth.uid()));
CREATE TRIGGER sat_account_map_updated_at BEFORE UPDATE ON public.sat_account_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- fiscal_years / EJERCIC
CREATE TABLE IF NOT EXISTS public.fiscal_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ejercicio integer NOT NULL,
  periodo integer NOT NULL,
  estatus text NOT NULL DEFAULT 'abierto',
  fecha_apertura date,
  fecha_cierre date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, ejercicio, periodo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_years TO authenticated;
GRANT ALL ON public.fiscal_years TO service_role;
ALTER TABLE public.fiscal_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fiscal_years org members" ON public.fiscal_years
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()))
  WITH CHECK (public.is_org_member(organization_id, auth.uid()));
CREATE TRIGGER fiscal_years_updated_at BEFORE UPDATE ON public.fiscal_years
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- account_balances / SALDOS
CREATE TABLE IF NOT EXISTS public.account_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_codigo text NOT NULL,
  ejercicio integer NOT NULL,
  periodo integer NOT NULL,
  saldo_inicial numeric(20,4) NOT NULL DEFAULT 0,
  cargos numeric(20,4) NOT NULL DEFAULT 0,
  abonos numeric(20,4) NOT NULL DEFAULT 0,
  saldo_final numeric(20,4) NOT NULL DEFAULT 0,
  moneda text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, account_codigo, ejercicio, periodo)
);
CREATE INDEX IF NOT EXISTS account_balances_org_idx ON public.account_balances(organization_id, ejercicio, periodo);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_balances TO authenticated;
GRANT ALL ON public.account_balances TO service_role;
ALTER TABLE public.account_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_balances org members" ON public.account_balances
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()))
  WITH CHECK (public.is_org_member(organization_id, auth.uid()));
CREATE TRIGGER account_balances_updated_at BEFORE UPDATE ON public.account_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 4) Landing tables: anything we don't map yet still gets stored
-- ============================================================
CREATE TABLE IF NOT EXISTS public.aspel_raw_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  import_job_id uuid REFERENCES public.import_jobs(id) ON DELETE SET NULL,
  sistema text NOT NULL DEFAULT 'COI',
  file_name text NOT NULL,
  table_detected text NOT NULL,
  rows_total integer NOT NULL DEFAULT 0,
  fields jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aspel_raw_imports_org_idx ON public.aspel_raw_imports(organization_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aspel_raw_imports TO authenticated;
GRANT ALL ON public.aspel_raw_imports TO service_role;
ALTER TABLE public.aspel_raw_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aspel_raw_imports org members" ON public.aspel_raw_imports
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()))
  WITH CHECK (public.is_org_member(organization_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.aspel_raw_rows (
  id bigserial PRIMARY KEY,
  raw_import_id uuid NOT NULL REFERENCES public.aspel_raw_imports(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  table_name text NOT NULL,
  row_index integer NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aspel_raw_rows_org_table_idx ON public.aspel_raw_rows(organization_id, table_name);
CREATE INDEX IF NOT EXISTS aspel_raw_rows_import_idx ON public.aspel_raw_rows(raw_import_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aspel_raw_rows TO authenticated;
GRANT ALL ON public.aspel_raw_rows TO service_role;
ALTER TABLE public.aspel_raw_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aspel_raw_rows org members" ON public.aspel_raw_rows
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()))
  WITH CHECK (public.is_org_member(organization_id, auth.uid()));



