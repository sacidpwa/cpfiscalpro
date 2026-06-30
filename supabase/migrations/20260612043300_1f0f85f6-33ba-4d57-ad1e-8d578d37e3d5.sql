CREATE UNIQUE INDEX IF NOT EXISTS cfdi_stamps_unique_reference_timbrado_idx
ON public.cfdi_stamps (reference_id, kind, ambiente)
WHERE estatus = 'timbrado' AND kind <> 'ingreso';