
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
