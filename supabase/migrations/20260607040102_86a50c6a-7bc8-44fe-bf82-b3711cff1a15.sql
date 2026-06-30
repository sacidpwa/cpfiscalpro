
CREATE TYPE public.org_request_status AS ENUM ('pendiente','aprobada','rechazada');

CREATE TABLE public.organization_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL,
  rfc text NOT NULL,
  razon_social text NOT NULL,
  regimen_fiscal text,
  codigo_postal text,
  motivo text,
  status public.org_request_status NOT NULL DEFAULT 'pendiente',
  admin_notes text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.organization_requests TO authenticated;
GRANT ALL ON public.organization_requests TO service_role;

ALTER TABLE public.organization_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_req_self_read ON public.organization_requests
  FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR public.is_platform_admin(auth.uid()));

CREATE POLICY org_req_self_insert ON public.organization_requests
  FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());

CREATE POLICY org_req_admin_update ON public.organization_requests
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TRIGGER trg_org_req_updated
  BEFORE UPDATE ON public.organization_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_org_req_status ON public.organization_requests(status);
CREATE INDEX idx_org_req_requested_by ON public.organization_requests(requested_by);
