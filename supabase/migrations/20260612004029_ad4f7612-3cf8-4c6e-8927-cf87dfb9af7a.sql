
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
