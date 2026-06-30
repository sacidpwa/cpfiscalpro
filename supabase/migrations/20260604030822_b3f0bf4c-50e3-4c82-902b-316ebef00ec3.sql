
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
