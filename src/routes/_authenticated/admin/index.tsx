import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getGlobalDashboard } from "@/lib/admin.functions";
import { PageHeader, KpiCard } from "@/components/app-ui";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const fn = useServerFn(getGlobalDashboard);
  const { data } = useQuery({ queryKey: ["admin-dash"], queryFn: () => fn() });

  return (
    <div>
      <PageHeader title="Dashboard global" description="Visión consolidada de todos los clientes de la plataforma" />
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Clientes activos" value={data?.totalOrgs ?? "—"} hint="Organizaciones registradas" />
          <KpiCard label="Empleados totales" value={data?.totalEmpleados ?? "—"} hint="Activos en toda la plataforma" />
          <KpiCard label="Recibos de nómina" value={data?.totalRecibos ?? "—"} hint="Acumulado histórico" />
          <KpiCard
            label="Timbres del mes"
            value={data ? `${data.timbresFacturaMes + data.timbresNominaMes}` : "—"}
            hint={data ? `${data.timbresFacturaMes} factura · ${data.timbresNominaMes} nómina` : ""}
          />
        </div>

        <div className="min-w-0 rounded-lg border bg-card p-4 sm:p-6">
          <h3 className="text-sm font-semibold">Consumo de timbres (últimos 6 meses)</h3>
          <p className="text-xs text-muted-foreground">Factura vs. nómina, todos los clientes</p>
          <div className="mt-4 h-72 min-w-0">
            {data && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="factura" fill="var(--color-chart-1)" name="Factura" />
                  <Bar dataKey="nomina" fill="var(--color-chart-2)" name="Nómina" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
