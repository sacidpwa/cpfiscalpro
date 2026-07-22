-- 1. Agregar tipo iva_isr_mensual al CHECK constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tax_filings_tipo_check'
  ) THEN
    ALTER TABLE public.tax_filings DROP CONSTRAINT tax_filings_tipo_check;
  END IF;
END $$;

ALTER TABLE public.tax_filings
  ADD CONSTRAINT tax_filings_tipo_check
  CHECK (tipo IN ('isr_mensual', 'iva_mensual', 'iva_isr_mensual', 'diot', 'isr_anual', 'retenciones_sueldos', 'retenciones_honorarios', 'informativa_nomina'));

-- 2. Agregar columnas de acuse separados para IVA e ISR
ALTER TABLE public.tax_filings ADD COLUMN IF NOT EXISTS acuse_iva_path text;
ALTER TABLE public.tax_filings ADD COLUMN IF NOT EXISTS acuse_isr_path text;

-- 3. Crear bucket tax-filings (privado) si no existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('tax-filings', 'tax-filings', false)
ON CONFLICT (id) DO NOTHING;

-- 4. Políticas RLS para el bucket tax-filings
DROP POLICY IF EXISTS "tax_filings_insert_auth" ON storage.objects;
CREATE POLICY "tax_filings_insert_auth"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tax-filings');

DROP POLICY IF EXISTS "tax_filings_select_auth" ON storage.objects;
CREATE POLICY "tax_filings_select_auth"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tax-filings');

DROP POLICY IF EXISTS "tax_filings_all_service" ON storage.objects;
CREATE POLICY "tax_filings_all_service"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'tax-filings');
