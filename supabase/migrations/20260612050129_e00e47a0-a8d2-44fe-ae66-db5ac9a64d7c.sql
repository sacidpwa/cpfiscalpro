UPDATE public.cfdi_stamps
SET payload = jsonb_set(
  COALESCE(payload, '{}'::jsonb),
  '{request,payment_method}',
  '"PPD"'::jsonb,
  true
)
WHERE folio = '3' AND kind = 'ingreso' AND facturapi_id = '6a2b72d32c929f5b7ff44c36';