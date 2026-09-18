-- Add per-line fecha to journal_lines
-- Stores the actual transaction date from the accounting source (Aspel COI auxiliar)
-- distinct from journal_entries.fecha which is the poliza header date
ALTER TABLE public.journal_lines ADD COLUMN IF NOT EXISTS fecha DATE;
