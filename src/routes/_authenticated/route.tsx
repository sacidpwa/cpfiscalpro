import { createFileRoute, Outlet, redirect, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listMyOrganizations } from "@/lib/orgs.functions";
import { checkPlatformAdmin } from "@/lib/admin.functions";
import { listEnabledModules, type ServiceModule } from "@/lib/admin-modules.functions";
import { listMyBilling } from "@/lib/billing-subs.functions";
import { OrgProvider, useOrg } from "@/lib/use-current-org";
import {
  LayoutDashboard, Users, Receipt, BookOpen, Library, Scale, Upload, Settings, LogOut, ChevronDown, Building2, Calendar, Shield, FileText, UserSquare, Package, Menu, X, FileCheck2, CreditCard, AlertCircle, Truck, ShieldCheck, ChevronLeft, ChevronRight, LineChart, PieChart, Download,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedShell,
});

function AuthedShell() {
  const fetchOrgs = useServerFn(listMyOrganizations);
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["my-orgs"],
    queryFn: () => fetchOrgs(),
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Cargando organizaciones…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="max-w-sm rounded-lg border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">No se pudieron cargar tus organizaciones</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {(error as Error | undefined)?.message ?? "La sesión está activa, pero la carga de permisos falló."}
          </p>
          <button
            onClick={() => refetch()}
            className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const orgs = data.map((r) => ({
    id: r.organization.id,
    rfc: r.organization.rfc,
    razon_social: r.organization.razon_social,
    regimen_fiscal: r.organization.regimen_fiscal,
    role: r.role,
  }));

  return (
    <OrgProvider initial={orgs} refresh={() => qc.invalidateQueries({ queryKey: ["my-orgs"] })}>
      <RouterAware />
    </OrgProvider>
  );
}

function RouterAware() {
  const navigate = useNavigate();
  const { organizations } = useOrg();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const checkAdmin = useServerFn(checkPlatformAdmin);
  const { data: adminData, isLoading: adminLoading, isError: adminError } = useQuery({
    queryKey: ["check-platform-admin"],
    queryFn: () => checkAdmin(),
    retry: 1,
  });

  const noOrgs = organizations.length === 0;
  const onAllowedNoOrgRoute =
    path === "/onboarding" || path.startsWith("/admin");

  useEffect(() => {
    if (!noOrgs || adminLoading || adminError || onAllowedNoOrgRoute) return;
    if (adminData?.isAdmin || adminData?.hasAnyAdmin === false) {
      navigate({ to: "/admin", replace: true });
    } else {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [noOrgs, adminLoading, adminError, adminData?.isAdmin, adminData?.hasAnyAdmin, onAllowedNoOrgRoute, navigate]);

  if (noOrgs) {
    if (onAllowedNoOrgRoute) return <Outlet />;
    if (adminError) {
      return (
        <div className="grid min-h-screen place-items-center p-6 text-center">
          <div className="max-w-sm rounded-lg border bg-card p-6 shadow-sm">
            <h1 className="text-lg font-semibold text-foreground">No se pudo validar el panel admin</h1>
            <p className="mt-2 text-sm text-muted-foreground">Actualiza la página e intenta entrar de nuevo.</p>
            <Link
              to="/admin"
              className="mt-5 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Ir a Super Admin
            </Link>
          </div>
        </div>
      );
    }
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Preparando tu cuenta…
      </div>
    );
  }
  return <Shell />;
}

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean; module?: ServiceModule };
const NAV: NavItem[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/empleados", label: "Empleados", icon: Users, module: "nomina" },
  { to: "/app/asistencias", label: "Asistencias", icon: Calendar, module: "asistencias" },
  { to: "/app/nomina", label: "Nómina", icon: Receipt, module: "nomina" },
  { to: "/app/sua", label: "SUA · IMSS", icon: ShieldCheck, module: "nomina" },
  { to: "/app/cuentas", label: "Catálogo", icon: Library, module: "contabilidad" },
  { to: "/app/polizas", label: "Pólizas", icon: BookOpen, module: "contabilidad" },
  { to: "/app/balanza", label: "Balanza", icon: Scale, module: "contabilidad" },
  { to: "/app/resultados", label: "Resultados", icon: LineChart, module: "contabilidad" },
  { to: "/app/balance", label: "Balance General", icon: PieChart, module: "contabilidad" },
  { to: "/app/importar-legacy", label: "Importar datos", icon: Upload, module: "contabilidad" },
  { to: "/app/exportar", label: "Exportar datos", icon: Download, module: "contabilidad" },
  { to: "/app/facturacion/clientes", label: "Clientes", icon: UserSquare, module: "facturacion" },
  { to: "/app/facturacion/productos", label: "Productos", icon: Package, module: "facturacion" },
  { to: "/app/facturacion/facturas", label: "Facturas", icon: Receipt, module: "facturacion" },
  { to: "/app/facturacion/complementos", label: "Complementos", icon: Truck, module: "facturacion" },
  { to: "/app/facturacion/configuracion", label: "Ajustes", icon: FileText, module: "facturacion" },
  { to: "/app/declaraciones", label: "Declaraciones", icon: FileCheck2, module: "declaraciones" },
  { to: "/app/cobranza", label: "Mi suscripción", icon: CreditCard },
  { to: "/app/configuracion", label: "Configuración", icon: Settings },
];

function Shell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [navOpen, setNavOpen] = useState(false);
  const { current } = useOrg();

  // Cierra el drawer al cambiar de ruta
  useEffect(() => { setNavOpen(false); }, [path]);

  // Módulos habilitados de la organización actual
  const modsFn = useServerFn(listEnabledModules);
  const { data: mods } = useQuery({
    queryKey: ["enabled-modules", current?.id],
    queryFn: () => modsFn({ data: { organizationId: current!.id } }),
    enabled: !!current,
  });
  // Adeudo
  const billingFn = useServerFn(listMyBilling);
  const { data: billing } = useQuery({
    queryKey: ["my-billing-banner", current?.id],
    queryFn: () => billingFn({ data: { organizationId: current!.id } }),
    enabled: !!current,
  });
  const adeudoGrave = (billing?.diasMasVencida ?? 0) > 7;

  const navVisible = NAV.filter((n) => !n.module || mods?.[n.module]?.activo);

  const currentLabel = navVisible.find((n) => n.exact ? path === n.to : path === n.to || path.startsWith(n.to + "/"))?.label ?? "Dranur";

  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sidebarCollapsed) return;
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setSidebarCollapsed(true);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [sidebarCollapsed]);

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar móvil */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur lg:hidden">
        <button
          onClick={() => setNavOpen(true)}
          aria-label="Abrir menú"
          className="rounded-md p-2 hover:bg-secondary"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white p-1">
            <img src="/icon-192.png" alt="Logo" className="h-full w-full object-contain" />
          </div>
          <span className="truncate font-semibold tracking-tight">{currentLabel}</span>
        </div>
      </header>

      {/* Overlay drawer */}
      {navOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}

      <aside
        ref={sidebarRef}
        onMouseEnter={() => setSidebarCollapsed(false)}
        onMouseLeave={() => setSidebarCollapsed(true)}
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r bg-sidebar text-sidebar-foreground transition-[width,transform] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          sidebarCollapsed ? "w-14" : "w-72"
        } ${navOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b border-sidebar-border px-4">
          <div className={`flex items-center gap-2 ${sidebarCollapsed ? "justify-center w-full" : ""}`}>
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white p-1">
              <img src="/icon-192.png" alt="Logo" className="h-full w-full object-contain" />
            </div>
            <span className={`font-semibold tracking-tight overflow-hidden whitespace-nowrap transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarCollapsed ? "max-w-0 opacity-0" : "max-w-[200px] opacity-100"}`}>CPFiscalPro</span>
          </div>
          <button
            onClick={() => setNavOpen(false)}
            aria-label="Cerrar menú"
            className="rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label={sidebarCollapsed ? "Expandir menú" : "Colapsar menú"}
            className="hidden rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent lg:block"
            title={sidebarCollapsed ? "Expandir menú" : "Colapsar menú"}
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
        <OrgPicker collapsed={sidebarCollapsed} />
        <nav className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto px-2 py-3 text-sm">
          {navVisible.map((n) => {
            const active = n.exact ? path === n.to : path === n.to || path.startsWith(n.to + "/");
            return (
              <Link
                key={n.to}
                to={n.to}
                title={sidebarCollapsed ? n.label : undefined}
                className={`flex items-center rounded-md py-2.5 transition-colors ${
                  sidebarCollapsed ? "justify-center px-2" : "gap-3 px-3"
                } ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                }`}
              >
                <n.icon className="h-4 w-4 shrink-0" />
                <span className={`overflow-hidden whitespace-nowrap transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarCollapsed ? "max-w-0 opacity-0" : "max-w-[200px] opacity-100"}`}>
                  {n.label}
                </span>
              </Link>
            );
          })}
        </nav>
        <SuperAdminLink collapsed={sidebarCollapsed} />
        <UserMenu collapsed={sidebarCollapsed} />
      </aside>
      <main className="min-w-0 lg:ml-14">
        {billing && billing.adeudoTotal > 0 && (
          <div className={`flex items-center gap-2 border-b px-4 py-2 text-xs sm:px-6 ${adeudoGrave ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Adeudo pendiente: <strong>${billing.adeudoTotal.toFixed(2)}</strong>
              {billing.diasMasVencida > 0 && ` · ${billing.diasMasVencida} día(s) de atraso`}.
              {adeudoGrave && " Contacta a tu administrador para regularizar."}
            </span>
            <Link to="/app/cobranza" className="ml-auto underline">Ver detalle</Link>
          </div>
        )}
        {adeudoGrave && (
          <div className="border-b bg-destructive/5 px-4 py-3 text-xs sm:px-6">
            <strong className="text-destructive">Acceso en modo limitado.</strong>{" "}
            <span className="text-muted-foreground">
              Algunas acciones de escritura pueden estar restringidas hasta regularizar tu pago.
            </span>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}


function OrgPicker({ collapsed }: { collapsed?: boolean }) {
  const { current, organizations, setCurrent } = useOrg();
  const [open, setOpen] = useState(false);
  if (!current) return null;
  if (collapsed) {
    return (
      <div className="flex justify-center border-b border-sidebar-border px-2 py-3">
        <button
          onClick={() => setOpen((v) => !v)}
          title={`RFC: ${current.rfc}`}
          className="grid h-8 w-8 place-items-center rounded-md bg-sidebar-accent/50 hover:bg-sidebar-accent"
        >
          <Building2 className="h-4 w-4" />
        </button>
      </div>
    );
  }
  return (
    <div className="relative border-b border-sidebar-border px-3 py-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-md bg-sidebar-accent/50 px-3 py-2 text-left hover:bg-sidebar-accent"
      >
        <div className="min-w-0">
          <div className="truncate text-xs text-sidebar-foreground/60">RFC actual</div>
          <div className="truncate text-sm font-semibold tabular-nums">{current.rfc}</div>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0" />
      </button>
      {open && (
        <div className="absolute left-3 right-3 top-full z-20 mt-1 max-h-72 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-lg">
          {organizations.map((o) => (
            <button
              key={o.id}
              onClick={() => {
                setCurrent(o);
                setOpen(false);
              }}
              className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-secondary ${
                o.id === current.id ? "bg-secondary" : ""
              }`}
            >
              <Building2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="truncate font-medium tabular-nums">{o.rfc}</div>
                <div className="truncate text-xs text-muted-foreground">{o.razon_social}</div>
              </div>
            </button>
          ))}
          <Link
            to="/onboarding"
            onClick={() => setOpen(false)}
            className="block border-t px-3 py-2 text-sm font-medium text-primary hover:bg-secondary"
          >
            ✉ Solicitar nueva organización
          </Link>
        </div>
      )}
    </div>
  );
}

function UserMenu({ collapsed }: { collapsed?: boolean }) {
  const navigate = useNavigate();
  async function logout() {
    await supabase.auth.signOut();
    toast.success("Sesión cerrada");
    navigate({ to: "/auth" });
  }
  return (
    <button
      onClick={logout}
      title="Cerrar sesión"
      className={`m-3 flex items-center rounded-md border border-sidebar-border py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent ${collapsed ? "justify-center px-2" : "gap-2 px-3"}`}
    >
      <LogOut className="h-4 w-4 shrink-0" />
      <span className={`overflow-hidden whitespace-nowrap transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${collapsed ? "max-w-0 opacity-0" : "max-w-[200px] opacity-100"}`}>Cerrar sesión</span>
    </button>
  );
}

function SuperAdminLink({ collapsed }: { collapsed?: boolean }) {
  const fn = useServerFn(checkPlatformAdmin);
  const { data } = useQuery({ queryKey: ["check-platform-admin"], queryFn: () => fn() });
  if (!data?.isAdmin) return null;
  return (
    <Link
      to="/admin"
      title="Panel Super Admin"
      className={`mx-3 mb-1 flex items-center rounded-md bg-destructive/15 py-2 text-sm font-medium text-destructive hover:bg-destructive/25 ${collapsed ? "justify-center px-2" : "gap-2 px-3"}`}
    >
      <Shield className="h-4 w-4 shrink-0" />
      <span className={`overflow-hidden whitespace-nowrap transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${collapsed ? "max-w-0 opacity-0" : "max-w-[200px] opacity-100"}`}>Panel Super Admin</span>
    </Link>
  );
}
