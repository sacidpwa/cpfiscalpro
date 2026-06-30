import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAllClients } from "@/lib/admin.functions";
import { PageHeader } from "@/components/app-ui";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/admin/consumo")({
  component: ConsumoPage,
});

function ConsumoPage() {
  const fn = useServerFn(listAllClients);
  const { data } = useQuery({ queryKey: ["admin-clients"], queryFn: () => fn() });
  const chart = (data ?? []).map((c: any) => ({
    cliente: c.razon_social.slice(0, 18),
    factura: c.uso_mes.factura,
    nomina: c.uso_mes.nomina,
  })).sort((a: any, b: any) => (b.factura + b.nomina) - (a.factura + a.nomina)).slice(0, 15);

  return (
    <div>
      <PageHeader title="Consumo de timbres" description="Top 15 clientes por timbres consumidos este mes" />
      <div className="p-8">
        <div className="rounded-lg border bg-card p-6">
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="cliente" tick={{ fontSize: 11 }} width={80} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="factura" stackId="a" fill="var(--color-chart-1)" name="Factura" />
                <Bar dataKey="nomina" stackId="a" fill="var(--color-chart-2)" name="Nómina" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
