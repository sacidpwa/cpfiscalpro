import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listMensuales, calcularMensual, listPatrones, deleteMensual } from "@/lib/sua.functions";
import { useRequireOrg } from "@/lib/use-current-org";
import { EmptyState } from "@/components/app-ui";
import { Calculator, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { NOMBRE_MES } from "@/lib/sua/calc-mensual";

export const Route = createFileRoute("/_authenticated/app/sua/mensuales/")({
  component: MensualesList,
});

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

function MensualesList() {
  const org = useRequireOrg();
  const qc = useQueryClient();
  const fList = useServerFn(listMensuales);
  const fPat = useServerFn(listPatrones);
  const fCalc = useServerFn(calcularMensual);
  const fDel = useServerFn(deleteMensual);
  const list = useQuery({ queryKey: ["sua-mens", org.id], queryFn: () => fList({ data: { organizationId: org.id } }) });
  const pats = useQuery({ queryKey: ["sua-patrones", org.id], queryFn: () => fPat({ data: { organizationId: org.id } }) });

  const [open, setOpen] = useState(false);
  const today = new Date();
  const [form, setForm] = useState({
    patronId: "",
    ejercicio: today.getFullYear(),
    mes: today.getMonth() + 1,
  });

  const calc = useMutation({
    mutationFn: (v: typeof form) => fCalc({ data: { organizationId: org.id, patronId: v.patronId, ejercicio: v.ejercicio, mes: v.mes } }),
    onSuccess: (r) => {
      toast.success(`Calculado: ${r.empleados} empleados · ${fmt(r.total)}`);
      qc.invalidateQueries({ queryKey: ["sua-mens", org.id] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => fDel({ data: { id } }),
    onSuccess: () => { toast.success("Eliminado"); qc.invalidateQueries({ queryKey: ["sua-mens", org.id] }); },
  });

  if (list.isLoading || pats.isLoading) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Cédulas mensuales IMSS</h2>
          <p className="text-sm text-muted-foreground">Cuotas mensuales: EFM, GMP, IV, Guarderías y RT.</p>
        </div>
        <button
          disabled={!pats.data?.length}
          onClick={() => { setForm((f) => ({ ...f, patronId: pats.data![0].id })); setOpen(true); }}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Calcular mes
        </button>
      </div>

      {!pats.data?.length ? (
        <EmptyState
          icon={Calculator}
          title="Sin patrones"
          description="Registra primero un patrón IMSS para poder calcular mensualidades."
          action={<Link to="/app/sua/patrones" className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground">Ir a Patrones</Link>}
        />
      ) : !list.data?.length ? (
        <EmptyState icon={Calculator} title="Sin cédulas mensuales todavía" description="Haz clic en “Calcular mes” para generar la primera." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-3">Mes</th>
                <th className="p-3">Patrón</th>
                <th className="p-3 text-right">EFM</th>
                <th className="p-3 text-right">GMP</th>
                <th className="p-3 text-right">IV</th>
                <th className="p-3 text-right">Guarderías</th>
                <th className="p-3 text-right">RT</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((b: any) => (
                <tr key={b.id} className="border-t hover:bg-muted/20">
                  <td className="p-3">
                    <Link to="/app/sua/mensuales/$id" params={{ id: b.id }} className="font-medium text-primary hover:underline">
                      {b.ejercicio} · {NOMBRE_MES[b.mes]}
                    </Link>
                  </td>
                  <td className="p-3">{b.patron?.razon_social}</td>
                  <td className="p-3 text-right">{fmt(b.total_efm)}</td>
                  <td className="p-3 text-right">{fmt(b.total_gmp)}</td>
                  <td className="p-3 text-right">{fmt(b.total_iv)}</td>
                  <td className="p-3 text-right">{fmt(b.total_guarderias)}</td>
                  <td className="p-3 text-right">{fmt(b.total_rt)}</td>
                  <td className="p-3 text-right font-semibold">{fmt(b.total_mes)}</td>
                  <td className="p-3 text-right">
                    <button onClick={() => { if (confirm("¿Eliminar cédula mensual?")) del.mutate(b.id); }} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-semibold">Calcular mes</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Patrón</label>
                <select className="w-full rounded border bg-background px-3 py-2 text-sm"
                  value={form.patronId} onChange={(e) => setForm({ ...form, patronId: e.target.value })}>
                  {pats.data!.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.registro_patronal} · {p.razon_social}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">Ejercicio</label>
                  <input type="number" className="w-full rounded border bg-background px-3 py-2 text-sm"
                    value={form.ejercicio} onChange={(e) => setForm({ ...form, ejercicio: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Mes</label>
                  <select className="w-full rounded border bg-background px-3 py-2 text-sm"
                    value={form.mes} onChange={(e) => setForm({ ...form, mes: Number(e.target.value) })}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>{NOMBRE_MES[m]}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded px-3 py-2 text-sm hover:bg-muted">Cancelar</button>
              <button
                disabled={calc.isPending || !form.patronId}
                onClick={() => calc.mutate(form)}
                className="rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {calc.isPending ? "Calculando…" : "Calcular"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
