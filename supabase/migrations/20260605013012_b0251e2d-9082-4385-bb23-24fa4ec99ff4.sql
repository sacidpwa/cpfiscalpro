CREATE OR REPLACE FUNCTION public.is_org_member(_org uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = _org
      AND user_id = _user
  )
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org uuid, _user uuid, _roles public.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = _org
      AND user_id = _user
      AND role = ANY(_roles)
  )
$$;

CREATE OR REPLACE FUNCTION public.user_org_ids(_user uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = _user
$$;

REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.app_role[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_org_ids(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.app_role[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_org_ids(uuid) TO service_role;