
CREATE TABLE public.payroll_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  payroll_period_id uuid NOT NULL,
  sent_by uuid,
  from_email text,
  summary_to text[],
  summary_cc text[],
  total_recipients integer NOT NULL DEFAULT 0,
  total_sent integer NOT NULL DEFAULT 0,
  total_skipped integer NOT NULL DEFAULT 0,
  total_failed integer NOT NULL DEFAULT 0,
  sin_email integer NOT NULL DEFAULT 0,
  summary_sent boolean NOT NULL DEFAULT false,
  summary_error text,
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payroll_email_logs_period_idx ON public.payroll_email_logs (payroll_period_id, created_at DESC);

GRANT SELECT, INSERT ON public.payroll_email_logs TO authenticated;
GRANT ALL ON public.payroll_email_logs TO service_role;

ALTER TABLE public.payroll_email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY pel_read ON public.payroll_email_logs
  FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_platform_admin(auth.uid()));

CREATE POLICY pel_insert ON public.payroll_email_logs
  FOR INSERT TO authenticated
  WITH CHECK (has_org_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'nomina'::app_role, 'contador'::app_role]) OR is_platform_admin(auth.uid()));
