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