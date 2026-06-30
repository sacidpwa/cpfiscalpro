CREATE OR REPLACE FUNCTION public.is_platform_admin(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins
    WHERE user_id = _user
  )
$$;

REVOKE EXECUTE ON FUNCTION public.claim_first_platform_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_first_platform_admin() TO service_role;