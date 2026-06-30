import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/clientes/$orgId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/admin/organizaciones/$orgId",
      params: { orgId: params.orgId },
      replace: true,
    });
  },
});
