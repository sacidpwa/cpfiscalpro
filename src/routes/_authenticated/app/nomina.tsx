import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef, useEffect, useMemo } from "react";
import { listPayrollPeriods, createPayrollPeriod, runPayroll, getPeriodReceipts, deletePayrollPeriod, updatePayrollPeriod, recalculateReceipt } from "@/lib/payroll.functions";
import { stampPayrollReceipt, stampPayrollPeriodBatch, listReceiptStamps, getCfdiDownloadUrl, cancelCfdiStamp, reconcilePeriodWithFacturapi, listFacturapiPeriodInvoices, getCancellationReceipt, cancelFacturapiInvoice } from "@/lib/cfdi.functions";
import { getBillingConfig } from "@/lib/billing.functions";
import { emailPeriodReceipts, listPeriodEmailLogs, emailSinglePayrollReceipt } from "@/lib/email.functions";
import { useRequireOrg } from "@/lib/use-current-org";
import { PageHeader, EmptyState } from "@/components/app-ui";
import { fmtMoney, fmtDate } from "@/lib/format";
import { Receipt, Plus, Play, X, FileText, Download, Trash2, Stamp, CheckCircle2, AlertCircle, FileDown, Pencil, Mail, History, Info, Eye, RefreshCw, ChevronLeft, ChevronRight, ListChecks, ChevronDown, Loader2 } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ReceiptPreviewDialog } from "@/components/payroll/ReceiptPreviewDialog";


import { toast } from "sonner";



export const Route = createFileRoute("/_authenticated/app/nomina")({
  component: Nomina,
});

function Nomina() {
  const org = useRequireOrg();
  const qc = useQueryClient();
  const fn = useServerFn(listPayrollPeriods);
  const create = useServerFn(createPayrollPeriod);
  const run = useServerFn(runPayroll);
  const recibos = useServerFn(getPeriodReceipts);
  const del = useServerFn(deletePayrollPeriod);
  const upd = useServerFn(updatePayrollPeriod);

  const { data, isLoading } = useQuery({ queryKey: ["periods", org.id], queryFn: () => fn({ data: { organizationId: org.id } }) });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [incluirImss, setIncluirImss] = useState(false);
  const [periodsCollapsed, setPeriodsCollapsed] = useState(true);
  const periodsRef = useRef<HTMLDivElement>(null);
  const periodsCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (periodsCollapsed) return;
      if (periodsRef.current && !periodsRef.current.contains(e.target as Node)) {
        setPeriodsCollapsed(true);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [periodsCollapsed]);

  function selectPeriod(p: any) {
    setSelected(p);
    setPeriodsCollapsed(true);
  }

  async function save(p: any) {
    try {
      await create({ data: { ...p, organizationId: org.id } });
      toast.success("Periodo creado");
      qc.invalidateQueries({ queryKey: ["periods", org.id] });
      setOpen(false);
    } catch (e: any) { toast.error(e.message); }
  }
  async function saveEdit(p: any) {
    try {
      await upd({ data: { ...p, periodId: editing.id } });
      toast.success("Periodo actualizado");
      qc.invalidateQueries({ queryKey: ["periods", org.id] });
      setEditing(null);
    } catch (e: any) { toast.error(e.message); }
  }
  async function calcular(p: any) {
    const t = toast.loading("Calculando nómina…");
    try {
      const res = await run({ data: { organizationId: org.id, periodId: p.id, incluirImss } });
      toast.success(`${res.calculados} recibos · Total neto ${fmtMoney(res.totalNeto)}`, { id: t });
      qc.invalidateQueries({ queryKey: ["periods", org.id] });
      qc.invalidateQueries({ queryKey: ["receipts", p.id] });
      qc.invalidateQueries({ queryKey: ["stamps", p.id] });
    } catch (e: any) { toast.error(e.message, { id: t }); }
  }

  async function eliminar(p: any) {
    if (!confirm(`¿Eliminar periodo #${p.numero}/${p.ejercicio} y todos sus recibos?`)) return;
    const t = toast.loading("Eliminando…");
    try {
      await del({ data: { periodId: p.id } });
      if (selected?.id === p.id) setSelected(null);
      qc.invalidateQueries({ queryKey: ["periods", org.id] });
      toast.success("Periodo eliminado", { id: t });
    } catch (e: any) { toast.error(e.message, { id: t }); }
  }

  return (
    <div>
      <PageHeader title="Nómina" description="Periodos calculados con cálculos de ISR e IMSS"
        actions={<button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"><Plus className="h-4 w-4"/>Nuevo periodo</button>} />
      <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
        <div
          ref={periodsRef}
          onMouseEnter={() => { if (periodsCloseTimer.current) { clearTimeout(periodsCloseTimer.current); periodsCloseTimer.current = null; } setPeriodsCollapsed(false); }}
          onMouseLeave={() => { if (periodsCloseTimer.current) clearTimeout(periodsCloseTimer.current); periodsCloseTimer.current = setTimeout(() => setPeriodsCollapsed(true), 400); }}
          className="relative min-w-0"
        >
          <div className="rounded-lg border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPeriodsCollapsed((v) => !v)}
                  title={periodsCollapsed ? "Expandir periodos" : "Colapsar periodos"}
                  className="inline-flex shrink-0 items-center justify-center rounded-md p-1 hover:bg-secondary"
                >
                  {periodsCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                </button>
                <h3 className="text-sm font-semibold">Periodos</h3>
              </div>
              {!periodsCollapsed && (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={incluirImss} onChange={(e) => setIncluirImss(e.target.checked)} className="h-3.5 w-3.5 rounded border-input" />
                  Incluir IMSS obrero al calcular
                </label>
              )}
            </div>

            <div className={`absolute left-0 right-0 top-full z-30 rounded-b-lg border border-t-0 bg-card shadow-lg overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${periodsCollapsed ? 'max-h-0 opacity-0 py-0' : 'max-h-[600px] opacity-100 p-3'}`}>
              {isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p>
                : !data?.length ? <EmptyState icon={Receipt} title="Sin periodos" description="Crea tu primer periodo de nómina." /> : (
                  <PeriodCarousel data={data} selected={selected} onSelect={(p: any) => { selectPeriod(p); setPeriodsCollapsed(true); }} onCalcular={calcular} onEditar={setEditing} onEliminar={eliminar} />
                )}
            </div>
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Recibos {selected && `· Periodo #${selected.numero}/${selected.ejercicio}`}</h3>
            {selected && <DownloadPdfBtn period={selected} fetcher={recibos} org={org} />}
          </div>
          {!selected ? <EmptyState title="Selecciona un periodo" description="Elige un periodo de la lista para ver el detalle." /> :
            <RecibosView periodId={selected.id} period={selected} fetcher={recibos} incluirImss={incluirImss} />}
        </div>
      </div>
      {open && <NewPeriodModal onClose={() => setOpen(false)} onSave={save} />}
      {editing && <NewPeriodModal onClose={() => setEditing(null)} onSave={saveEdit} initial={editing} title="Editar periodo" />}
    </div>
  );
}

function DownloadPdfBtn({ period, fetcher, org }: { period: any; fetcher: any; org: any }) {
  const [loading, setLoading] = useState(false);
  async function onClick() {
    setLoading(true);
    const t = toast.loading("Generando PDF…");
    try {
      const receipts = await fetcher({ data: { periodId: period.id } });
      if (!receipts?.length) { toast.error("No hay recibos en este periodo", { id: t }); return; }
      const { generateNominaPDF } = await import("@/lib/nomina-pdf");
      generateNominaPDF({ org: { razon_social: org.razon_social, rfc: org.rfc }, period, receipts });
      toast.success("PDF generado", { id: t });
    } catch (e: any) { toast.error(e.message ?? "Error", { id: t }); }
    finally { setLoading(false); }
  }
  return (
    <button onClick={onClick} disabled={loading}
      className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-xs font-medium hover:bg-secondary disabled:opacity-50">
      <Download className="h-3.5 w-3.5"/>{loading ? "Generando…" : "Descargar PDF"}
    </button>
  );
}

function PeriodCarousel({ data, selected, onSelect, onCalcular, onEditar, onEliminar }: any) {
  const scrollRef = useRef<HTMLDivElement>(null);
  function scroll(dir: "left" | "right") {
    const el = scrollRef.current;
    if (!el) return;
    const amount = dir === "left" ? -280 : 280;
    el.scrollBy({ left: amount, behavior: "smooth" });
  }
  return (
    <div className="relative">
      <button onClick={() => scroll("left")} className="absolute -left-2 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border bg-card p-1 shadow-sm hover:bg-secondary lg:block">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-2 pt-1 snap-x snap-mandatory scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none]">
        {data.map((p: any) => {
          const active = selected?.id === p.id;
          return (
            <div key={p.id} className={`relative w-60 shrink-0 snap-start rounded-lg border bg-card p-3 shadow-sm transition-all ${active ? "border-primary ring-1 ring-primary/30" : "hover:border-muted-foreground/30"}`}>
              <button onClick={() => onSelect(p)} className="w-full text-left">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{p.ejercicio} · #{p.numero}</div>
                    <div className="text-xs capitalize text-muted-foreground">{p.periodicidad}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{fmtDate(p.fecha_inicio)} → {fmtDate(p.fecha_fin)}</div>
                  </div>
                  <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide">{p.estatus}</span>
                </div>
              </button>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button onClick={() => onSelect(p)} className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs hover:bg-secondary" title="Ver"><FileText className="h-3.5 w-3.5"/>Ver</button>
                {p.estatus !== "cerrado" && <button onClick={() => onCalcular(p)} className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90" title="Calcular"><Play className="h-3.5 w-3.5"/>Calcular</button>}
                {p.estatus !== "cerrado" && <button onClick={() => onEditar(p)} className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs hover:bg-secondary" title="Editar"><Pencil className="h-3.5 w-3.5"/>Editar</button>}
                {p.estatus !== "cerrado" && <button onClick={() => onEliminar(p)} className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs text-destructive hover:bg-destructive/10" title="Eliminar"><Trash2 className="h-3.5 w-3.5"/></button>}
              </div>
            </div>
          );
        })}
      </div>
      <button onClick={() => scroll("right")} className="absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border bg-card p-1 shadow-sm hover:bg-secondary lg:block">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function RecibosView({ periodId, period, fetcher, incluirImss }: { periodId: string; period: any; fetcher: any; incluirImss: boolean }) {
  const qc = useQueryClient();
  const org = useRequireOrg();
  const listStamps = useServerFn(listReceiptStamps);
  const stampOne = useServerFn(stampPayrollReceipt);
  const stampBatch = useServerFn(stampPayrollPeriodBatch);
  const dlUrl = useServerFn(getCfdiDownloadUrl);
  const sendEmails = useServerFn(emailPeriodReceipts);
  const getCfg = useServerFn(getBillingConfig);
  const sendOne = useServerFn(emailSinglePayrollReceipt);
  const cancelStamp = useServerFn(cancelCfdiStamp);
  const recalcOne = useServerFn(recalculateReceipt);
  const reconcile = useServerFn(reconcilePeriodWithFacturapi);
  const [sending, setSending] = useState(false);
  const [sendingOne, setSendingOne] = useState<string | null>(null);
  const [recalcing, setRecalcing] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [bulkStamping, setBulkStamping] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileRes, setReconcileRes] = useState<any[] | null>(null);
  const [showFapiList, setShowFapiList] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["receipts", periodId], queryFn: () => fetcher({ data: { periodId } }) });
  const { data: stamps } = useQuery({
    queryKey: ["stamps", periodId],
    queryFn: () => listStamps({ data: { periodId } }),
  });
  const { data: billing } = useQuery({
    queryKey: ["billing-config", org.id],
    queryFn: () => getCfg({ data: { organization_id: org.id } }),
  });
  const currentEnv = billing?.environment ?? "test";

  const [showLog, setShowLog] = useState(false);

  const stampMap = new Map<string, any>();
  (stamps ?? []).forEach((s: any) => {
    const prev = stampMap.get(s.reference_id);
    if (!prev || new Date(s.created_at) > new Date(prev.created_at)) {
      stampMap.set(s.reference_id, s);
    }
  });

  const timbrarMut = useMutation({
    mutationFn: (receiptId: string) => stampOne({ data: { receiptId } }),
    onSuccess: (res, receiptId) => {
      if (res.alreadyStamped) toast.info(`Ya estaba timbrado · ${res.uuid}`);
      else toast.success(`Timbrado ✓ UUID ${res.uuid?.slice(0, 8)}…`);
      qc.invalidateQueries({ queryKey: ["stamps", periodId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error al timbrar"),
  });

  async function timbrarTodos() {
    if (!data?.length) return;
    // Sólo los que no estén ya timbrados
    const pend = data.filter((r: any) => {
      const s = stampMap.get(r.id);
      return s?.estatus !== "timbrado" || s?.ambiente !== currentEnv;
    });
    if (!pend.length) { toast.info("No hay recibos pendientes de timbrar"); return; }
    if (!confirm(`Timbrar ${pend.length} recibos pendientes?`)) return;
    setBulkStamping(true);
    let ok = 0;
    const errores: { receiptId: string; nombre: string; msg: string }[] = [];
    const excludeReceiptIds = new Set<string>();
    const t = toast.loading(`Timbrando 0/${pend.length}…`);
    try {
      while (ok + errores.length < pend.length) {
        const res = await stampBatch({ data: { periodId, limit: 4, excludeReceiptIds: Array.from(excludeReceiptIds) } });
        ok += Number(res.stamped ?? 0);
        for (const e of res.errors ?? []) {
          errores.push({ receiptId: e.receiptId, nombre: e.employee ?? e.receiptId.slice(0, 8), msg: e.error ?? "Error" });
          excludeReceiptIds.add(e.receiptId);
        }
        toast.loading(`Timbrando ${Math.min(ok + errores.length, pend.length)}/${pend.length}…`, { id: t });
        if (!res.processed || res.remainingPending === 0) break;
        await qc.invalidateQueries({ queryKey: ["stamps", periodId] });
        await new Promise((resDelay) => setTimeout(resDelay, 400));
      }
    } catch (e: any) {
      errores.push({ receiptId: "general", nombre: "Lote", msg: e?.message ?? "Error" });
    } finally {
      setBulkStamping(false);
    }
    qc.invalidateQueries({ queryKey: ["stamps", periodId] });
    if (errores.length === 0) {
      toast.success(`${ok} timbrados correctamente`, { id: t });
    } else {
      toast.error(`${ok} timbrados, ${errores.length} fallidos. Intenta de nuevo: continuará con los pendientes.`, { id: t, duration: 8000 });
      console.error("Recibos que fallaron al timbrar:", errores);
      errores.slice(0, 3).forEach((e) => toast.error(`${e.nombre}: ${e.msg}`, { duration: 10000 }));
    }
  }
  async function descargar(stampId: string, kind: "xml" | "pdf") {
    try {
      const { url } = await dlUrl({ data: { stampId, kind } });
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("Error al descargar el archivo");
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `${stampId.slice(0, 8)}.${kind}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch (e: any) { toast.error(e.message); }
  }

  async function enviarUno(receiptId: string, empName: string, empEmail?: string) {
    if (!empEmail) { toast.error(`${empName} no tiene correo registrado`); return; }
    if (!confirm(`Enviar el recibo a ${empName} (${empEmail})?`)) return;
    setSendingOne(receiptId);
    const t = toast.loading(`Enviando a ${empEmail}…`);
    try {
      await sendOne({ data: { receiptId } });
      toast.success(`Enviado a ${empEmail}`, { id: t });
    } catch (e: any) {
      toast.error(e.message ?? "Error", { id: t });
    } finally {
      setSendingOne(null);
    }
  }
  

  async function recalcular(r: any, stampOverride?: { id: string; uuid_sat?: string; estatus?: string } | null) {
    const s = stampOverride ?? stampMap.get(r.id);
    const empName = [r.employee?.nombre, r.employee?.apellido_paterno].filter(Boolean).join(" ") || "este recibo";
    const isStamped = s?.estatus === "timbrado";
    const msg = isStamped
      ? `Vas a RECALCULAR el recibo de ${empName}.\n\nEsto:\n1) CANCELARÁ el CFDI vigente en FacturAPI/SAT (UUID ${String(s?.uuid_sat ?? "").slice(0, 8)}…, motivo 02)\n2) Recalculará con los datos actuales del empleado\n3) Volverá a timbrar uno nuevo (consume 1 timbre)\n\n¿Continuar?`
      : `Recalcular el recibo de ${empName} con los datos actuales?`;
    if (!confirm(msg)) return;
    setRecalcing(r.id);
    const t = toast.loading(isStamped ? "Cancelando CFDI…" : "Recalculando…");
    try {
      if (isStamped && s?.id) {
        await cancelStamp({ data: { stampId: s.id, motive: "02" } });
        toast.loading("Recalculando…", { id: t });
      }
      await recalcOne({ data: { receiptId: r.id, incluirImss } });
      await qc.invalidateQueries({ queryKey: ["receipts", periodId] });
      await qc.invalidateQueries({ queryKey: ["stamps", periodId] });
      if (isStamped) {
        toast.loading("Re-timbrando…", { id: t });
        const res = await stampOne({ data: { receiptId: r.id, force: true } });
        toast.success(`Listo · nuevo UUID ${String(res.uuid ?? "").slice(0, 8)}…`, { id: t });
      } else {
        toast.success("Recibo recalculado", { id: t });
      }
      qc.invalidateQueries({ queryKey: ["stamps", periodId] });
    } catch (e: any) {
      toast.error(e.message ?? "Error", { id: t, duration: 8000 });
    } finally {
      setRecalcing(null);
    }
  }


  async function descargarZip() {
    const all = (data ?? []).map((r: any) => ({ r, s: stampMap.get(r.id) }));
    if (!all.length) { toast.error("No hay recibos"); return; }
    setDownloadingZip(true);
    const t = toast.loading(`Preparando ZIP (0/${all.length})…`);
    try {
      const { default: JSZip } = await import("jszip");
      const { generateNominaPDF } = await import("@/lib/nomina-pdf");
      const zip = new JSZip();
      let n = 0;
      for (const { r, s } of all) {
        const safeName = [r.employee?.numero, r.employee?.nombre, r.employee?.apellido_paterno]
          .filter(Boolean).join("_").replace(/[^\w-]+/g, "_").slice(0, 80) || r.id.slice(0, 8);
        const isStamped = s?.estatus === "timbrado";
        if (isStamped) {
          const tasks: Array<Promise<void>> = [];
          if (s.pdf_path) tasks.push((async () => {
            const { url } = await dlUrl({ data: { stampId: s.id, kind: "pdf" } });
            const buf = await (await fetch(url)).arrayBuffer();
            zip.file(`timbrados/${safeName}.pdf`, buf);
          })());
          if (s.xml_path) tasks.push((async () => {
            const { url } = await dlUrl({ data: { stampId: s.id, kind: "xml" } });
            const buf = await (await fetch(url)).arrayBuffer();
            zip.file(`timbrados/${safeName}.xml`, buf);
          })());
          await Promise.all(tasks);
        } else {
          // Genera un PDF individual (no timbrado) usando el reporte de un solo empleado
          const res: any = generateNominaPDF({
            org: { razon_social: org.razon_social, rfc: org.rfc },
            period: period,
            receipts: [r],
            output: "blob",
          });
          if (res?.blob) {
            const buf = await res.blob.arrayBuffer();
            zip.file(`sin_timbrar/${safeName}.pdf`, buf);
          }
        }
        n++;
        toast.loading(`Preparando ZIP (${n}/${all.length})…`, { id: t });
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Recibos_Nomina_${periodId.slice(0, 8)}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`ZIP listo (${n} recibos)`, { id: t });
    } catch (e: any) {
      toast.error(e.message ?? "Error generando ZIP", { id: t });
    } finally {
      setDownloadingZip(false);
    }
  }


  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (!data?.length) return <EmptyState title="Sin recibos" description="Calcula este periodo para generar los recibos." />;
  const tot = (k: string) => data.reduce((s: number, r: any) => s + Number(r[k] ?? 0), 0);
  const pendientes = data.filter((r: any) => {
    const s = stampMap.get(r.id);
    return !s || s.estatus !== "timbrado" || s.ambiente !== currentEnv;
  }).length;
  const timbradosCount = data.filter((r: any) => stampMap.get(r.id)?.estatus === "timbrado").length;
  const actionLabel = (isStamped: boolean) => (isStamped ? "Recalcular" : "Calcular");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          onClick={() => setShowLog(true)}
          className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary"
          title="Historial de envíos de correo de este periodo"
        >
          <History className="h-3.5 w-3.5" /> Log de este periodo
        </button>
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
              title="Conciliación y CFDIs sincronizados con FacturAPI"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${reconciling ? "animate-spin" : ""}`} />
              {reconciling ? "Conciliando…" : "Concilia"}
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-1">
            <button
              onClick={async () => {
                setReconciling(true);
                const t = toast.loading("Consultando FacturAPI…");
                try {
                  const res = await reconcile({ data: { periodId } });
                  setReconcileRes(res.results);
                  await qc.invalidateQueries({ queryKey: ["stamps", periodId] });
                  const diffs = res.results.filter((r: any) => r.status === "diff").length;
                  const matches = res.results.filter((r: any) => r.status === "match").length;
                  const nost = res.results.filter((r: any) => r.status === "no_stamp").length;
                  toast.success(`${matches} coinciden · ${diffs} con diferencia · ${nost} sin CFDI`, { id: t, duration: 6000 });
                } catch (e: any) { toast.error(e.message ?? "Error", { id: t }); }
                finally { setReconciling(false); }
              }}
              disabled={reconciling}
              className="flex w-full items-start gap-2 rounded px-2 py-2 text-left text-xs hover:bg-secondary disabled:opacity-50"
            >
              <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <div className="font-medium">Conciliar contra FacturAPI</div>
                <div className="text-[11px] text-muted-foreground">Compara totales locales vs CFDI vigentes y enlaza huérfanos.</div>
              </div>
            </button>
            <button
              onClick={() => setShowFapiList(true)}
              className="flex w-full items-start gap-2 rounded px-2 py-2 text-left text-xs hover:bg-secondary"
            >
              <ListChecks className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <div className="font-medium">CFDIs emitidos en este periodo</div>
                <div className="text-[11px] text-muted-foreground">Ver, cancelar y descargar acuse SAT desde FacturAPI.</div>
              </div>
            </button>
          </PopoverContent>
        </Popover>


        <button
          onClick={descargarZip}
          disabled={downloadingZip}
          className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
          title="Descarga todos los recibos del periodo en un ZIP (PDF/XML timbrados + PDF sin timbrar)"
        >
          {downloadingZip ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {downloadingZip ? "Preparando ZIP…" : "Descargar todos los recibos"}
        </button>

        <button
          onClick={async () => {
            if (timbradosCount === 0) return;
            if (!confirm("Se enviará a cada empleado su CFDI y un correo resumen a contabilidad (con copia). ¿Continuar?")) return;
            setSending(true);
            const t = toast.loading("Generando resumen y enviando correos…");
            try {
              // Genera el PDF resumen del periodo en el cliente
              const receiptsForPdf = await fetcher({ data: { periodId } });
              const { generateNominaPDF } = await import("@/lib/nomina-pdf");
              const pdfRes = generateNominaPDF({
                org: { razon_social: org.razon_social, rfc: org.rfc },
                period,
                receipts: receiptsForPdf,
                output: "base64",
              }) as { filename: string; base64: string };

              const res = await sendEmails({
                data: {
                  periodId,
                  summaryPdfBase64: pdfRes.base64,
                  summaryPdfFilename: pdfRes.filename,
                },
              });
              const extra = res.summarySent ? " · Resumen enviado a contabilidad" : (res.summaryError ? ` · Resumen FALLÓ: ${res.summaryError}` : "");
              toast.success(`Enviados: ${res.sent} · Sin correo: ${res.sinEmail ?? res.skipped} · Errores: ${res.failed}${extra}`, { id: t, duration: 8000 });
              if (res.failed > 0) console.warn("Errores envío:", res.details.filter((d: any) => d.status === "error"));
            } catch (e: any) {
              toast.error(e.message ?? "Error", { id: t });
            } finally {
              setSending(false);
            }
          }}
          disabled={sending || timbradosCount === 0}
          className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
          title="Envía a cada empleado su PDF + XML, y un resumen del periodo a contabilidad"
        >
          <Mail className="h-3.5 w-3.5" /> {sending ? "Enviando…" : `Enviar por correo (${timbradosCount})`}
        </button>
        {pendientes === 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Todos timbrados ({timbradosCount})
          </span>
        ) : (
          <button
            onClick={timbrarTodos}
            disabled={bulkStamping || timbrarMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Stamp className="h-3.5 w-3.5" /> {bulkStamping ? "Timbrando…" : `Timbrar todos (${pendientes} pendientes)`}
          </button>
        )}
      </div>

      {/* Card stack — móvil/tablet */}
      <div className="space-y-2 lg:hidden">
        {data.map((r: any) => {
          const s = stampMap.get(r.id);
          const isStamped = s?.estatus === "timbrado";
          return (
            <div key={r.id} className="rounded-lg border bg-card p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{[r.employee?.nombre, r.employee?.apellido_paterno].filter(Boolean).join(" ")}</div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">{r.employee?.rfc ?? r.employee?.numero} {r.employee?.cp_fiscal ? `· CP ${r.employee.cp_fiscal}` : ""}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Neto</div>
                  <NetoConDesglose receipt={r} />
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 rounded-md bg-secondary/40 p-2 text-xs">
                <div><div className="text-[10px] uppercase text-muted-foreground">Percep.</div><div className="text-money">{fmtMoney(r.total_percepciones)}</div></div>
                <div><div className="text-[10px] uppercase text-muted-foreground">ISR</div><div className="text-money">{fmtMoney(r.isr)}</div></div>
                <div><div className="text-[10px] uppercase text-muted-foreground">IMSS</div><div className="text-money">{fmtMoney(r.imss_obrero)}</div></div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setPreviewId(r.id)}
                  title="Ver detalle del recibo"
                  className="inline-flex items-center gap-1 rounded border bg-card px-2 py-0.5 text-xs hover:bg-secondary"
                >
                  <Eye className="h-3 w-3"/> Ver
                </button>
                {isStamped ? (
                  <>
                    <span title={s.uuid_sat} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${s.ambiente === "live" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}>
                      <CheckCircle2 className="h-3 w-3" /> {s.ambiente}
                    </span>
                    {s.pdf_path && <button onClick={() => descargar(s.id, "pdf")} className="inline-flex items-center gap-1 rounded border bg-card px-2 py-0.5 text-xs hover:bg-secondary"><FileDown className="h-3 w-3"/>PDF</button>}
                    {s.xml_path && <button onClick={() => descargar(s.id, "xml")} className="inline-flex items-center gap-1 rounded border bg-card px-2 py-0.5 text-xs hover:bg-secondary">XML</button>}
                    <button
                      onClick={() => enviarUno(r.id, [r.employee?.nombre, r.employee?.apellido_paterno].filter(Boolean).join(" "), r.employee?.email)}
                      disabled={sendingOne === r.id || !r.employee?.email}
                      title={r.employee?.email ? `Enviar a ${r.employee.email}` : "Sin correo registrado"}
                      className="inline-flex items-center gap-1 rounded border bg-card px-2 py-0.5 text-xs hover:bg-secondary disabled:opacity-50"
                    >
                      <Mail className="h-3 w-3"/>{sendingOne === r.id ? "…" : "Enviar"}
                    </button>
                    {s.ambiente !== currentEnv && (
                      <button onClick={() => timbrarMut.mutate(r.id)} disabled={timbrarMut.isPending} className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-primary hover:bg-primary/20 disabled:opacity-50">
                        <Stamp className="h-3 w-3"/> {currentEnv}
                      </button>
                    )}
                    <button onClick={() => recalcular(r)} disabled={recalcing === r.id} title="Cancelar CFDI, calcular nuevamente y re-timbrar" className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-400">
                      <RefreshCw className={`h-3 w-3 ${recalcing === r.id ? "animate-spin" : ""}`}/> {actionLabel(true)}
                    </button>
                  </>
                ) : s?.estatus === "error" ? (
                  <>
                    <button onClick={() => timbrarMut.mutate(r.id)} title={s.error_message} className="inline-flex items-center gap-1 rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive hover:bg-destructive/20">
                      <AlertCircle className="h-3.5 w-3.5"/> Reintentar
                    </button>
                    <button onClick={() => recalcular(r)} disabled={recalcing === r.id} title="Calcular nuevamente este recibo" className="inline-flex items-center gap-1 rounded border bg-card px-2 py-0.5 text-xs hover:bg-secondary disabled:opacity-50">
                      <RefreshCw className={`h-3 w-3 ${recalcing === r.id ? "animate-spin" : ""}`}/> {actionLabel(false)}
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => timbrarMut.mutate(r.id)} disabled={timbrarMut.isPending} className="inline-flex items-center gap-1 rounded border bg-card px-2 py-0.5 text-xs hover:bg-secondary disabled:opacity-50">
                      <Stamp className="h-3.5 w-3.5"/> Timbrar
                    </button>
                    <button onClick={() => recalcular(r)} disabled={recalcing === r.id} title="Calcular nuevamente este recibo" className="inline-flex items-center gap-1 rounded border bg-card px-2 py-0.5 text-xs hover:bg-secondary disabled:opacity-50">
                      <RefreshCw className={`h-3 w-3 ${recalcing === r.id ? "animate-spin" : ""}`}/> {actionLabel(false)}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {/* Totales card */}
        <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Totales del periodo</div>
          <div className="mt-1 grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted-foreground">Percep:</span> <span className="text-money font-semibold">{fmtMoney(tot("total_percepciones"))}</span></div>
            <div><span className="text-muted-foreground">ISR:</span> <span className="text-money font-semibold">{fmtMoney(tot("isr"))}</span></div>
            <div><span className="text-muted-foreground">IMSS:</span> <span className="text-money font-semibold">{fmtMoney(tot("imss_obrero"))}</span></div>
            <div><span className="text-muted-foreground">Neto:</span> <span className="text-money text-base font-bold text-primary">{fmtMoney(tot("neto_pagar"))}</span></div>
          </div>
        </div>
      </div>

      {/* Tabla — desktop */}
      <div className="hidden max-h-[70vh] overflow-auto rounded-lg border bg-card lg:block">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Empleado</th>
              <th className="px-3 py-2 text-left">CP fiscal</th>
              <th className="px-3 py-2 text-right">Percep.</th>
              <th className="px-3 py-2 text-right">ISR</th>
              <th className="px-3 py-2 text-right">IMSS</th>
              <th className="px-3 py-2 text-right">Neto</th>
              <th className="px-3 py-2 text-center">CFDI / Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.map((r: any) => {
              const s = stampMap.get(r.id);
              return (
                <tr key={r.id} className="hover:bg-secondary/30">
                  <td className="px-3 py-2"><div className="font-medium">{[r.employee?.nombre, r.employee?.apellido_paterno].filter(Boolean).join(" ")}</div><div className="text-xs font-mono text-muted-foreground">{r.employee?.rfc ?? r.employee?.numero}</div></td>
                  <td className="px-3 py-2 font-mono text-xs">{r.employee?.cp_fiscal ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-money">{fmtMoney(r.total_percepciones)}</td>
                  <td className="px-3 py-2 text-right text-money">{fmtMoney(r.isr)}</td>
                  <td className="px-3 py-2 text-right text-money">{fmtMoney(r.imss_obrero)}</td>
                  <td className="px-3 py-2 text-right"><NetoConDesglose receipt={r} compact /></td>
                  <td className="px-3 py-2 text-center">
                    {s?.estatus === "timbrado" ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => setPreviewId(r.id)} className="rounded p-1 hover:bg-secondary" title="Vista previa del recibo"><Eye className="h-3.5 w-3.5" /></button>
                        <span title={s.uuid_sat} className={`inline-flex items-center gap-1 text-xs ${s.ambiente === "live" ? "text-emerald-600" : "text-amber-600"}`}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> {s.ambiente}
                        </span>
                        {s.pdf_path && <button onClick={() => descargar(s.id, "pdf")} className="rounded p-1 hover:bg-secondary" title="PDF CFDI"><FileDown className="h-3.5 w-3.5" /></button>}
                        {s.xml_path && <button onClick={() => descargar(s.id, "xml")} className="rounded p-1 text-xs hover:bg-secondary" title="XML">XML</button>}
                        <button
                          onClick={() => enviarUno(r.id, [r.employee?.nombre, r.employee?.apellido_paterno].filter(Boolean).join(" "), r.employee?.email)}
                          disabled={sendingOne === r.id || !r.employee?.email}
                          title={r.employee?.email ? `Enviar recibo a ${r.employee.email}` : "Empleado sin correo"}
                          className="rounded p-1 hover:bg-secondary disabled:opacity-40"
                        >
                          <Mail className="h-3.5 w-3.5" />
                        </button>
                        {s.ambiente !== currentEnv && (
                          <button
                            onClick={() => timbrarMut.mutate(r.id)}
                            disabled={timbrarMut.isPending}
                            title={`El timbre actual es de ${s.ambiente}. Volver a timbrar en ${currentEnv}.`}
                            className="ml-1 inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-primary hover:bg-primary/20 disabled:opacity-50"
                          >
                            <Stamp className="h-3 w-3" /> Timbrar en {currentEnv}
                          </button>
                        )}
                        <button onClick={() => recalcular(r)} disabled={recalcing === r.id} title="Cancelar CFDI, calcular nuevamente y re-timbrar" className="ml-1 inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-400">
                          <RefreshCw className={`h-3 w-3 ${recalcing === r.id ? "animate-spin" : ""}`}/> {actionLabel(true)}
                        </button>
                      </div>
                    ) : s?.estatus === "error" ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => setPreviewId(r.id)} className="rounded p-1 hover:bg-secondary" title="Vista previa del recibo"><Eye className="h-3.5 w-3.5" /></button>
                        <button
                          onClick={() => timbrarMut.mutate(r.id)}
                          title={s.error_message}
                          className="inline-flex items-center gap-1 rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive hover:bg-destructive/20"
                        >
                          <AlertCircle className="h-3.5 w-3.5" /> Reintentar
                        </button>
                        <button onClick={() => recalcular(r)} disabled={recalcing === r.id} title="Calcular nuevamente este recibo" className="inline-flex items-center gap-1 rounded border bg-card px-2 py-0.5 text-xs hover:bg-secondary disabled:opacity-50">
                          <RefreshCw className={`h-3 w-3 ${recalcing === r.id ? "animate-spin" : ""}`}/> {actionLabel(false)}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => setPreviewId(r.id)} className="rounded p-1 hover:bg-secondary" title="Vista previa del recibo"><Eye className="h-3.5 w-3.5" /></button>
                      <button
                        onClick={() => timbrarMut.mutate(r.id)}
                        disabled={timbrarMut.isPending}
                        className="inline-flex items-center gap-1 rounded border bg-card px-2 py-0.5 text-xs hover:bg-secondary disabled:opacity-50"
                      >
                        <Stamp className="h-3.5 w-3.5" /> Timbrar
                        </button>
                        <button onClick={() => recalcular(r)} disabled={recalcing === r.id} title="Calcular nuevamente este recibo" className="inline-flex items-center gap-1 rounded border bg-card px-2 py-0.5 text-xs hover:bg-secondary disabled:opacity-50">
                          <RefreshCw className={`h-3 w-3 ${recalcing === r.id ? "animate-spin" : ""}`}/> {actionLabel(false)}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-secondary/30 font-semibold">
            <tr>
              <td className="px-3 py-2">Totales</td>
              <td></td>
              <td className="px-3 py-2 text-right text-money">{fmtMoney(tot("total_percepciones"))}</td>
              <td className="px-3 py-2 text-right text-money">{fmtMoney(tot("isr"))}</td>
              <td className="px-3 py-2 text-right text-money">{fmtMoney(tot("imss_obrero"))}</td>
              <td className="px-3 py-2 text-right text-money">{fmtMoney(tot("neto_pagar"))}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {showLog && <EmailLogModal periodId={periodId} period={period} onClose={() => setShowLog(false)} />}
      <ReceiptPreviewDialog receiptId={previewId} onClose={() => setPreviewId(null)} />
      {reconcileRes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setReconcileRes(null)}>
          <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-lg bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h3 className="font-semibold">Conciliación con FacturAPI</h3>
                <p className="text-xs text-muted-foreground">Compara el total CFDI vs el cálculo actual. Re-timbra uno por uno los que difieran.</p>
              </div>
              <button onClick={() => setReconcileRes(null)} className="rounded p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
            </div>
            <div className="overflow-auto p-4" style={{ maxHeight: "calc(85vh - 60px)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="p-2">Empleado</th>
                    <th className="p-2 text-right">Total FacturAPI</th>
                    <th className="p-2 text-right">Total actual</th>
                    <th className="p-2 text-right">Diferencia</th>
                    <th className="p-2">Estatus</th>
                    <th className="p-2">UUID</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {reconcileRes.map((row: any) => {
                    const r = data?.find((x: any) => x.id === row.receiptId);
                    const color = row.status === "match" ? "text-emerald-700 dark:text-emerald-400" : row.status === "diff" ? "text-amber-700 dark:text-amber-400" : row.status === "no_stamp" ? "text-muted-foreground" : "text-destructive";
                    const label = row.status === "match" ? "Coincide" : row.status === "diff" ? "Diferente" : row.status === "no_stamp" ? "Sin CFDI" : "Error";
                    return (
                      <tr key={row.receiptId} className="border-b">
                        <td className="p-2">
                          <div className="font-medium">{row.employee}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">{row.rfc}</div>
                        </td>
                        <td className="p-2 text-right text-money">{row.total_facturapi != null ? fmtMoney(row.total_facturapi) : "—"}</td>
                        <td className="p-2 text-right text-money">{fmtMoney(row.total_actual)}</td>
                        <td className={`p-2 text-right text-money ${Math.abs(row.diff) > 0.02 ? "text-amber-700 dark:text-amber-400 font-semibold" : ""}`}>{fmtMoney(row.diff)}</td>
                        <td className={`p-2 text-xs font-semibold ${color}`}>{label}{row.message ? ` · ${row.message}` : ""}</td>
                        <td className="p-2 font-mono text-[10px]">{row.uuid ? `${row.uuid.slice(0, 8)}…` : "—"}</td>
                        <td className="p-2 text-right">
                          {row.status === "diff" && r && (
                            <button
                              onClick={async () => {
                                const stampOverride = row.stampId ? { id: row.stampId, uuid_sat: row.uuid, estatus: "timbrado" } : null;
                                await recalcular(r, stampOverride);
                                setReconcileRes((prev: any) => prev?.filter((x: any) => x.receiptId !== row.receiptId) ?? null);
                              }}

                              disabled={recalcing === row.receiptId}
                              className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-400"
                              title="Cancelar CFDI, recalcular y volver a timbrar"
                            >
                              <RefreshCw className={`h-3 w-3 ${recalcing === row.receiptId ? "animate-spin" : ""}`} /> Cancelar y re-timbrar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {showFapiList && (
        <FacturapiPeriodInvoicesModal
          periodId={periodId}
          organizationId={org.id}
          onClose={() => {
            setShowFapiList(false);
            qc.invalidateQueries({ queryKey: ["stamps", periodId] });
          }}
        />
      )}
    </div>


  );
}

function EmailLogModal({ periodId, period, onClose }: { periodId: string; period: any; onClose: () => void }) {
  const listLogs = useServerFn(listPeriodEmailLogs);
  const { data: logs, isLoading } = useQuery({
    queryKey: ["email-logs", periodId],
    queryFn: () => listLogs({ data: { periodId } }),
  });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl max-h-[85vh] overflow-auto rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Log de envíos · Periodo #{period.numero}/{period.ejercicio}</h2>
            <p className="text-xs text-muted-foreground">Historial de los correos enviados a empleados y al resumen de contabilidad.</p>
          </div>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : !logs?.length ? (
          <EmptyState title="Sin envíos registrados" description="Aún no se ha enviado este periodo por correo." />
        ) : (
          <div className="space-y-4">
            {logs.map((log: any) => (
              <div key={log.id} className="rounded-lg border bg-background p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">
                    {new Date(log.created_at).toLocaleString("es-MX")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Desde: <span className="font-mono">{log.from_email ?? "—"}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                  <Stat label="Recibos" value={log.total_recipients} />
                  <Stat label="Enviados" value={log.total_sent} color="text-emerald-600" />
                  <Stat label="Sin correo" value={log.sin_email} color="text-amber-600" />
                  <Stat label="Errores" value={log.total_failed} color="text-destructive" />
                  <Stat label="Resumen" value={log.summary_sent ? "OK" : "—"} color={log.summary_sent ? "text-emerald-600" : "text-muted-foreground"} />
                </div>
                {(log.summary_to?.length || log.summary_cc?.length) ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Resumen a: <span className="font-mono">{(log.summary_to ?? []).join(", ")}</span>
                    {log.summary_cc?.length ? <> · CC: <span className="font-mono">{log.summary_cc.join(", ")}</span></> : null}
                  </p>
                ) : null}
                {log.summary_error && (
                  <p className="mt-2 text-xs text-destructive">Error resumen: {log.summary_error}</p>
                )}
                {Array.isArray(log.details) && log.details.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-primary hover:underline">
                      Ver detalle por empleado ({log.details.length})
                    </summary>
                    <div className="mt-2 overflow-hidden rounded border">
                      <table className="w-full text-xs">
                        <thead className="bg-secondary/50 text-muted-foreground">
                          <tr>
                            <th className="px-2 py-1.5 text-left">Empleado</th>
                            <th className="px-2 py-1.5 text-left">Correo</th>
                            <th className="px-2 py-1.5 text-left">Estatus</th>
                            <th className="px-2 py-1.5 text-left">Error</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {log.details.map((d: any, i: number) => (
                            <tr key={i}>
                              <td className="px-2 py-1">{d.employee}</td>
                              <td className="px-2 py-1 font-mono">{d.email ?? "—"}</td>
                              <td className="px-2 py-1">
                                <span className={
                                  d.status === "enviado" ? "text-emerald-600" :
                                  d.status === "error" ? "text-destructive" :
                                  "text-amber-600"
                                }>{d.status}</span>
                              </td>
                              <td className="px-2 py-1 text-destructive">{d.error ?? ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color = "" }: { label: string; value: any; color?: string }) {
  return (
    <div className="rounded border bg-card px-2 py-1.5">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${color}`}>{value}</div>
    </div>
  );
}



function NewPeriodModal({ onClose, onSave, initial, title }: any) {
  const [f, setF] = useState({
    ejercicio: initial?.ejercicio ?? new Date().getFullYear(),
    numero: initial?.numero ?? 1,
    periodicidad: initial?.periodicidad ?? "quincenal",
    fecha_inicio: initial?.fecha_inicio ?? "",
    fecha_fin: initial?.fecha_fin ?? "",
    fecha_pago: initial?.fecha_pago ?? "",
  });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave({ ...f, numero: Number(f.numero), ejercicio: Number(f.ejercicio) }); }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">{title ?? "Nuevo periodo de nómina"}</h2><button type="button" onClick={onClose}><X className="h-4 w-4"/></button></div>
        <div className="grid grid-cols-2 gap-3">
          <Lbl label="Ejercicio"><input type="number" value={f.ejercicio} onChange={(e) => setF({ ...f, ejercicio: Number(e.target.value) })} className="inp"/></Lbl>
          <Lbl label="No. periodo"><input type="number" value={f.numero} onChange={(e) => setF({ ...f, numero: Number(e.target.value) })} className="inp"/></Lbl>
          <Lbl label="Periodicidad" className="col-span-2">
            <select value={f.periodicidad} onChange={(e) => setF({ ...f, periodicidad: e.target.value })} className="inp">
              <option value="semanal">Semanal (7d)</option>
              <option value="catorcenal">Catorcenal (14d)</option>
              <option value="quincenal">Quincenal (15d)</option>
              <option value="mensual">Mensual (30d)</option>
            </select>
          </Lbl>
          <Lbl label="Inicio"><input type="date" value={f.fecha_inicio} onChange={(e) => setF({ ...f, fecha_inicio: e.target.value })} required className="inp"/></Lbl>
          <Lbl label="Fin"><input type="date" value={f.fecha_fin} onChange={(e) => setF({ ...f, fecha_fin: e.target.value })} required className="inp"/></Lbl>
          <Lbl label="Pago" className="col-span-2"><input type="date" value={f.fecha_pago} onChange={(e) => setF({ ...f, fecha_pago: e.target.value })} required className="inp"/></Lbl>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-secondary">Cancelar</button>
          <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">{initial ? "Guardar" : "Crear"}</button>
        </div>
        <style>{`.inp{width:100%;border:1px solid var(--color-border);background:var(--color-background);border-radius:6px;padding:.4rem .6rem;font-size:.875rem}`}</style>
      </form>
    </div>
  );
}
function Lbl({ label, children, className = "" }: any) {
  return <label className={`block ${className}`}><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>{children}</label>;
}

function NetoConDesglose({ receipt, compact }: { receipt: any; compact?: boolean }) {
  const percep = Number(receipt.total_percepciones ?? 0);
  const exento = Number(receipt.total_exento ?? 0);
  const gravado = Number(receipt.total_gravado ?? 0);
  const subsidio = Number(receipt.subsidio ?? 0);
  const isr = Number(receipt.isr ?? 0);
  const imss = Number(receipt.imss_obrero ?? 0);
  const infonavit = Number(receipt.infonavit ?? 0);
  const otras = Math.max(0, Number(receipt.total_deducciones ?? 0) - isr - imss - infonavit);
  const neto = Number(receipt.neto_pagar ?? 0);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1 rounded hover:bg-secondary/60 transition-colors ${compact ? "px-1.5 py-0.5" : "px-2 py-1"}`}
          title="Ver desglose del cálculo"
        >
          <span className={`text-money font-semibold ${compact ? "" : "text-base"}`}>{fmtMoney(neto)}</span>
          <Info className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3 text-xs">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cómo se compone el neto</div>
        <div className="space-y-1 font-mono">
          <Row label="Total percepciones" value={percep} positive />
          <Row label="  · Gravado ISR" value={gravado} muted />
          <Row label="  · Exento" value={exento} muted />
          <Row label="Subsidio al empleo" value={subsidio} positive />
          <div className="my-1 border-t border-dashed" />
          <Row label="ISR" value={-isr} negative />
          <Row label="IMSS obrero" value={-imss} negative />
          {infonavit > 0 && <Row label="Crédito INFONAVIT" value={-infonavit} negative />}
          {otras > 0 && <Row label="Otras deducciones" value={-otras} negative />}
          <div className="my-1 border-t" />
          <Row label="Neto a pagar" value={neto} bold />
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
          Cálculo conforme LISR Art. 96 + tabla del subsidio al empleo + cuotas obrero IMSS.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function Row({ label, value, positive, negative, muted, bold }: { label: string; value: number; positive?: boolean; negative?: boolean; muted?: boolean; bold?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${bold ? "font-bold" : ""} ${muted ? "text-muted-foreground" : ""}`}>
      <span className="font-sans">{label}</span>
      <span className={`tabular-nums ${positive ? "text-emerald-600 dark:text-emerald-400" : negative ? "text-destructive" : ""}`}>
        {fmtMoney(value)}
      </span>
    </div>
  );
}

function FacturapiPeriodInvoicesModal({ periodId, organizationId, onClose }: { periodId: string; organizationId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listFacturapiPeriodInvoices);
  const cancelFn = useServerFn(cancelFacturapiInvoice);
  const acuseFn = useServerFn(getCancellationReceipt);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["fapi-invoices", periodId],
    queryFn: () => listFn({ data: { periodId } }),
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "canceled" | "pending">("all");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filteredInvoices = useMemo(() => {
    const list = (data?.invoices ?? []) as any[];
    const q = search.trim().toLowerCase();
    const out = list.filter((inv) => {
      if (statusFilter !== "all") {
        const s = inv.status === "canceled" ? "canceled" : inv.status === "pending_cancelation" ? "pending" : "active";
        if (s !== statusFilter) return false;
      }
      if (!q) return true;
      const hay = [inv.customer_name, inv.customer_rfc, inv.uuid, inv.folio, inv.serie, inv.periodNumber ? `${inv.periodYear}-${inv.periodNumber}` : null].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
    out.sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return sortDir === "asc" ? da - db : db - da;
    });
    return out;
  }, [data, search, statusFilter, sortDir]);

  async function cancelInvoice(facturapiId: string, customer: string) {
    const motivePrompt = window.prompt(
      `Motivo de cancelación para ${customer}:\n01 = Comprobante emitido con errores con relación\n02 = Comprobante emitido con errores sin relación\n03 = No se llevó a cabo la operación\n04 = Operación nominativa relacionada en factura global`,
      "02",
    );
    if (!motivePrompt) return;
    const motive = motivePrompt.trim();
    if (!["01", "02", "03", "04"].includes(motive)) {
      toast.error("Motivo inválido"); return;
    }
    let substitution: string | undefined;
    if (motive === "01") {
      const sub = window.prompt("UUID del CFDI que sustituye (requerido para motivo 01):");
      if (!sub) return;
      substitution = sub.trim();
    }
    setBusy(facturapiId);
    const t = toast.loading("Cancelando en FacturAPI/SAT…");
    try {
      const res = await cancelFn({ data: { organizationId, facturapiId, motive: motive as any, substitution } });
      toast.success(`Cancelado · ${res.status}`, { id: t });
      await refetch();
      qc.invalidateQueries({ queryKey: ["stamps", periodId] });
    } catch (e: any) {
      toast.error(e.message ?? "Error", { id: t });
    } finally { setBusy(null); }
  }

  async function downloadAcuse(facturapiId: string, kind: "xml" | "pdf") {
    setBusy(facturapiId + ":" + kind);
    const t = toast.loading(`Descargando acuse ${kind.toUpperCase()}…`);
    try {
      const res = await acuseFn({ data: { organizationId, facturapiId, kind } });
      if (res.notReady || !res.base64) {
        toast.info(res.message ?? "Acuse aún no disponible", { id: t });
        return;
      }
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: res.mime });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Acuse descargado", { id: t });
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo descargar el acuse", { id: t });
    } finally { setBusy(null); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-lg bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="font-semibold">CFDIs de nómina · FacturAPI</h3>
            <p className="text-xs text-muted-foreground">CFDIs emitidos en el rango del periodo. Puedes cancelar y descargar el acuse SAT.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()} disabled={isFetching} className="rounded border bg-card px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50">
              <RefreshCw className={`inline h-3 w-3 ${isFetching ? "animate-spin" : ""}`} /> Refrescar
            </button>
            <button onClick={onClose} className="rounded p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 bg-muted/30">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, RFC, UUID, folio o periodo…"
            className="flex-1 min-w-[200px] rounded border bg-card px-2 py-1 text-xs"
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="rounded border bg-card px-2 py-1 text-xs">
            <option value="all">Todos los estatus</option>
            <option value="active">Vigentes</option>
            <option value="canceled">Cancelados</option>
            <option value="pending">Cancelación pendiente</option>
          </select>
          <button onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")} className="rounded border bg-card px-2 py-1 text-xs hover:bg-secondary">
            Periodo: {sortDir === "asc" ? "↑ más antiguo" : "↓ más reciente"}
          </button>
          <span className="text-xs text-muted-foreground">{filteredInvoices.length} de {data?.invoices?.length ?? 0}</span>
        </div>
        <div className="overflow-auto p-4" style={{ maxHeight: "calc(88vh - 110px)" }}>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Consultando FacturAPI…</p>
          ) : !filteredInvoices.length ? (
            <p className="text-sm text-muted-foreground">No se encontraron CFDIs con los filtros actuales.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="p-2">Receptor</th>
                  <th className="p-2">Folio</th>
                  <th className="p-2">Periodo</th>
                  <th className="p-2">Fecha</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2">Estatus</th>
                  <th className="p-2">UUID</th>
                  <th className="p-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv: any) => {
                  const canceled = inv.status === "canceled";
                  const pending = inv.status === "pending_cancelation";
                  return (
                    <tr key={inv.facturapi_id} className="border-b align-top">
                      <td className="p-2">
                        <div className="font-medium">{inv.customer_name}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">{inv.customer_rfc}</div>
                      </td>
                      <td className="p-2 font-mono text-xs">{[inv.serie, inv.folio].filter(Boolean).join("-") || "—"}</td>
                      <td className="p-2 font-mono text-xs">{inv.periodNumber ? `${inv.periodYear}·#${inv.periodNumber}` : "—"}</td>
                      <td className="p-2 text-xs">{inv.date ? new Date(inv.date).toLocaleString("es-MX") : "—"}</td>
                      <td className="p-2 text-right text-money">{fmtMoney(inv.total)}</td>
                      <td className="p-2 text-xs">
                        <span className={
                          canceled ? "font-semibold text-destructive" :
                          pending ? "font-semibold text-amber-600" :
                          "font-semibold text-emerald-600"
                        }>
                          {canceled ? "Cancelado" : pending ? "Cancelación pendiente" : "Vigente"}
                        </span>
                        {inv.cancellation_status && (
                          <div className="text-[10px] text-muted-foreground">{inv.cancellation_status}</div>
                        )}
                      </td>
                      <td className="p-2 font-mono text-[10px]">{inv.uuid ? `${inv.uuid.slice(0, 13)}…` : "—"}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {!canceled && !pending && (
                            <button
                              onClick={() => cancelInvoice(inv.facturapi_id, inv.customer_name)}
                              disabled={busy === inv.facturapi_id}
                              className="inline-flex items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs text-destructive hover:bg-destructive/20 disabled:opacity-50"
                            >
                              {busy === inv.facturapi_id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <X className="h-3 w-3" />
                              )}
                              {busy === inv.facturapi_id ? "Cancelando…" : "Cancelar"}
                            </button>
                          )}
                          {(canceled || pending) && (
                            <>
                              <button
                                onClick={() => downloadAcuse(inv.facturapi_id, "pdf")}
                                disabled={busy?.startsWith(inv.facturapi_id)}
                                className="inline-flex items-center gap-1 rounded border bg-card px-2 py-0.5 text-xs hover:bg-secondary disabled:opacity-50"
                              >
                                <FileDown className="h-3 w-3" /> Acuse PDF
                              </button>
                              <button
                                onClick={() => downloadAcuse(inv.facturapi_id, "xml")}
                                disabled={busy?.startsWith(inv.facturapi_id)}
                                className="inline-flex items-center gap-1 rounded border bg-card px-2 py-0.5 text-xs hover:bg-secondary disabled:opacity-50"
                              >
                                <Download className="h-3 w-3" /> Acuse XML
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
