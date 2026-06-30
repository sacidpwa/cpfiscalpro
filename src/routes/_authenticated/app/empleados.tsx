import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listEmployees, upsertEmployee, deleteEmployee } from "@/lib/payroll.functions";
import { useRequireOrg } from "@/lib/use-current-org";
import { PageHeader, EmptyState } from "@/components/app-ui";
import { calcSDI } from "@/lib/payroll.calc";
import { fmtMoney, fmtDate } from "@/lib/format";
import { Users, Plus, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/empleados")({
  component: Empleados,
});

function Empleados() {
  const org = useRequireOrg();
  const qc = useQueryClient();
  const list = useServerFn(listEmployees);
  const upsert = useServerFn(upsertEmployee);
  const del = useServerFn(deleteEmployee);
  const { data, isLoading } = useQuery({ queryKey: ["employees", org.id], queryFn: () => list({ data: { organizationId: org.id } }) });
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'numero', dir: 'asc' });
  const filtered = (data ?? [])
    .filter((e: any) => {
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return [e.numero, e.nombre, e.apellido_paterno, e.apellido_materno, e.rfc, e.curp, e.nss, e.puesto, e.departamento]
        .filter(Boolean).some((v: string) => String(v).toLowerCase().includes(s));
    })
    .sort((a: any, b: any) => {
      const getVal = (o: any) => {
        if (sort.key === 'nombre') return [o.nombre, o.apellido_paterno, o.apellido_materno].filter(Boolean).join(' ').toLowerCase();
        const v = o[sort.key];
        return typeof v === 'number' ? v : String(v ?? '').toLowerCase();
      };
      const va = getVal(a), vb = getVal(b);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? cmp : -cmp;
    });

  async function save(form: any) {
    try {
      const payload = {
        ...form,
        organizationId: org.id,
        salario_diario: Number(form.salario_diario) || 0,
        riesgo_puesto: form.riesgo_puesto ? Number(form.riesgo_puesto) : undefined,
        infonavit_cuota_mensual: form.infonavit_cuota_mensual ? Number(form.infonavit_cuota_mensual) : undefined,
        fecha_nacimiento: form.fecha_nacimiento || null,
        fecha_baja: form.fecha_baja || null,
        email: form.email?.trim() ? form.email.trim() : null,
        telefono: form.telefono?.trim() ? form.telefono.trim() : null,
        cp_fiscal: form.cp_fiscal || undefined,
        regimen_fiscal_receptor: form.regimen_fiscal_receptor || undefined,
        tipo_regimen: form.tipo_regimen || undefined,
        empresa: form.empresa || undefined,

      };
      await upsert({ data: payload });
      toast.success("Empleado guardado");
      qc.invalidateQueries({ queryKey: ["employees", org.id] });
      setOpen(false); setEditing(null);
    } catch (e: any) { toast.error(e.message); }
  }
  async function remove(id: string) {
    if (!confirm("¿Eliminar empleado?")) return;
    await del({ data: { id } });
    qc.invalidateQueries({ queryKey: ["employees", org.id] });
  }

  return (
    <div>
      <PageHeader title="Empleados" description="Plantilla activa para nómina"
        actions={<button onClick={() => { setEditing(null); setOpen(true); }} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"><Plus className="h-4 w-4"/>Nuevo</button>} />
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mb-4">
          <input
            type="search"
            placeholder="Buscar por nombre, RFC, CURP, NSS, puesto…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full max-w-md rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p>
          : !data?.length ? (
            <EmptyState icon={Users} title="Sin empleados" description="Agrega tu primer empleado para empezar a calcular nómina."
              action={<button onClick={() => setOpen(true)} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Agregar empleado</button>} />
          ) : (
            <>
              {/* Card stack — móvil/tablet */}
              <div className="space-y-2 lg:hidden">
                {filtered.map((e: any) => (
                  <div key={e.id} className="rounded-lg border bg-card p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">#{e.numero}</span>
                          <Badge status={e.estatus} />
                        </div>
                        <div className="mt-1 truncate font-semibold">{[e.nombre, e.apellido_paterno, e.apellido_materno].filter(Boolean).join(" ")}</div>
                        <div className="truncate font-mono text-[11px] text-muted-foreground">{e.rfc ?? "—"}</div>
                        {e.puesto && <div className="mt-0.5 truncate text-xs text-muted-foreground">{e.puesto}{e.departamento ? ` · ${e.departamento}` : ""}</div>}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button onClick={() => { setEditing(e); setOpen(true); }} className="rounded-md border bg-card p-1.5 hover:bg-secondary"><Pencil className="h-3.5 w-3.5"/></button>
                        <button onClick={() => remove(e.id)} className="rounded-md border bg-card p-1.5 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5"/></button>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 rounded-md bg-secondary/40 p-2 text-xs">
                      <div><div className="text-[10px] uppercase text-muted-foreground">Diario</div><div className="text-money">{fmtMoney(e.salario_diario)}</div></div>
                      <div><div className="text-[10px] uppercase text-muted-foreground">SDI</div><div className="text-money">{fmtMoney(e.sdi)}</div></div>
                      <div><div className="text-[10px] uppercase text-muted-foreground">Periodicidad</div><div className="capitalize">{e.periodicidad}</div></div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Tabla — desktop */}
              <div className="hidden overflow-hidden rounded-lg border bg-card lg:block">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      {[
                        { key: 'numero', label: 'Núm.', align: 'left' },
                        { key: 'nombre', label: 'Nombre', align: 'left' },
                        { key: 'rfc', label: 'RFC', align: 'left' },
                        { key: 'puesto', label: 'Puesto', align: 'left' },
                        { key: 'periodicidad', label: 'Periodicidad', align: 'left' },
                        { key: 'salario_diario', label: 'Salario diario', align: 'right' },
                        { key: 'sdi', label: 'SDI', align: 'right' },
                        { key: 'fecha_alta', label: 'Alta', align: 'left' },
                        { key: 'estatus', label: 'Estatus', align: 'left' },
                      ].map(({ key, label, align }) => (
                        <th key={key} className={`px-3 py-2 text-${align} cursor-pointer select-none hover:text-foreground`}
                          onClick={() => setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })}>
                          {label} {sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                        </th>
                      ))}
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((e: any) => (
                      <tr key={e.id} className="hover:bg-secondary/30">
                        <td className="px-3 py-2 font-mono text-xs">{e.numero}</td>
                        <td className="px-3 py-2 font-medium">{[e.nombre, e.apellido_paterno, e.apellido_materno].filter(Boolean).join(" ")}</td>
                        <td className="px-3 py-2 font-mono text-xs">{e.rfc ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{e.puesto ?? "—"}</td>
                        <td className="px-3 py-2 capitalize">{e.periodicidad}</td>
                        <td className="px-3 py-2 text-right text-money">{fmtMoney(e.salario_diario)}</td>
                        <td className="px-3 py-2 text-right text-money">{fmtMoney(e.sdi)}</td>
                        <td className="px-3 py-2 text-xs">{fmtDate(e.fecha_alta)}</td>
                        <td className="px-3 py-2"><Badge status={e.estatus} /></td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => { setEditing(e); setOpen(true); }} className="rounded p-1 hover:bg-secondary"><Pencil className="h-3.5 w-3.5"/></button>
                            <button onClick={() => remove(e.id)} className="rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5"/></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
      </div>
      {open && <EmpForm initial={editing} onClose={() => { setOpen(false); setEditing(null); }} onSave={save} />}
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const map: any = {
    activo: "bg-success/15 text-success",
    baja: "bg-destructive/15 text-destructive",
    suspendido: "bg-warning/15 text-warning",
  };
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium capitalize ${map[status]}`}>{status}</span>;
}

function fmtDateInput(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return "";
}

function EmpForm({ initial, onClose, onSave }: { initial: any; onClose: () => void; onSave: (f: any) => void }) {
  const [f, setF] = useState({
    id: initial?.id,
    numero: initial?.numero ?? "",
    nombre: initial?.nombre ?? "",
    apellido_paterno: initial?.apellido_paterno ?? "",
    apellido_materno: initial?.apellido_materno ?? "",
    rfc: initial?.rfc ?? "",
    curp: initial?.curp ?? "",
    nss: initial?.nss ?? "",
    fecha_nacimiento: fmtDateInput(initial?.fecha_nacimiento),
    fecha_alta: fmtDateInput(initial?.fecha_alta) || new Date().toISOString().slice(0, 10),
    fecha_baja: fmtDateInput(initial?.fecha_baja),
    puesto: initial?.puesto ?? "",
    departamento: initial?.departamento ?? "",
    empresa: initial?.empresa ?? "",
    salario_diario: initial?.salario_diario ?? "",
    periodicidad: initial?.periodicidad ?? "quincenal",
    forma_pago: initial?.forma_pago ?? "transferencia",
    banco: initial?.banco ?? "",
    clabe: initial?.clabe ?? "",
    email: initial?.email ?? "",
    telefono: initial?.telefono ?? "",
    estatus: initial?.estatus ?? "activo",
    cp_fiscal: initial?.cp_fiscal ?? "",
    regimen_fiscal_receptor: initial?.regimen_fiscal_receptor ?? "605",
    tipo_regimen: initial?.tipo_regimen ?? "sueldos_salarios",
    riesgo_puesto: initial?.riesgo_puesto ?? "",
    infonavit_cuota_mensual: initial?.infonavit_cuota_mensual ?? "",
  });

  const sdiPreview = f.salario_diario ? calcSDI(Number(f.salario_diario)) : 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); onSave(f); }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg border bg-card p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{initial ? "Editar" : "Nuevo"} empleado</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-secondary"><X className="h-4 w-4"/></button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Input label="Núm." value={f.numero} onChange={(v) => setF({ ...f, numero: v })} required />
          <Input label="Nombre(s)" value={f.nombre} onChange={(v) => setF({ ...f, nombre: v })} required className="col-span-2"/>
          <Input label="Apellido paterno" value={f.apellido_paterno} onChange={(v) => setF({ ...f, apellido_paterno: v })} />
          <Input label="Apellido materno" value={f.apellido_materno} onChange={(v) => setF({ ...f, apellido_materno: v })} />
          <Input label="Empresa" value={f.empresa} onChange={(v) => setF({ ...f, empresa: v })} />
          <Input label="RFC" value={f.rfc} mono onChange={(v) => setF({ ...f, rfc: v.toUpperCase() })} />
          <Input label="CURP" value={f.curp} mono onChange={(v) => setF({ ...f, curp: v.toUpperCase() })} />
          <Input label="NSS" value={f.nss} mono onChange={(v) => setF({ ...f, nss: v })} />
          <Input label="Fecha de nacimiento" type="date" value={f.fecha_nacimiento} onChange={(v) => setF({ ...f, fecha_nacimiento: v })} />
          <Input label="Fecha de alta" type="date" value={f.fecha_alta} onChange={(v) => setF({ ...f, fecha_alta: v })} required />
          <Input label="Fecha de baja" type="date" value={f.fecha_baja} onChange={(v) => setF({ ...f, fecha_baja: v })} />
          <Input label="Puesto" value={f.puesto} onChange={(v) => setF({ ...f, puesto: v })} />
          <Input label="Departamento" value={f.departamento} onChange={(v) => setF({ ...f, departamento: v })} />
          <Select label="Periodicidad" value={f.periodicidad} options={[["semanal","Semanal"],["catorcenal","Catorcenal"],["quincenal","Quincenal"],["mensual","Mensual"]]} onChange={(v) => setF({ ...f, periodicidad: v })} />
          <Input label="Salario diario" type="number" step="0.01" value={f.salario_diario} mono onChange={(v) => setF({ ...f, salario_diario: v })} required />
          <Field label="SDI (cálculo)"><div className="rounded-md border bg-secondary/40 px-3 py-2 text-sm font-mono">{fmtMoney(sdiPreview)}</div></Field>
          <Select label="Forma de pago" value={f.forma_pago} options={[["transferencia","Transferencia"],["efectivo","Efectivo"],["cheque","Cheque"]]} onChange={(v) => setF({ ...f, forma_pago: v })} />
          <Input label="Banco" value={f.banco} onChange={(v) => setF({ ...f, banco: v })} />
          <Input label="CLABE" value={f.clabe} mono onChange={(v) => setF({ ...f, clabe: v })} />
          <Input label="Email" type="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} />
          <Input label="Teléfono" value={f.telefono} onChange={(v) => setF({ ...f, telefono: v })} />
          <Select label="Estatus" value={f.estatus} options={[["activo","Activo"],["baja","Baja"],["suspendido","Suspendido"]]} onChange={(v) => setF({ ...f, estatus: v })} />
          <Input label="CP Fiscal" value={f.cp_fiscal} mono onChange={(v) => setF({ ...f, cp_fiscal: v })} />
          <Input label="Régimen fiscal receptor" value={f.regimen_fiscal_receptor} mono onChange={(v) => setF({ ...f, regimen_fiscal_receptor: v })} />
          <Input label="Tipo régimen" value={f.tipo_regimen} onChange={(v) => setF({ ...f, tipo_regimen: v })} />
          <Input label="Riesgo puesto" type="number" step="0.00001" value={f.riesgo_puesto} mono onChange={(v) => setF({ ...f, riesgo_puesto: v })} />
          <Input label="INFONAVIT cuota mensual" type="number" step="0.01" value={f.infonavit_cuota_mensual} mono onChange={(v) => setF({ ...f, infonavit_cuota_mensual: v })} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-secondary">Cancelar</button>
          <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">Guardar</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: any) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>{children}</label>;
}
function Input({ label, value, onChange, required, type = "text", step, mono, className = "" }: { label: string; value: any; onChange: (v: string) => void; required?: boolean; type?: string; step?: string; mono?: boolean; className?: string }) {
  return (
    <Field label={label}>
      <input
        type={type}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={`w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring ${mono ? "font-mono" : ""} ${className}`}
      />
    </Field>
  );
}
function Select({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </Field>
  );
}
