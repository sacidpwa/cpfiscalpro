import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getBalanza } from "@/lib/accounting.functions";
import { useRequireOrg } from "@/lib/use-current-org";
import { PageHeader } from "@/components/app-ui";
import { fmtMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/balanza")({
  component: Balanza,
});

function Balanza() {
  const org = useRequireOrg();
  const fn = useServerFn(getBalanza);
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [desde, setDesde] = useState(firstDay);
  const [hasta, setHasta] = useState(lastDay);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["balanza", org.id, desde, hasta],
    queryFn: () => fn({ data: { organizationId: org.id, desde, hasta } }),
  });

  const totC = data?.reduce((s: number, r: any) => s + r.cargo, 0) ?? 0;
  const totA = data?.reduce((s: number, r: any) => s + r.abono, 0) ?? 0;

  return (
    <div>
      <PageHeader title="Balanza de comprobación" description="Saldo por cuenta en el periodo seleccionado" />
      <div className="space-y-4 p-8">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
          <label className="block text-xs"><span className="mb-1 block text-muted-foreground">Desde</span><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-md border bg-background px-2 py-1.5 text-sm"/></label>
          <label className="block text-xs"><span className="mb-1 block text-muted-foreground">Hasta</span><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-md border bg-background px-2 py-1.5 text-sm"/></label>
          <button onClick={() => refetch()} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">Actualizar</button>
        </div>
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
              <tr><th className="px-3 py-2 text-left">Código</th><th className="px-3 py-2 text-left">Cuenta</th><th className="px-3 py-2 text-right">Cargos</th><th className="px-3 py-2 text-right">Abonos</th><th className="px-3 py-2 text-right">Saldo</th></tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Cargando…</td></tr>
                : !data?.length ? <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Sin movimientos en el periodo.</td></tr>
                : data.map((r: any) => (
                  <tr key={r.id} className="hover:bg-secondary/30">
                    <td className="px-3 py-2 font-mono text-xs">{r.codigo}</td>
                    <td className="px-3 py-2">{r.nombre}</td>
                    <td className="px-3 py-2 text-right text-money">{fmtMoney(r.cargo)}</td>
                    <td className="px-3 py-2 text-right text-money">{fmtMoney(r.abono)}</td>
                    <td className="px-3 py-2 text-right text-money font-semibold">{fmtMoney(r.saldo)}</td>
                  </tr>
                ))}
            </tbody>
            <tfoot className="bg-secondary/30 font-semibold">
              <tr><td colSpan={2} className="px-3 py-2">Totales</td><td className="px-3 py-2 text-right text-money">{fmtMoney(totC)}</td><td className="px-3 py-2 text-right text-money">{fmtMoney(totA)}</td><td className="px-3 py-2 text-right text-money">{fmtMoney(totC - totA)}</td></tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
