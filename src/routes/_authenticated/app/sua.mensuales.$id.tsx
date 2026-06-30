import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMensualDetalle } from "@/lib/sua.functions";
import { ArrowLeft, FileDown } from "lucide-react";
import { NOMBRE_MES } from "@/lib/sua/calc-mensual";
import { generarCedulaMensualPDF } from "@/lib/sua/cedula-mensual-pdf";

export const Route = createFileRoute("/_authenticated/app/sua/mensuales/$id")({
  component: MensualDetail,
});

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function MensualDetail() {
  const { id } = Route.useParams();
  const fGet = useServerFn(getMensualDetalle);
  const q = useQuery({ queryKey: ["sua-mens", id], queryFn: () => fGet({ data: { id } }) });

  if (q.isLoading) return <div className="text-sm text-muted-foreground">Cargando…</div>;
  if (q.isError || !q.data) return <div className="text-sm text-destructive">No se pudo cargar.</div>;

  const { header, detalle } = q.data as any;

  const downloadPDF = () => {
    const doc = generarCedulaMensualPDF(header, detalle);
    doc.save(`Cedula_Mensual_${header.ejercicio}_${String(header.mes).padStart(2, "0")}.pdf`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/app/sua/mensuales" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
        <button onClick={downloadPDF} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
          <FileDown className="h-4 w-4" /> Descargar cédula PDF
        </button>
      </div>

      <div className="rounded-lg border bg-card p-5">
        <h2 className="text-lg font-semibold">
          {NOMBRE_MES[header.mes]} {header.ejercicio}
        </h2>
        <p className="text-sm text-muted-foreground">
          {header.patron?.razon_social} · {header.patron?.registro_patronal}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
          <Stat label="EFM" value={fmt(header.total_efm)} />
          <Stat label="GMP" value={fmt(header.total_gmp)} />
          <Stat label="IV" value={fmt(header.total_iv)} />
          <Stat label="Guarderías" value={fmt(header.total_guarderias)} />
          <Stat label="RT" value={fmt(header.total_rt)} />
          <Stat label="Total" value={fmt(header.total_mes)} emphasis />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-2">NSS</th>
              <th className="p-2">Trabajador</th>
              <th className="p-2 text-right">SBC</th>
              <th className="p-2 text-right">Días</th>
              <th className="p-2 text-right">EFM CF</th>
              <th className="p-2 text-right">EFM Exc</th>
              <th className="p-2 text-right">EFM Din</th>
              <th className="p-2 text-right">GMP</th>
              <th className="p-2 text-right">IV</th>
              <th className="p-2 text-right">Guard</th>
              <th className="p-2 text-right">RT</th>
              <th className="p-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {detalle.map((d: any) => (
              <tr key={d.id} className="border-t">
                <td className="p-2">{d.employee?.nss}</td>
                <td className="p-2">{`${d.employee?.apellido_paterno ?? ""} ${d.employee?.apellido_materno ?? ""} ${d.employee?.nombre ?? ""}`.trim()}</td>
                <td className="p-2 text-right">{fmt(d.sbc)}</td>
                <td className="p-2 text-right">{d.dias_cot}</td>
                <td className="p-2 text-right">{fmt(d.efm_cf)}</td>
                <td className="p-2 text-right">{fmt(d.efm_exc)}</td>
                <td className="p-2 text-right">{fmt(d.efm_din)}</td>
                <td className="p-2 text-right">{fmt(d.gmp)}</td>
                <td className="p-2 text-right">{fmt(d.iv)}</td>
                <td className="p-2 text-right">{fmt(d.guarderias)}</td>
                <td className="p-2 text-right">{fmt(d.rt)}</td>
                <td className="p-2 text-right font-semibold">{fmt(d.total)}</td>
              </tr>
            ))}
            {!detalle.length && (
              <tr><td colSpan={12} className="p-6 text-center text-muted-foreground">Sin empleados con días cotizados en este mes.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`rounded border p-3 ${emphasis ? "border-primary bg-primary/5" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-semibold ${emphasis ? "text-lg" : ""}`}>${value}</div>
    </div>
  );
}
