GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.app_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_org_ids(uuid) TO authenticated, service_role;