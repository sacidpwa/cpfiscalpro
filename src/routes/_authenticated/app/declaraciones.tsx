import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageHeader, EmptyState } from "@/components/app-ui";
import { useOrg } from "@/lib/use-current-org";
import { listMyFilings, getFilingFileUrl, TAX_LABELS } from "@/lib/tax-filings.functions";
import { Download, FileCheck2, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/declaraciones")({
  component: ClientFilings,
});

function ClientFilings() {
  const { current } = useOrg();
  const now = new Date();
  const [ejercicio, setEjercicio] = useState(now.getFullYear());
  const fn = useServerFn(listMyFilings);
  const { data, isLoading } = useQuery({
    queryKey: ["my-filings", current?.id, ejercicio],
    queryFn: () => fn({ data: { organizationId: current!.id, ejercicio } }),
    enabled: !!current,
  });

  const today = new Date();
  const pendientesProximas = (data ?? []).filter(
    (f: any) =>
      f.estatus !== "presentada" &&
      new Date(f.fecha_limite).getTime() - today.getTime() < 7 * 86400000,
  ).length;

  return (
    <div>
      <PageHeader
        title="Mis declaraciones"
        description="Acuses, líneas de captura y cumplimiento fiscal mes a mes"
        actions={
          <input
            type="number"
            value={ejercicio}
            onChange={(e) => setEjercicio(Number(e.target.value))}
            className="w-24 rounded border bg-background px-2 py-1 text-sm"
          />
        }
      />
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        {pendientesProximas > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            Tienes {pendientesProximas} declaración(es) próximas a vencer o vencidas.
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : !data?.length ? (
          <EmptyState
            icon={FileCheck2}
            title="Aún no hay declaraciones registradas"
            description="Tu contador subirá las declaraciones presentadas y verás aquí los acuses y líneas de captura."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Periodo</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Estatus</th>
                  <th className="px-3 py-2">Fecha límite</th>
                  <th className="px-3 py-2">Presentada</th>
                  <th className="px-3 py-2 text-right">Monto pagado</th>
                  <th className="px-3 py-2">Línea de captura</th>
                  <th className="px-3 py-2 text-right">Acuse</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r: any) => {
                  const vencida = r.estatus !== "presentada" && new Date(r.fecha_limite) < today;
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2 text-xs">
                        {r.ejercicio}
                        {r.mes ? `/${String(r.mes).padStart(2, "0")}` : " anual"}
                      </td>
                      <td className="px-3 py-2 text-xs">{TAX_LABELS[r.tipo as keyof typeof TAX_LABELS]}</td>
                      <td className="px-3 py-2 text-xs">
                        <Status value={r.estatus} vencida={vencida} />
                      </td>
                      <td className="px-3 py-2 text-xs">{r.fecha_limite}</td>
                      <td className="px-3 py-2 text-xs">{r.fecha_presentacion ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums">
                        ${Number(r.monto_pagar).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px]">{r.linea_captura ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        {r.acuse_path && <FileLink path={r.acuse_path} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Status({ value, vencida }: { value: string; vencida: boolean }) {
  if (vencida) {
    return <span className="rounded bg-destructive/15 px-2 py-0.5 text-destructive">Vencida</span>;
  }
  const map: Record<string, string> = {
    pendiente: "bg-amber-500/15 text-amber-700",
    en_revision: "bg-blue-500/15 text-blue-700",
    presentada: "bg-emerald-500/15 text-emerald-700",
    con_observaciones: "bg-destructive/15 text-destructive",
  };
  return <span className={`rounded px-2 py-0.5 ${map[value] ?? ""}`}>{value.replace("_", " ")}</span>;
}

function FileLink({ path }: { path: string }) {
  const fn = useServerFn(getFilingFileUrl);
  return (
    <button
      onClick={async () => {
        try {
          const r = await fn({ data: { path } });
          window.open(r.url, "_blank");
        } catch (e: any) {
          toast.error(e.message);
        }
      }}
      className="rounded border px-2 py-1 text-xs hover:bg-secondary"
    >
      <Download className="inline h-3 w-3" /> Descargar
    </button>
  );
}
