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