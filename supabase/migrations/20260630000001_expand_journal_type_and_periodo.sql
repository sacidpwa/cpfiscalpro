-- Migration: Expandir journal_type a 5 tipos + agregar columna periodo
-- 1. Agregar 'cheque' y 'transferencia' al enum journal_type
-- 2. Agregar columna periodo (1-13) a journal_entries

-- ====== 1. Expandir enum de tipos de póliza ======
ALTER TYPE public.journal_type ADD VALUE IF NOT EXISTS 'cheque';
ALTER TYPE public.journal_type ADD VALUE IF NOT EXISTS 'transferencia';

-- ====== 2. Agregar columna periodo ======
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS periodo integer;

-- Popular periodo desde referencia (formato "YYYY-MM")
UPDATE public.journal_entries
SET periodo = SPLIT_PART(referencia, '-', 2)::int
WHERE referencia IS NOT NULL
  AND periodo IS NULL;

-- Para registros sin referencia, usar el mes de la fecha
UPDATE public.journal_entries
SET periodo = EXTRACT(MONTH FROM fecha)::int
WHERE periodo IS NULL;

-- ====== Verificación ======
SELECT tipo, COUNT(*) as total
FROM public.journal_entries
WHERE organization_id = '7145db9f-18fd-4729-9050-3f5c8f2e533e'
GROUP BY tipo
ORDER BY tipo;

SELECT periodo, COUNT(*) as total
FROM public.journal_entries
WHERE organization_id = '7145db9f-18fd-4729-9050-3f5c8f2e533e'
GROUP BY periodo
ORDER BY periodo;
