
-- Sembrar tarifas fiscales 2026 (sin actualización SAT vigente, se clonan de 2025)
INSERT INTO public.tax_tables (ejercicio, tipo, orden, limite_inferior, limite_superior, cuota_fija, porcentaje)
SELECT 2026, tipo, orden, limite_inferior, limite_superior, cuota_fija, porcentaje
FROM public.tax_tables
WHERE ejercicio = 2025
  AND NOT EXISTS (SELECT 1 FROM public.tax_tables t2 WHERE t2.ejercicio = 2026);

INSERT INTO public.fiscal_params (ejercicio, clave, valor, vigente_desde)
SELECT 2026, clave, valor, '2026-01-01'::date
FROM public.fiscal_params
WHERE ejercicio = 2025
  AND NOT EXISTS (SELECT 1 FROM public.fiscal_params f2 WHERE f2.ejercicio = 2026 AND f2.clave = public.fiscal_params.clave);
