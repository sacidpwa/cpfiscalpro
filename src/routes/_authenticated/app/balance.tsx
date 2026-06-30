import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getBalanceGeneral } from "@/lib/accounting.functions";
import { useRequireOrg } from "@/lib/use-current-org";
import { PageHeader, EmptyState } from "@/components/app-ui";
import { Scale } from "lucide-react";
import { fmtMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/balance")({
  component: Balance,
});

const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function Balance() {
  const org = useRequireOrg();
  const fn = useServerFn(getBalanceGeneral);
  const now = new Date();
  const [ejercicio, setEjercicio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);

  const { data: bg, isLoading } = useQuery({
    queryKey: ["bg", org.id, ejercicio, mes],
    queryFn: () => fn({ data: { organizationId: org.id, ejercicio, mes } }),
  });

  function renderSection(title: string, items: any[], total: number, color: string, bgColor: string) {
    if (!items?.length) return null;
    return (
      <>
        <tr className={bgColor}><td colSpan={3} className="px-3 py-2 font-bold text-sm" style={{color}}>{title}</td></tr>
        {items.map((item: any, i: number) => (
          <tr key={i} className="hover:bg-secondary/30">
            <td className="px-3 pl-6 font-mono text-xs">{item.codigo ? item.codigo.replace(/^0+/,'') : ''}</td>
            <td className="px-3">{item.nombre}</td>
            <td className="px-3 text-right text-money font-medium">{fmtMoney(item.saldo)}</td>
          </tr>
        ))}
        <tr className="font-bold" style={{borderTop:'2px solid '+color}}>
          <td colSpan={2} className="px-3 py-2">Total {title}</td>
          <td className="px-3 text-right text-money" style={{color}}>{fmtMoney(total)}</td>
        </tr>
      </>
    );
  }

  return (
    <div>
      <PageHeader title="Balance General" description="Situación financiera de la organización" />
      <div className="space-y-4 p-8">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
          <label className="block text-xs"><span className="mb-1 block text-muted-foreground">Mes</span>
            <select value={mes} onChange={e => setMes(Number(e.target.value))} className="rounded-md border bg-background px-2 py-1.5 text-sm">
              {meses.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
            </select>
          </label>
          <label className="block text-xs"><span className="mb-1 block text-muted-foreground">Ejercicio</span>
            <input type="number" value={ejercicio} onChange={e => setEjercicio(Number(e.target.value))} className="rounded-md border bg-background px-2 py-1.5 text-sm w-20" />
          </label>
        </div>

        {isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p>
          : !bg ? <EmptyState icon={Scale} title="Sin datos" description="No hay información para mostrar." />
          : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* ACTIVO */}
            <div className="overflow-hidden rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-blue-50/50 dark:bg-blue-950/10">
                  <tr><th colSpan={3} className="px-3 py-2 text-left font-bold text-blue-700 dark:text-blue-400">ACTIVO</th></tr>
                  <tr className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-1.5 text-left w-24">Código</th><th className="px-3 py-1.5 text-left">Cuenta</th><th className="px-3 py-1.5 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {renderSection('Activo Circulante', bg.activoCirculante, bg.totalActivo - (bg.activoNoCirculante||[]).reduce((s:number,i:any)=>s+i.saldo,0), '#2563eb', 'bg-blue-50/30 dark:bg-blue-950/5')}
                  {renderSection('Activo No Circulante', bg.activoNoCirculante, (bg.activoNoCirculante||[]).reduce((s:number,i:any)=>s+i.saldo,0), '#2563eb', 'bg-blue-50/30 dark:bg-blue-950/5')}
                </tbody>
                <tfoot className="bg-blue-100/50 dark:bg-blue-950/20 font-bold text-base">
                  <tr><td colSpan={2} className="px-3 py-3">Total Activo</td><td className="px-3 py-3 text-right text-blue-700">{fmtMoney(bg.totalActivo)}</td></tr>
                </tfoot>
              </table>
            </div>

            {/* PASIVO + CAPITAL */}
            <div className="overflow-hidden rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-orange-50/50 dark:bg-orange-950/10">
                  <tr><th colSpan={3} className="px-3 py-2 text-left font-bold text-orange-700 dark:text-orange-400">PASIVO</th></tr>
                  <tr className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-1.5 text-left w-24">Código</th><th className="px-3 py-1.5 text-left">Cuenta</th><th className="px-3 py-1.5 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {renderSection('Pasivo Circulante', bg.pasivoCirculante, (bg.pasivoCirculante||[]).reduce((s:number,i:any)=>s+i.saldo,0), '#ea580c', 'bg-orange-50/30 dark:bg-orange-950/5')}
                  {renderSection('Pasivo No Circulante', bg.pasivoNoCirculante, (bg.pasivoNoCirculante||[]).reduce((s:number,i:any)=>s+i.saldo,0), '#ea580c', 'bg-orange-50/30 dark:bg-orange-950/5')}
                </tbody>
                <tfoot className="divide-y">
                  <tr className="bg-orange-100/50 dark:bg-orange-950/20 font-bold">
                    <td colSpan={2} className="px-3 py-2">Total Pasivo</td>
                    <td className="px-3 py-2 text-right text-orange-700">{fmtMoney(bg.totalPasivo)}</td>
                  </tr>
                  <tr className="bg-green-50/50 dark:bg-green-950/10 font-bold">
                    <td colSpan={2} className="px-3 py-2 text-green-700 dark:text-green-400">CAPITAL CONTABLE</td>
                    <td></td>
                  </tr>
                  {bg.capital.map((item: any, i: number) => (
                    <tr key={i} className="hover:bg-secondary/30">
                      <td className="px-3 pl-6 font-mono text-xs">{item.codigo ? item.codigo.replace(/^0+/,'') : ''}</td>
                      <td className="px-3">{item.nombre}</td>
                      <td className="px-3 text-right text-money font-medium">{fmtMoney(item.saldo)}</td>
                    </tr>
                  ))}
                  <tr className="bg-green-100/50 dark:bg-green-950/20 font-bold border-t-2 border-green-500">
                    <td colSpan={2} className="px-3 py-2">Total Capital Contable</td>
                    <td className="px-3 py-2 text-right text-green-700">{fmtMoney(bg.totalCapital)}</td>
                  </tr>
                  <tr className="font-bold text-base border-t-2 border-foreground bg-secondary/30">
                    <td colSpan={2} className="px-3 py-3">Total Pasivo + Capital</td>
                    <td className="px-3 py-3 text-right">{fmtMoney(bg.totalPasivoCapital)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
