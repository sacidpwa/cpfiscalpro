
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
