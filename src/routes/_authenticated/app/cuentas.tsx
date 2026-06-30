import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listAccounts, upsertAccount } from "@/lib/accounting.functions";
import { useRequireOrg } from "@/lib/use-current-org";
import { PageHeader } from "@/components/app-ui";
import { Plus, X, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/cuentas")({
  component: Cuentas,
});

function Cuentas() {
  const org = useRequireOrg();
  const qc = useQueryClient();
  const list = useServerFn(listAccounts);
  const upsert = useServerFn(upsertAccount);
  const { data, isLoading } = useQuery({ queryKey: ["accounts", org.id], queryFn: () => list({ data: { organizationId: org.id } }) });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  async function save(f: any) {
    try {
      await upsert({ data: { ...f, organizationId: org.id, nivel: Number(f.nivel) } });
      toast.success("Cuenta guardada");
      qc.invalidateQueries({ queryKey: ["accounts", org.id] });
      setOpen(false); setEditing(null);
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div>
      <PageHeader title="Catálogo de cuentas" description="Estructura contable conforme al código agrupador SAT"
        actions={<button onClick={() => { setEditing(null); setOpen(true); }} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"><Plus className="h-4 w-4"/>Nueva cuenta</button>} />
      <div className="p-8">
        {isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Código</th>
                  <th className="px-3 py-2 text-left">Nombre</th>
                  <th className="px-3 py-2 text-left">C. Agrupador SAT</th>
                  <th className="px-3 py-2 text-left">Naturaleza</th>
                  <th className="px-3 py-2 text-center">Nivel</th>
                  <th className="px-3 py-2 text-center">Acumulativa</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data?.map((a: any) => (
                  <tr key={a.id} className="hover:bg-secondary/30">
                    <td className="px-3 py-2 font-mono text-xs">{a.codigo}</td>
                    <td className="px-3 py-2 font-medium" style={{ paddingLeft: `${0.75 + (a.nivel - 1) * 1}rem` }}>{a.nombre}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{a.codigo_agrupador ?? "—"}</td>
                    <td className="px-3 py-2 capitalize">{a.naturaleza}</td>
                    <td className="px-3 py-2 text-center">{a.nivel}</td>
                    <td className="px-3 py-2 text-center">{a.acumulativa ? "✓" : ""}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => { setEditing(a); setOpen(true); }} className="rounded p-1 hover:bg-secondary"><Pencil className="h-3.5 w-3.5"/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {open && <AccountForm initial={editing} onClose={() => { setOpen(false); setEditing(null); }} onSave={save} />}
    </div>
  );
}

function AccountForm({ initial, onClose, onSave }: any) {
  const [f, setF] = useState({
    id: initial?.id,
    codigo: initial?.codigo ?? "",
    nombre: initial?.nombre ?? "",
    codigo_agrupador: initial?.codigo_agrupador ?? "",
    naturaleza: initial?.naturaleza ?? "deudora",
    nivel: initial?.nivel ?? 2,
    acumulativa: initial?.acumulativa ?? false,
  });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(f); }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">{initial ? "Editar" : "Nueva"} cuenta</h2><button type="button" onClick={onClose}><X className="h-4 w-4"/></button></div>
        <div className="grid grid-cols-2 gap-3">
          <Lbl label="Código"><input className="inp font-mono" value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} required /></Lbl>
          <Lbl label="Cód. Agrupador SAT"><input className="inp font-mono" value={f.codigo_agrupador} onChange={(e) => setF({ ...f, codigo_agrupador: e.target.value })} /></Lbl>
          <Lbl label="Nombre" className="col-span-2"><input className="inp" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required /></Lbl>
          <Lbl label="Naturaleza"><select className="inp" value={f.naturaleza} onChange={(e) => setF({ ...f, naturaleza: e.target.value })}><option value="deudora">Deudora</option><option value="acreedora">Acreedora</option></select></Lbl>
          <Lbl label="Nivel"><input type="number" min={1} max={6} className="inp" value={f.nivel} onChange={(e) => setF({ ...f, nivel: Number(e.target.value) })} /></Lbl>
          <label className="col-span-2 mt-1 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.acumulativa} onChange={(e) => setF({ ...f, acumulativa: e.target.checked })} /> Cuenta acumulativa (no recibe movimientos)</label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-secondary">Cancelar</button>
          <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">Guardar</button>
        </div>
        <style>{`.inp{width:100%;border:1px solid var(--color-border);background:var(--color-background);border-radius:6px;padding:.4rem .6rem;font-size:.875rem}`}</style>
      </form>
    </div>
  );
}
function Lbl({ label, children, className = "" }: any) {
  return <label className={`block ${className}`}><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>{children}</label>;
}
