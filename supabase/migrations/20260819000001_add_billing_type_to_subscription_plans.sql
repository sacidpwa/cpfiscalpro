-- Agregar columna billing_type para determinar cómo se calcula la factura
-- "fijo" = solo mensualidad (monto acordado con el cliente)
-- "modulos" = suma de costos de módulos activos
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS billing_type text NOT NULL DEFAULT 'modulos';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscription_plans_billing_type_check'
  ) THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_billing_type_check
      CHECK (billing_type IN ('fijo', 'modulos'));
  END IF;
END $$;
