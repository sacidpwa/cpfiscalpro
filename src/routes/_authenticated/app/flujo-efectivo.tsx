import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getFlujoEfectivo } from "@/lib/accounting.functions";
import { useRequireOrg } from "@/lib/use-current-org";
import { PageHeader, EmptyState } from "@/components/app-ui";
import { Waves, TrendingUp, TrendingDown, Building2, Banknote } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/flujo-efectivo")({
  component: FlujoEfectivo,
});

const meses = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function fmt(n: number) {
  return Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Flecha({ v }: { v: number }) {
  if (Math.abs(v) < 0.01) return <span className="text-muted-foreground">—</span>;
  return v > 0 ? (
    <TrendingUp className="inline h-3 w-3 text-success" />
  ) : (
    <TrendingDown className="inline h-3 w-3 text-destructive" />
  );
}

function Fila({
  label,
  value,
  bold,
  indent,
  color,
}: {
  label: string;
  value: number;
  bold?: boolean;
  indent?: boolean;
  color?: string;
}) {
  return (
    <tr className={bold ? "font-bold" : "hover:bg-secondary/30"}>
      <td className={`px-3 py-1.5 ${indent ? "pl-8" : ""} ${bold ? "" : "text-muted-foreground"}`}>
        {label}
      </td>
      <td className="px-3 py-1.5 text-right font-mono" style={color ? { color } : undefined}>
        {value >= 0 ? "" : "("}
        {fmt(Math.abs(value))}
        {value >= 0 ? "" : ")"}
      </td>
      <td className="px-3 py-1.5 text-center">
        <Flecha v={value} />
      </td>
    </tr>
  );
}

function FlujoEfectivo() {
  const org = useRequireOrg();
  const fn = useServerFn(getFlujoEfectivo);
  const now = new Date();
  const [ejercicio, setEjercicio] = useState(now.getFullYear());
  const [desde, setDesde] = useState(1);
  const [hasta, setHasta] = useState(now.getMonth() + 1);

  const { data: ef, isLoading } = useQuery({
    queryKey: ["flujo", org.id, ejercicio, desde, hasta],
    queryFn: () =>
      fn({ data: { organizationId: org.id, ejercicio, desdeMes: desde, hastaMes: hasta } }),
  });

  return (
    <div>
      <PageHeader
        title="Estado de Flujo de Efectivo"
        description="Origen y aplicación de recursos del periodo"
      />
      <div className="space-y-4 p-8">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
          <label className="block text-xs">
            <span className="mb-1 block text-muted-foreground">Desde</span>
            <select
              value={desde}
              onChange={(e) => setDesde(Number(e.target.value))}
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              {meses.map((m, i) => (
                <option key={i} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-muted-foreground">Hasta</span>
            <select
              value={hasta}
              onChange={(e) => setHasta(Number(e.target.value))}
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              {meses.map((m, i) => (
                <option key={i} value={i + 1}>
                  {m}
                </option>
              ))}
              <option value={13}>Cierre (P.13)</option>
            </select>
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-muted-foreground">Ejercicio</span>
            <input
              type="number"
              value={ejercicio}
              onChange={(e) => setEjercicio(Number(e.target.value))}
              className="rounded-md border bg-background px-2 py-1.5 text-sm w-20"
            />
          </label>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : !ef ? (
          <EmptyState
            icon={Waves}
            title="Sin datos"
            description="No hay movimientos en el periodo seleccionado."
          />
        ) : (
          <div className="max-w-2xl overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {/* Saldo inicial */}
                <tr style={{ background: "#f8fafc" }}>
                  <td className="px-3 py-2 font-bold" style={{ fontSize: ".95rem" }}>
                    <Banknote className="mr-2 inline h-4 w-4 text-muted-foreground" />
                    Saldo de efectivo al inicio
                  </td>
                  <td className="px-3 py-2 text-right font-bold font-mono">
                    ${fmt(ef.efectivoInicio)}
                  </td>
                  <td></td>
                </tr>

                {/* OPERACIÓN */}
                <tr style={{ background: "#eff6ff" }}>
                  <td
                    className="px-3 py-2 font-bold"
                    style={{ color: "#2563eb", fontSize: ".9rem" }}
                  >
                    <TrendingUp className="mr-2 inline h-4 w-4" />
                    FLUJO DE OPERACIÓN
                  </td>
                  <td></td>
                  <td></td>
                </tr>
                <Fila label="Utilidad neta del periodo" value={ef.operacion.utilidadNeta} indent />
                <Fila label="(+) Depreciación" value={ef.operacion.depreciacion} indent />
                <Fila label="(+) Amortización" value={ef.operacion.amortizacion} indent />
                <Fila
                  label="(±) Cambio en cuentas por cobrar"
                  value={ef.operacion.deltaCuentasPorCobrar}
                  indent
                />
                <Fila
                  label="(±) Cambio en IVA acreditable"
                  value={ef.operacion.deltaIvaAcreditable}
                  indent
                />
                <Fila
                  label="(±) Cambio en pagos anticipados"
                  value={ef.operacion.deltaPagosAnticipados}
                  indent
                />
                <Fila
                  label="(±) Cambio en anticipos a proveedores"
                  value={ef.operacion.deltaAnticiposProveedores}
                  indent
                />
                <Fila
                  label="(±) Cambio en cuentas por pagar"
                  value={ef.operacion.deltaCuentasPorPagar}
                  indent
                />
                <Fila
                  label="(±) Cambio en IVA por trasladar"
                  value={ef.operacion.deltaIvaPorTrasladar}
                  indent
                />
                <Fila
                  label="(±) Cambio en ISR por pagar"
                  value={ef.operacion.deltaIsrPorPagar}
                  indent
                />
                <Fila
                  label="(±) Cambio en retenciones"
                  value={ef.operacion.deltaRetenciones}
                  indent
                />
                <Fila
                  label="(±) Cambio en nómina por pagar"
                  value={ef.operacion.deltaNominaPorPagar}
                  indent
                />
                <Fila
                  label="(±) Cambio en impuestos por pagar"
                  value={ef.operacion.deltaImpuestosPorPagar}
                  indent
                />
                <Fila
                  label="(±) Otros pasivos / créditos diferidos"
                  value={ef.operacion.deltaOtroPasivo + ef.operacion.deltaCreditosDiferidos}
                  indent
                />
                <Fila
                  label="Total flujo de operación"
                  value={ef.operacion.total}
                  bold
                  color={ef.operacion.total >= 0 ? "#16a34a" : "#dc2626"}
                />

                {/* INVERSIÓN */}
                <tr style={{ background: "#fffbeb" }}>
                  <td
                    className="px-3 py-2 font-bold"
                    style={{ color: "#d97706", fontSize: ".9rem" }}
                  >
                    <Building2 className="mr-2 inline h-4 w-4" />
                    FLUJO DE INVERSIÓN
                  </td>
                  <td></td>
                  <td></td>
                </tr>
                <Fila
                  label="(±) Cambio en activo fijo"
                  value={ef.inversion.deltaActivoFijo}
                  indent
                />
                <Fila
                  label="(±) Cambio en inversiones"
                  value={ef.inversion.deltaInversiones}
                  indent
                />
                <Fila
                  label="(±) Cambio en deudores diversos"
                  value={ef.inversion.deltaDeudoresDiversos}
                  indent
                />
                <Fila
                  label="(±) Cambio en documentos por cobrar"
                  value={ef.inversion.deltaDocumentosCobrar}
                  indent
                />
                <Fila
                  label="Total flujo de inversión"
                  value={ef.inversion.total}
                  bold
                  color={ef.inversion.total >= 0 ? "#16a34a" : "#dc2626"}
                />

                {/* FINANCIAMIENTO */}
                <tr style={{ background: "#f0fdf4" }}>
                  <td
                    className="px-3 py-2 font-bold"
                    style={{ color: "#059669", fontSize: ".9rem" }}
                  >
                    <Banknote className="mr-2 inline h-4 w-4" />
                    FLUJO DE FINANCIAMIENTO
                  </td>
                  <td></td>
                  <td></td>
                </tr>
                <Fila
                  label="(±) Préstamos bancarios"
                  value={ef.financiamiento.deltaPrestamosBancarios}
                  indent
                />
                <Fila label="(±) Cambio en capital" value={ef.financiamiento.deltaCapital} indent />
                <Fila
                  label="Total flujo de financiamiento"
                  value={ef.financiamiento.total}
                  bold
                  color={ef.financiamiento.total >= 0 ? "#16a34a" : "#dc2626"}
                />

                {/* RESULTADO */}
                <tr
                  style={{
                    borderTop: "2px solid hsl(var(--color-foreground))",
                    background: "#f8fafc",
                  }}
                >
                  <td className="px-3 py-3 font-bold" style={{ fontSize: "1rem" }}>
                    Flujo neto del periodo
                  </td>
                  <td
                    className="px-3 py-3 text-right font-bold font-mono"
                    style={{ fontSize: "1rem", color: ef.flujoNeto >= 0 ? "#16a34a" : "#dc2626" }}
                  >
                    {ef.flujoNeto >= 0 ? "" : "("}
                    {fmt(Math.abs(ef.flujoNeto))}
                    {ef.flujoNeto >= 0 ? "" : ")"}
                  </td>
                  <td></td>
                </tr>
                <tr style={{ background: "#f8fafc" }}>
                  <td className="px-3 py-2 font-bold">Saldo de efectivo al cierre</td>
                  <td className="px-3 py-2 text-right font-bold font-mono">
                    ${fmt(ef.efectivoFin)}
                  </td>
                  <td></td>
                </tr>
                <tr style={{ background: "#f8fafc" }}>
                  <td className="px-3 py-2 text-muted-foreground">
                    Saldo calculado (inicio + flujo neto)
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                    ${fmt(ef.efectivoCalculado)}
                  </td>
                  <td></td>
                </tr>
                <tr style={{ borderTop: "1px solid var(--color-border)", background: "#f8fafc" }}>
                  <td
                    className="px-3 py-2 font-bold"
                    style={{ color: Math.abs(ef.diferencia) < 0.01 ? "#16a34a" : "#dc2626" }}
                  >
                    Diferencia
                  </td>
                  <td
                    className="px-3 py-2 text-right font-bold font-mono"
                    style={{ color: Math.abs(ef.diferencia) < 0.01 ? "#16a34a" : "#dc2626" }}
                  >
                    ${fmt(ef.diferencia)}
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {ef && Math.abs(ef.diferencia) > 0.01 && (
          <div className="max-w-2xl rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-muted-foreground">
            <strong className="text-destructive">⚠ Diferencia de conciliación:</strong> El saldo
            calculado (${fmt(ef.efectivoCalculado)}) no coincide con el saldo real ($
            {fmt(ef.efectivoFin)}). Esto puede deberse a ajustes manuales sin póliza o movimientos
            de cierre de ejercicio que afectan saldos pero no efectivo.
          </div>
        )}
      </div>
    </div>
  );
}
