
CREATE TABLE public.org_billing_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE,
  facturapi_org_id text,
  facturapi_test_key text,
  facturapi_live_key text,
  environment text NOT NULL DEFAULT 'test' CHECK (environment IN ('test','live')),
  csd_uploaded_at timestamptz,
  csd_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_billing_config TO authenticated;
GRANT ALL ON public.org_billing_config TO service_role;

ALTER TABLE public.org_billing_config ENABLE ROW LEVEL SECURITY;

-- Solo owner/admin pueden leer (los server fns igualmente usan service_role)
CREATE POLICY obc_read ON public.org_billing_config
  FOR SELECT TO authenticated
  USING (
    has_org_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
    OR is_platform_admin(auth.uid())
  );

CREATE POLICY obc_write ON public.org_billing_config
  FOR ALL TO authenticated
  USING (
    has_org_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
    OR is_platform_admin(auth.uid())
  )
  WITH CHECK (
    has_org_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
    OR is_platform_admin(auth.uid())
  );

CREATE TRIGGER trg_obc_updated_at
  BEFORE UPDATE ON public.org_billing_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
