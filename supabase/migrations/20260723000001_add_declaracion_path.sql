-- Agregar columna para el archivo de la declaración (distinto del acuse)
ALTER TABLE public.tax_filings ADD COLUMN IF NOT EXISTS declaracion_path text;
