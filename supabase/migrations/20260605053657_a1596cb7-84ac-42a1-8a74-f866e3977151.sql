
REVOKE SELECT ON public.org_billing_config FROM authenticated;
DROP POLICY IF EXISTS obc_read ON public.org_billing_config;
