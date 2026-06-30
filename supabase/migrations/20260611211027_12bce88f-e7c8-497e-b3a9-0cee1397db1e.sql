
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
