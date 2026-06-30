import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listJournalEntries, upsertJournalEntry, cancelJournalEntry, listAccounts } from "@/lib/accounting.functions";
import { useRequireOrg } from "@/lib/use-current-org";
import { PageHeader, EmptyState } from "@/components/app-ui";
import { fmtMoney, fmtDate } from "@/lib/format";
import { BookOpen, Plus, X, Ban, Trash2, Search, Calendar } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/polizas")({
  component: Polizas,
});

const TIPO_STYLES: Record<string, string> = {
  ingreso: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  egreso: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  diario: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
};

const TIPO_LABELS: Record<string, string> = {
  ingreso: "Ingreso",
  egreso: "Egreso",
  diario: "Diario",
};

const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function Polizas() {
  const org = useRequireOrg();
  const qc = useQueryClient();
  const list = useServerFn(listJournalEntries);
  const accountsFn = useServerFn(listAccounts);
  const upsert = useServerFn(upsertJournalEntry);
  const cancel = useServerFn(cancelJournalEntry);
  const [search, setSearch] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");

  const now = new Date();
  const mesActual = now.getMonth() + 1;
  const anioActual = now.getFullYear();
  const [filtroFecha, setFiltroFecha] = useState<"mes" | "personalizado">("mes");
  const [mesSel, setMesSel] = useState(mesActual);
  const [anioSel, setAnioSel] = useState(anioActual);
  const [desdeCustom, setDesdeCustom] = useState(() => new Date(anioActual, mesActual - 1, 1).toISOString().slice(0, 10));
  const [hastaCustom, setHastaCustom] = useState(() => new Date(anioActual, mesActual, 0).toISOString().slice(0, 10));

  function buildPeriod() {
    if (filtroFecha === "mes") {
      const d = `${anioSel}-${String(mesSel).padStart(2, "0")}-01`;
      const ultimo = new Date(anioSel, mesSel, 0).getDate();
      const h = `${anioSel}-${String(mesSel).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
      return { desde: d, hasta: h };
    }
    return { desde: desdeCustom, hasta: hastaCustom };
  }

  const periodo = buildPeriod();
  const { data, isLoading } = useQuery({
    queryKey: ["entries", org.id, search, tipoFiltro, periodo],
    queryFn: () => list({ data: { organizationId: org.id, q: search || undefined, tipo: tipoFiltro || undefined, desde: periodo.desde, hasta: periodo.hasta } }),
  });
  const { data: accounts } = useQuery({ queryKey: ["accounts", org.id], queryFn: () => accountsFn({ data: { organizationId: org.id } }) });
  const [open, setOpen] = useState(false);

  async function save(p: any) {
    try {
      await upsert({ data: { ...p, organizationId: org.id } });
      toast.success("Póliza registrada");
      qc.invalidateQueries({ queryKey: ["entries", org.id] });
      setOpen(false);
    } catch (e: any) { toast.error(e.message); }
  }
  async function doCancel(id: string) {
    if (!confirm("¿Cancelar la póliza?")) return;
    await cancel({ data: { id } });
    qc.invalidateQueries({ queryKey: ["entries", org.id] });
    toast.success("Póliza cancelada");
  }

  return (
    <div>
      <PageHeader title="Pólizas" description="Captura con validación de cuadre automático"
        actions={<button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"><Plus className="h-4 w-4"/>Nueva póliza</button>} />
      <div className="space-y-4 p-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1" style={{ maxWidth: 320 }}>
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text" placeholder="Buscar por concepto..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          {["", "ingreso", "egreso", "diario"].map((t) => (
            <button key={t} onClick={() => setTipoFiltro(tipoFiltro === t ? "" : t)}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${tipoFiltro === t ? (TIPO_STYLES[t] || "bg-secondary text-foreground") : "bg-card text-muted-foreground hover:bg-secondary/50"}`}
            >{t ? TIPO_LABELS[t] : "Todos"}</button>
          ))}
          <div className="flex items-center gap-1.5 border-l pl-3">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <button onClick={() => setFiltroFecha(filtroFecha === "mes" ? "personalizado" : "mes")}
              className="rounded-md border px-2 py-1 text-xs font-medium bg-card hover:bg-secondary/50"
            >{filtroFecha === "mes" ? "Mes" : "Personalizado"}</button>
            {filtroFecha === "mes" ? (
              <>
                <select value={mesSel} onChange={(e) => setMesSel(Number(e.target.value))} className="rounded-md border bg-background px-1.5 py-1 text-xs">
                  {meses.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <input type="number" value={anioSel} onChange={(e) => setAnioSel(Number(e.target.value))} className="w-16 rounded-md border bg-background px-1.5 py-1 text-xs" />
              </>
            ) : (
              <>
                <input type="date" value={desdeCustom} onChange={(e) => setDesdeCustom(e.target.value)} className="rounded-md border bg-background px-1.5 py-1 text-xs" />
                <span className="text-xs text-muted-foreground">→</span>
                <input type="date" value={hastaCustom} onChange={(e) => setHastaCustom(e.target.value)} className="rounded-md border bg-background px-1.5 py-1 text-xs" />
              </>
            )}
          </div>
        </div>
        {isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p>
          : !data?.length ? <EmptyState icon={BookOpen} title="Sin pólizas" description={search ? "No hay pólizas que coincidan con la búsqueda." : "No hay pólizas en este periodo."} />
          : (
            <div className="overflow-hidden rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                  <tr><th className="px-3 py-2 text-left">Fecha</th><th className="px-3 py-2 text-left">Tipo</th><th className="px-3 py-2 text-left">Núm.</th><th className="px-3 py-2 text-left">Concepto</th><th className="px-3 py-2 text-right">Cargo</th><th className="px-3 py-2 text-right">Abono</th><th className="px-3 py-2 text-left">Estatus</th><th className="px-3 py-2"></th></tr>
                </thead>
                <tbody className="divide-y">
                  {data.map((p: any) => (
                    <tr key={p.id} className="hover:bg-secondary/30">
                      <td className="px-3 py-2 font-mono text-xs">{fmtDate(p.fecha)}</td>
                      <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-xs font-medium ${TIPO_STYLES[p.tipo] || "bg-secondary text-muted-foreground"}`}>{TIPO_LABELS[p.tipo] || p.tipo}</span></td>
                      <td className="px-3 py-2 font-mono text-xs">{p.numero}</td>
                      <td className="px-3 py-2">{p.concepto}</td>
                      <td className="px-3 py-2 text-right text-money">{fmtMoney(p.total_cargo)}</td>
                      <td className="px-3 py-2 text-right text-money">{fmtMoney(p.total_abono)}</td>
                      <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-xs capitalize ${p.estatus === "cancelada" ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>{p.estatus}</span></td>
                      <td className="px-3 py-2 text-right">
                        {p.estatus !== "cancelada" && <button onClick={() => doCancel(p.id)} className="rounded p-1 text-destructive hover:bg-destructive/10" title="Cancelar"><Ban className="h-3.5 w-3.5"/></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
      {open && <PolizaForm accounts={accounts ?? []} onClose={() => setOpen(false)} onSave={save} />}
    </div>
  );
}

function PolizaForm({ accounts, onClose, onSave }: any) {
  const [tipo, setTipo] = useState("diario");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [concepto, setConcepto] = useState("");
  const [referencia, setReferencia] = useState("");
  const [lines, setLines] = useState([{ account_id: "", concepto: "", cargo: 0, abono: 0 }, { account_id: "", concepto: "", cargo: 0, abono: 0 }]);

  const totalC = lines.reduce((s, l) => s + Number(l.cargo || 0), 0);
  const totalA = lines.reduce((s, l) => s + Number(l.abono || 0), 0);
  const diff = totalC - totalA;
  const cuadra = Math.abs(diff) < 0.005;

  function update(i: number, field: string, v: any) {
    const next = [...lines];
    (next[i] as any)[field] = v;
    setLines(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!cuadra) { toast.error("La póliza no cuadra"); return; }
    const valid = lines.filter((l) => l.account_id && (Number(l.cargo) > 0 || Number(l.abono) > 0));
    if (valid.length < 2) { toast.error("Necesitas al menos 2 movimientos"); return; }
    onSave({ tipo, fecha, concepto, referencia, lines: valid.map((l) => ({ ...l, cargo: Number(l.cargo), abono: Number(l.abono) })) });
  }

  const usable = accounts.filter((a: any) => !a.acumulativa);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Nueva póliza</h2><button type="button" onClick={onClose}><X className="h-4 w-4"/></button></div>
        <div className="grid grid-cols-4 gap-3">
          <Lbl label="Tipo"><select className="inp" value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="ingreso">Ingreso</option><option value="egreso">Egreso</option><option value="diario">Diario</option></select></Lbl>
          <Lbl label="Fecha"><input type="date" className="inp" value={fecha} onChange={(e) => setFecha(e.target.value)} required /></Lbl>
          <Lbl label="Concepto" className="col-span-2"><input className="inp" value={concepto} onChange={(e) => setConcepto(e.target.value)} required /></Lbl>
          <Lbl label="Referencia" className="col-span-4"><input className="inp" value={referencia} onChange={(e) => setReferencia(e.target.value)} /></Lbl>
        </div>

        <h3 className="mt-5 mb-2 text-sm font-semibold">Movimientos</h3>
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs text-muted-foreground"><tr><th className="px-2 py-1.5 text-left">Cuenta</th><th className="px-2 py-1.5 text-left">Concepto</th><th className="px-2 py-1.5 text-right">Cargo</th><th className="px-2 py-1.5 text-right">Abono</th><th></th></tr></thead>
            <tbody className="divide-y">
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="p-1"><select className="inp" value={l.account_id} onChange={(e) => update(i, "account_id", e.target.value)}><option value="">Seleccionar...</option>{usable.map((a: any) => <option key={a.id} value={a.id}>{a.codigo} — {a.nombre}</option>)}</select></td>
                  <td className="p-1"><input className="inp" value={l.concepto} onChange={(e) => update(i, "concepto", e.target.value)} /></td>
                  <td className="p-1"><input type="number" step="0.01" className="inp text-right font-mono" value={l.cargo || ""} onChange={(e) => update(i, "cargo", e.target.value)} /></td>
                  <td className="p-1"><input type="number" step="0.01" className="inp text-right font-mono" value={l.abono || ""} onChange={(e) => update(i, "abono", e.target.value)} /></td>
                  <td className="p-1"><button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} className="rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5"/></button></td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-secondary/30 text-sm font-semibold">
              <tr>
                <td colSpan={2} className="px-2 py-1.5">Totales</td>
                <td className="px-2 py-1.5 text-right text-money">{fmtMoney(totalC)}</td>
                <td className="px-2 py-1.5 text-right text-money">{fmtMoney(totalA)}</td>
                <td></td>
              </tr>
              <tr className={cuadra ? "text-success" : "text-destructive"}>
                <td colSpan={2} className="px-2 py-1.5">Diferencia</td>
                <td colSpan={2} className="px-2 py-1.5 text-right text-money">{fmtMoney(Math.abs(diff))}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <button type="button" onClick={() => setLines([...lines, { account_id: "", concepto: "", cargo: 0, abono: 0 }])} className="mt-2 rounded-md border bg-card px-2 py-1 text-xs hover:bg-secondary">+ Agregar movimiento</button>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-secondary">Cancelar</button>
          <button type="submit" disabled={!cuadra} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40">Guardar</button>
        </div>
        <style>{`.inp{width:100%;border:1px solid var(--color-border);background:var(--color-background);border-radius:6px;padding:.4rem .6rem;font-size:.875rem}`}</style>
      </form>
    </div>
  );
}
function Lbl({ label, children, className = "" }: any) {
  return <label className={`block ${className}`}><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>{children}</label>;
}
