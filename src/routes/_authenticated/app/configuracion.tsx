import { createFileRoute, Link } from "@tanstack/react-router";
import { useRequireOrg, useOrg } from "@/lib/use-current-org";
import { PageHeader } from "@/components/app-ui";
import { Building2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/configuracion")({
  component: Conf,
});

function Conf() {
  const org = useRequireOrg();
  const { organizations } = useOrg();
  return (
    <div>
      <PageHeader title="Configuración" description="Datos de la organización y administración" />
      <div className="grid gap-6 p-8 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-6">
          <h3 className="text-sm font-semibold">Organización actual</h3>
          <dl className="mt-4 space-y-2 text-sm">
            <Row k="Razón social" v={org.razon_social} />
            <Row k="RFC" v={<span className="font-mono">{org.rfc}</span>} />
            <Row k="Régimen fiscal" v={org.regimen_fiscal ?? "—"} />
            <Row k="Tu rol" v={<span className="capitalize">{org.role}</span>} />
          </dl>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Organizaciones disponibles</h3><Link to="/onboarding" className="text-xs font-medium text-primary hover:underline">+ Nueva</Link></div>
          <ul className="mt-4 divide-y">
            {organizations.map((o) => (
              <li key={o.id} className="flex items-center gap-3 py-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0 flex-1"><div className="font-medium truncate">{o.razon_social}</div><div className="font-mono text-xs text-muted-foreground">{o.rfc}</div></div>
                <span className="rounded bg-secondary px-1.5 py-0.5 text-xs capitalize">{o.role}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="md:col-span-2 rounded-lg border bg-card p-6">
          <h3 className="text-sm font-semibold">Tablas fiscales</h3>
          <p className="mt-1 text-sm text-muted-foreground">El sistema usa las tarifas ISR mensuales (Anexo 8) y parámetros UMA / IMSS vigentes para 2026. Los cálculos para periodicidad semanal, catorcenal o quincenal se derivan automáticamente.</p>
          <ul className="mt-3 grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
            <li>UMA diaria 2026: <span className="font-mono text-foreground">$117.55</span></li>
            <li>Salario mínimo: <span className="font-mono text-foreground">$315.04</span></li>
            <li>Tope SBC IMSS (25 UMA): <span className="font-mono text-foreground">$2,938.75</span></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
function Row({ k, v }: any) {
  return <div className="flex items-center justify-between border-b py-1.5 last:border-0"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>;
}
