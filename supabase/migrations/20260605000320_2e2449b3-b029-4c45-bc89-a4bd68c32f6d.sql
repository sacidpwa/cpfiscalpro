
REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_first_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_first_platform_admin() TO authenticated, service_role;
