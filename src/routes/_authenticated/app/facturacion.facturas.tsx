import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, Fragment } from "react";
import { listCustomers, listCustomerItems } from "@/lib/customers.functions";
import { listProducts, upsertProduct } from "@/lib/products.functions";
import { listInvoices, stampIncomeInvoice, cancelInvoice, importInvoicesFromFacturapi } from "@/lib/invoices.functions";
import { getCfdiDownloadUrl } from "@/lib/cfdi.functions";
import { emailStampedComplement, emailStampedBatch } from "@/lib/email.functions";
import { searchSatProducts, searchSatUnits } from "@/lib/sat-catalogs.functions";
import { useRequireOrg } from "@/lib/use-current-org";
import { PageHeader, EmptyState } from "@/components/app-ui";
import { fmtMoney } from "@/lib/format";
import { FileText, Plus, X, Download, Trash2, Loader2, Receipt, RefreshCw, Search, Mail } from "lucide-react";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/app/facturacion/facturas")({
  component: Facturas,
});

const USO_CFDI = [
  ["G01", "G01 - Adquisición de mercancías"],
  ["G03", "G03 - Gastos en general"],
  ["P01", "P01 - Por definir"],
  ["I01", "I01 - Construcciones"],
  ["I02", "I02 - Mobiliario y equipo de oficina"],
  ["I04", "I04 - Equipo de cómputo"],
  ["I08", "I08 - Otra maquinaria"],
  ["D01", "D01 - Honorarios médicos"],
  ["S01", "S01 - Sin efectos fiscales"],
  ["CP01", "CP01 - Pagos"],
] as const;

const FORMA_PAGO = [
  ["01", "01 - Efectivo"],
  ["02", "02 - Cheque nominativo"],
  ["03", "03 - Transferencia electrónica"],
  ["04", "04 - Tarjeta de crédito"],
  ["28", "28 - Tarjeta de débito"],
  ["99", "99 - Por definir"],
] as const;

function Facturas() {
  const org = useRequireOrg();
  const qc = useQueryClient();
  const list = useServerFn(listInvoices);
  const cancel = useServerFn(cancelInvoice);
  const getUrl = useServerFn(getCfdiDownloadUrl);
  const emailFn = useServerFn(emailStampedComplement);
  const emailBatchFn = useServerFn(emailStampedBatch);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const importFn = useServerFn(importInvoicesFromFacturapi);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["invoices", org.id],
    queryFn: () => list({ data: { organizationId: org.id } }),
  });
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  // Filtros
  const [q, setQ] = useState("");
  const [estatus, setEstatus] = useState<"todos" | "timbrado" | "cancelado" | "error">("timbrado");
  const [ambiente, setAmbiente] = useState<"todos" | "live" | "test">("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  async function sync(silent = false) {
    setSyncing(true);
    try {
      const r: any = await importFn({ data: { organizationId: org.id, limit: 100, pages: 10 } });
      setLastSync(new Date());
      if (!silent && r?.imported > 0) toast.success(`Sincronizadas ${r.imported} facturas`);
      if (!silent && r?.failed > 0) toast.error(`${r.failed} facturas no se pudieron guardar localmente`);
      qc.invalidateQueries({ queryKey: ["invoices", org.id] });
    } catch (e: any) {
      if (!silent) toast.error(`No se pudo sincronizar: ${e.message}`);
    } finally { setSyncing(false); }
  }

  // Auto-sync al montar
  useEffect(() => { sync(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [org.id]);

  const filtered = useMemo(() => {
    const rows: any[] = data ?? [];
    const term = q.trim().toLowerCase();
    return rows.filter((s) => {
      if (estatus !== "todos" && s.estatus !== estatus) return false;
      if (ambiente !== "todos" && s.ambiente !== ambiente) return false;
      const fecha = (s.fecha_timbrado ?? s.created_at)?.slice(0, 10);
      if (desde && fecha && fecha < desde) return false;
      if (hasta && fecha && fecha > hasta) return false;
      if (term) {
        const hay = [s.uuid_sat, s.serie, s.folio, s.payload?.response?.customer?.legal_name, s.payload?.response?.customer?.tax_id, String(s.total ?? "")]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [data, q, estatus, ambiente, desde, hasta]);

  async function download(stampId: string, kind: "xml" | "pdf") {
    try {
      const r = await getUrl({ data: { stampId, kind } });
      window.open(r.url, "_blank");
    } catch (e: any) { toast.error(e.message); }
  }
  async function doCancel(stampId: string) {
    const motivo = prompt("Motivo de cancelación (01,02,03,04). 02=No se llevó a cabo la operación", "02");
    if (!motivo) return;
    try {
      await cancel({ data: { stampId, motivo: motivo as any } });
      toast.success("Cancelación enviada");
      qc.invalidateQueries({ queryKey: ["invoices", org.id] });
    } catch (e: any) { toast.error(e.message); }
  }
  async function sendByEmail(s: any) {
    const suggested =
      s?.payload?.customer?.email ||
      s?.payload?.request?.customer?.email ||
      s?.payload?.receiver?.email ||
      "";
    const input = window.prompt("Correo(s) destinatario (separa con coma para varios):", suggested);
    if (!input) return;
    const to = input.split(",").map((x) => x.trim()).filter(Boolean);
    if (!to.length) return;
    const t = toast.loading("Enviando correo…");
    try {
      await emailFn({ data: { stampId: s.id, to } });
      toast.success(`Correo enviado a ${to.join(", ")}`, { id: t });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo enviar", { id: t });
    }
  }

  const rfcOf = (s: any) =>
    (s?.payload?.customer?.tax_id ||
      s?.payload?.request?.customer?.tax_id ||
      s?.payload?.receiver?.rfc ||
      "").toString().toUpperCase().trim();
  const emailOf = (s: any) =>
    s?.payload?.customer?.email ||
    s?.payload?.request?.customer?.email ||
    s?.payload?.receiver?.email ||
    "";

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  const selectedRows = useMemo(
    () => (data ?? []).filter((s: any) => selected.has(s.id) && s.estatus === "timbrado"),
    [data, selected],
  );
  const selectedRfcs = useMemo(
    () => new Set(selectedRows.map(rfcOf).filter(Boolean)),
    [selectedRows],
  );
  const sameRfc = selectedRfcs.size <= 1;

  async function sendBatch() {
    if (!selectedRows.length) return;
    if (!sameRfc) { toast.error("Las facturas seleccionadas deben ser del mismo RFC"); return; }
    const suggested = emailOf(selectedRows[0]);
    const input = window.prompt(
      `Enviar ${selectedRows.length} facturas (RFC ${[...selectedRfcs][0] || "—"}). Correo(s) destinatario (coma para varios):`,
      suggested,
    );
    if (!input) return;
    const to = input.split(",").map((x) => x.trim()).filter(Boolean);
    if (!to.length) return;
    const t = toast.loading(`Enviando ${selectedRows.length} facturas…`);
    try {
      const r: any = await emailBatchFn({ data: { stampIds: selectedRows.map((s: any) => s.id), to } });
      toast.success(`Enviadas ${r.count} facturas a ${to.join(", ")}`, { id: t });
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo enviar", { id: t });
    }
  }


  return (
    <div>
      <PageHeader
        title="Facturas de ingreso"
        description="Emite y administra CFDI tipo Ingreso"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => { sync(false); refetch(); }}
              disabled={syncing}
              title={lastSync ? `Última sincronización: ${lastSync.toLocaleTimeString()}` : "Sincronizar con FacturAPI"}
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm font-medium hover:bg-secondary disabled:opacity-60"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Actualizar
            </button>
            <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4" /> Nueva factura
            </button>
          </div>
        }
      />
      <div className="space-y-4 p-8">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <div className="relative col-span-2 md:col-span-2">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar UUID, serie/folio, cliente, RFC, total…"
              className="w-full rounded-md border bg-background py-2 pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <select value={estatus} onChange={(e) => setEstatus(e.target.value as any)} className="rounded-md border bg-background px-2 py-2 text-sm">
            <option value="todos">Todos los estatus</option>
            <option value="timbrado">Timbradas</option>
            <option value="cancelado">Canceladas</option>
            <option value="error">Con error</option>
          </select>
          <select value={ambiente} onChange={(e) => setAmbiente(e.target.value as any)} className="rounded-md border bg-background px-2 py-2 text-sm">
            <option value="todos">Todos los ambientes</option>
            <option value="live">Producción (live)</option>
            <option value="test">Sandbox (test)</option>
          </select>
          <div className="col-span-2 grid grid-cols-2 gap-2 md:col-span-1">
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-md border bg-background px-2 py-2 text-xs" title="Desde" />
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-md border bg-background px-2 py-2 text-xs" title="Hasta" />
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : !filtered.length ? (
          <EmptyState
            icon={Receipt}
            title={data?.length ? "Sin resultados con esos filtros" : "Sin facturas"}
            description={data?.length ? "Ajusta los filtros para ver más resultados." : "Aún no hay facturas. Al abrir esta pantalla se sincroniza con FacturAPI automáticamente."}
            action={!data?.length ? <button onClick={() => setOpen(true)} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Emitir primera</button> : undefined}
          />
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            {selectedRows.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-secondary/40 px-3 py-2 text-xs">
                <div>
                  <strong>{selectedRows.length}</strong> seleccionadas
                  {selectedRfcs.size === 1 && <span className="ml-2 text-muted-foreground">RFC {String([...selectedRfcs][0] ?? "")}</span>}
                  {!sameRfc && <span className="ml-2 text-destructive">⚠ Distintos RFC (se requiere mismo RFC)</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setSelected(new Set())} className="rounded-md border bg-card px-2 py-1 hover:bg-secondary">Limpiar</button>
                  <button onClick={sendBatch} disabled={!sameRfc} className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                    <Mail className="h-3.5 w-3.5" /> Enviar en un correo
                  </button>
                </div>
              </div>
            )}
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-8 px-2 py-2">
                    <input
                      type="checkbox"
                      checked={filtered.filter((s: any) => s.estatus === "timbrado").length > 0 && filtered.filter((s: any) => s.estatus === "timbrado").every((s: any) => selected.has(s.id))}
                      onChange={(e) => {
                        const ids = filtered.filter((s: any) => s.estatus === "timbrado").map((s: any) => s.id);
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) ids.forEach((id: string) => next.add(id));
                          else ids.forEach((id: string) => next.delete(id));
                          return next;
                        });
                      }}
                    />
                  </th>
                  <th className="px-3 py-2 text-left">Fecha</th>
                  <th className="px-3 py-2 text-left">Serie/Folio</th>
                  <th className="px-3 py-2 text-left">UUID</th>
                  <th className="px-3 py-2 text-left">RFC</th>
                  <th className="px-3 py-2 text-left">Ambiente</th>
                  <th className="px-3 py-2 text-left">Estatus</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((s: any) => (
                  <tr key={s.id} className="hover:bg-secondary/30">
                    <td className="px-2 py-2">
                      {s.estatus === "timbrado" && (
                        <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{(s.fecha_timbrado ?? s.created_at)?.slice(0, 16).replace("T", " ")}</td>
                    <td className="px-3 py-2 font-mono text-xs">{[s.serie, s.folio].filter(Boolean).join("-") || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{s.uuid_sat ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{rfcOf(s) || "—"}</td>

                    <td className="px-3 py-2 text-xs"><span className={`rounded px-1.5 py-0.5 ${s.ambiente === "live" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>{s.ambiente}</span></td>
                    <td className="px-3 py-2 text-xs">
                      <span className={`rounded px-1.5 py-0.5 ${s.estatus === "timbrado" ? "bg-emerald-500/10 text-emerald-600" : s.estatus === "cancelado" ? "bg-muted text-muted-foreground" : "bg-destructive/10 text-destructive"}`}>{s.estatus}</span>
                      {s.error_message && <p className="mt-0.5 max-w-xs truncate text-[10px] text-destructive" title={s.error_message}>{s.error_message}</p>}
                    </td>
                    <td className="px-3 py-2 text-right text-money">{fmtMoney(s.total ?? 0)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        {s.estatus === "timbrado" && <button onClick={() => sendByEmail(s)} title="Enviar por correo" className="rounded p-1 hover:bg-secondary"><Mail className="h-3.5 w-3.5" /></button>}
                        {s.pdf_path && <button onClick={() => download(s.id, "pdf")} title="PDF" className="rounded p-1 hover:bg-secondary"><Download className="h-3.5 w-3.5" /></button>}
                        {s.xml_path && <button onClick={() => download(s.id, "xml")} title="XML" className="rounded px-1.5 py-0.5 text-[10px] font-mono hover:bg-secondary">XML</button>}
                        {s.estatus === "timbrado" && (s.payload?.request?.payment_method ?? s.payload?.response?.payment_method) === "PPD" && (
                          <Link to="/app/facturacion/complementos" search={{ pagoOrigen: s.id }} title="Generar complemento de pago" className="rounded px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10">+Pago</Link>
                        )}
                        {s.estatus === "timbrado" && <button onClick={() => doCancel(s.id)} title="Cancelar" className="rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {open && <InvoiceForm organizationId={org.id} onClose={() => setOpen(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ["invoices", org.id] }); setOpen(false); }} />}
    </div>
  );
}

function InvoiceForm({ organizationId, onClose, onSaved }: { organizationId: string; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const listCust = useServerFn(listCustomers);
  const listProds = useServerFn(listProducts);
  const listItems = useServerFn(listCustomerItems);
  const upsertProd = useServerFn(upsertProduct);
  const stamp = useServerFn(stampIncomeInvoice);
  const { data: customers } = useQuery({
    queryKey: ["customers", organizationId],
    queryFn: () => listCust({ data: { organizationId } }),
  });
  const { data: products } = useQuery({
    queryKey: ["products", organizationId],
    queryFn: () => listProds({ data: { organizationId } }),
  });

  const [customerId, setCustomerId] = useState("");
  const [usoCfdi, setUsoCfdi] = useState("G03");
  const [formaPago, setFormaPago] = useState("03");
  const [metodoPago, setMetodoPago] = useState<"PUE" | "PPD">("PUE");
  const [serie, setSerie] = useState("");
  const [moneda, setMoneda] = useState("MXN");
  // ref: "p:<uuid>" producto del catálogo · "c:<uuid>" concepto guardado del cliente
  const [items, setItems] = useState<{ ref: string; cantidad: number; descuento: number; descripcion?: string; precio_unitario?: number }[]>([{ ref: "", cantidad: 1, descuento: 0 }]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Nuevo concepto inline
  const [newItemRow, setNewItemRow] = useState<number | null>(null);
  const [newItemForm, setNewItemForm] = useState({
    clave_prod_serv: "",
    descripcion: "",
    clave_unidad: "E48",
    unidad: "Unidad de servicio",
    precio_unitario: "",
    iva_tasa: "0.16",
    tipo: "servicio" as "producto" | "servicio",
  });
  const [savingNewItem, setSavingNewItem] = useState(false);

  const customer = useMemo(() => (customers ?? []).find((c: any) => c.id === customerId), [customers, customerId]);

  const { data: customerItems } = useQuery({
    queryKey: ["customer-items", customerId],
    queryFn: () => listItems({ data: { customerId } }),
    enabled: !!customerId,
  });

  // Set defaults when customer changes
  function pickCustomer(id: string) {
    setCustomerId(id);
    setItems([{ ref: "", cantidad: 1, descuento: 0 }]);
    setNewItemRow(null);
    // Defaults preferentes para facturas de ingreso
    setUsoCfdi("G03");
    setFormaPago("03");
    setMetodoPago("PUE");
    const c: any = (customers ?? []).find((x: any) => x.id === id);
    if (c?.moneda) setMoneda(c.moneda);
  }

  function resolveSource(ref: string): any | null {
    if (!ref) return null;
    if (ref.startsWith("p:")) return (products ?? []).find((x: any) => x.id === ref.slice(2)) ?? null;
    if (ref.startsWith("c:")) return (customerItems ?? []).find((x: any) => x.id === ref.slice(2)) ?? null;
    return null;
  }

  const totals = useMemo(() => {
    let subtotal = 0, iva = 0;
    for (const it of items) {
      const p: any = resolveSource(it.ref);
      if (!p) continue;
      const price = it.precio_unitario ?? Number(p.precio_unitario);
      const sub = price * Number(it.cantidad) - Number(it.descuento || 0);
      subtotal += sub;
      const ivaTipo = p.iva_tipo ?? "tasa";
      if (ivaTipo === "tasa") iva += sub * Number(p.iva_tasa);
    }
    return { subtotal, iva, total: subtotal + iva };
  }, [items, products, customerItems]);

  // Opciones de claves SAT usadas con este cliente + catálogo
  const claveOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const ci of (customerItems ?? []) as any[]) {
      if (ci.clave_prod_serv && !map.has(ci.clave_prod_serv)) map.set(ci.clave_prod_serv, ci.descripcion ?? "");
    }
    for (const p of (products ?? []) as any[]) {
      if (p.activo && p.clave_prod_serv && !map.has(p.clave_prod_serv)) map.set(p.clave_prod_serv, p.descripcion ?? "");
    }
    return Array.from(map.entries()).map(([key, desc]) => ({ key, desc }));
  }, [customerItems, products]);

  function descOptionsForClave(clave: string): string[] {
    const set = new Set<string>();
    if (!clave) {
      for (const ci of (customerItems ?? []) as any[]) if (ci.descripcion) set.add(ci.descripcion);
      return Array.from(set);
    }
    for (const ci of (customerItems ?? []) as any[]) {
      if (ci.clave_prod_serv === clave && ci.descripcion) set.add(ci.descripcion);
    }
    for (const p of (products ?? []) as any[]) {
      if (p.clave_prod_serv === clave && p.descripcion) set.add(p.descripcion);
    }
    return Array.from(set);
  }

  function pickByClave(idx: number, clave: string) {
    const ci = (customerItems ?? []).find((x: any) => x.clave_prod_serv === clave);
    const p = (products ?? []).find((x: any) => x.activo && x.clave_prod_serv === clave);
    const src: any = ci ?? p;
    setItems(items.map((it, i) => {
      if (i !== idx) return it;
      if (src) return { ...it, ref: ci ? `c:${ci.id}` : `p:${(p as any).id}`, descripcion: src.descripcion ?? "" };
      return { ...it, ref: "" };
    }));
    if (src) setNewItemRow(null);
  }

  function pickByDesc(idx: number, desc: string) {
    const it = items[idx];
    const currentClave = (() => {
      const s: any = resolveSource(it?.ref ?? "");
      return s?.clave_prod_serv ?? "";
    })();
    // Si la descripción corresponde a un customer_item de este cliente (mismo clave si hay), cambiar ref
    const ci = (customerItems ?? []).find((x: any) =>
      x.descripcion === desc && (!currentClave || x.clave_prod_serv === currentClave)
    ) ?? (customerItems ?? []).find((x: any) => x.descripcion === desc);
    setItems(items.map((row, i) => {
      if (i !== idx) return row;
      if (ci) return { ...row, ref: `c:${ci.id}`, descripcion: desc };
      return { ...row, descripcion: desc };
    }));
  }

  function addItem() { setItems([...items, { ref: "", cantidad: 1, descuento: 0 }]); }
  function removeItem(i: number) { setItems(items.filter((_, idx) => idx !== i)); setNewItemRow(null); }
  function updateItem(i: number, patch: Partial<{ ref: string; cantidad: number; descuento: number; descripcion: string; precio_unitario: number }>) {
    const next = items.map((it, idx) => {
      if (idx !== i) return it;
      const merged = { ...it, ...patch };
      if (patch.ref !== undefined && patch.ref !== "new" && patch.ref !== "") {
        let src: any = null;
        if (patch.ref.startsWith("p:")) src = (products ?? []).find((x: any) => x.id === patch.ref!.slice(2));
        else if (patch.ref.startsWith("c:")) src = (customerItems ?? []).find((x: any) => x.id === patch.ref!.slice(2));
        merged.descripcion = src?.descripcion ?? "";
      }
      if (patch.ref === "" || patch.ref === "new") merged.descripcion = "";
      return merged;
    });
    setItems(next);
    if (patch.ref === "new") {
      setNewItemRow(i);
      setNewItemForm({
        clave_prod_serv: "",
        descripcion: "",
        clave_unidad: "E48",
        unidad: "Unidad de servicio",
        precio_unitario: "",
        iva_tasa: "0.16",
        tipo: "servicio",
      });
    } else if (patch.ref !== undefined && patch.ref !== "new") {
      setNewItemRow(null);
    }
  }


  async function saveNewItem(rowIdx: number) {
    const f = newItemForm;
    if (!f.clave_prod_serv || !f.descripcion || !f.clave_unidad || !f.unidad || !f.precio_unitario) {
      toast.error("Completa todos los campos del nuevo concepto.");
      return;
    }
    setSavingNewItem(true);
    try {
      const r = await upsertProd({
        data: {
          organizationId,
          clave: f.clave_prod_serv,
          descripcion: f.descripcion,
          tipo: f.tipo,
          clave_prod_serv: f.clave_prod_serv,
          clave_unidad: f.clave_unidad,
          unidad: f.unidad,
          precio_unitario: Number(f.precio_unitario),
          moneda,
          iva_tasa: Number(f.iva_tasa),
          iva_tipo: "tasa",
          objeto_imp: "02",
          activo: true,
        },
      });
      await qc.invalidateQueries({ queryKey: ["products", organizationId] });
      updateItem(rowIdx, { ref: `p:${r.id}` });
      setNewItemRow(null);
      toast.success("Concepto guardado en el catálogo");
    } catch (e: any) {
      toast.error(e.message || "No se pudo guardar el concepto");
    } finally {
      setSavingNewItem(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!customerId) { setErrorMsg("Selecciona un cliente"); return; }
    if (items.some((it) => !it.ref || it.ref === "new" || it.cantidad <= 0)) { setErrorMsg("Verifica los conceptos: selecciona un producto/servicio y cantidad válida."); return; }
    setSubmitting(true);
    try {
      const payloadItems = items.map((it) => ({
        ...(it.ref.startsWith("p:") ? { product_id: it.ref.slice(2) } : { customer_item_id: it.ref.slice(2) }),
        cantidad: it.cantidad,
        descuento: it.descuento,
        ...(it.descripcion && it.descripcion.trim() ? { descripcion: it.descripcion.trim() } : {}),
        ...(it.precio_unitario !== undefined ? { precio_unitario: it.precio_unitario } : {}),
      }));

      const r = await stamp({
        data: {
          organizationId,
          customerId,
          items: payloadItems,
          uso_cfdi: usoCfdi,
          forma_pago: formaPago,
          metodo_pago: metodoPago,
          serie: serie || undefined,
          moneda,
        },
      });
      toast.success(`Factura timbrada · UUID ${r.uuid.slice(0, 8)}…`);
      onSaved();
    } catch (e: any) {
      const msg = e?.message || "No se pudo timbrar la factura";
      setErrorMsg(msg);
      toast.error(msg);
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg border bg-card p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nueva factura de ingreso</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-medium">No se pudo timbrar</p>
            <p className="mt-0.5 text-xs leading-relaxed">{errorMsg}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <label className="col-span-2 block md:col-span-3">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Cliente</span>
            <select value={customerId} onChange={(e) => pickCustomer(e.target.value)} required className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring">
              <option value="">Selecciona…</option>
              {(customers ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.razon_social} · {c.rfc}</option>
              ))}
            </select>
            {customer && <p className="mt-1 text-xs text-muted-foreground">CP {customer.codigo_postal} · Régimen {customer.regimen_fiscal}</p>}
          </label>
          <Select label="Uso CFDI" value={usoCfdi} options={USO_CFDI as any} onChange={setUsoCfdi} />
          <Select label="Forma de pago" value={formaPago} options={FORMA_PAGO as any} onChange={setFormaPago} />
          <Select label="Método de pago" value={metodoPago} options={[["PUE", "PUE - Pago en una exhibición"], ["PPD", "PPD - Pago en parcialidades"]]} onChange={(v) => setMetodoPago(v as any)} />
          <Input label="Serie (opcional)" value={serie} onChange={setSerie} mono />
          <Input label="Moneda" value={moneda} onChange={(v) => setMoneda(v.toUpperCase())} mono />
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Conceptos</h3>
            <button type="button" onClick={addItem} className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs hover:bg-secondary"><Plus className="h-3 w-3" /> Agregar</button>
          </div>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left">Producto/Servicio</th>
                  <th className="px-2 py-1.5 text-right">Cant.</th>
                  <th className="px-2 py-1.5 text-right">P. Unit.</th>
                  <th className="px-2 py-1.5 text-right">Desc.</th>
                  <th className="px-2 py-1.5 text-right">Importe</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((it, idx) => {
                  const p: any = resolveSource(it.ref);
                  const price = it.precio_unitario ?? (p ? Number(p.precio_unitario) : 0);
                  const importe = p ? price * Number(it.cantidad) - Number(it.descuento || 0) : 0;
                  const isNewRow = newItemRow === idx;
                  return (
                    <Fragment key={idx}>
                      <tr>
                        <td className="px-2 py-1.5">
                          {isNewRow ? (
                            <div className="rounded border border-dashed border-primary/40 bg-primary/5 px-2 py-1 text-[11px] text-muted-foreground">Nuevo concepto (ver abajo)</div>
                          ) : (
                            <div className="space-y-1">
                              <div className="grid grid-cols-[140px_1fr] gap-1">
                                <input
                                  list={`claves-${idx}`}
                                  value={p?.clave_prod_serv ?? ""}
                                  onChange={(e) => pickByClave(idx, e.target.value)}
                                  placeholder="Clave SAT"
                                  className="rounded border bg-background px-1.5 py-1 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
                                />
                                <input
                                  list={`descs-${idx}`}
                                  value={it.descripcion ?? p?.descripcion ?? ""}
                                  onChange={(e) => pickByDesc(idx, e.target.value)}
                                  placeholder="Descripción (editable)"
                                  className="rounded border bg-background px-1.5 py-1 text-xs outline-none focus:ring-2 focus:ring-ring"
                                />
                              </div>
                              <datalist id={`claves-${idx}`}>
                                {claveOptions.map((o) => (
                                  <option key={o.key} value={o.key}>{o.desc.slice(0, 80)}</option>
                                ))}
                              </datalist>
                              <datalist id={`descs-${idx}`}>
                                {descOptionsForClave(p?.clave_prod_serv ?? "").map((d) => (
                                  <option key={d} value={d} />
                                ))}
                              </datalist>
                              <button type="button" onClick={() => updateItem(idx, { ref: "new" })} className="text-[10px] text-primary hover:underline">➕ Nuevo concepto…</button>
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5"><input type="number" step="0.0001" min="0" value={it.cantidad} onChange={(e) => updateItem(idx, { cantidad: Number(e.target.value) || 0 })} required className="w-20 rounded border bg-background px-1.5 py-1 text-right font-mono text-xs outline-none focus:ring-2 focus:ring-ring" /></td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={p ? (it.precio_unitario ?? Number(p.precio_unitario)) : ""}
                            onChange={(e) => updateItem(idx, { precio_unitario: e.target.value === "" ? undefined : Number(e.target.value) })}
                            disabled={!p}
                            className="w-28 rounded border bg-background px-1.5 py-1 text-right font-mono text-xs outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                          />
                        </td>
                        <td className="px-2 py-1.5"><input type="number" step="0.01" min="0" value={it.descuento} onChange={(e) => updateItem(idx, { descuento: Number(e.target.value) || 0 })} className="w-24 rounded border bg-background px-1.5 py-1 text-right font-mono text-xs outline-none focus:ring-2 focus:ring-ring" /></td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs">{fmtMoney(importe)}</td>
                        <td className="px-2 py-1.5 text-right">
                          {items.length > 1 && <button type="button" onClick={() => removeItem(idx)} className="rounded p-1 text-destructive hover:bg-destructive/10"><X className="h-3 w-3" /></button>}
                        </td>
                      </tr>


                      {isNewRow && (
                        <tr key={`${idx}-new`}>
                          <td colSpan={6} className="bg-secondary/20 px-2 py-2">
                            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                              <label className="block">
                                <span className="text-[10px] font-medium text-muted-foreground">Clave SAT</span>
                                <SatProductAutocomplete
                                  organizationId={organizationId}
                                  value={newItemForm.clave_prod_serv}
                                  onChange={(clave) => setNewItemForm((s) => ({ ...s, clave_prod_serv: clave }))}
                                  onPick={(item) => setNewItemForm((s) => ({
                                    ...s,
                                    clave_prod_serv: item.key,
                                    descripcion: s.descripcion || item.description,
                                  }))}
                                />
                              </label>
                              <label className="block md:col-span-2">
                                <span className="text-[10px] font-medium text-muted-foreground">Descripción</span>
                                <input value={newItemForm.descripcion} onChange={(e) => setNewItemForm((s) => ({ ...s, descripcion: e.target.value }))} placeholder="Descripción del servicio/producto" className="w-full rounded border bg-background px-1.5 py-1 text-xs outline-none focus:ring-2 focus:ring-ring" />
                              </label>
                              <label className="block">
                                <span className="text-[10px] font-medium text-muted-foreground">Tipo</span>
                                <select value={newItemForm.tipo} onChange={(e) => setNewItemForm((s) => ({ ...s, tipo: e.target.value as any }))} className="w-full rounded border bg-background px-1.5 py-1 text-xs outline-none focus:ring-2 focus:ring-ring">
                                  <option value="servicio">Servicio</option>
                                  <option value="producto">Producto</option>
                                </select>
                              </label>
                              <label className="block">
                                <span className="text-[10px] font-medium text-muted-foreground">Clave unidad</span>
                                <SatUnitAutocomplete
                                  organizationId={organizationId}
                                  value={newItemForm.clave_unidad}
                                  onChange={(clave) => setNewItemForm((s) => ({ ...s, clave_unidad: clave }))}
                                  onPick={(item) => setNewItemForm((s) => ({
                                    ...s,
                                    clave_unidad: item.key,
                                    unidad: s.unidad || item.name,
                                  }))}
                                />
                              </label>
                              <label className="block">
                                <span className="text-[10px] font-medium text-muted-foreground">Unidad</span>
                                <input value={newItemForm.unidad} onChange={(e) => setNewItemForm((s) => ({ ...s, unidad: e.target.value }))} placeholder="ej. Servicio" className="w-full rounded border bg-background px-1.5 py-1 text-xs outline-none focus:ring-2 focus:ring-ring" />
                              </label>
                              <label className="block">
                                <span className="text-[10px] font-medium text-muted-foreground">Precio unitario</span>
                                <input type="number" step="0.01" min="0" value={newItemForm.precio_unitario} onChange={(e) => setNewItemForm((s) => ({ ...s, precio_unitario: e.target.value }))} placeholder="0.00" className="w-full rounded border bg-background px-1.5 py-1 text-right font-mono text-xs outline-none focus:ring-2 focus:ring-ring" />
                              </label>
                              <label className="block">
                                <span className="text-[10px] font-medium text-muted-foreground">IVA (%)</span>
                                <input type="number" step="0.01" min="0" max="1" value={newItemForm.iva_tasa} onChange={(e) => setNewItemForm((s) => ({ ...s, iva_tasa: e.target.value }))} placeholder="0.16" className="w-full rounded border bg-background px-1.5 py-1 text-right font-mono text-xs outline-none focus:ring-2 focus:ring-ring" />
                              </label>
                              <div className="flex items-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => saveNewItem(idx)}
                                  disabled={savingNewItem}
                                  className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                                >
                                  {savingNewItem ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                                  Guardar y usar
                                </button>
                                <button type="button" onClick={() => { setNewItemRow(null); updateItem(idx, { ref: "" }); }} className="rounded border bg-card px-2 py-1 text-xs hover:bg-secondary">Cancelar</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 ml-auto grid w-full max-w-xs grid-cols-2 gap-1 text-sm">
          <span className="text-muted-foreground">Subtotal</span><span className="text-right font-mono">{fmtMoney(totals.subtotal)}</span>
          <span className="text-muted-foreground">IVA</span><span className="text-right font-mono">{fmtMoney(totals.iva)}</span>
          <span className="font-semibold">Total</span><span className="text-right font-mono font-semibold">{fmtMoney(totals.total)}</span>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-secondary">Cancelar</button>
          <button type="submit" disabled={submitting} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Timbrar factura
          </button>
        </div>
      </form>
    </div>
  );
}


function Input({ label, value, onChange, mono }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={`w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring ${mono ? "font-mono" : ""}`} />
    </label>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: readonly (readonly [string, string])[]; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function SatProductAutocomplete({
  organizationId,
  value,
  onChange,
  onPick,
}: {
  organizationId: string;
  value: string;
  onChange: (v: string) => void;
  onPick: (item: { key: string; description: string }) => void;
}) {
  const search = useServerFn(searchSatProducts);
  const [query, setQuery] = useState(value);
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => { setQuery(value); }, [value]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results, isFetching } = useQuery({
    queryKey: ["sat-products", organizationId, debounced],
    queryFn: () => search({ data: { organizationId, q: debounced } }),
    enabled: open && debounced.length >= 2,
    staleTime: 60_000,
  });

  const items: { key: string; description: string }[] = results ?? [];

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); setHighlight(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || items.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, items.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter") {
            const sel = items[highlight];
            if (sel) { e.preventDefault(); onPick(sel); setQuery(sel.key); setOpen(false); }
          } else if (e.key === "Escape") { setOpen(false); }
        }}
        placeholder="Buscar: ej. asesoría, software, 86121600…"
        autoComplete="off"
        className="w-full rounded border bg-background px-1.5 py-1 text-xs outline-none focus:ring-2 focus:ring-ring"
      />
      {open && debounced.length >= 2 && (
        <div className="absolute left-0 top-full z-20 mt-0.5 max-h-56 min-w-[420px] overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md">
          {isFetching && items.length === 0 && (
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Buscando…</div>
          )}
          {!isFetching && items.length === 0 && (
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Sin coincidencias. Puedes escribir la clave manualmente.</div>
          )}
          {items.map((it, i) => (
            <button
              type="button"
              key={`${it.key}-${i}`}
              onMouseDown={(e) => { e.preventDefault(); onPick(it); setQuery(it.key); setOpen(false); }}
              onMouseEnter={() => setHighlight(i)}
              className={`flex w-full items-start gap-2 px-2 py-1.5 text-left text-[11px] ${i === highlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"}`}
            >
              <span className="shrink-0 font-mono font-medium">{it.key}</span>
              <span className="flex-1 whitespace-normal break-words text-muted-foreground">{it.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SatUnitAutocomplete({
  organizationId,
  value,
  onChange,
  onPick,
}: {
  organizationId: string;
  value: string;
  onChange: (v: string) => void;
  onPick: (item: { key: string; name: string }) => void;
}) {
  const search = useServerFn(searchSatUnits);
  const [query, setQuery] = useState(value);
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => { setQuery(value); }, [value]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results, isFetching } = useQuery({
    queryKey: ["sat-units", organizationId, debounced],
    queryFn: () => search({ data: { organizationId, q: debounced } }),
    enabled: open && debounced.length >= 1,
    staleTime: 60_000,
  });

  const items: { key: string; name: string; symbol: string }[] = results ?? [];

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); setHighlight(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || items.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, items.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter") {
            const sel = items[highlight];
            if (sel) { e.preventDefault(); onPick(sel); setQuery(sel.key); setOpen(false); }
          } else if (e.key === "Escape") { setOpen(false); }
        }}
        placeholder="Buscar: ej. servicio, E48…"
        autoComplete="off"
        className="w-full rounded border bg-background px-1.5 py-1 text-xs outline-none focus:ring-2 focus:ring-ring"
      />
      {open && debounced.length >= 1 && (
        <div className="absolute left-0 top-full z-20 mt-0.5 max-h-56 min-w-[360px] overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md">
          {isFetching && items.length === 0 && (
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Buscando…</div>
          )}
          {!isFetching && items.length === 0 && (
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Sin coincidencias. Puedes escribir la clave manualmente.</div>
          )}
          {items.map((it, i) => (
            <button
              type="button"
              key={`${it.key}-${i}`}
              onMouseDown={(e) => { e.preventDefault(); onPick(it); setQuery(it.key); setOpen(false); }}
              onMouseEnter={() => setHighlight(i)}
              className={`flex w-full items-start gap-2 px-2 py-1.5 text-left text-[11px] ${i === highlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"}`}
            >
              <span className="shrink-0 font-mono font-medium">{it.key}</span>
              <span className="flex-1 whitespace-normal break-words text-muted-foreground">{it.name}{it.symbol ? ` (${it.symbol})` : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
