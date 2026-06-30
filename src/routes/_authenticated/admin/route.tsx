import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery, QueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkPlatformAdmin, claimSuperadmin } from "@/lib/admin.functions";
import { LayoutDashboard, Users, FileBarChart, Shield, ArrowLeft, Inbox, Building2, CreditCard, FileText, UserCog, Stamp, LogOut } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminShell,
});

function LogoutButton() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  return (
    <button
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await supabase.auth.signOut();
          navigate({ to: "/auth", replace: true });
        } catch (e: any) {
          toast.error(e.message ?? "Error al cerrar sesión");
        } finally {
          setLoading(false);
        }
      }}
      className="m-3 mt-0 hidden items-center gap-2 rounded-md border border-sidebar-border px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:flex"
    >
      <LogOut className="h-4 w-4" />
      {loading ? "Saliendo…" : "Cerrar sesión"}
    </button>
  );
}

function AdminShell() {
  const fn = useServerFn(checkPlatformAdmin);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["check-platform-admin"],
    queryFn: () => fn(),
  });
  const claim = useServerFn(claimSuperadmin);
  const [claiming, setClaiming] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });

  if (isLoading) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Verificando permisos…</div>;
  }

  if (!data?.isAdmin) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="max-w-md rounded-xl border bg-card p-8 text-center">
          <Shield className="mx-auto h-10 w-10 text-primary" />
          <h2 className="mt-3 text-xl font-semibold">Panel de Super Administración</h2>
          {data?.hasAnyAdmin ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                No tienes permisos para acceder al panel global. Contacta al administrador de la plataforma.
              </p>
              <Link to="/app" className="mt-6 inline-block text-sm text-primary hover:underline">
                ← Volver a mi panel
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                Aún no hay un super administrador registrado. Como primer usuario puedes reclamar este rol.
              </p>
              <button
                disabled={claiming}
                onClick={async () => {
                  setClaiming(true);
                  try {
                    const r = await claim();
                    if (r.claimed) {
                      toast.success("Ahora eres super administrador");
                      await refetch();
                    } else toast.error("Ya existe un super administrador");
                  } catch (e: any) {
                    toast.error(e.message);
                  } finally {
                    setClaiming(false);
                  }
                }}
                className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {claiming ? "Activando…" : "Reclamar rol de super admin"}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const NAV = [
    { to: "/admin", label: "Dashboard global", icon: LayoutDashboard, exact: true },
    { to: "/admin/clientes", label: "Clientes", icon: Building2 },
    { to: "/admin/usuarios", label: "Usuarios", icon: UserCog },
    { to: "/admin/solicitudes", label: "Solicitudes", icon: Inbox },
    { to: "/admin/cobranza", label: "Cobranza", icon: CreditCard },
    { to: "/admin/declaraciones", label: "Declaraciones", icon: FileText },
    { to: "/admin/consumo", label: "Consumo de timbres", icon: FileBarChart },
    { to: "/admin/facturapi", label: "FacturAPI", icon: Stamp },
  ];

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="flex flex-col border-b bg-sidebar text-sidebar-foreground lg:border-b-0 lg:border-r">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-4">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-destructive text-destructive-foreground text-sm font-bold">
            <Shield className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight">Super Admin</span>
        </div>
        <nav className="grid grid-cols-3 gap-1 px-2 py-3 text-sm lg:flex lg:flex-1 lg:flex-col lg:space-y-0.5">
          {NAV.map((n) => {
            const active = n.exact ? path === n.to : path === n.to || path.startsWith(n.to + "/");
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex min-w-0 items-center justify-center gap-2 rounded-md px-2 py-2 transition-colors lg:justify-start lg:gap-3 lg:px-3 ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                }`}
              >
                <n.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <Link
          to="/app"
          className="m-3 hidden items-center gap-2 rounded-md border border-sidebar-border px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent lg:flex"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a la app
        </Link>
        <LogoutButton />
      </aside>
      <main className="min-w-0 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
