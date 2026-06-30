
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
