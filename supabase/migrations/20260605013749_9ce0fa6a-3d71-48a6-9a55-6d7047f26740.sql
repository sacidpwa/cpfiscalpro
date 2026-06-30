CREATE OR REPLACE FUNCTION public.is_platform_admin(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins
    WHERE user_id = _user
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.app_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_org_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;