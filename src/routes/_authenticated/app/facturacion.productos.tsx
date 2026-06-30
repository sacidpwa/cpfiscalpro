import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { listProducts, upsertProduct, deleteProduct, importProducts } from "@/lib/products.functions";
import { searchSatProducts, searchSatUnits } from "@/lib/sat-catalogs.functions";
import { useRequireOrg } from "@/lib/use-current-org";
import { PageHeader, EmptyState } from "@/components/app-ui";
import { ImportDialog } from "@/components/import-dialog";
import { fmtMoney } from "@/lib/format";
import { Package, Plus, Pencil, Trash2, X, Upload, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/facturacion/productos")({
  component: Productos,
});

function Productos() {
  const org = useRequireOrg();
  const qc = useQueryClient();
  const list = useServerFn(listProducts);
  const upsert = useServerFn(upsertProduct);
  const del = useServerFn(deleteProduct);
  const importFn = useServerFn(importProducts);
  const { data, isLoading } = useQuery({
    queryKey: ["products", org.id],
    queryFn: () => list({ data: { organizationId: org.id } }),
  });
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = (data ?? []).filter((p: any) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return [p.clave, p.descripcion, p.clave_prod_serv, p.sku]
      .filter(Boolean).some((v: string) => String(v).toLowerCase().includes(s));
  });

  async function save(form: any) {
    try {
      await upsert({ data: { ...form, organizationId: org.id } });
      toast.success("Producto guardado");
      qc.invalidateQueries({ queryKey: ["products", org.id] });
      setOpen(false); setEditing(null);
    } catch (e: any) { toast.error(e.message); }
  }
  async function remove(id: string) {
    if (!confirm("¿Eliminar producto?")) return;
    try {
      await del({ data: { id } });
      toast.success("Producto eliminado");
      qc.invalidateQueries({ queryKey: ["products", org.id] });
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div>
      <PageHeader
        title="Productos y servicios"
        description="Catálogo con claves SAT para facturación"
        actions={
          <>
            <button onClick={() => setImportOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-secondary">
              <Upload className="h-4 w-4" /> Importar
            </button>
            <button onClick={() => { setEditing(null); setOpen(true); }} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4" /> Nuevo
            </button>
          </>
        }
      />
      <div className="p-8">
        <div className="mb-4">
          <input
            type="search"
            placeholder="Buscar por clave, descripción, SAT, SKU…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full max-w-md rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : !data?.length ? (
          <EmptyState
            icon={Package}
            title="Sin productos"
            description="Agrega productos o servicios para usarlos en facturación."
            action={<button onClick={() => setOpen(true)} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Agregar</button>}
          />
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Clave</th>
                  <th className="px-3 py-2 text-left">Descripción</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-left">ClaveProdServ</th>
                  <th className="px-3 py-2 text-left">Unidad</th>
                  <th className="px-3 py-2 text-right">Precio</th>
                  <th className="px-3 py-2 text-right">IVA</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((p: any) => (
                  <tr key={p.id} className="hover:bg-secondary/30">
                    <td className="px-3 py-2 font-mono text-xs">{p.clave}</td>
                    <td className="px-3 py-2 font-medium">{p.descripcion}</td>
                    <td className="px-3 py-2 capitalize text-xs">{p.tipo}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.clave_prod_serv}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.clave_unidad}</td>
                    <td className="px-3 py-2 text-right text-money">{fmtMoney(p.precio_unitario)}</td>
                    <td className="px-3 py-2 text-right text-xs">
                      {p.iva_tipo === "exento" ? "Exento" : p.iva_tipo === "no_aplica" ? "N/A" : `${(p.iva_tasa * 100).toFixed(0)}%`}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => { setEditing(p); setOpen(true); }} className="rounded p-1 hover:bg-secondary"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => remove(p.id)} className="rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {open && <ProductForm initial={editing} organizationId={org.id} onClose={() => { setOpen(false); setEditing(null); }} onSave={save} />}
      {importOpen && (
        <ImportDialog
          title="Importar productos"
          templateHeaders={["clave", "descripcion", "tipo", "clave_prod_serv", "clave_unidad", "unidad", "precio_unitario", "iva_tipo", "iva_tasa", "ieps_tasa", "ret_iva_tasa", "ret_isr_tasa", "sku"]}
          templateFile="plantilla-productos.csv"
          onImport={async (args) => await importFn({ data: { organizationId: org.id, ...args } })}
          onClose={() => setImportOpen(false)}
          onDone={() => qc.invalidateQueries({ queryKey: ["products", org.id] })}
        />
      )}
    </div>
  );
}

function ProductForm({ initial, organizationId, onClose, onSave }: { initial: any; organizationId: string; onClose: () => void; onSave: (f: any) => void }) {
  const [f, setF] = useState({
    id: initial?.id,
    clave: initial?.clave ?? "",
    descripcion: initial?.descripcion ?? "",
    tipo: initial?.tipo ?? "producto",
    clave_prod_serv: initial?.clave_prod_serv ?? "01010101",
    clave_unidad: initial?.clave_unidad ?? "H87",
    unidad: initial?.unidad ?? "Pieza",
    precio_unitario: initial?.precio_unitario ?? 0,
    moneda: initial?.moneda ?? "MXN",
    iva_tipo: initial?.iva_tipo ?? "tasa",
    iva_tasa: initial?.iva_tasa ?? 0.16,
    ieps_tasa: initial?.ieps_tasa ?? 0,
    ret_iva_tasa: initial?.ret_iva_tasa ?? 0,
    ret_isr_tasa: initial?.ret_isr_tasa ?? 0,
    objeto_imp: initial?.objeto_imp ?? "02",
    sku: initial?.sku ?? "",
    activo: initial?.activo ?? true,
  });
  const [satOpen, setSatOpen] = useState(false);
  const [unitOpen, setUnitOpen] = useState(false);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); onSave(f); }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg border bg-card p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{initial ? "Editar" : "Nuevo"} producto/servicio</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Input label="Clave interna" value={f.clave} mono onChange={(v) => setF({ ...f, clave: v })} required />
          <Input label="Descripción" value={f.descripcion} onChange={(v) => setF({ ...f, descripcion: v })} required className="col-span-2" />
          <Select label="Tipo" value={f.tipo} options={[["producto", "Producto"], ["servicio", "Servicio"]]} onChange={(v) => setF({ ...f, tipo: v })} />
          <Field label="ClaveProdServ SAT" className="col-span-2">
            <div className="flex gap-1">
              <input
                value={f.clave_prod_serv}
                onChange={(e) => setF({ ...f, clave_prod_serv: e.target.value })}
                required
                className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button type="button" onClick={() => setSatOpen(true)} className="inline-flex shrink-0 items-center gap-1 rounded-md border bg-card px-2 text-xs hover:bg-secondary">
                <Search className="h-3.5 w-3.5" /> Buscar SAT
              </button>
            </div>
          </Field>
          <Field label="ClaveUnidad SAT">
            <div className="flex gap-1">
              <input
                value={f.clave_unidad}
                onChange={(e) => setF({ ...f, clave_unidad: e.target.value.toUpperCase() })}
                required
                className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button type="button" onClick={() => setUnitOpen(true)} className="inline-flex shrink-0 items-center gap-1 rounded-md border bg-card px-2 text-xs hover:bg-secondary">
                <Search className="h-3.5 w-3.5" />
              </button>
            </div>
          </Field>
          <Input label="Unidad (descripción)" value={f.unidad} onChange={(v) => setF({ ...f, unidad: v })} />
          <Input label="Precio unitario" type="number" step="0.0001" value={f.precio_unitario} mono onChange={(v) => setF({ ...f, precio_unitario: Number(v) || 0 })} required />
          <Input label="Moneda" value={f.moneda} mono onChange={(v) => setF({ ...f, moneda: v.toUpperCase() })} />
          <Select label="Objeto Impuesto" value={f.objeto_imp} options={[["01", "01 - No objeto"], ["02", "02 - Sí objeto"], ["03", "03 - Sí objeto, no desglose"], ["04", "04 - Sí objeto, IEPS no desglose"]]} onChange={(v) => setF({ ...f, objeto_imp: v })} />
          <Select label="IVA" value={f.iva_tipo} options={[["tasa", "Tasa"], ["exento", "Exento"], ["no_aplica", "No aplica"]]} onChange={(v) => setF({ ...f, iva_tipo: v })} />
          {f.iva_tipo === "tasa" && (
            <Select label="Tasa IVA" value={String(f.iva_tasa)} options={[["0.16", "16%"], ["0.08", "8% frontera"], ["0", "0%"]]} onChange={(v) => setF({ ...f, iva_tasa: Number(v) })} />
          )}
          <Input label="IEPS %" type="number" step="0.01" value={f.ieps_tasa * 100} mono onChange={(v) => setF({ ...f, ieps_tasa: (Number(v) || 0) / 100 })} />
          <Input label="Ret. IVA %" type="number" step="0.01" value={f.ret_iva_tasa * 100} mono onChange={(v) => setF({ ...f, ret_iva_tasa: (Number(v) || 0) / 100 })} />
          <Input label="Ret. ISR %" type="number" step="0.01" value={f.ret_isr_tasa * 100} mono onChange={(v) => setF({ ...f, ret_isr_tasa: (Number(v) || 0) / 100 })} />
          <Input label="SKU" value={f.sku} mono onChange={(v) => setF({ ...f, sku: v })} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Usa "Buscar SAT" para encontrar la ClaveProdServ exacta del catálogo oficial. Si no la conoces, <span className="font-mono">01010101</span> funciona como genérico.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-secondary">Cancelar</button>
          <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">Guardar</button>
        </div>
      </form>
      {satOpen && (
        <SatSearchDialog
          title="Buscar ClaveProdServ SAT"
          initialQuery={f.descripcion}
          organizationId={organizationId}
          mode="products"
          onClose={() => setSatOpen(false)}
          onPick={(item) => {
            setF((prev) => ({ ...prev, clave_prod_serv: item.key, descripcion: prev.descripcion || item.label }));
            setSatOpen(false);
          }}
        />
      )}
      {unitOpen && (
        <SatSearchDialog
          title="Buscar ClaveUnidad SAT"
          initialQuery={f.unidad}
          organizationId={organizationId}
          mode="units"
          onClose={() => setUnitOpen(false)}
          onPick={(item) => {
            setF((prev) => ({ ...prev, clave_unidad: item.key, unidad: prev.unidad || item.label }));
            setUnitOpen(false);
          }}
        />
      )}
    </div>
  );
}

function SatSearchDialog({ title, initialQuery, organizationId, mode, onClose, onPick }: {
  title: string;
  initialQuery: string;
  organizationId: string;
  mode: "products" | "units";
  onClose: () => void;
  onPick: (item: { key: string; label: string }) => void;
}) {
  const [q, setQ] = useState(initialQuery ?? "");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ key: string; label: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const searchProds = useServerFn(searchSatProducts);
  const searchUnits = useServerFn(searchSatUnits);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    const id = setTimeout(async () => {
      setLoading(true); setError(null);
      try {
        if (mode === "products") {
          const r = await searchProds({ data: { organizationId, q: term } });
          setResults(r.map((x: any) => ({ key: x.key, label: x.description })));
        } else {
          const r = await searchUnits({ data: { organizationId, q: term } });
          setResults(r.map((x: any) => ({ key: x.key, label: [x.name, x.symbol].filter(Boolean).join(" · ") })));
        }
      } catch (e: any) {
        setError(e.message ?? "Error al buscar");
        setResults([]);
      } finally { setLoading(false); }
    }, 350);
    return () => clearTimeout(id);
  }, [q, mode, organizationId, searchProds, searchUnits]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border bg-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <div className="border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={mode === "products" ? "Ej: laptop, asesoría contable, software…" : "Ej: pieza, kilogramo, hora…"}
              className="w-full rounded-md border bg-background py-2 pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {loading && <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {error ? (
            <p className="p-4 text-sm text-destructive">{error}</p>
          ) : q.trim().length < 2 ? (
            <p className="p-4 text-sm text-muted-foreground">Escribe al menos 2 caracteres para buscar en el catálogo SAT.</p>
          ) : !loading && results.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Sin resultados.</p>
          ) : (
            <ul className="divide-y">
              {results.map((r) => (
                <li key={r.key}>
                  <button
                    type="button"
                    onClick={() => onPick(r)}
                    className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-secondary/60"
                  >
                    <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">{r.key}</span>
                    <span className="text-sm">{r.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, className = "" }: any) {
  return <label className={`block ${className}`}><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>{children}</label>;
}
function Input({ label, value, onChange, required, type = "text", step, mono, className = "" }: { label: string; value: any; onChange: (v: string) => void; required?: boolean; type?: string; step?: string; mono?: boolean; className?: string }) {
  return (
    <Field label={label} className={className}>
      <input
        type={type}
        step={step}
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
