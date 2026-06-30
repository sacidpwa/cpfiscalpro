import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getDashboardKpis } from "@/lib/dashboard.functions";
import { useRequireOrg } from "@/lib/use-current-org";
import { PageHeader, KpiCard } from "@/components/app-ui";
import { fmtMoney } from "@/lib/format";
import { Users, FileText, TrendingUp, Wallet, Calendar, AlertCircle } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const meses = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export const Route = createFileRoute("/_authenticated/app/")({
  component: Dashboard,
});

function Dashboard() {
  const org = useRequireOrg();
  const fn = useServerFn(getDashboardKpis);
  const now = new Date();
  const [ejercicio, setEjercicio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const { data, isLoading } = useQuery({
    queryKey: ["kpis", org.id, ejercicio, mes],
    queryFn: () => fn({ data: { organizationId: org.id, mes, ejercicio } }),
  });

  return (
    <div>
      <PageHeader title="Dashboard" description={`${org.razon_social} · ${org.rfc}`} />
      <div className="space-y-6 p-8">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
          <label className="block text-xs">
            <span className="mb-1 block text-muted-foreground">Mes</span>
            <select
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              {meses.map((m, i) => (
                <option key={i} value={i + 1}>
                  {m}
                </option>
              ))}
              <option value={13}>Cierre (P.13)</option>
            </select>
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-muted-foreground">Ejercicio</span>
            <input
              type="number"
              value={ejercicio}
              onChange={(e) => setEjercicio(Number(e.target.value))}
              className="rounded-md border bg-background px-2 py-1.5 text-sm w-20"
            />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label={`Ingresos — ${meses[mes - 1]}`}
            value={data ? fmtMoney(data.ingresos) : "—"}
            hint="Cuentas 4xxx (ER)"
          />
          <KpiCard
            label={`Egresos — ${meses[mes - 1]}`}
            value={data ? fmtMoney(data.egresos) : "—"}
            hint={`Costos ${data ? fmtMoney(data.costos) : "—"} · Gastos ${data ? fmtMoney(data.gastos) : "—"}`}
          />
          <KpiCard
            label={`Utilidad — ${meses[mes - 1]}`}
            value={data ? fmtMoney(data.utilidad) : "—"}
            trend={
              data
                ? {
                    label: data.utilidad >= 0 ? "Positiva" : "Negativa",
                    positive: data.utilidad >= 0,
                  }
                : undefined
            }
          />
          <KpiCard
            label={`Nómina — ${meses[mes - 1]}`}
            value={data ? fmtMoney(data.nominaMes) : "—"}
            hint="Cuenta 6100-001 (Sueldos)"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <SmallStat icon={Users} label="Empleados activos" value={data?.empleadosActivos ?? "—"} />
          <SmallStat
            icon={FileText}
            label={`Pólizas — ${meses[mes - 1]}`}
            value={data?.polizasMes ?? "—"}
          />
          <SmallStat
            icon={AlertCircle}
            label="Pólizas en borrador"
            value={data?.polizasPendientes ?? "—"}
            accent={(data?.polizasPendientes ?? 0) > 0 ? "warning" : undefined}
          />
          <SmallStat
            icon={Calendar}
            label="Periodos de nómina abiertos"
            value={data?.periodosActivos ?? "—"}
          />
        </div>

        <div className="rounded-lg border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Tendencia 6 meses ({ejercicio})</h3>
              <p className="text-xs text-muted-foreground">Ingresos vs. egresos vs. utilidad</p>
            </div>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="h-64">
            {isLoading || !data ? (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                Cargando…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="mes"
                    tick={{ fontSize: 11 }}
                    stroke="var(--color-muted-foreground)"
                  />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                  <Tooltip
                    formatter={(v: number) => fmtMoney(v)}
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="ingresos"
                    stroke="var(--color-chart-1)"
                    strokeWidth={2}
                    dot={false}
                    name="Ingresos"
                  />
                  <Line
                    type="monotone"
                    dataKey="egresos"
                    stroke="var(--color-chart-4)"
                    strokeWidth={2}
                    dot={false}
                    name="Egresos"
                  />
                  <Line
                    type="monotone"
                    dataKey="nomina"
                    stroke="var(--color-chart-3)"
                    strokeWidth={2}
                    dot={false}
                    name="Nómina"
                  />
                  <Line
                    type="monotone"
                    dataKey="utilidad"
                    stroke="var(--color-chart-2)"
                    strokeWidth={2}
                    dot={false}
                    name="Utilidad"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border bg-card p-6">
            <h3 className="text-sm font-semibold">Próximas obligaciones</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Calendario fiscal y patronal sugerido
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              <Obligacion fecha="Día 17 del mes" texto="Declaración mensual ISR e IVA (SAT)" />
              <Obligacion fecha="Día 17 del mes" texto="Pago de cuotas IMSS" />
              <Obligacion fecha="Día 31 mensual" texto="Pago de Infonavit y RCV bimestral" />
              <Obligacion fecha="Anual" texto="Declaración anual y reparto de PTU" />
            </ul>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <h3 className="text-sm font-semibold">Estado de la contabilidad</h3>
            <p className="mt-1 text-xs text-muted-foreground">Resumen general</p>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Movimientos contables totales</span>
                <span className="tabular-nums font-medium">{data?.totalLineas ?? "—"}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Régimen fiscal</span>
                <span className="font-medium">{org.regimen_fiscal ?? "—"}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Tu rol</span>
                <span className="font-medium capitalize">{org.role}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function SmallStat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any;
  label: string;
  value: any;
  accent?: "warning";
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
      <div
        className={`grid h-9 w-9 place-items-center rounded-md ${accent === "warning" ? "bg-warning/15 text-warning" : "bg-secondary text-muted-foreground"}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function Obligacion({ fecha, texto }: { fecha: string; texto: string }) {
  return (
    <li className="flex items-start gap-3 border-l-2 border-primary/40 pl-3">
      <div>
        <div className="text-xs font-medium text-primary">{fecha}</div>
        <div className="text-sm">{texto}</div>
      </div>
    </li>
  );
}
