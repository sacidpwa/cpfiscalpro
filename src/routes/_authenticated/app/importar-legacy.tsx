import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { importLegacyData } from "@/lib/accounting.functions";
import { useRequireOrg } from "@/lib/use-current-org";
import { PageHeader } from "@/components/app-ui";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/importar-legacy")({
  component: ImportarLegacy,
});

function ImportarLegacy() {
  const org = useRequireOrg();
  const qc = useQueryClient();
  const importFn = useServerFn(importLegacyData);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ cuentas: number; polizas: number; detalles: number; saldos: number } | null>(null);

  async function handleImport() {
    if (!file) return toast.error("Selecciona un archivo JSON");
    setLoading(true);
    setResult(null);
    try {
      const text = await file.text();
      // Validate JSON early
      try { JSON.parse(text); } catch { throw new Error("El archivo no es un JSON válido"); }
      const res = await importFn({ data: { organizationId: org.id, payload: text } });
      setResult({ cuentas: res.cuentas, polizas: res.polizas, detalles: res.detalles, saldos: res.saldos });
      toast.success("Importación completada");
      qc.invalidateQueries({ queryKey: ["accounts", org.id] });
    } catch (e: any) {
      toast.error(e.message ?? "Error al importar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader title="Importar datos contables" description="Carga un archivo JSON con cuentas, pólizas, detalles y saldos legacy (COI)." />
      <div className="p-8">
        <div className="max-w-2xl space-y-6 rounded-lg border bg-card p-6">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Organización destino</label>
            <div className="rounded-md border bg-background px-3 py-2 text-sm">
              <span className="font-semibold tabular-nums">{org.rfc}</span>
              <span className="ml-2 text-muted-foreground">· {org.razon_social}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Archivo JSON</label>
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
              className="block w-full rounded-md border bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-secondary/80"
            />
            {file && <p className="text-xs text-muted-foreground">{file.name} · {(file.size / 1024).toFixed(1)} KB</p>}
          </div>

          <button
            onClick={handleImport}
            disabled={!file || loading}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {loading ? "Importando…" : "Importar"}
          </button>

          {result && (
            <div className="rounded-md border bg-secondary/30 p-4 text-sm">
              <h3 className="mb-3 font-semibold">Resultados</h3>
              <ul className="space-y-1 font-mono text-xs">
                <li>Cuentas: <span className="font-bold tabular-nums">{result.cuentas}</span></li>
                <li>Pólizas: <span className="font-bold tabular-nums">{result.polizas}</span></li>
                <li>Detalles: <span className="font-bold tabular-nums">{result.detalles}</span></li>
                <li>Saldos: <span className="font-bold tabular-nums">{result.saldos}</span></li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
