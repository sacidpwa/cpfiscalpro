import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, Fragment } from "react";
import { toast } from "sonner";
import { getEstadoResultados, getHelixLarossSplit } from "@/lib/accounting.functions";
import { useRequireOrg } from "@/lib/use-current-org";
import { PageHeader, EmptyState } from "@/components/app-ui";
import { LineChart, ChevronDown, ChevronRight, FileDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/resultados")({
  component: Resultados,
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
function pctFmt(n: number) {
  return n.toFixed(2) + "%";
}
function HLRow({ label, h, l }: { label: string; h: number; l: number }) {
  return (
    <tr>
      <td className="px-3 pl-8 font-mono text-xs">{label}</td>
      <td className="px-3 text-right font-mono font-medium">${fmt(h)}</td>
      <td></td>
      <td className="px-3 text-right font-mono font-medium">${fmt(l)}</td>
      <td></td>
    </tr>
  );
}

function Resultados() {
  const org = useRequireOrg();
  const fn = useServerFn(getEstadoResultados);
  const now = new Date();
  const ej = now.getFullYear();
  const mesAct = now.getMonth() + 1;
  const [ejercicio, setEjercicio] = useState(ej);
  const [desde, setDesde] = useState(1);
  const [hasta, setHasta] = useState(mesAct);
  const [detalle, setDetalle] = useState(true);
  const [splitOn, setSplitOn] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const splitFn = useServerFn(getHelixLarossSplit);
  const { data: splitData } = useQuery({
    queryKey: ["hl-split", org.id, ejercicio, desde, hasta],
    queryFn: () =>
      splitFn({ data: { organizationId: org.id, ejercicio, desdeMes: desde, hastaMes: hasta } }),
    enabled: splitOn,
  });

  const { data: er, isLoading } = useQuery({
    queryKey: ["er", org.id, ejercicio, desde, hasta],
    queryFn: () =>
      fn({ data: { organizationId: org.id, ejercicio, desdeMes: desde, hastaMes: hasta } }),
  });

  function toggle(key: string) {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function downloadPdf() {
    if (!er) return;
    const { generateResultadosPDF } = await import("@/lib/resultados-pdf");
    const t = toast.loading("Generando PDF…");
    try {
      generateResultadosPDF(
        org,
        er,
        desde,
        hasta,
        ejercicio,
        detalle,
        splitOn && splitData ? splitData : null,
      );
      toast.success("PDF generado", { id: t });
    } catch (e: any) {
      toast.error(e.message ?? "Error", { id: t });
    }
  }

  return (
    <div>
      <PageHeader
        title="Estado de Resultados"
        description="Rentabilidad y estructura de ingresos y gastos"
        actions={
          er ? (
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={detalle}
                  onChange={(e) => setDetalle(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Detalle
              </label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={splitOn}
                  onChange={(e) => setSplitOn(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                HELIX-LAROSS
              </label>
              <button
                onClick={downloadPdf}
                className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-xs font-medium hover:bg-secondary"
              >
                <FileDown className="h-3.5 w-3.5" /> Descargar PDF
              </button>
            </div>
          ) : undefined
        }
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
        ) : !er || (!er.ingresos.length && !er.costos.length) ? (
          <EmptyState
            icon={LineChart}
            title="Sin datos"
            description="No hay movimientos contables en el periodo seleccionado."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th rowSpan={2} className="px-3 py-2 text-left" style={{ width: "40%" }}>
                    Cuenta
                  </th>
                  <th
                    colSpan={2}
                    className="px-3 py-2 text-center"
                    style={{ borderRight: "1px solid var(--color-border)" }}
                  >
                    {desde === 1 ? "Enero -" : meses[desde - 1] + " -"}{" "}
                    {hasta === 13 ? "Cierre (P.13)" : meses[hasta - 1]}
                  </th>
                  <th colSpan={2} className="px-3 py-2 text-center">
                    Acumulado {ejercicio}
                  </th>
                </tr>
                <tr>
                  <th className="px-3 py-2 text-right">Importe</th>
                  <th className="px-3 py-2 text-right">%</th>
                  <th className="px-3 py-2 text-right">Importe</th>
                  <th className="px-3 py-2 text-right">%</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {/* INGRESOS */}
                <tr style={{ background: "#eff6ff" }}>
                  <td
                    colSpan={5}
                    className="px-3 py-2 font-bold"
                    style={{ color: "#2563eb", fontSize: ".9rem" }}
                  >
                    INGRESOS
                  </td>
                </tr>
                {er.ingresos.map((c: any, i: number) => (
                  <tr key={i} className="hover:bg-secondary/30">
                    <td className="px-3 pl-6 font-mono text-xs">
                      {c.codigo.replace(/^0+/, "")} — {c.nombre}
                    </td>
                    <td className="px-3 text-right font-mono font-medium">${fmt(c.perVal)}</td>
                    <td className="px-3 text-right font-mono text-muted-foreground">
                      {pctFmt(c.perPct)}
                    </td>
                    <td className="px-3 text-right font-mono font-medium">${fmt(c.ytdVal)}</td>
                    <td className="px-3 text-right font-mono text-muted-foreground">
                      {pctFmt(c.ytdPct)}
                    </td>
                  </tr>
                ))}
                <tr className="font-bold" style={{ borderTop: "2px solid #2563eb" }}>
                  <td className="px-3 py-2">Total Ingresos</td>
                  <td className="px-3 text-right font-mono" style={{ color: "#16a34a" }}>
                    ${fmt(er.totalIngresosPer)}
                  </td>
                  <td className="px-3 text-right font-mono">{pctFmt(100)}</td>
                  <td className="px-3 text-right font-mono" style={{ color: "#16a34a" }}>
                    ${fmt(er.totalIngresosYTD)}
                  </td>
                  <td className="px-3 text-right font-mono">{pctFmt(100)}</td>
                </tr>

                {/* COSTOS */}
                <tr style={{ background: "#fef2f2" }}>
                  <td
                    colSpan={5}
                    className="px-3 py-2 font-bold"
                    style={{ color: "#dc2626", fontSize: ".9rem" }}
                  >
                    COSTOS
                  </td>
                </tr>
                {er.costos.map((c: any, i: number) => (
                  <tr key={i} className="hover:bg-secondary/30">
                    <td className="px-3 pl-6 font-mono text-xs">
                      {c.codigo.replace(/^0+/, "")} — {c.nombre}
                    </td>
                    <td className="px-3 text-right font-mono font-medium">${fmt(c.perVal)}</td>
                    <td className="px-3 text-right font-mono text-muted-foreground">
                      {pctFmt(c.perPct)}
                    </td>
                    <td className="px-3 text-right font-mono font-medium">${fmt(c.ytdVal)}</td>
                    <td className="px-3 text-right font-mono text-muted-foreground">
                      {pctFmt(c.ytdPct)}
                    </td>
                  </tr>
                ))}
                <tr className="font-bold" style={{ borderTop: "2px solid #dc2626" }}>
                  <td className="px-3 py-2">Total Costos</td>
                  <td className="px-3 text-right font-mono" style={{ color: "#dc2626" }}>
                    ${fmt(er.totalCostosPer)}
                  </td>
                  <td className="px-3 text-right font-mono">
                    {pctFmt((er.totalCostosPer / er.ventasPer) * 100)}
                  </td>
                  <td className="px-3 text-right font-mono" style={{ color: "#dc2626" }}>
                    ${fmt(er.totalCostosYTD)}
                  </td>
                  <td className="px-3 text-right font-mono">
                    {pctFmt((er.totalCostosYTD / er.ventasYTD) * 100)}
                  </td>
                </tr>

                {/* UTILIDAD BRUTA */}
                <tr
                  style={{
                    borderTop: "2px solid hsl(var(--color-foreground))",
                    background: "#f8fafc",
                  }}
                >
                  <td className="px-3 py-2 font-bold" style={{ fontSize: ".95rem" }}>
                    Utilidad Bruta
                  </td>
                  <td
                    className="px-3 text-right font-bold font-mono"
                    style={{
                      fontSize: ".95rem",
                      color: er.utilidadBrutaPer >= 0 ? "inherit" : "#dc2626",
                    }}
                  >
                    ${fmt(er.utilidadBrutaPer)}
                  </td>
                  <td className="px-3 text-right font-mono">
                    {pctFmt((er.utilidadBrutaPer / er.ventasPer) * 100)}
                  </td>
                  <td
                    className="px-3 text-right font-bold font-mono"
                    style={{
                      fontSize: ".95rem",
                      color: er.utilidadBrutaYTD >= 0 ? "inherit" : "#dc2626",
                    }}
                  >
                    ${fmt(er.utilidadBrutaYTD)}
                  </td>
                  <td className="px-3 text-right font-mono">
                    {pctFmt((er.utilidadBrutaYTD / er.ventasYTD) * 100)}
                  </td>
                </tr>

                {/* GASTOS DE OPERACIÓN */}
                <tr style={{ background: "#fffbeb" }}>
                  <td
                    colSpan={5}
                    className="px-3 py-2 font-bold"
                    style={{ color: "#d97706", fontSize: ".9rem" }}
                  >
                    GASTOS DE OPERACIÓN
                  </td>
                </tr>
                {Object.entries(er.gastosOpDef || {}).map(
                  ([key, def]: [string, any], idx: number) => {
                    const items = er.gastosOp[key] || [];
                    const hasMov = items.some(
                      (c: any) => Math.abs(c.perVal) > 0.01 || Math.abs(c.ytdVal) > 0.01,
                    );
                    if (!hasMov && key === "otros") return null;
                    const isCollapsed = collapsed[`gasto_${key}`];
                    return (
                      <Fragment key={key}>
                        <tr style={{ cursor: "pointer" }} onClick={() => toggle(`gasto_${key}`)}>
                          <td
                            colSpan={5}
                            className="px-3 pl-4 py-1.5 font-semibold"
                            style={{ fontSize: ".85rem", color: "#92400e" }}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="inline h-3 w-3 mr-1" />
                            ) : (
                              <ChevronDown className="inline h-3 w-3 mr-1" />
                            )}
                            {def.label}
                          </td>
                        </tr>
                        {!isCollapsed &&
                          hasMov &&
                          items.map((c: any, ci: number) =>
                            Math.abs(c.perVal) > 0.01 || Math.abs(c.ytdVal) > 0.01 ? (
                              <tr key={ci}>
                                <td className="px-3 pl-8 font-mono text-xs">
                                  {c.codigo.replace(/^0+/, "")} — {c.nombre}
                                </td>
                                <td className="px-3 text-right font-mono font-medium">
                                  ${fmt(c.perVal)}
                                </td>
                                <td className="px-3 text-right font-mono text-muted-foreground">
                                  {pctFmt(c.perPct)}
                                </td>
                                <td className="px-3 text-right font-mono font-medium">
                                  ${fmt(c.ytdVal)}
                                </td>
                                <td className="px-3 text-right font-mono text-muted-foreground">
                                  {pctFmt(c.ytdPct)}
                                </td>
                              </tr>
                            ) : null,
                          )}
                        <tr
                          className="font-bold"
                          style={{ borderTop: "1px solid var(--color-border)" }}
                        >
                          <td className="px-3 pl-5">Total {def.label}</td>
                          <td className="px-3 text-right font-mono" style={{ color: "#d97706" }}>
                            ${fmt(er.gastosOpTotals[key].perVal)}
                          </td>
                          <td className="px-3 text-right font-mono">
                            {pctFmt((er.gastosOpTotals[key].perVal / er.ventasPer) * 100)}
                          </td>
                          <td className="px-3 text-right font-mono" style={{ color: "#d97706" }}>
                            ${fmt(er.gastosOpTotals[key].ytdVal)}
                          </td>
                          <td className="px-3 text-right font-mono">
                            {pctFmt((er.gastosOpTotals[key].ytdVal / er.ventasYTD) * 100)}
                          </td>
                        </tr>
                      </Fragment>
                    );
                  },
                )}
                <tr className="font-bold" style={{ borderTop: "2px solid #d97706" }}>
                  <td className="px-3 py-2">Total Gastos de Operación</td>
                  <td className="px-3 text-right font-mono" style={{ color: "#d97706" }}>
                    ${fmt(er.totalGastosPer)}
                  </td>
                  <td className="px-3 text-right font-mono">
                    {pctFmt((er.totalGastosPer / er.ventasPer) * 100)}
                  </td>
                  <td className="px-3 text-right font-mono" style={{ color: "#d97706" }}>
                    ${fmt(er.totalGastosYTD)}
                  </td>
                  <td className="px-3 text-right font-mono">
                    {pctFmt((er.totalGastosYTD / er.ventasYTD) * 100)}
                  </td>
                </tr>

                {/* HELIX-LAROSS SPLIT (informativo) */}
                {splitOn && splitData && (
                  <>
                    <tr style={{ background: "#f5f3ff" }}>
                      <td
                        colSpan={5}
                        className="px-3 py-2 font-bold"
                        style={{ color: "#7c3aed", fontSize: ".85rem" }}
                      >
                        HELIX-LAROSS (solo informativo)
                      </td>
                    </tr>
                    <tr
                      className="text-xs uppercase text-muted-foreground"
                      style={{ background: "#f5f3ff" }}
                    >
                      <td className="px-3 pl-6 py-1 font-semibold" style={{ color: "#6b21a8" }}>
                        Concepto
                      </td>
                      <td className="px-3 text-right font-semibold" style={{ color: "#6b21a8" }}>
                        HELIX
                      </td>
                      <td></td>
                      <td className="px-3 text-right font-semibold" style={{ color: "#6b21a8" }}>
                        HELIX-LAROSS
                      </td>
                      <td></td>
                    </tr>
                    <HLRow label="Nómina" h={splitData.helix.nomina} l={splitData.laross.nomina} />
                    <HLRow
                      label="Honorarios Profesionales"
                      h={splitData.helix.asimilados}
                      l={splitData.laross.asimilados}
                    />
                    <HLRow label="IMSS" h={splitData.helix.imss} l={splitData.laross.imss} />
                    <HLRow label="ISN 3%" h={splitData.helix.isn} l={splitData.laross.isn} />
                    <HLRow
                      label="Honorarios"
                      h={splitData.helix.honorarios}
                      l={splitData.laross.honorarios}
                    />
                  </>
                )}

                {/* UTILIDAD OPERACIÓN */}
                <tr
                  style={{
                    borderTop: "2px solid hsl(var(--color-foreground))",
                    background: "#f8fafc",
                  }}
                >
                  <td className="px-3 py-2 font-bold" style={{ fontSize: ".95rem" }}>
                    Utilidad de Operación
                  </td>
                  <td
                    className="px-3 text-right font-bold font-mono"
                    style={{
                      fontSize: ".95rem",
                      color: er.utilidadOperacionPer >= 0 ? "inherit" : "#dc2626",
                    }}
                  >
                    ${fmt(er.utilidadOperacionPer)}
                  </td>
                  <td className="px-3 text-right font-mono">
                    {pctFmt((er.utilidadOperacionPer / er.ventasPer) * 100)}
                  </td>
                  <td
                    className="px-3 text-right font-bold font-mono"
                    style={{
                      fontSize: ".95rem",
                      color: er.utilidadOperacionYTD >= 0 ? "inherit" : "#dc2626",
                    }}
                  >
                    ${fmt(er.utilidadOperacionYTD)}
                  </td>
                  <td className="px-3 text-right font-mono">
                    {pctFmt((er.utilidadOperacionYTD / er.ventasYTD) * 100)}
                  </td>
                </tr>

                {/* OTROS INGRESOS Y GASTOS */}
                <tr style={{ background: "#f0fdf4" }}>
                  <td
                    colSpan={5}
                    className="px-3 py-2 font-bold"
                    style={{ color: "#059669", fontSize: ".9rem" }}
                  >
                    OTROS INGRESOS Y GASTOS
                  </td>
                </tr>
                {Object.entries(er.otrosDef || {}).map(([key, def]: [string, any], idx: number) => {
                  const items = er.otrosGrupos[key] || [];
                  const hasMov = items.some(
                    (c: any) => Math.abs(c.perVal) > 0.01 || Math.abs(c.ytdVal) > 0.01,
                  );
                  if (!hasMov) return null;
                  const isCollapsed = collapsed[`otro_${key}`];
                  return (
                    <Fragment key={key}>
                      <tr style={{ cursor: "pointer" }} onClick={() => toggle(`otro_${key}`)}>
                        <td
                          colSpan={5}
                          className="px-3 pl-4 py-1.5 font-semibold"
                          style={{ fontSize: ".85rem", color: "#065f46" }}
                        >
                          {isCollapsed ? (
                            <ChevronRight className="inline h-3 w-3 mr-1" />
                          ) : (
                            <ChevronDown className="inline h-3 w-3 mr-1" />
                          )}
                          {def.label}
                        </td>
                      </tr>
                      {!isCollapsed &&
                        items.map((c: any, ci: number) =>
                          Math.abs(c.perVal) > 0.01 || Math.abs(c.ytdVal) > 0.01 ? (
                            <tr key={ci}>
                              <td className="px-3 pl-8 font-mono text-xs">
                                {c.codigo.replace(/^0+/, "")} — {c.nombre}
                              </td>
                              <td className="px-3 text-right font-mono font-medium">
                                ${fmt(c.perVal)}
                              </td>
                              <td className="px-3 text-right font-mono text-muted-foreground">
                                {pctFmt(c.perPct)}
                              </td>
                              <td className="px-3 text-right font-mono font-medium">
                                ${fmt(c.ytdVal)}
                              </td>
                              <td className="px-3 text-right font-mono text-muted-foreground">
                                {pctFmt(c.ytdPct)}
                              </td>
                            </tr>
                          ) : null,
                        )}
                      <tr
                        className="font-bold"
                        style={{ borderTop: "1px solid var(--color-border)" }}
                      >
                        <td className="px-3 pl-5">Total {def.label}</td>
                        <td className="px-3 text-right font-mono" style={{ color: "#059669" }}>
                          ${fmt(er.otrosGrupoTotals[key].perVal)}
                        </td>
                        <td className="px-3 text-right font-mono">
                          {pctFmt((er.otrosGrupoTotals[key].perVal / er.ventasPer) * 100)}
                        </td>
                        <td className="px-3 text-right font-mono" style={{ color: "#059669" }}>
                          ${fmt(er.otrosGrupoTotals[key].ytdVal)}
                        </td>
                        <td className="px-3 text-right font-mono">
                          {pctFmt((er.otrosGrupoTotals[key].ytdVal / er.ventasYTD) * 100)}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
                <tr className="font-bold" style={{ borderTop: "1px solid #059669" }}>
                  <td className="px-3 py-2">Total Otros Ingresos</td>
                  <td className="px-3 text-right font-mono" style={{ color: "#059669" }}>
                    ${fmt(er.totalOtrosIngresosPer)}
                  </td>
                  <td className="px-3 text-right font-mono">
                    {pctFmt((er.totalOtrosIngresosPer / er.ventasPer) * 100)}
                  </td>
                  <td className="px-3 text-right font-mono" style={{ color: "#059669" }}>
                    ${fmt(er.totalOtrosIngresosYTD)}
                  </td>
                  <td className="px-3 text-right font-mono">
                    {pctFmt((er.totalOtrosIngresosYTD / er.ventasYTD) * 100)}
                  </td>
                </tr>
                <tr className="font-bold" style={{ borderTop: "1px solid #9333ea" }}>
                  <td className="px-3 py-2">Total Otros Gastos</td>
                  <td className="px-3 text-right font-mono" style={{ color: "#9333ea" }}>
                    ${fmt(er.totalOtrosGastosPer)}
                  </td>
                  <td className="px-3 text-right font-mono">
                    {pctFmt((er.totalOtrosGastosPer / er.ventasPer) * 100)}
                  </td>
                  <td className="px-3 text-right font-mono" style={{ color: "#9333ea" }}>
                    ${fmt(er.totalOtrosGastosYTD)}
                  </td>
                  <td className="px-3 text-right font-mono">
                    {pctFmt((er.totalOtrosGastosYTD / er.ventasYTD) * 100)}
                  </td>
                </tr>

                {/* UTILIDAD NETA */}
                <tr
                  style={{
                    borderTop: "3px double hsl(var(--color-foreground))",
                    background: "#f8fafc",
                  }}
                >
                  <td className="px-3 py-3 font-bold" style={{ fontSize: "1.05rem" }}>
                    Utilidad Neta
                  </td>
                  <td
                    className="px-3 text-right font-bold font-mono"
                    style={{
                      fontSize: "1.05rem",
                      color: er.utilidadNetaPer >= 0 ? "#16a34a" : "#dc2626",
                    }}
                  >
                    ${fmt(er.utilidadNetaPer)}
                  </td>
                  <td className="px-3 text-right font-mono">
                    {pctFmt((er.utilidadNetaPer / er.ventasPer) * 100)}
                  </td>
                  <td
                    className="px-3 text-right font-bold font-mono"
                    style={{
                      fontSize: "1.05rem",
                      color: er.utilidadNetaYTD >= 0 ? "#16a34a" : "#dc2626",
                    }}
                  >
                    ${fmt(er.utilidadNetaYTD)}
                  </td>
                  <td className="px-3 text-right font-mono">
                    {pctFmt((er.utilidadNetaYTD / er.ventasYTD) * 100)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
