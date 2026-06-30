import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getBimestreDetalle } from "@/lib/sua.functions";
import { ArrowLeft, FileDown } from "lucide-react";
import { NOMBRE_BIMESTRE } from "@/lib/sua/calc";
import { generarCedulaPDF } from "@/lib/sua/cedula-pdf";

export const Route = createFileRoute("/_authenticated/app/sua/bimestres/$id")({
  component: BimestreDetail,
});

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function BimestreDetail() {
  const { id } = Route.useParams();
  const fGet = useServerFn(getBimestreDetalle);
  const q = useQuery({ queryKey: ["sua-bim", id], queryFn: () => fGet({ data: { id } }) });

  if (q.isLoading) return <div className="text-sm text-muted-foreground">Cargando…</div>;
  if (q.isError || !q.data) return <div className="text-sm text-destructive">No se pudo cargar.</div>;

  const { header, detalle } = q.data as any;

  const downloadPDF = () => {
    const doc = generarCedulaPDF(header, detalle);
    doc.save(`Cedula_${header.ejercicio}_B${header.bimestre}.pdf`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/app/sua/bimestres" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
        <button onClick={downloadPDF} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
          <FileDown className="h-4 w-4" /> Descargar cédula PDF
        </button>
      </div>

      <div className="rounded-lg border bg-card p-5">
        <h2 className="text-lg font-semibold">
          Bimestre {header.bimestre} ({NOMBRE_BIMESTRE[header.bimestre]}) {header.ejercicio}
        </h2>
        <p className="text-sm text-muted-foreground">
          {header.patron?.razon_social} · {header.patron?.registro_patronal}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="IMSS Mes 1" value={fmt(header.total_imss_mes1)} />
          <Stat label="IMSS Mes 2" value={fmt(header.total_imss_mes2)} />
          <Stat label="RCV" value={fmt(header.total_rcv)} />
          <Stat label="Infonavit" value={fmt(header.total_infonavit)} />
          <Stat label="Total" value={fmt(header.total_bimestre)} emphasis />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-2">NSS</th>
              <th className="p-2">Trabajador</th>
              <th className="p-2 text-right">SBC</th>
              <th className="p-2 text-right">Días M1</th>
              <th className="p-2 text-right">Días M2</th>
              <th className="p-2 text-right">IMSS M1</th>
              <th className="p-2 text-right">IMSS M2</th>
              <th className="p-2 text-right">RCV</th>
              <th className="p-2 text-right">Infonavit</th>
              <th className="p-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {detalle.map((d: any) => (
              <tr key={d.id} className="border-t">
                <td className="p-2">{d.employee?.nss}</td>
                <td className="p-2">{`${d.employee?.apellido_paterno ?? ""} ${d.employee?.apellido_materno ?? ""} ${d.employee?.nombre ?? ""}`.trim()}</td>
                <td className="p-2 text-right">{fmt(d.sbc)}</td>
                <td className="p-2 text-right">{d.dias_mes1}</td>
                <td className="p-2 text-right">{d.dias_mes2}</td>
                <td className="p-2 text-right">{fmt(d.total_imss_mes1)}</td>
                <td className="p-2 text-right">{fmt(d.total_imss_mes2)}</td>
                <td className="p-2 text-right">{fmt(d.total_rcv)}</td>
                <td className="p-2 text-right">{fmt(d.infonavit)}</td>
                <td className="p-2 text-right font-semibold">{fmt(d.total)}</td>
              </tr>
            ))}
            {!detalle.length && (
              <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Sin empleados con días cotizados en este bimestre.</td></tr>
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
