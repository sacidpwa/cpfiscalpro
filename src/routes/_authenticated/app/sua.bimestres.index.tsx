import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listBimestres, calcularBimestre, listPatrones, deleteBimestre } from "@/lib/sua.functions";
import { useRequireOrg } from "@/lib/use-current-org";
import { EmptyState } from "@/components/app-ui";
import { Calculator, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { NOMBRE_BIMESTRE } from "@/lib/sua/calc";

export const Route = createFileRoute("/_authenticated/app/sua/bimestres/")({
  component: BimestresList,
});

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

function BimestresList() {
  const org = useRequireOrg();
  const qc = useQueryClient();
  const fList = useServerFn(listBimestres);
  const fPat = useServerFn(listPatrones);
  const fCalc = useServerFn(calcularBimestre);
  const fDel = useServerFn(deleteBimestre);
  const list = useQuery({ queryKey: ["sua-bims", org.id], queryFn: () => fList({ data: { organizationId: org.id } }) });
  const pats = useQuery({ queryKey: ["sua-patrones", org.id], queryFn: () => fPat({ data: { organizationId: org.id } }) });

  const [open, setOpen] = useState(false);
  const today = new Date();
  const currentBim = Math.floor(today.getMonth() / 2) + 1;
  const [form, setForm] = useState({
    patronId: "",
    ejercicio: today.getFullYear(),
    bimestre: currentBim,
  });

  const calc = useMutation({
    mutationFn: (v: typeof form) => fCalc({ data: { organizationId: org.id, patronId: v.patronId, ejercicio: v.ejercicio, bimestre: v.bimestre } }),
    onSuccess: (r) => {
      toast.success(`Calculado: ${r.empleados} empleados · ${fmt(r.total)}`);
      qc.invalidateQueries({ queryKey: ["sua-bims", org.id] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => fDel({ data: { id } }),
    onSuccess: () => { toast.success("Eliminado"); qc.invalidateQueries({ queryKey: ["sua-bims", org.id] }); },
  });

  if (list.isLoading || pats.isLoading) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Bimestres calculados</h2>
          <p className="text-sm text-muted-foreground">Cálculo de cuotas IMSS, RCV e Infonavit.</p>
        </div>
        <button
          disabled={!pats.data?.length}
          onClick={() => { setForm((f) => ({ ...f, patronId: pats.data![0].id })); setOpen(true); }}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Calcular bimestre
        </button>
      </div>

      {!pats.data?.length ? (
        <EmptyState
          icon={Calculator}
          title="Sin patrones"
          description="Registra primero un patrón IMSS para poder calcular bimestres."
          action={<Link to="/app/sua/patrones" className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground">Ir a Patrones</Link>}
        />
      ) : !list.data?.length ? (
        <EmptyState icon={Calculator} title="Sin bimestres todavía" description="Haz clic en “Calcular bimestre” para generar el primero." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-3">Bimestre</th>
                <th className="p-3">Patrón</th>
                <th className="p-3 text-right">IMSS M1</th>
                <th className="p-3 text-right">IMSS M2</th>
                <th className="p-3 text-right">RCV</th>
                <th className="p-3 text-right">Infonavit</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((b: any) => (
                <tr key={b.id} className="border-t hover:bg-muted/20">
                  <td className="p-3">
                    <Link to="/app/sua/bimestres/$id" params={{ id: b.id }} className="font-medium text-primary hover:underline">
                      {b.ejercicio} · B{b.bimestre} ({NOMBRE_BIMESTRE[b.bimestre]})
                    </Link>
                  </td>
                  <td className="p-3">{b.patron?.razon_social}</td>
                  <td className="p-3 text-right">{fmt(b.total_imss_mes1)}</td>
                  <td className="p-3 text-right">{fmt(b.total_imss_mes2)}</td>
                  <td className="p-3 text-right">{fmt(b.total_rcv)}</td>
                  <td className="p-3 text-right">{fmt(b.total_infonavit)}</td>
                  <td className="p-3 text-right font-semibold">{fmt(b.total_bimestre)}</td>
                  <td className="p-3 text-right">
                    <button onClick={() => { if (confirm("¿Eliminar bimestre?")) del.mutate(b.id); }} className="text-muted-foreground hover:text-destructive">
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
            <h3 className="mb-4 text-lg font-semibold">Calcular bimestre</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Patrón</label>
                <select
                  className="w-full rounded border bg-background px-3 py-2 text-sm"
                  value={form.patronId}
                  onChange={(e) => setForm({ ...form, patronId: e.target.value })}
                >
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
                  <label className="mb-1 block text-sm font-medium">Bimestre</label>
                  <select className="w-full rounded border bg-background px-3 py-2 text-sm"
                    value={form.bimestre} onChange={(e) => setForm({ ...form, bimestre: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5, 6].map((b) => (
                      <option key={b} value={b}>B{b} · {NOMBRE_BIMESTRE[b]}</option>
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
