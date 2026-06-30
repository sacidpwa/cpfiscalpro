
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS sexo text,
  ADD COLUMN IF NOT EXISTS entidad_nacimiento text,
  ADD COLUMN IF NOT EXISTS ocupacion text,
  ADD COLUMN IF NOT EXISTS infonavit_credito text,
  ADD COLUMN IF NOT EXISTS infonavit_tipo_descuento text,
  ADD COLUMN IF NOT EXISTS infonavit_factor_descuento numeric,
  ADD COLUMN IF NOT EXISTS infonavit_fecha_inicio date;

ALTER TABLE public.imss_patrones
  ADD COLUMN IF NOT EXISTS actividad_economica text,
  ADD COLUMN IF NOT EXISTS area_geografica text,
  ADD COLUMN IF NOT EXISTS subdelegacion_clave text,
  ADD COLUMN IF NOT EXISTS subdelegacion text,
  ADD COLUMN IF NOT EXISTS delegacion text,
  ADD COLUMN IF NOT EXISTS representante_legal text,
  ADD COLUMN IF NOT EXISTS telefono text;

CREATE TABLE IF NOT EXISTS public.imss_primas_rt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patron_id uuid NOT NULL REFERENCES public.imss_patrones(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ejercicio integer NOT NULL,
  mes integer NOT NULL DEFAULT 3,
  prima numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patron_id, ejercicio)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imss_primas_rt TO authenticated;
GRANT ALL ON public.imss_primas_rt TO service_role;

ALTER TABLE public.imss_primas_rt ENABLE ROW LEVEL SECURITY;

CREATE POLICY "primas_rt_select" ON public.imss_primas_rt FOR SELECT
  TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "primas_rt_mut" ON public.imss_primas_rt FOR ALL
  TO authenticated USING (public.is_org_member(organization_id, auth.uid()))
  WITH CHECK (public.is_org_member(organization_id, auth.uid()));
