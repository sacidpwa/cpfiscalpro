-- Tabla de plantillas de documentos por organización
CREATE TABLE IF NOT EXISTS public.org_document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  tipo text NOT NULL,
  giro text,
  nombre text NOT NULL,
  contenido_html text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT org_document_templates_tipo_check CHECK (tipo IN ('contrato_trabajo', 'renuncia', 'rit')),
  CONSTRAINT org_document_templates_giro_check CHECK (giro IS NULL OR giro IN ('salud', 'comercio', 'industrial', 'servicios')),
  CONSTRAINT org_document_templates_org_tipo_giro_unique UNIQUE (organization_id, tipo, giro)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_document_templates TO authenticated;
GRANT ALL ON public.org_document_templates TO service_role;
ALTER TABLE public.org_document_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doc_templates_read ON public.org_document_templates;
CREATE POLICY doc_templates_read ON public.org_document_templates
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS doc_templates_admin_all ON public.org_document_templates;
CREATE POLICY doc_templates_admin_all ON public.org_document_templates
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- También permitir que el cliente de la org inserte/update sus propias plantillas
DROP POLICY IF EXISTS doc_templates_org_member_insert ON public.org_document_templates;
CREATE POLICY doc_templates_org_member_insert ON public.org_document_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS doc_templates_org_member_update ON public.org_document_templates;
CREATE POLICY doc_templates_org_member_update ON public.org_document_templates
  FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

DROP TRIGGER IF EXISTS update_org_document_templates_updated_at ON public.org_document_templates;
CREATE TRIGGER update_org_document_templates_updated_at
  BEFORE UPDATE ON public.org_document_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabla para documentos generados (contratos, renuncias, etc.)
CREATE TABLE IF NOT EXISTS public.employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  tipo text NOT NULL,
  titulo text NOT NULL,
  contenido_html text NOT NULL,
  pdf_path text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT employee_documents_tipo_check CHECK (tipo IN ('contrato_trabajo', 'renuncia', 'rit', 'otro'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_documents TO authenticated;
GRANT ALL ON public.employee_documents TO service_role;
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS emp_docs_read ON public.employee_documents;
CREATE POLICY emp_docs_read ON public.employee_documents
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS emp_docs_org_member_all ON public.employee_documents;
CREATE POLICY emp_docs_org_member_all ON public.employee_documents
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

DROP TRIGGER IF EXISTS update_employee_documents_updated_at ON public.employee_documents;
CREATE TRIGGER update_employee_documents_updated_at
  BEFORE UPDATE ON public.employee_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
