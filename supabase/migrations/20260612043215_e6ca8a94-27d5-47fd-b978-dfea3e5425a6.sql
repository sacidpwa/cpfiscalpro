DROP INDEX IF EXISTS public.cfdi_stamps_unique_timbrado_idx;
CREATE UNIQUE INDEX IF NOT EXISTS cfdi_stamps_unique_facturapi_idx
ON public.cfdi_stamps (organization_id, facturapi_id)
WHERE facturapi_id IS NOT NULL;