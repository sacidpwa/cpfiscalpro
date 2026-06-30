import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  listMovimientos, upsertMovimiento, deleteMovimiento,
  updateMovimientoFolio, generateIDSEFile, listPatrones,
} from "@/lib/sua.functions";
import { listEmployees } from "@/lib/payroll.functions";
import { useRequireOrg } from "@/lib/use-current-org";
import { EmptyState } from "@/components/app-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRightLeft, Plus, Download, Trash2, FileCheck2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { MOTIVO_BAJA, TIPO_INCAPACIDAD } from "@/lib/sua/idse-layout";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/sua/movimientos")({
  component: MovimientosPage,
});

const TIPOS = [
  { v: "alta", l: "Alta" },
  { v: "reingreso", l: "Reingreso" },
  { v: "baja", l: "Baja" },
  { v: "modificacion", l: "Modificación salarial" },
  { v: "ausentismo", l: "Ausentismo" },
  { v: "incapacidad", l: "Incapacidad" },
];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pendiente_envio: { label: "Pendiente", cls: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200" },
  enviado: { label: "Enviado", cls: "bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200" },
  aceptado: { label: "Aceptado", cls: "bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-200" },
  rechazado: { label: "Rechazado", cls: "bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-200" },
};

function MovimientosPage() {
  const org = useRequireOrg();
  const qc = useQueryClient();
  const fnPat = useServerFn(listPatrones);
  const fnEmp = useServerFn(listEmployees);
  const fnMov = useServerFn(listMovimientos);
  const upd = useServerFn(upsertMovimiento);
  const del = useServerFn(deleteMovimiento);
  const setFolioFn = useServerFn(updateMovimientoFolio);
  const genFile = useServerFn(generateIDSEFile);

  const pat = useQuery({ queryKey: ["sua-patrones", org.id], queryFn: () => fnPat({ data: { organizationId: org.id } }) });
  const emp = useQuery({ queryKey: ["employees", org.id], queryFn: () => fnEmp({ data: { organizationId: org.id } }) });
  const mov = useQuery({ queryKey: ["sua-movs", org.id], queryFn: () => fnMov({ data: { organizationId: org.id } }) });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const pendingIds = useMemo(
    () => (mov.data ?? []).filter((m: any) => m.estatus === "pendiente_envio").map((m: any) => m.id),
    [mov.data],
  );

  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }
  function toggleAll() {
    setSelected(selected.size === pendingIds.length ? new Set() : new Set(pendingIds));
  }

  async function save(data: any) {
    try {
      await upd({ data: { ...data, organizationId: org.id } });
      toast.success("Movimiento guardado");
      qc.invalidateQueries({ queryKey: ["sua-movs", org.id] });
      setOpen(false);
      setEditing(null);
    } catch (e: any) { toast.error(e.message); }
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar este movimiento?")) return;
    try {
      await del({ data: { id } });
      qc.invalidateQueries({ queryKey: ["sua-movs", org.id] });
    } catch (e: any) { toast.error(e.message); }
  }

  async function downloadIDSE() {
    if (!selected.size) return toast.error("Selecciona al menos un movimiento pendiente");
    try {
      const res = await genFile({ data: { organizationId: org.id, movimientoIds: Array.from(selected) } });
      const blob = new Blob([res.contenido], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = res.filename; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Archivo generado: ${res.registros} registros`);
    } catch (e: any) { toast.error(e.message); }
  }

  async function setFolio(m: any) {
    const folio = prompt("Folio IDSE del acuse:", m.folio_idse ?? "");
    if (!folio) return;
    try {
      await setFolioFn({ data: { id: m.id, folio_idse: folio, estatus: "aceptado" } });
      qc.invalidateQueries({ queryKey: ["sua-movs", org.id] });
      toast.success("Folio guardado");
    } catch (e: any) { toast.error(e.message); }
  }

  if (pat.isLoading || mov.isLoading) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  if (!pat.data?.length) {
    return <EmptyState title="Registra primero un patrón" description="Antes de capturar movimientos necesitas al menos un registro patronal." icon={ArrowRightLeft} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Movimientos afiliatorios</h2>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!selected.size} onClick={downloadIDSE}>
            <Download className="mr-1 h-4 w-4" />Descargar archivo IDSE ({selected.size})
          </Button>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditing(null); setOpen(true); }}>
                <Plus className="mr-1 h-4 w-4" />Nuevo movimiento
              </Button>
            </DialogTrigger>
            <MovDialog
              patrones={pat.data} empleados={emp.data ?? []} initial={editing} onSave={save}
            />
          </Dialog>
        </div>
      </div>

      {!mov.data?.length ? (
        <EmptyState icon={ArrowRightLeft} title="Sin movimientos" description="Captura altas, bajas, modificaciones, ausencias e incapacidades para generar el archivo IDSE." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">
                  <Checkbox checked={pendingIds.length > 0 && selected.size === pendingIds.length} onCheckedChange={toggleAll} />
                </th>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Empleado</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-right">SDI</th>
                <th className="px-3 py-2 text-left">Estatus</th>
                <th className="px-3 py-2 text-left">Folio IDSE</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {mov.data.map((m: any) => {
                const e = m.employee;
                const nombre = e ? `${e.numero ?? ""} ${e.apellido_paterno ?? ""} ${e.apellido_materno ?? ""} ${e.nombre ?? ""}`.trim() : "—";
                const st = STATUS_BADGE[m.estatus] ?? STATUS_BADGE.pendiente_envio;
                const tipo = TIPOS.find(t => t.v === m.tipo)?.l ?? m.tipo;
                return (
                  <tr key={m.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2">
                      {m.estatus === "pendiente_envio" && (
                        <Checkbox checked={selected.has(m.id)} onCheckedChange={() => toggle(m.id)} />
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(m.fecha_movimiento)}</td>
                    <td className="px-3 py-2">{nombre}</td>
                    <td className="px-3 py-2">{tipo}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {m.tipo === "modificacion" ? Number(m.sdi_nuevo ?? 0).toFixed(2) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{m.folio_idse ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {m.estatus !== "aceptado" && (
                        <Button size="sm" variant="ghost" onClick={() => setFolio(m)} title="Marcar como aceptado">
                          <FileCheck2 className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(m); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(m.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Flujo:</strong> selecciona los movimientos pendientes → "Descargar archivo IDSE" → súbelo al portal IDSE del IMSS con tu FIEL → cuando bajes el acuse, captura el folio en cada movimiento con el ícono ✓.
      </div>
    </div>
  );
}

function MovDialog({ patrones, empleados, initial, onSave }: any) {
  const [form, setForm] = useState<any>(() => initial ?? {
    patron_id: patrones[0]?.id ?? "",
    employee_id: "",
    tipo: "alta",
    fecha_movimiento: new Date().toISOString().slice(0, 10),
    fecha_fin: "",
    dias: 0,
    sdi_anterior: 0,
    sdi_nuevo: 0,
    motivo_baja: "",
    tipo_incapacidad: "",
    ramo_incapacidad: "",
    observaciones: "",
  });
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e?.target ? e.target.value : e });
  const isBaja = form.tipo === "baja";
  const isMod = form.tipo === "modificacion";
  const isIncap = form.tipo === "incapacidad";
  const isAus = form.tipo === "ausentismo";

  function submit() {
    if (!form.employee_id) return toast.error("Selecciona el empleado");
    onSave({
      ...form,
      id: initial?.id,
      dias: form.dias ? Number(form.dias) : null,
      sdi_anterior: form.sdi_anterior ? Number(form.sdi_anterior) : null,
      sdi_nuevo: form.sdi_nuevo ? Number(form.sdi_nuevo) : null,
      fecha_fin: form.fecha_fin || null,
      motivo_baja: isBaja ? form.motivo_baja : null,
      tipo_incapacidad: isIncap ? form.tipo_incapacidad : null,
      ramo_incapacidad: isIncap ? form.ramo_incapacidad : null,
    });
  }

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{initial ? "Editar movimiento" : "Nuevo movimiento afiliatorio"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Patrón">
          <Select value={form.patron_id} onValueChange={(v) => setForm({ ...form, patron_id: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {patrones.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.registro_patronal} · {p.razon_social}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Empleado">
          <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
            <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
            <SelectContent>
              {empleados.map((e: any) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.numero} · {[e.apellido_paterno, e.apellido_materno, e.nombre].filter(Boolean).join(" ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Tipo de movimiento">
          <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPOS.map(t => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Fecha"><Input type="date" value={form.fecha_movimiento} onChange={set("fecha_movimiento")} /></Field>

        {isMod && (
          <>
            <Field label="SDI anterior"><Input type="number" step="0.01" value={form.sdi_anterior} onChange={set("sdi_anterior")} /></Field>
            <Field label="SDI nuevo"><Input type="number" step="0.01" value={form.sdi_nuevo} onChange={set("sdi_nuevo")} /></Field>
          </>
        )}

        {isBaja && (
          <Field label="Motivo de baja" className="sm:col-span-2">
            <Select value={form.motivo_baja} onValueChange={(v) => setForm({ ...form, motivo_baja: v })}>
              <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
              <SelectContent>
                {Object.entries(MOTIVO_BAJA).map(([k, l]) => <SelectItem key={k} value={k}>{k} - {l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )}

        {(isIncap || isAus) && (
          <>
            <Field label="Fecha fin"><Input type="date" value={form.fecha_fin} onChange={set("fecha_fin")} /></Field>
            <Field label="Días"><Input type="number" value={form.dias} onChange={set("dias")} /></Field>
          </>
        )}

        {isIncap && (
          <>
            <Field label="Tipo de incapacidad">
              <Select value={form.tipo_incapacidad} onValueChange={(v) => setForm({ ...form, tipo_incapacidad: v })}>
                <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_INCAPACIDAD).map(([k, l]) => <SelectItem key={k} value={k}>{k} - {l}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Folio incapacidad"><Input value={form.ramo_incapacidad ?? ""} onChange={set("ramo_incapacidad")} /></Field>
          </>
        )}

        <Field label="Observaciones" className="sm:col-span-2">
          <Textarea value={form.observaciones ?? ""} onChange={set("observaciones")} rows={2} />
        </Field>
      </div>
      <DialogFooter><Button onClick={submit}>Guardar</Button></DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children, className }: any) {
  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
