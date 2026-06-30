import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { importAspelAuto, detectAspelFile, listImportJobs, deleteImportJob } from "@/lib/import-dbf.functions";
import { useRequireOrg } from "@/lib/use-current-org";
import { PageHeader } from "@/components/app-ui";
import { Upload, CheckCircle2, AlertCircle, Database, Trash2, Loader2, FileText, Archive } from "lucide-react";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/importar")({
  component: Importar,
});

type Detected = { kind: string; label: string };
type FileRow = {
  file: File;
  detected: Detected | null;
  status: "pendiente" | "procesando" | "ok" | "error";
  ok?: number;
  errors?: number;
  total?: number;
  storedAs?: string;
  message?: string;
};

// Suggested upload order: catalogs first, then docs, then balances, then raw
const KIND_ORDER: Record<string, number> = {
  coi_ejercicios: 1, coi_monedas: 2, coi_diarios: 3, coi_departamentos: 4,
  coi_cuentas: 5, coi_asocsat: 6,
  coi_polizas: 7, coi_movimientos: 8,
  coi_saldos: 9,
  noi_empleados: 10,
  coi_raw: 99, noi_raw: 99,
};

function Importar() {
  const org = useRequireOrg();
  const qc = useQueryClient();
  const importFn = useServerFn(importAspelAuto);
  const detectFn = useServerFn(detectAspelFile);
  const listJobs = useServerFn(listImportJobs);
  const delJob = useServerFn(deleteImportJob);
  const { data: jobs } = useQuery({ queryKey: ["jobs", org.id], queryFn: () => listJobs({ data: { organizationId: org.id } }) });

  const [items, setItems] = useState<FileRow[]>([]);
  const [running, setRunning] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function onFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    // Detect kind for each (server-side, by filename — fast, no parsing)
    const rows: FileRow[] = await Promise.all(
      arr.map(async (file) => {
        try {
          const det = await detectFn({ data: { fileName: file.name } });
          return { file, detected: det, status: "pendiente" } as FileRow;
        } catch {
          return { file, detected: null, status: "pendiente" } as FileRow;
        }
      }),
    );
    // Sort by recommended order
    rows.sort((a, b) => (KIND_ORDER[a.detected?.kind ?? ""] ?? 50) - (KIND_ORDER[b.detected?.kind ?? ""] ?? 50));
    setItems((prev) => [...prev, ...rows]);
  }

  async function runAll() {
    if (!items.length || running) return;
    setRunning(true);
    for (let i = 0; i < items.length; i++) {
      if (items[i].status === "ok") continue;
      setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, status: "procesando" } : it));
      try {
        const buf = await items[i].file.arrayBuffer();
        const b64 = arrayBufferToBase64(buf);
        const res = await importFn({ data: { organizationId: org.id, fileBase64: b64, fileName: items[i].file.name } });
        setItems((prev) => prev.map((it, idx) => idx === i ? {
          ...it, status: "ok", ok: res.ok, errors: res.errors, total: res.total,
          storedAs: res.storedAs, detected: res.detected,
        } : it));
      } catch (e: any) {
        setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, status: "error", message: e.message } : it));
      }
    }
    setRunning(false);
    qc.invalidateQueries({ queryKey: ["jobs", org.id] });
    qc.invalidateQueries({ queryKey: ["employees", org.id] });
    qc.invalidateQueries({ queryKey: ["accounts", org.id] });
    toast.success("Lote terminado");
  }

  async function doDelete(jobId: string) {
    if (!confirm("¿Eliminar esta importación del historial?")) return;
    setDeletingId(jobId);
    try {
      await delJob({ data: { jobId, deleteRecords: true } });
      qc.invalidateQueries({ queryKey: ["jobs", org.id] });
      toast.success("Eliminado");
    } catch (e: any) { toast.error(e.message); }
    finally { setDeletingId(null); }
  }

  const pending = items.filter((i) => i.status === "pendiente").length;
  const retryable = items.filter((i) => i.status === "pendiente" || i.status === "error").length;
  const okCount = items.filter((i) => i.status === "ok").length;
  const errCount = items.filter((i) => i.status === "error").length;

  return (
    <div>
      <PageHeader title="Importar respaldos Aspel" description="Sube los DBF de un respaldo COI/NOI completo. El sistema detecta cada tabla automáticamente; lo que no reconoce se guarda íntegro como respaldo." />
      <div className="space-y-6 p-8">
        <div className="rounded-lg border bg-card p-6">
          <h3 className="text-sm font-semibold">Paso 1 · Selecciona uno o varios archivos (.DBF, .CSV o .XLSX)</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Puedes arrastrar los 66 DBF de tu respaldo a la vez. El tipo se detecta por nombre y se ordena automáticamente (catálogos primero, pólizas después, saldos al final).
          </p>
          <label className="mt-4 flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed bg-secondary/30 hover:bg-secondary/50">
            <Upload className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm font-medium">Arrastra o haz clic para seleccionar archivos</span>
            <span className="text-xs text-muted-foreground">.dbf · .csv · .xlsx</span>
            <input type="file" multiple accept=".dbf,.DBF,.csv,.CSV,.xlsx,.XLSX,.xls,.XLS,.xlsm,.xlsb" className="hidden"
              onChange={(e) => e.target.files && onFiles(e.target.files)} />
          </label>
        </div>

        {items.length > 0 && (
          <div className="rounded-lg border bg-card p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Paso 2 · Lote ({items.length} archivo{items.length > 1 ? "s" : ""})</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {okCount} listo · {errCount} error · {pending} pendiente
                </span>
                <button
                  onClick={() => setItems([])}
                  disabled={running}
                  className="rounded-md border bg-card px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-40"
                >Limpiar</button>
                <button
                  onClick={runAll}
                  disabled={running || !retryable}
                  className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
                >{running ? "Procesando…" : errCount ? `Reintentar ${retryable} archivo${retryable !== 1 ? "s" : ""}` : `Importar ${pending} pendiente${pending !== 1 ? "s" : ""}`}</button>
              </div>
            </div>
            <div className="mt-4 overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-secondary/50 uppercase text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Archivo</th>
                    <th className="px-2 py-1.5 text-left">Detectado como</th>
                    <th className="px-2 py-1.5 text-right">Filas</th>
                    <th className="px-2 py-1.5 text-right">Errores</th>
                    <th className="px-2 py-1.5 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5 font-mono">{it.file.name}</td>
                      <td className="px-2 py-1.5">
                        <span className="inline-flex items-center gap-1">
                          {it.storedAs === "raw" || it.storedAs === "raw_fallback" ? <Archive className="h-3 w-3 text-muted-foreground" /> : <FileText className="h-3 w-3 text-primary" />}
                          {it.detected?.label ?? "—"}
                        </span>
                        {(it.storedAs === "raw" || it.storedAs === "raw_fallback") && (
                          <span className="ml-1 text-[10px] text-muted-foreground">(guardado como respaldo)</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{it.ok ?? "—"}{it.total != null ? <span className="text-muted-foreground"> / {it.total}</span> : null}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{it.errors ?? "—"}</td>
                      <td className="px-2 py-1.5">
                        {it.status === "procesando" && <span className="inline-flex items-center gap-1 text-warning"><Loader2 className="h-3 w-3 animate-spin"/>Procesando</span>}
                        {it.status === "ok" && <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-3 w-3"/>Importado</span>}
                        {it.status === "error" && <span className="inline-flex items-center gap-1 text-destructive" title={it.message}><AlertCircle className="h-3 w-3"/>Error</span>}
                        {it.status === "pendiente" && <span className="text-muted-foreground">Pendiente</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-start gap-3">
            <Database className="mt-0.5 h-5 w-5 text-primary" />
            <div className="flex-1 text-xs text-muted-foreground">
              <h4 className="text-sm font-semibold text-foreground">Tablas reconocidas</h4>
              <p className="mt-1">
                <strong className="text-foreground">COI:</strong> CUENTAS · POLIZAS/POL* · MOVPOL/MOV* · SALDOS · DEPTOS · DIARIOS · MONEDAS · ASOCSAT · EJERCIC
                · <strong className="text-foreground">NOI:</strong> EMPLEAD/TRABAJ.
                Todas las demás (CONFIG, PARAM, etc.) se guardan completas como respaldo en <code>aspel_raw_rows</code> sin perder información.
              </p>
            </div>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Historial de importaciones</h3>
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-left">Fecha</th><th className="px-3 py-2 text-left">Archivo</th><th className="px-3 py-2 text-left">Tipo</th><th className="px-3 py-2 text-right">OK</th><th className="px-3 py-2 text-right">Errores</th><th className="px-3 py-2 text-left">Estado</th><th className="px-3 py-2 text-center">Acciones</th></tr></thead>
              <tbody className="divide-y">
                {!jobs?.length ? <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Sin importaciones previas.</td></tr>
                  : jobs.map((j: any) => (
                  <tr key={j.id}>
                    <td className="px-3 py-2 text-xs">{fmtDate(j.created_at)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{j.file_name}</td>
                    <td className="px-3 py-2 text-xs">{j.kind}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{j.rows_ok}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{j.rows_error}</td>
                    <td className="px-3 py-2">{j.status === "completado" ? <span className="inline-flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3 w-3"/>Completado</span> : <span className="inline-flex items-center gap-1 text-xs text-warning"><AlertCircle className="h-3 w-3"/>{j.status}</span>}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => doDelete(j.id)}
                        disabled={deletingId === j.id}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-40"
                      >
                        <Trash2 className="h-3 w-3" />
                        {deletingId === j.id ? "…" : "Eliminar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(bin);
}
