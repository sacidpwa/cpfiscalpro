
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
