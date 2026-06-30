import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  listOriginInvoices,
  stampPaymentComplement,
  stampCartaPorte,
  listVehicles,
  listOperators,
  syncOriginInvoicesFromFacturapi,
  importOriginInvoicesFromXml,
  deleteOriginInvoice,
  listStampedComplements,
} from "@/lib/complements.functions";
import { getCfdiDownloadUrl } from "@/lib/cfdi.functions";
import { emailStampedComplement } from "@/lib/email.functions";
import { listCustomers } from "@/lib/customers.functions";
import { useRequireOrg } from "@/lib/use-current-org";
import { PageHeader } from "@/components/app-ui";
import { FileText, X, Plus, Trash2, Truck, Receipt, MoveRight, Download, CheckCircle2, Mail } from "lucide-react";
import { toast } from "sonner";
import { fmtMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/facturacion/complementos")({
  component: ComplementosPage,
  validateSearch: (s: Record<string, unknown>) => ({
    pagoOrigen: typeof s.pagoOrigen === "string" ? s.pagoOrigen : undefined,
  }),
});

function ComplementosPage() {
  const org = useRequireOrg();
  const search = Route.useSearch();
  const [tab, setTab] = useState<"pago" | "carta">("pago");
  const [origenPagoIds, setOrigenPagoIds] = useState<string[]>(search.pagoOrigen ? [search.pagoOrigen] : []);
  const [checkedPagoIds, setCheckedPagoIds] = useState<string[]>([]);
  const [openCP, setOpenCP] = useState(false);

  const list = useServerFn(listOriginInvoices);
  const sync = useServerFn(syncOriginInvoicesFromFacturapi);
  const importXml = useServerFn(importOriginInvoicesFromXml);
  const removeOrigin = useServerFn(deleteOriginInvoice);
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [importingXml, setImportingXml] = useState(false);
  const { data: origenes } = useQuery({
    queryKey: ["origin-invoices", org.id],
    queryFn: () => list({ data: { organizationId: org.id } }),
  });

  async function handleSync() {
    setSyncing(true);
    try {
      const r: any = await sync({ data: { organizationId: org.id } });
      toast.success(`Sincronización lista: ${r.imported} nuevas, ${r.updated} actualizadas (${r.scanned} revisadas)`);
      qc.invalidateQueries({ queryKey: ["origin-invoices", org.id] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error al sincronizar");
    } finally {
      setSyncing(false);
    }
  }

  async function handleXmlUpload(files: FileList | null) {
    if (!files || !files.length) return;
    const arr = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".xml"));
    if (!arr.length) { toast.error("Selecciona archivos .xml"); return; }
    if (arr.length > 50) { toast.error("Máximo 50 XML por carga"); return; }
    setImportingXml(true);
    try {
      const payload = await Promise.all(arr.map(async (f) => ({ name: f.name, content: await f.text() })));
      const r: any = await importXml({ data: { organizationId: org.id, files: payload } });
      const msg = `Importadas: ${r.imported}, actualizadas: ${r.updated}, omitidas: ${r.skipped}`;
      if (r.errors?.length) {
        toast.warning(msg, { description: r.errors.slice(0, 5).join("\n") });
      } else {
        toast.success(msg);
      }
      qc.invalidateQueries({ queryKey: ["origin-invoices", org.id] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error al importar XML");
    } finally {
      setImportingXml(false);
    }
  }

  const selectedOrigins = useMemo(
    () => origenPagoIds.map((id) => (origenes ?? []).find((o: any) => o.id === id)).filter(Boolean) as any[],
    [origenPagoIds, origenes]
  );

  function toggle(id: string) {
    setCheckedPagoIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function addIds(ids: string[]) {
    setOrigenPagoIds((prev) => Array.from(new Set([...prev, ...ids])));
  }

  function importChecked() {
    if (!checkedPagoIds.length) {
      toast.error("Selecciona una o varias facturas primero");
      return;
    }
    addIds(checkedPagoIds);
    setCheckedPagoIds([]);
    toast.success(`${checkedPagoIds.length} factura${checkedPagoIds.length !== 1 ? "s" : ""} agregada${checkedPagoIds.length !== 1 ? "s" : ""}`);
  }

  async function handleDeleteOrigin(id: string) {
    if (!confirm("¿Eliminar esta factura de la lista? Esta acción no se puede deshacer.")) return;
    try {
      await removeOrigin({ data: { id, organizationId: org.id } });
      setOrigenPagoIds((prev) => prev.filter((x) => x !== id));
      setCheckedPagoIds((prev) => prev.filter((x) => x !== id));
      qc.invalidateQueries({ queryKey: ["origin-invoices", org.id] });
      toast.success("Factura eliminada");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo eliminar");
    }
  }

  return (
    <div>
      <PageHeader
        title="Complementos CFDI"
        description="Genera complementos de pago y carta porte"
      />
      <div className="space-y-5 p-8">
        <div className="flex gap-2 border-b">
          {([["pago", "Complemento de pago", Receipt], ["carta", "Carta porte", Truck]] as const).map(([k, lbl, Icon]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="h-4 w-4" /> {lbl}
            </button>
          ))}
        </div>

        {tab === "pago" && (
          <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
            <div className="rounded-lg border bg-card p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <FileText className="h-4 w-4" /> Facturas PPD timbradas
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Marca una o varias facturas e impórtalas al complemento. Todas deben ser del mismo cliente.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <label className={`cursor-pointer rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-secondary ${importingXml ? "pointer-events-none opacity-50" : ""}`}>
                    {importingXml ? "Importando…" : "Subir XML del SAT"}
                    <input
                      type="file"
                      accept=".xml,application/xml,text/xml"
                      multiple
                      className="hidden"
                      onChange={(e) => { handleXmlUpload(e.target.files); e.currentTarget.value = ""; }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleSync}
                    disabled={syncing}
                    className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
                  >
                    {syncing ? "Sincronizando…" : "Sincronizar desde FacturAPI"}
                  </button>
                  <button
                    type="button"
                    onClick={importChecked}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${checkedPagoIds.length ? "bg-primary text-primary-foreground hover:opacity-90" : "border bg-background text-muted-foreground hover:bg-secondary"}`}
                  >
                    Importar seleccionadas
                  </button>
                </div>
              </div>
              <div className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
                {(origenes ?? []).length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    Aún no hay facturas PPD timbradas para importar. Primero timbra o sincroniza facturas PPD.
                  </p>
                )}
                {(origenes ?? []).map((o: any) => {
                  const selected = checkedPagoIds.includes(o.id);
                  const imported = origenPagoIds.includes(o.id);
                  return (
                    <div
                      key={o.id}
                      role="button"
                      tabIndex={0}
                      draggable
                      onDragStart={(e) => {
                        const ids = selected && checkedPagoIds.length > 0 ? checkedPagoIds : [o.id];
                        const payload = JSON.stringify(ids);
                        try { e.dataTransfer.setData("application/json", payload); } catch {}
                        try { e.dataTransfer.setData("text/plain", payload); } catch {}
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        toggle(o.id);
                      }}
                      className={`w-full cursor-grab select-none rounded-md border bg-background p-2 text-left text-xs hover:border-primary active:cursor-grabbing ${selected ? "border-primary ring-1 ring-primary" : imported ? "border-primary/40 bg-primary/5" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex min-w-0 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggle(o.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-3.5 w-3.5 accent-primary"
                          />
                          <span className="font-mono">{[o.serie, o.folio].filter(Boolean).join("-") || "—"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-right tabular-nums text-money">{fmtMoney(o.total ?? 0)}</span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); addIds([o.id]); toast.success("Factura importada"); }}
                            className="rounded border px-2 py-0.5 text-[10px] font-medium hover:bg-secondary"
                          >
                            Importar
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDeleteOrigin(o.id); }}
                            title="Eliminar factura"
                            className="rounded border p-1 text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {o.payload?.response?.customer?.legal_name ?? ""} · UUID {o.uuid_sat?.slice(0, 8)}…{imported ? " · agregada" : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <DropZone
              onDropIds={addIds}
              filled={selectedOrigins.length > 0}
              onClear={() => setOrigenPagoIds([])}
              origins={selectedOrigins}
              onRemove={(id) => setOrigenPagoIds((prev) => prev.filter((x) => x !== id))}
            >
              {selectedOrigins.length > 0 && (
                <PaymentForm
                  organizationId={org.id}
                  origins={selectedOrigins}
                  onSaved={async (usedIds) => {
                    setOrigenPagoIds([]);
                    setCheckedPagoIds([]);
                    // Vaciar los XML importados que ya quedaron pagados
                    const results = await Promise.allSettled(
                      usedIds.map((id) => removeOrigin({ data: { id, organizationId: org.id } }))
                    );
                    const failed = results.filter((r) => r.status === "rejected");
                    if (failed.length) {
                      toast.error(`No se pudieron quitar ${failed.length} XML: ${(failed[0] as any).reason?.message ?? ""}`);
                    }
                    await qc.refetchQueries({ queryKey: ["origin-invoices", org.id] });
                    qc.refetchQueries({ queryKey: ["stamped-complements", org.id] });
                  }}
                />
              )}
            </DropZone>
          </div>
        )}

        {tab === "carta" && (
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Carta Porte 3.0</h3>
                <p className="text-xs text-muted-foreground">
                  Genera un CFDI con complemento Carta Porte (Ingreso para facturar el flete o Traslado para mover mercancía propia).
                </p>
              </div>
              <button onClick={() => setOpenCP(true)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">
                <Plus className="h-4 w-4" /> Nueva carta porte
              </button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Antes de timbrar, registra al menos un <strong>vehículo</strong> y un <strong>operador</strong> en Facturación → Ajustes.
            </p>
            {openCP && <CartaPorteForm organizationId={org.id} onClose={() => setOpenCP(false)} />}
          </div>
        )}

        <StampedComplementsList organizationId={org.id} />
      </div>
    </div>
  );
}

function StampedComplementsList({ organizationId }: { organizationId: string }) {
  const listFn = useServerFn(listStampedComplements);
  const getUrl = useServerFn(getCfdiDownloadUrl);
  const emailFn = useServerFn(emailStampedComplement);
  const { data, isLoading } = useQuery({
    queryKey: ["stamped-complements", organizationId],
    queryFn: () => listFn({ data: { organizationId } }),
  });

  async function download(id: string, kind: "xml" | "pdf") {
    try {
      const { base64, mime, filename } = await getUrl({ data: { stampId: id, kind } });
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime });
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objUrl);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo descargar");
    }
  }

  async function sendByEmail(s: any) {
    const suggested =
      s?.payload?.customer?.email ||
      s?.payload?.receiver?.email ||
      "";
    const input = window.prompt(
      "Correo(s) destinatario (separa con coma para varios):",
      suggested,
    );
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

  const rows = (data ?? []).filter((s: any) => s.estatus === "timbrado");

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Complementos timbrados</h3>
        <span className="text-xs text-muted-foreground">({rows.length})</span>
      </div>
      {isLoading ? (
        <p className="py-4 text-center text-xs text-muted-foreground">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Aún no has timbrado complementos. Los pagos y cartas porte aparecerán aquí.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 text-left font-medium">Tipo</th>
                <th className="py-2 text-left font-medium">Serie-Folio</th>
                <th className="py-2 text-left font-medium">UUID</th>
                <th className="py-2 text-left font-medium">Fecha</th>
                <th className="py-2 text-right font-medium">Total</th>
                <th className="py-2 text-left font-medium">Estatus</th>
                <th className="py-2 text-right font-medium">Descargas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s: any) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="py-2">
                    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${s.kind === "pago" ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
                      {s.kind === "pago" ? <Receipt className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
                      {s.kind === "pago" ? "Pago" : "Carta porte"}
                    </span>
                  </td>
                  <td className="py-2 font-mono">{[s.serie, s.folio].filter(Boolean).join("-") || "—"}</td>
                  <td className="py-2 font-mono text-[10px]">{s.uuid_sat?.slice(0, 8)}…</td>
                  <td className="py-2">{s.fecha_timbrado ? new Date(s.fecha_timbrado).toLocaleString() : "—"}</td>
                  <td className="py-2 text-right tabular-nums text-money">{fmtMoney(s.total ?? 0)}</td>
                  <td className="py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${s.estatus === "timbrado" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                      {s.estatus}
                    </span>
                  </td>
                  <td className="py-2">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => sendByEmail(s)} title="Enviar por correo" className="rounded p-1 hover:bg-secondary">
                        <Mail className="h-3.5 w-3.5" />
                      </button>
                      {s.pdf_path && (
                        <button onClick={() => download(s.id, "pdf")} title="PDF" className="rounded p-1 hover:bg-secondary">
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {s.xml_path && (
                        <button onClick={() => download(s.id, "xml")} title="XML" className="rounded border px-1.5 py-0.5 text-[10px] font-mono hover:bg-secondary">
                          XML
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DropZone({ children, onDropIds, filled, onClear, origins, onRemove }: { children: React.ReactNode; onDropIds: (ids: string[]) => void; filled: boolean; onClear: () => void; origins: any[]; onRemove: (id: string) => void }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const raw = e.dataTransfer.getData("application/json") || e.dataTransfer.getData("text/plain");
        if (!raw) return;
        try {
          const ids = JSON.parse(raw) as string[];
          if (Array.isArray(ids) && ids.length) onDropIds(ids);
        } catch {}
      }}
      className={`min-h-[60vh] rounded-lg border-2 border-dashed p-4 transition-colors ${over ? "border-primary bg-primary/5" : filled ? "border-border bg-card" : "border-border bg-secondary/30"}`}
    >
      {!filled ? (
        <div className="grid h-full place-items-center py-16 text-center">
          <div>
            <MoveRight className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Arrastra aquí una o varias facturas PPD</p>
            <p className="mt-1 text-xs text-muted-foreground">Mismo cliente. Se generará un solo complemento con todas.</p>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-3 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold">{origins.length} factura{origins.length !== 1 ? "s" : ""} seleccionada{origins.length !== 1 ? "s" : ""}</span>
              <button onClick={onClear} className="text-muted-foreground hover:text-foreground underline">Limpiar todo</button>
            </div>
            {origins.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-md border bg-background p-2 text-xs">
                <div className="min-w-0">
                  <div className="font-mono">{[o.serie, o.folio].filter(Boolean).join("-") || "—"} · {fmtMoney(o.total ?? 0)}</div>
                  <div className="truncate text-muted-foreground">{o.payload?.response?.customer?.legal_name}</div>
                </div>
                <button onClick={() => onRemove(o.id)} className="rounded p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          {children}
        </div>
      )}
    </div>
  );
}

const FORMA_PAGO = [
  ["01", "01 - Efectivo"],
  ["02", "02 - Cheque nominativo"],
  ["03", "03 - Transferencia electrónica"],
  ["04", "04 - Tarjeta de crédito"],
  ["28", "28 - Tarjeta de débito"],
] as const;

function PaymentForm({ organizationId, origins, onSaved }: { organizationId: string; origins: any[]; onSaved: (usedIds: string[]) => void }) {
  const stamp = useServerFn(stampPaymentComplement);
  const qc = useQueryClient();
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 19));
  const [forma, setForma] = useState("03");
  const [moneda, setMoneda] = useState(origins[0]?.payload?.response?.currency ?? "MXN");
  const firstCustomer = origins[0]?.payload?.response?.customer;
  const initialTaxSystem = /^\d{3}$/.test(String(firstCustomer?.tax_system ?? "")) ? String(firstCustomer?.tax_system) : "";
  const [customerZip, setCustomerZip] = useState(firstCustomer?.address?.zip ?? "");
  const [customerTaxSystem, setCustomerTaxSystem] = useState(initialTaxSystem);
  const [rows, setRows] = useState<Record<string, { parcialidad: number; saldoAnt: number; monto: number }>>({});
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const c = origins[0]?.payload?.response?.customer;
    setCustomerZip(c?.address?.zip ?? "");
    setCustomerTaxSystem(/^\d{3}$/.test(String(c?.tax_system ?? "")) ? String(c?.tax_system) : "");
  }, [origins]);

  // Asegurar fila por cada origen y refrescar pago completo si el XML corrige el total
  useEffect(() => {
    setRows((prev) => {
      const next = { ...prev };
      for (const o of origins) {
        const total = Number(o.total ?? o.payload?.response?.total ?? 0);
        if (!next[o.id]) {
          next[o.id] = { parcialidad: 1, saldoAnt: total, monto: total };
        } else if (next[o.id].saldoAnt === next[o.id].monto && Math.abs(next[o.id].saldoAnt - total) > 0.009) {
          next[o.id] = { ...next[o.id], saldoAnt: total, monto: total };
        }
      }
      for (const id of Object.keys(next)) {
        if (!origins.find((o) => o.id === id)) delete next[id];
      }
      return next;
    });
  }, [origins]);

  // Validar mismo cliente
  const rfcs = Array.from(new Set(origins.map((o) => o.payload?.response?.customer?.tax_id).filter(Boolean)));
  const mismatch = rfcs.length > 1;
  const totalPago = origins.reduce((s, o) => s + (rows[o.id]?.monto ?? 0), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (mismatch) { setErr("Todas las facturas deben ser del mismo cliente."); return; }
    setSubmitting(true);
    try {
      const r = await stamp({
        data: {
          organizationId,
          fecha_pago: fecha,
          forma_pago: forma,
          moneda,
          customer_zip: customerZip,
          customer_tax_system: customerTaxSystem,
          relations: origins.map((o) => {
            const row = rows[o.id]!;
            return {
              originStampId: o.id,
              num_parcialidad: row.parcialidad,
              saldo_anterior: row.saldoAnt,
              monto: row.monto,
              saldo_insoluto: Math.max(row.saldoAnt - row.monto, 0),
            };
          }),
        },
      });
      toast.success("Complemento de pago timbrado con éxito", {
        description: `UUID ${r.uuid} · ${origins.length} factura${origins.length !== 1 ? "s" : ""}`,
      });
      qc.invalidateQueries({ queryKey: ["invoices", organizationId] });
      qc.invalidateQueries({ queryKey: ["origin-invoices", organizationId] });
      onSaved(origins.map((o) => o.id));
    } catch (e: any) {
      setErr(e?.message ?? "Error al timbrar");
      toast.error(e?.message ?? "Error");
    } finally { setSubmitting(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {err && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{err}</div>}
      {mismatch && <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">Hay facturas de distintos clientes. Quita las que no correspondan.</div>}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Fecha de pago">
          <input type="datetime-local" required value={fecha.slice(0, 16)} onChange={(e) => setFecha(e.target.value + ":00")} className="input" />
        </Field>
        <Field label="Forma de pago">
          <select value={forma} onChange={(e) => setForma(e.target.value)} className="input">
            {FORMA_PAGO.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
          </select>
        </Field>
        <Field label="Moneda"><input value={moneda} onChange={(e) => setMoneda(e.target.value.toUpperCase())} className="input font-mono" /></Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="C.P. fiscal receptor">
          <input required inputMode="numeric" pattern="\d{5}" maxLength={5} value={customerZip} onChange={(e) => setCustomerZip(e.target.value.replace(/\D/g, ""))} className="input font-mono" />
        </Field>
        <Field label="Régimen fiscal receptor">
          <input required inputMode="numeric" pattern="\d{3}" maxLength={3} value={customerTaxSystem} onChange={(e) => setCustomerTaxSystem(e.target.value.replace(/\D/g, ""))} className="input font-mono" />
        </Field>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-muted-foreground">Detalle por factura</div>
        {origins.map((o) => {
          const row = rows[o.id] ?? { parcialidad: 1, saldoAnt: 0, monto: 0 };
          const insoluto = Math.max(row.saldoAnt - row.monto, 0);
          const payload = o.payload?.response;
          const subtotal = Number(payload?.subtotal ?? 0);
          const totalFact = Number(payload?.total ?? o.total ?? 0);
          let rate = 0;
          if (subtotal > 0 && totalFact > subtotal) {
            rate = Math.round(((totalFact - subtotal) / subtotal) * 1000000) / 1000000;
          }
          if (!rate || rate <= 0) rate = 0.16;
          const xmlIva = subtotal > 0 && totalFact > subtotal ? totalFact - subtotal : 0;
          const basePago = row.monto > 0 ? row.monto / (1 + rate) : 0;
          const ivaPago = row.monto > 0 ? row.monto - basePago : 0;
          return (
            <div key={o.id} className="rounded-md border bg-background p-2">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-mono">{[o.serie, o.folio].filter(Boolean).join("-") || "—"} · {fmtMoney(o.total ?? 0)}</span>
                <span className="text-muted-foreground">Insoluto: <strong className="text-money">{fmtMoney(insoluto)}</strong></span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Parcialidad">
                  <input type="number" min={1} value={row.parcialidad} onChange={(e) => setRows((p) => ({ ...p, [o.id]: { ...row, parcialidad: Number(e.target.value) } }))} className="input" />
                </Field>
                <Field label="Saldo anterior">
                  <input type="number" step="0.01" min={0} value={row.saldoAnt} onChange={(e) => setRows((p) => ({ ...p, [o.id]: { ...row, saldoAnt: Number(e.target.value) } }))} className="input text-money" />
                </Field>
                <Field label="Monto pagado">
                  <input type="number" step="0.01" min={0.01} value={row.monto} onChange={(e) => setRows((p) => ({ ...p, [o.id]: { ...row, monto: Number(e.target.value) } }))} className="input text-money" />
                </Field>
              </div>
              {row.monto > 0 && (
                <div className="mt-2 space-y-1 rounded bg-secondary/40 p-1.5 text-[10px]">
                  {subtotal > 0 && totalFact > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      <div><span className="text-muted-foreground">Subtotal XML:</span> <strong className="text-money">{fmtMoney(subtotal)}</strong></div>
                      <div><span className="text-muted-foreground">IVA XML:</span> <strong className="text-money">{fmtMoney(xmlIva)}</strong></div>
                      <div><span className="text-muted-foreground">Total XML:</span> <strong className="text-money">{fmtMoney(totalFact)}</strong></div>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <div><span className="text-muted-foreground">Base pago:</span> <strong className="text-money">{fmtMoney(basePago)}</strong></div>
                    <div><span className="text-muted-foreground">Tasa IVA:</span> <strong>{(rate * 100).toFixed(2)}%</strong></div>
                    <div><span className="text-muted-foreground">IVA pago:</span> <strong className="text-money">{fmtMoney(ivaPago)}</strong></div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">Total del pago: <strong className="text-money">{fmtMoney(totalPago)}</strong></p>
      <button disabled={submitting || mismatch} className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
        {submitting ? "Timbrando…" : `Timbrar complemento de pago (${origins.length} factura${origins.length !== 1 ? "s" : ""})`}
      </button>
    </form>
  );
}


function CartaPorteForm({ organizationId, onClose }: { organizationId: string; onClose: () => void }) {
  const stamp = useServerFn(stampCartaPorte);
  const listV = useServerFn(listVehicles);
  const listO = useServerFn(listOperators);
  const listC = useServerFn(listCustomers);
  const qc = useQueryClient();
  const { data: vehicles } = useQuery({ queryKey: ["vehicles", organizationId], queryFn: () => listV({ data: { organizationId } }) });
  const { data: operators } = useQuery({ queryKey: ["operators", organizationId], queryFn: () => listO({ data: { organizationId } }) });
  const { data: customers } = useQuery({ queryKey: ["customers", organizationId], queryFn: () => listC({ data: { organizationId } }) });

  const [cfdiType, setCfdiType] = useState<"I" | "T">("I");
  const [customerId, setCustomerId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [totalDist, setTotalDist] = useState<number>(100);
  const [internac, setInternac] = useState(false);
  const [entrada, setEntrada] = useState<"Entrada" | "Salida">("Salida");
  const [servicePrice, setServicePrice] = useState<number>(1000);
  const [serviceDesc, setServiceDesc] = useState("Servicio de transporte de carga");

  const emptyDom = { calle: "", numero_exterior: "", colonia: "", municipio: "", estado: "", pais: "MEX", codigo_postal: "" };
  const [ubicaciones, setUbicaciones] = useState<any[]>([
    { tipo_ubicacion: "Origen", rfc: "", nombre: "", fecha: new Date().toISOString().slice(0, 16) + ":00", distancia_recorrida: 0, domicilio: { ...emptyDom } },
    { tipo_ubicacion: "Destino", rfc: "", nombre: "", fecha: new Date(Date.now() + 86400000).toISOString().slice(0, 16) + ":00", distancia_recorrida: 100, domicilio: { ...emptyDom } },
  ]);
  const [mercancias, setMercancias] = useState<any[]>([
    { bienes_transp: "10101500", descripcion: "Mercancía general", cantidad: 1, clave_unidad: "KGM", peso_kg: 100, material_peligroso: false, moneda: "MXN", valor_mercancia: 1000 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function upd<T>(arr: T[], setter: (v: T[]) => void, i: number, patch: Partial<T>) {
    setter(arr.map((v, idx) => idx === i ? { ...v, ...patch } : v));
  }
  function updDom(i: number, patch: any) {
    setUbicaciones(ubicaciones.map((v, idx) => idx === i ? { ...v, domicilio: { ...v.domicilio, ...patch } } : v));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const r = await stamp({
        data: {
          organizationId,
          cfdi_type: cfdiType,
          customer_id: cfdiType === "I" ? customerId : undefined,
          vehicle_id: vehicleId,
          operator_id: operatorId,
          total_dist_rec: totalDist,
          transp_internac: internac,
          entrada_salida_merc: internac ? entrada : undefined,
          service_price: cfdiType === "I" ? servicePrice : undefined,
          service_description: serviceDesc,
          service_product_key: "78101800",
          ubicaciones,
          mercancias,
        } as any,
      });
      toast.success(`Carta porte timbrada · ${r.uuid.slice(0, 8)}…`);
      qc.invalidateQueries({ queryKey: ["invoices", organizationId] });
      qc.invalidateQueries({ queryKey: ["stamped-complements", organizationId] });
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Error al timbrar");
      toast.error(e?.message ?? "Error");
    } finally { setSubmitting(false); }
  }

  const noVeh = !(vehicles ?? []).length;
  const noOp = !(operators ?? []).length;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nueva carta porte 3.0</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        {err && <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{err}</div>}
        {(noVeh || noOp) && (
          <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
            Configura {noVeh && "al menos un vehículo"}{noVeh && noOp && " y "}{noOp && "un operador"} en Facturación → Ajustes.
          </div>
        )}

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Tipo y datos generales</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Tipo de CFDI">
              <select value={cfdiType} onChange={(e) => setCfdiType(e.target.value as any)} className="input">
                <option value="I">Ingreso (cobro de flete)</option>
                <option value="T">Traslado (mercancía propia)</option>
              </select>
            </Field>
            {cfdiType === "I" && (
              <Field label="Cliente">
                <select required value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="input">
                  <option value="">Selecciona…</option>
                  {(customers ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.razon_social} · {c.rfc}</option>)}
                </select>
              </Field>
            )}
            <Field label="Vehículo">
              <select required value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="input">
                <option value="">Selecciona…</option>
                {(vehicles ?? []).map((v: any) => <option key={v.id} value={v.id}>{v.alias || `${v.placa_vm} (${v.config_vehicular})`}</option>)}
              </select>
            </Field>
            <Field label="Operador">
              <select required value={operatorId} onChange={(e) => setOperatorId(e.target.value)} className="input">
                <option value="">Selecciona…</option>
                {(operators ?? []).map((o: any) => <option key={o.id} value={o.id}>{o.nombre} · {o.rfc}</option>)}
              </select>
            </Field>
            <Field label="Distancia total (km)">
              <input type="number" min={0} step="0.01" value={totalDist} onChange={(e) => setTotalDist(Number(e.target.value))} className="input" required />
            </Field>
            {cfdiType === "I" && (
              <>
                <Field label="Importe servicio (sin IVA)">
                  <input type="number" min={0} step="0.01" value={servicePrice} onChange={(e) => setServicePrice(Number(e.target.value))} className="input text-money" />
                </Field>
                <Field label="Descripción servicio">
                  <input value={serviceDesc} onChange={(e) => setServiceDesc(e.target.value)} className="input" />
                </Field>
              </>
            )}
            <Field label="Transporte internacional">
              <select value={internac ? "1" : "0"} onChange={(e) => setInternac(e.target.value === "1")} className="input">
                <option value="0">No</option>
                <option value="1">Sí</option>
              </select>
            </Field>
            {internac && (
              <Field label="Entrada/Salida">
                <select value={entrada} onChange={(e) => setEntrada(e.target.value as any)} className="input">
                  <option value="Salida">Salida</option>
                  <option value="Entrada">Entrada</option>
                </select>
              </Field>
            )}
          </div>
        </section>

        <section className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Ubicaciones (origen → destinos)</h3>
            <button type="button" onClick={() => setUbicaciones([...ubicaciones, { tipo_ubicacion: "Destino", rfc: "", nombre: "", fecha: new Date().toISOString().slice(0, 16) + ":00", distancia_recorrida: 0, domicilio: { ...emptyDom } }])} className="text-xs underline">+ Agregar destino</button>
          </div>
          {ubicaciones.map((u, i) => (
            <div key={i} className="rounded-md border bg-background p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase">{u.tipo_ubicacion} {i > 0 ? i : ""}</span>
                {ubicaciones.length > 2 && i > 0 && (
                  <button type="button" onClick={() => setUbicaciones(ubicaciones.filter((_, idx) => idx !== i))} className="rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Field label="Tipo">
                  <select value={u.tipo_ubicacion} onChange={(e) => upd(ubicaciones, setUbicaciones, i, { tipo_ubicacion: e.target.value })} className="input">
                    <option value="Origen">Origen</option>
                    <option value="Destino">Destino</option>
                  </select>
                </Field>
                <Field label="RFC remit./dest."><input required value={u.rfc} onChange={(e) => upd(ubicaciones, setUbicaciones, i, { rfc: e.target.value.toUpperCase() })} className="input font-mono" /></Field>
                <Field label="Nombre"><input value={u.nombre ?? ""} onChange={(e) => upd(ubicaciones, setUbicaciones, i, { nombre: e.target.value })} className="input" /></Field>
                <Field label={u.tipo_ubicacion === "Origen" ? "Fecha/hora salida" : "Fecha/hora llegada"}>
                  <input type="datetime-local" value={u.fecha.slice(0, 16)} onChange={(e) => upd(ubicaciones, setUbicaciones, i, { fecha: e.target.value + ":00" })} className="input" />
                </Field>
                {u.tipo_ubicacion === "Destino" && (
                  <Field label="Distancia (km)"><input type="number" min={0} step="0.01" value={u.distancia_recorrida ?? 0} onChange={(e) => upd(ubicaciones, setUbicaciones, i, { distancia_recorrida: Number(e.target.value) })} className="input" /></Field>
                )}
                <Field label="Calle"><input required value={u.domicilio.calle} onChange={(e) => updDom(i, { calle: e.target.value })} className="input" /></Field>
                <Field label="No. ext."><input value={u.domicilio.numero_exterior ?? ""} onChange={(e) => updDom(i, { numero_exterior: e.target.value })} className="input" /></Field>
                <Field label="Colonia"><input required value={u.domicilio.colonia} onChange={(e) => updDom(i, { colonia: e.target.value })} className="input" /></Field>
                <Field label="Municipio"><input required value={u.domicilio.municipio} onChange={(e) => updDom(i, { municipio: e.target.value })} className="input" /></Field>
                <Field label="Estado (clave SAT)"><input required value={u.domicilio.estado} onChange={(e) => updDom(i, { estado: e.target.value.toUpperCase() })} className="input font-mono" placeholder="ej. JAL" /></Field>
                <Field label="C.P."><input required value={u.domicilio.codigo_postal} onChange={(e) => updDom(i, { codigo_postal: e.target.value })} className="input font-mono" maxLength={5} /></Field>
              </div>
            </div>
          ))}
        </section>

        <section className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Mercancías</h3>
            <button type="button" onClick={() => setMercancias([...mercancias, { bienes_transp: "10101500", descripcion: "", cantidad: 1, clave_unidad: "KGM", peso_kg: 0, material_peligroso: false, moneda: "MXN" }])} className="text-xs underline">+ Agregar mercancía</button>
          </div>
          {mercancias.map((m, i) => (
            <div key={i} className="rounded-md border bg-background p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase">Mercancía {i + 1}</span>
                {mercancias.length > 1 && (
                  <button type="button" onClick={() => setMercancias(mercancias.filter((_, idx) => idx !== i))} className="rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Field label="Clave ProdServCP"><input required value={m.bienes_transp} onChange={(e) => upd(mercancias, setMercancias, i, { bienes_transp: e.target.value })} className="input font-mono" /></Field>
                <Field label="Descripción"><input required value={m.descripcion} onChange={(e) => upd(mercancias, setMercancias, i, { descripcion: e.target.value })} className="input" /></Field>
                <Field label="Cantidad"><input type="number" min={0} step="0.01" value={m.cantidad} onChange={(e) => upd(mercancias, setMercancias, i, { cantidad: Number(e.target.value) })} className="input" /></Field>
                <Field label="Clave unidad"><input required value={m.clave_unidad} onChange={(e) => upd(mercancias, setMercancias, i, { clave_unidad: e.target.value.toUpperCase() })} className="input font-mono" /></Field>
                <Field label="Peso (kg)"><input type="number" min={0} step="0.001" value={m.peso_kg} onChange={(e) => upd(mercancias, setMercancias, i, { peso_kg: Number(e.target.value) })} className="input" /></Field>
                <Field label="Valor mercancía"><input type="number" min={0} step="0.01" value={m.valor_mercancia ?? 0} onChange={(e) => upd(mercancias, setMercancias, i, { valor_mercancia: Number(e.target.value) })} className="input text-money" /></Field>
                <Field label="Moneda"><input value={m.moneda} onChange={(e) => upd(mercancias, setMercancias, i, { moneda: e.target.value.toUpperCase() })} className="input font-mono" /></Field>
                <Field label="Material peligroso">
                  <select value={m.material_peligroso ? "1" : "0"} onChange={(e) => upd(mercancias, setMercancias, i, { material_peligroso: e.target.value === "1" })} className="input">
                    <option value="0">No</option><option value="1">Sí</option>
                  </select>
                </Field>
              </div>
            </div>
          ))}
        </section>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm">Cancelar</button>
          <button disabled={submitting || noVeh || noOp} className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {submitting ? "Timbrando…" : "Timbrar carta porte"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
