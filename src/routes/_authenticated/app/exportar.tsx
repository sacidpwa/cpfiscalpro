import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { exportAllData } from "@/lib/accounting.functions";
import { useRequireOrg } from "@/lib/use-current-org";
import { PageHeader } from "@/components/app-ui";
import { Download, Loader2, Database } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/exportar")({
  component: ExportarData,
});

function ExportarData() {
  const org = useRequireOrg();
  const exportFn = useServerFn(exportAllData);
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  async function handleExport() {
    setLoading(true);
    setCounts(null);
    try {
      const res = await exportFn({ data: { organizationId: org.id } });
      setCounts(res.counts);
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export-${org.rfc}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exportadas ${Object.keys(res.tables).length} tablas`);
    } catch (e: any) {
      toast.error(e.message ?? "Error al exportar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader title="Exportar datos" description="Descarga toda la información de tu organización como JSON." />
      <div className="p-8">
        <div className="max-w-2xl space-y-6 rounded-lg border bg-card p-6">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Organización</label>
            <div className="rounded-md border bg-background px-3 py-2 text-sm">
              <span className="font-semibold tabular-nums">{org.rfc}</span>
              <span className="ml-2 text-muted-foreground">· {org.razon_social}</span>
            </div>
          </div>

          <button
            onClick={handleExport}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {loading ? "Exportando…" : "Exportar todo como JSON"}
          </button>

          {counts && (
            <div className="rounded-md border bg-secondary/30 p-4 text-sm">
              <h3 className="mb-3 flex items-center gap-2 font-semibold">
                <Database className="h-4 w-4" /> Tablas exportadas
              </h3>
              <ul className="space-y-1 font-mono text-xs">
                {Object.entries(counts).map(([table, count]) => (
                  <li key={table} className="flex justify-between">
                    <span>{table}</span>
                    <span className="font-bold tabular-nums">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
