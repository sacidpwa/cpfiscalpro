import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listCustomers, upsertCustomer, deleteCustomer, importCustomers, importCustomersFromCfdiXml } from "@/lib/customers.functions";
import { useRequireOrg } from "@/lib/use-current-org";
import { PageHeader, EmptyState } from "@/components/app-ui";
import { ImportDialog } from "@/components/import-dialog";
import { Users, Plus, Pencil, Trash2, X, Upload, FileCode2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/facturacion/clientes")({
  component: Clientes,
});

function Clientes() {
  const org = useRequireOrg();
  const qc = useQueryClient();
  const list = useServerFn(listCustomers);
  const upsert = useServerFn(upsertCustomer);
  const del = useServerFn(deleteCustomer);
  const importFn = useServerFn(importCustomers);
  const importXmlFn = useServerFn(importCustomersFromCfdiXml);
  const { data, isLoading } = useQuery({
    queryKey: ["customers", org.id],
    queryFn: () => list({ data: { organizationId: org.id } }),
  });
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [q, setQ] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [importingXml, setImportingXml] = useState(false);

  async function handleXmlDrop(fileList: FileList | File[]) {
    const all = Array.from(fileList);
    const xmls = all.filter((f) => /\.xml$/i.test(f.name));
    const pdfs = all.filter((f) => /\.pdf$/i.test(f.name));
    if (pdfs.length && !xmls.length) {
      toast.error("Solo se pueden leer XML. Sube el XML del CFDI (el PDF no contiene los datos fiscales estructurados).");
      return;
    }
    if (!xmls.length) {
      toast.error("Arrastra archivos .xml de CFDI");
      return;
    }
    setImportingXml(true);
    const t = toast.loading(`Leyendo ${xmls.length} XML…`);
    try {
      const files = await Promise.all(
        xmls.map(async (f) => ({ name: f.name, content: await f.text() })),
      );
      const res: any = await importXmlFn({ data: { organizationId: org.id, files } });
      const parts = [
        `${res.created} nuevos`,
        `${res.updated} actualizados`,
        `${res.skipped} omitidos`,
        `${res.itemsSaved ?? 0} conceptos guardados`,
      ];
      toast.success(`Importación XML: ${parts.join(" · ")}`, { id: t, duration: 6000 });
      if (res.errors?.length) {
        toast.error(`Errores: ${res.errors[0]}${res.errors.length > 1 ? ` (+${res.errors.length - 1} más)` : ""}`);
      }
      qc.invalidateQueries({ queryKey: ["customers", org.id] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falló la importación", { id: t });
    } finally {
      setImportingXml(false);
    }
  }

  const filtered = (data ?? []).filter((c: any) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return [c.rfc, c.razon_social, c.nombre_comercial, c.email, c.codigo_postal]
      .filter(Boolean).some((v: string) => String(v).toLowerCase().includes(s));
  });

  async function save(form: any) {
    try {
      await upsert({ data: { ...form, organizationId: org.id } });
      toast.success("Cliente guardado");
      qc.invalidateQueries({ queryKey: ["customers", org.id] });
      setOpen(false); setEditing(null);
    } catch (e: any) { toast.error(e.message); }
  }
  async function remove(id: string) {
    if (!confirm("¿Eliminar cliente?")) return;
    try {
      await del({ data: { id } });
      toast.success("Cliente eliminado");
      qc.invalidateQueries({ queryKey: ["customers", org.id] });
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Catálogo de clientes para facturación"
        actions={
          <>
            <button
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-secondary"
            >
              <Upload className="h-4 w-4" /> Importar
            </button>
            <button
              onClick={() => { setEditing(null); setOpen(true); }}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Nuevo
            </button>
          </>
        }
      />
      <div className="p-8">
        <div className="mb-4">
          <input
            type="search"
            placeholder="Buscar por RFC, razón social, email, CP…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full max-w-md rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <label
          onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setDragOver(true); }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) handleXmlDrop(e.dataTransfer.files);
          }}
          className={`mb-4 flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-4 text-sm transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border bg-secondary/30 hover:bg-secondary/50"} ${importingXml ? "pointer-events-none opacity-60" : ""}`}
        >
          <FileCode2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            {importingXml ? "Importando…" : "Arrastra aquí XML de CFDI para dar de alta a sus receptores como clientes"}
          </span>
          <input
            type="file"
            accept=".xml,application/xml,text/xml"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) handleXmlDrop(e.target.files); e.currentTarget.value = ""; }}
          />
        </label>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : !data?.length ? (
          <EmptyState
            icon={Users}
            title="Sin clientes"
            description="Agrega tu primer cliente para empezar a facturar."
            action={
              <button onClick={() => setOpen(true)} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
                Agregar cliente
              </button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">RFC</th>
                  <th className="px-3 py-2 text-left">Razón social</th>
                  <th className="px-3 py-2 text-left">Régimen</th>
                  <th className="px-3 py-2 text-left">Uso CFDI</th>
                  <th className="px-3 py-2 text-left">CP</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Método</th>
                  <th className="px-3 py-2 text-right">Crédito</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((c: any) => (
                  <tr key={c.id} className="hover:bg-secondary/30">
                    <td className="px-3 py-2 font-mono text-xs">{c.rfc}</td>
                    <td className="px-3 py-2 font-medium">{c.razon_social}</td>
                    <td className="px-3 py-2 font-mono text-xs">{c.regimen_fiscal}</td>
                    <td className="px-3 py-2 font-mono text-xs">{c.uso_cfdi_default}</td>
                    <td className="px-3 py-2 font-mono text-xs">{c.codigo_postal}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{c.email ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{c.metodo_pago_default}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">{c.dias_credito}d</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => { setEditing(c); setOpen(true); }} className="rounded p-1 hover:bg-secondary"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => remove(c.id)} className="rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {open && <CustomerForm initial={editing} onClose={() => { setOpen(false); setEditing(null); }} onSave={save} />}
      {importOpen && (
        <ImportDialog
          title="Importar clientes"
          templateHeaders={["rfc", "razon_social", "regimen_fiscal", "uso_cfdi", "codigo_postal", "email", "telefono", "calle", "num_exterior", "colonia", "municipio", "estado", "metodo_pago", "dias_credito"]}
          templateFile="plantilla-clientes.csv"
          onImport={async (args) => await importFn({ data: { organizationId: org.id, ...args } })}
          onClose={() => setImportOpen(false)}
          onDone={() => qc.invalidateQueries({ queryKey: ["customers", org.id] })}
        />
      )}
    </div>
  );
}

function CustomerForm({ initial, onClose, onSave }: { initial: any; onClose: () => void; onSave: (f: any) => void }) {
  const [f, setF] = useState({
    id: initial?.id,
    rfc: initial?.rfc ?? "",
    razon_social: initial?.razon_social ?? "",
    nombre_comercial: initial?.nombre_comercial ?? "",
    regimen_fiscal: initial?.regimen_fiscal ?? "616",
    uso_cfdi_default: initial?.uso_cfdi_default ?? "G03",
    codigo_postal: initial?.codigo_postal ?? "",
    email: initial?.email ?? "",
    telefono: initial?.telefono ?? "",
    calle: initial?.calle ?? "",
    num_exterior: initial?.num_exterior ?? "",
    num_interior: initial?.num_interior ?? "",
    colonia: initial?.colonia ?? "",
    municipio: initial?.municipio ?? "",
    estado: initial?.estado ?? "",
    pais: initial?.pais ?? "MEX",
    moneda: initial?.moneda ?? "MXN",
    dias_credito: initial?.dias_credito ?? 0,
    metodo_pago_default: initial?.metodo_pago_default ?? "PUE",
    forma_pago_default: initial?.forma_pago_default ?? "",
    notas: initial?.notas ?? "",
    activo: initial?.activo ?? true,
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); onSave(f); }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg border bg-card p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{initial ? "Editar" : "Nuevo"} cliente</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Input label="RFC" value={f.rfc} mono onChange={(v) => setF({ ...f, rfc: v.toUpperCase() })} required />
          <Input label="Razón social" value={f.razon_social} onChange={(v) => setF({ ...f, razon_social: v })} required className="col-span-2" />
          <Input label="Nombre comercial" value={f.nombre_comercial} onChange={(v) => setF({ ...f, nombre_comercial: v })} className="col-span-2" />
          <Select label="Régimen fiscal" value={f.regimen_fiscal} options={REGIMENES} onChange={(v) => setF({ ...f, regimen_fiscal: v })} />
          <Select label="Uso CFDI" value={f.uso_cfdi_default} options={USOS_CFDI} onChange={(v) => setF({ ...f, uso_cfdi_default: v })} />
          <Input label="CP fiscal" value={f.codigo_postal} mono onChange={(v) => setF({ ...f, codigo_postal: v })} required />
          <Input label="Email" type="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} />
          <Input label="Teléfono" value={f.telefono} onChange={(v) => setF({ ...f, telefono: v })} />
          <Select label="Método de pago" value={f.metodo_pago_default} options={[["PUE", "PUE - Pago en una exhibición"], ["PPD", "PPD - Pago en parcialidades"]]} onChange={(v) => setF({ ...f, metodo_pago_default: v })} />
          <Input label="Días de crédito" type="number" value={f.dias_credito} mono onChange={(v) => setF({ ...f, dias_credito: Number(v) || 0 })} />
          <Input label="Moneda" value={f.moneda} mono onChange={(v) => setF({ ...f, moneda: v.toUpperCase() })} />
          <Input label="Calle" value={f.calle} onChange={(v) => setF({ ...f, calle: v })} className="col-span-2" />
          <Input label="Núm. ext" value={f.num_exterior} onChange={(v) => setF({ ...f, num_exterior: v })} />
          <Input label="Núm. int" value={f.num_interior} onChange={(v) => setF({ ...f, num_interior: v })} />
          <Input label="Colonia" value={f.colonia} onChange={(v) => setF({ ...f, colonia: v })} />
          <Input label="Municipio" value={f.municipio} onChange={(v) => setF({ ...f, municipio: v })} />
          <Input label="Estado" value={f.estado} onChange={(v) => setF({ ...f, estado: v })} />
          <Field label="Notas" className="col-span-3">
            <textarea value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} rows={2} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-secondary">Cancelar</button>
          <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">Guardar</button>
        </div>
      </form>
    </div>
  );
}

const REGIMENES: [string, string][] = [
  ["601", "601 - General Personas Morales"],
  ["603", "603 - Personas Morales con Fines no Lucrativos"],
  ["605", "605 - Sueldos y Salarios"],
  ["606", "606 - Arrendamiento"],
  ["608", "608 - Demás ingresos"],
  ["610", "610 - Residentes en el extranjero"],
  ["611", "611 - Ingresos por Dividendos"],
  ["612", "612 - Personas Físicas Actividades Empresariales"],
  ["614", "614 - Ingresos por intereses"],
  ["615", "615 - Régimen de los ingresos por obtención de premios"],
  ["616", "616 - Sin obligaciones fiscales"],
  ["620", "620 - Sociedades Cooperativas de Producción"],
  ["621", "621 - Incorporación Fiscal"],
  ["622", "622 - Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras"],
  ["623", "623 - Opcional para Grupos de Sociedades"],
  ["624", "624 - Coordinados"],
  ["625", "625 - Actividades Empresariales Plataformas Tecnológicas"],
  ["626", "626 - RESICO"],
];

const USOS_CFDI: [string, string][] = [
  ["G01", "G01 - Adquisición de mercancías"],
  ["G02", "G02 - Devoluciones, descuentos o bonificaciones"],
  ["G03", "G03 - Gastos en general"],
  ["I01", "I01 - Construcciones"],
  ["I02", "I02 - Mobiliario y equipo de oficina"],
  ["I03", "I03 - Equipo de transporte"],
  ["I04", "I04 - Equipo de cómputo"],
  ["I08", "I08 - Otra maquinaria y equipo"],
  ["D01", "D01 - Honorarios médicos"],
  ["D02", "D02 - Gastos médicos por incapacidad"],
  ["D03", "D03 - Gastos funerales"],
  ["D04", "D04 - Donativos"],
  ["D10", "D10 - Pagos por servicios educativos"],
  ["S01", "S01 - Sin efectos fiscales"],
  ["CP01", "CP01 - Pagos"],
  ["CN01", "CN01 - Nómina"],
];

function Field({ label, children, className = "" }: any) {
  return <label className={`block ${className}`}><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>{children}</label>;
}
function Input({ label, value, onChange, required, type = "text", mono, className = "" }: { label: string; value: any; onChange: (v: string) => void; required?: boolean; type?: string; mono?: boolean; className?: string }) {
  return (
    <Field label={label} className={className}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={`w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring ${mono ? "font-mono" : ""}`}
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
