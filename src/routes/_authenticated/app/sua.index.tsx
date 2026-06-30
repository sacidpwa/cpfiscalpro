import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listPatrones } from "@/lib/sua.functions";
import { listMovimientos } from "@/lib/sua.functions";
import { useRequireOrg } from "@/lib/use-current-org";
import { KpiCard, EmptyState } from "@/components/app-ui";
import { Building2, ArrowRightLeft, ClipboardList, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/sua/")({
  component: SuaIndex,
});

function SuaIndex() {
  const org = useRequireOrg();
  const fPat = useServerFn(listPatrones);
  const fMov = useServerFn(listMovimientos);
  const pat = useQuery({ queryKey: ["sua-patrones", org.id], queryFn: () => fPat({ data: { organizationId: org.id } }) });
  const mov = useQuery({ queryKey: ["sua-movs", org.id], queryFn: () => fMov({ data: { organizationId: org.id } }) });

  const pendientes = (mov.data ?? []).filter((m: any) => m.estatus === "pendiente_envio").length;
  const enviados = (mov.data ?? []).filter((m: any) => m.estatus === "enviado").length;

  if (pat.isLoading || mov.isLoading) {
    return <div className="text-sm text-muted-foreground">Cargando…</div>;
  }

  if (!pat.data?.length) {
    return (
      <EmptyState
        icon={Building2}
        title="Primero registra tu patrón IMSS"
        description="Antes de capturar movimientos o calcular cuotas, da de alta tu registro patronal con su prima de riesgo."
        action={
          <Link to="/app/sua/patrones" className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            Registrar patrón
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Patrones" value={pat.data.length} hint="registros activos" />
        <KpiCard label="Movimientos pendientes" value={pendientes} hint="por enviar a IDSE" />
        <KpiCard label="Enviados" value={enviados} hint="esperando acuse" />
        <KpiCard label="Total movimientos" value={mov.data?.length ?? 0} hint="histórico" />
      </div>

      <div className="rounded-lg border bg-card p-5">
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <ClipboardList className="h-4 w-4" /> Flujo recomendado
        </h3>
        <ol className="space-y-2 text-sm text-muted-foreground">
          <li><strong className="text-foreground">1.</strong> Captura movimientos afiliatorios (altas, bajas, modificaciones, incapacidades) en <Link to="/app/sua/movimientos" className="text-primary underline">Movimientos IDSE</Link>.</li>
          <li><strong className="text-foreground">2.</strong> Descarga el archivo <code className="rounded bg-muted px-1 text-xs">.txt</code> IDSE y súbelo al portal IDSE del IMSS con tu FIEL.</li>
          <li><strong className="text-foreground">3.</strong> Cuando bajes el acuse, captura el folio para marcarlo como aceptado.</li>
          <li><strong className="text-foreground">4.</strong> Al cierre de cada bimestre, ve a <span className="text-foreground">Bimestres</span> para calcular cuotas IMSS, RCV e Infonavit y descargar la cédula y el archivo SIPARE.</li>
        </ol>
      </div>

      <div className="rounded-lg border border-amber-300/40 bg-amber-50/40 p-4 text-sm dark:bg-amber-950/20">
        <div className="flex gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="text-amber-900 dark:text-amber-200">
            <strong>Sobre el envío a IDSE/SIPARE:</strong> esta aplicación genera los archivos en el formato oficial.
            Igual que el SUA de escritorio, el último paso (subir el archivo y firmar con FIEL) se hace en los portales
            del IMSS porque requieren tu certificado.
          </div>
        </div>
      </div>
    </div>
  );
}
