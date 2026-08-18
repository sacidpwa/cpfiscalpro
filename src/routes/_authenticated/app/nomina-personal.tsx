import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRequireOrg } from "@/lib/use-current-org";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listEmployees, runPayrollPersonal, listPersonalReceipts } from "@/lib/payroll.functions";
import { getCfdiDownloadUrl } from "@/lib/cfdi.functions";
import { emailSinglePayrollReceipt } from "@/lib/email.functions";
import { Download, FileText, Mail } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/nomina-personal")({
  component: NominaPersonal,
});

type Percepcion = { clave: string; descripcion: string; importe_gravado: number; importe_exento: number };
type Deduccion = { clave: string; descripcion: string; importe: number };

function NominaPersonal() {
  const org = useRequireOrg();
  const [empleadoId, setEmpleadoId] = useState<string>("");
  const [salarioDiario, setSalarioDiario] = useState<number>(315.04);
  const [diasPagados, setDiasPagados] = useState<number>(1);
  const [periodicidad, setPeriodicidad] = useState<"quincenal" | "mensual">("mensual");
  const [percepciones, setPercepciones] = useState<Percepcion[]>([
    { clave: "023", descripcion: "Vacaciones Proporcionales 2025 (Art. 76 LFT)", importe_gravado: 0, importe_exento: 2061.14 },
    { clave: "023", descripcion: "Prima Vacacional 2025 25% (Art. 80 LFT)", importe_gravado: 0, importe_exento: 515.28 },
    { clave: "023", descripcion: "Aguinaldo Proporcional 2026 (Art. 87 LFT)", importe_gravado: 0, importe_exento: 2887.15 },
    { clave: "023", descripcion: "Vacaciones Proporcionales 2026 (Art. 76 LFT)", importe_gravado: 0, importe_exento: 2309.72 },
    { clave: "023", descripcion: "Prima Vacacional 2026 25% (Art. 80 LFT)", importe_gravado: 0, importe_exento: 577.43 },
  ]);
  const [deducciones, setDeducciones] = useState<Deduccion[]>([]);
  const [incluirImss, setIncluirImss] = useState(false);
  const [timbrar, setTimbrar] = useState(true);
  const [esLiquidacion, setEsLiquidacion] = useState(true);
  const [resultado, setResultado] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const empleadosFn = useServerFn(listEmployees);
  const { data: empleados = [] } = useQuery({
    queryKey: ["employees", org.id],
    queryFn: () => empleadosFn({ data: { organizationId: org.id } }),
  });

  // Auto-seleccionar Alejandro Becerril si existe en la lista
  useEffect(() => {
    if (!empleadoId && (empleados as any[]).length > 0) {
      const alejandro = (empleados as any[]).find(
        (e: any) => e.nombre?.toLowerCase().includes("alejandro") && e.apellido_paterno?.toLowerCase().includes("becerril")
      );
      if (alejandro) {
        setEmpleadoId(alejandro.id);
        setSalarioDiario(Number(alejandro.salario_diario) || 315.04);
      }
    }
  }, [empleados, empleadoId]);

  const calcularFn = useServerFn(runPayrollPersonal);
  const dlUrlFn = useServerFn(getCfdiDownloadUrl);
  const listReceiptsFn = useServerFn(listPersonalReceipts);
  const emailFn = useServerFn(emailSinglePayrollReceipt);
  const queryClient = useQueryClient();

  const { data: recibos = [], refetch: refetchRecibos } = useQuery({
    queryKey: ["personal-receipts", org.id],
    queryFn: () => listReceiptsFn({ data: { organizationId: org.id } }),
  });

  async function descargar(stampId: string, kind: "xml" | "pdf") {
    try {
      const { base64, mime, filename } = await dlUrlFn({ data: { stampId, kind } });
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime });
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(objUrl); }, 1000);
    } catch (e: any) { toast.error(e.message ?? "Error al descargar"); }
  }

  async function enviarCorreo(receiptId: string, empName: string) {
    const t = toast.loading(`Enviando a ${empName}...`);
    try {
      await emailFn({ data: { receiptId } });
      toast.success(`Correo enviado a ${empName}`, { id: t });
    } catch (e: any) {
      toast.error(e.message ?? "Error al enviar", { id: t });
    }
  }

  async function handleCalcular() {
    if (!empleadoId) {
      toast.error("Selecciona un empleado");
      return;
    }
    if (salarioDiario <= 0) {
      toast.error("El salario diario debe ser mayor a 0");
      return;
    }
    const t = toast.loading("Generando recibo...");
    setLoading(true);
    try {
      const res = await calcularFn({
        data: {
          organizationId: org.id,
          employeeId: empleadoId,
          salarioDiario,
          diasPagados,
          periodicidad,
          percepciones,
          deducciones,
          incluirImss,
          timbrar,
          esLiquidacion,
        },
      });
      toast.success("Recibo generado exitosamente", { id: t });
      setResultado(res);
      refetchRecibos();
    } catch (e: any) {
      toast.error(e.message ?? "Error generando recibo", { id: t });
    } finally {
      setLoading(false);
    }
  }

  function agregarPercepcion() {
    setPercepciones(prev => [...prev, { clave: "", descripcion: "", importe_gravado: 0, importe_exento: 0 }]);
  }

  function eliminarPercepcion(idx: number) {
    setPercepciones(prev => prev.filter((_, i) => i !== idx));
  }

  function actualizarPercepcion(idx: number, campo: keyof Percepcion, valor: string | number) {
    setPercepciones(prev => {
      const nuevo = [...prev];
      nuevo[idx] = { ...nuevo[idx], [campo]: valor };
      return nuevo;
    });
  }

  function agregarDeduccion() {
    setDeducciones(prev => [...prev, { clave: "", descripcion: "", importe: 0 }]);
  }

  function eliminarDeduccion(idx: number) {
    setDeducciones(prev => prev.filter((_, i) => i !== idx));
  }

  function actualizarDeduccion(idx: number, campo: keyof Deduccion, valor: string | number) {
    setDeducciones(prev => {
      const nuevo = [...prev];
      nuevo[idx] = { ...nuevo[idx], [campo]: valor };
      return nuevo;
    });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/app/nomina" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-white p-1 ring-1 ring-border">
              <img src="/icon-192.png" alt="Logo" className="h-full w-full object-contain" />
            </div>
            <span className="font-semibold tracking-tight">CPFiscalPro</span>
          </Link>
          <nav className="hidden gap-6 text-sm text-muted-foreground md:flex">
            <a href="#modulos" className="hover:text-foreground">Módulos</a>
            <a href="#cumplimiento" className="hover:text-foreground">Cumplimiento</a>
            <a href="#seguridad" className="hover:text-foreground">Seguridad</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">Iniciar sesión</Link>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Entrar
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl p-6">
        <PageHeader
          title="Recibo de Nómina Personalizado"
          description="Genera un recibo de nómina individualizado para un empleado dado de baja (renuncia)"
        />

        <div className="bg-card p-6 rounded-lg mb-6">
          <h3 className="text-lg font-semibold mb-4">Datos del Empleado</h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <Label className="block text-sm font-medium">Empleado</Label>
              <select
                value={empleadoId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  const id = e.target.value;
                  setEmpleadoId(id);
                  const emp = (empleados as any[]).find((emp: any) => emp.id === id);
                  if (emp) setSalarioDiario(Number(emp.salario_diario) || 0);
                }}
                className="mt-1 block w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">-- Seleccionar empleado --</option>
                {(empleados as any[]).map((emp: any) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nombre} {emp.apellido_paterno} {emp.apellido_materno} ({emp.estatus})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="block text-sm font-medium">Salario Diario</Label>
              <Input
                type="number"
                value={salarioDiario}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSalarioDiario(Number(e.target.value) || 0)}
                placeholder="0"
                className="mt-1 block w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <Label className="block text-sm font-medium">Días Pagados</Label>
              <Input
                type="number"
                value={diasPagados}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDiasPagados(Number(e.target.value) || 0)}
                placeholder="0"
                className="mt-1 block w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>

            <div>
              <Label className="block text-sm font-medium">Periodicidad</Label>
              <select
                value={periodicidad}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPeriodicidad(e.target.value as "quincenal" | "mensual")}
                className="mt-1 block w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="quincenal">Quincenal</option>
                <option value="mensual">Mensual</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="esLiquidacion"
                checked={esLiquidacion}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEsLiquidacion(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Label htmlFor="esLiquidacion" className="text-sm font-medium">Liquidación / Finiquito</Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="incluirImss"
                checked={incluirImss}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIncluirImss(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Label htmlFor="incluirImss" className="text-sm font-medium">Incluir IMSS obrero</Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="timbrar"
                checked={timbrar}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTimbrar(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Label htmlFor="timbrar" className="text-sm font-medium">Timbrar (FacturAPI)</Label>
            </div>
          </div>

          <div className="mb-4">
            <Label className="block text-sm font-medium">Percepciones</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Agrega percepciones según la ley (Sueldo base, Prima vacacional, Aguinaldo, etc.)
            </p>
            <div className="space-y-2">
              {percepciones.map((p, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={p.clave}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => actualizarPercepcion(idx, "clave", e.target.value)}
                    placeholder="Clave SAT"
                    className="w-24 rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <Input
                    type="text"
                    value={p.descripcion}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => actualizarPercepcion(idx, "descripcion", e.target.value)}
                    placeholder="Descripción"
                    className="flex-1 rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <Input
                    type="number"
                    value={p.importe_gravado}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => actualizarPercepcion(idx, "importe_gravado", Number(e.target.value) || 0)}
                    placeholder="Gravado"
                    className="w-24 rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <Input
                    type="number"
                    value={p.importe_exento}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => actualizarPercepcion(idx, "importe_exento", Number(e.target.value) || 0)}
                    placeholder="Exento"
                    className="w-24 rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => eliminarPercepcion(idx)}
                  >
                    <span className="sr-only">Eliminar</span>
                  </Button>
                </div>
              ))}
              <Button
                onClick={agregarPercepcion}
                className="w-full mt-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Agregar percepción
              </Button>
            </div>
          </div>

          <div className="mb-4">
            <Label className="block text-sm font-medium">Deducciones</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Agrega deducciones según la ley (ISR, IMSS, INFONAVIT, faltas, etc.)
            </p>
            <div className="space-y-2">
              {deducciones.map((d, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={d.clave}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => actualizarDeduccion(idx, "clave", e.target.value)}
                    placeholder="Clave SAT"
                    className="w-24 rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <Input
                    type="text"
                    value={d.descripcion}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => actualizarDeduccion(idx, "descripcion", e.target.value)}
                    placeholder="Descripción"
                    className="flex-1 rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <Input
                    type="number"
                    value={d.importe}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => actualizarDeduccion(idx, "importe", Number(e.target.value) || 0)}
                    placeholder="Importe"
                    className="w-24 rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => eliminarDeduccion(idx)}
                  >
                    <span className="sr-only">Eliminar</span>
                  </Button>
                </div>
              ))}
              <Button
                onClick={agregarDeduccion}
                className="w-full mt-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Agregar deducción
              </Button>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t">
            <Button
              onClick={handleCalcular}
              className="w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
              disabled={loading}
            >
              {loading ? "Calculando..." : "Calcular y Generar Recibo"}
            </Button>
          </div>
        </div>

        {resultado && (
          <div className="bg-card p-6 rounded-lg">
            <h3 className="text-lg font-semibold mb-4">Resultado del Recibo</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm text-muted-foreground">Total percepciones:</span>
                <p className="font-medium">${resultado.total_percepciones?.toFixed(2)}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Total deducciones:</span>
                <p className="font-medium">${resultado.total_deducciones?.toFixed(2)}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">ISR:</span>
                <p className="font-medium">${resultado.isr?.toFixed(2)}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Subsidio:</span>
                <p className="font-medium">${resultado.subsidio?.toFixed(2)}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">IMSS Obrero:</span>
                <p className="font-medium">${resultado.imss_obrero?.toFixed(2)}</p>
              </div>
              <div className="col-span-2 border-t pt-2">
                <span className="text-sm text-muted-foreground">Neto a pagar:</span>
                <p className="text-lg font-bold">${resultado.neto?.toFixed(2)}</p>
              </div>
            </div>
            {resultado.timbrado && (
              <div className="mt-4 p-3 rounded bg-muted">
                <p className="text-sm font-medium">Timbrado:</p>
                {resultado.timbrado.error ? (
                  <p className="text-destructive text-sm">Error: {resultado.timbrado.error}</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-green-700 font-medium">Timbrado exitosamente</p>
                    {resultado.timbrado.uuid && (
                      <p className="text-xs font-mono">UUID: {resultado.timbrado.uuid}</p>
                    )}
                    {resultado.timbrado.stampId && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => descargar(resultado.timbrado.stampId, "pdf")}>
                          Descargar PDF
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => descargar(resultado.timbrado.stampId, "xml")}>
                          Descargar XML
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => {
                          const emp = (empleados as any[]).find((e: any) => e.id === empleadoId);
                          const name = emp ? [emp.nombre, emp.apellido_paterno].filter(Boolean).join(" ") : "Empleado";
                          enviarCorreo(resultado.receiptId, name);
                        }}>
                          Enviar por correo
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {((recibos as any[]).length > 0) && (
          <div className="bg-card p-6 rounded-lg mt-6">
            <h3 className="text-lg font-semibold mb-4">Recibos Generados</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Fecha</th>
                    <th className="pb-2 font-medium">Empleado</th>
                    <th className="pb-2 font-medium">Neto</th>
                    <th className="pb-2 font-medium">UUID</th>
                    <th className="pb-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {(recibos as any[]).map((r: any) => {
                    const empName = [r.employee?.nombre, r.employee?.apellido_paterno, r.employee?.apellido_materno].filter(Boolean).join(" ");
                    return (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-2">{r.created_at ? new Date(r.created_at).toLocaleDateString("es-MX") : "—"}</td>
                        <td className="py-2">{empName || "—"}</td>
                        <td className="py-2 font-medium">${Number(r.neto_pagar ?? 0).toFixed(2)}</td>
                        <td className="py-2 font-mono text-xs">{r.stamp?.uuid_sat?.slice(0, 8) ?? "—"}</td>
                        <td className="py-2">
                          {r.stamp && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => descargar(r.stamp.id, "pdf")} title="Descargar PDF">
                                <FileText className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => descargar(r.stamp.id, "xml")} title="Descargar XML">
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => enviarCorreo(r.id, empName)} title="Enviar por correo">
                                <Mail className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
