import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { PageHeader } from "@/components/app-ui";
import { Building2, ArrowRightLeft, Calculator, Wallet, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/sua")({
  component: SuaLayout,
});

const TABS = [
  { to: "/app/sua", label: "Inicio", icon: Calculator, exact: true },
  { to: "/app/sua/patrones", label: "Patrones IMSS", icon: Building2 },
  { to: "/app/sua/importar", label: "Importar SUA", icon: Upload },
  { to: "/app/sua/movimientos", label: "Movimientos IDSE", icon: ArrowRightLeft },
  { to: "/app/sua/mensuales", label: "Mensuales", icon: Calculator },
  { to: "/app/sua/bimestres", label: "Bimestres", icon: Calculator },
  { to: "/app/sua/pagos", label: "Pagos SIPARE", icon: Wallet },
];


function SuaLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="SUA · IMSS"
        description="Patrones, movimientos afiliatorios (IDSE), cálculo bimestral y pagos SIPARE."
      />
      <div className="flex gap-1 overflow-x-auto border-b bg-card/20 px-4 sm:px-6 lg:px-8">
        {TABS.map((t) => {
          const active = t.exact ? path === t.to : path.startsWith(t.to);
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to as any}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition ${
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </div>
      <div className="flex-1 p-4 sm:p-6 lg:p-8">
        <Outlet />
      </div>
    </div>
  );
}
