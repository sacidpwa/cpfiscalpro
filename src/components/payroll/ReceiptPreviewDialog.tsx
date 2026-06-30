import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getReceiptDetail } from "@/lib/payroll.functions";
import { fmtMoney, fmtDate } from "@/lib/format";
import { X, Loader2 } from "lucide-react";

export function ReceiptPreviewDialog({ receiptId, onClose }: { receiptId: string | null; onClose: () => void }) {
  const fn = useServerFn(getReceiptDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["receipt-detail", receiptId],
    queryFn: () => fn({ data: { receiptId: receiptId! } }),
    enabled: !!receiptId,
  });

  if (!receiptId) return null;

  const r = data?.receipt;
  const lines = data?.lines ?? [];
  const emp = r?.employee;
  const period = r?.period;
  const perceps = lines.filter((l: any) => l.tipo === "percepcion");
  const deducs = lines.filter((l: any) => l.tipo === "deduccion");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-2 sm:p-6" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-lg border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Vista previa del recibo</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>

        {isLoading || !r ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : (
          <div className="space-y-4 p-4 text-sm">
            {/* Encabezado */}
            <div className="rounded-md border bg-secondary/30 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Recibo de nómina</div>
                  <div className="text-base font-semibold">
                    {emp?.numero} · {[emp?.nombre, emp?.apellido_paterno, emp?.apellido_materno].filter(Boolean).join(" ")}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {emp?.puesto ?? ""} {emp?.departamento ? `· ${emp.departamento}` : ""}
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div className="text-muted-foreground">Periodo {period?.numero}/{period?.ejercicio}</div>
                  <div>{fmtDate(period?.fecha_inicio)} → {fmtDate(period?.fecha_fin)}</div>
                  <div className="text-muted-foreground">Pago: {fmtDate(period?.fecha_pago)}</div>
                </div>
              </div>
            </div>

            {/* Datos fiscales */}
            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <Field label="RFC" value={emp?.rfc} />
              <Field label="CURP" value={emp?.curp} />
              <Field label="NSS" value={emp?.nss} />
              <Field label="CP fiscal" value={emp?.cp_fiscal} />
              <Field label="SDI" value={emp?.sdi != null ? fmtMoney(emp.sdi) : "—"} />
              <Field label="Sal. diario" value={emp?.salario_diario != null ? fmtMoney(emp.salario_diario) : "—"} />
              <Field label="Días pagados" value={r.dias_pagados ?? "—"} />
              <Field label="Régimen" value={emp?.regimen_fiscal_receptor} />
            </div>

            {/* Percepciones y deducciones */}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border">
                <div className="border-b bg-emerald-500/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  Percepciones
                </div>
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase text-muted-foreground">
                    <tr><th className="px-2 py-1 text-left">Clave</th><th className="px-2 py-1 text-left">Concepto</th><th className="px-2 py-1 text-right">Importe</th></tr>
                  </thead>
                  <tbody>
                    {perceps.length === 0 && <tr><td colSpan={3} className="px-2 py-3 text-center text-muted-foreground">Sin percepciones</td></tr>}
                    {perceps.map((l: any) => (
                      <tr key={l.id} className="border-t">
                        <td className="px-2 py-1 font-mono">{l.concepto_clave}</td>
                        <td className="px-2 py-1">{l.descripcion}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{fmtMoney(Number(l.importe_gravado) + Number(l.importe_exento))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-secondary/40 font-semibold">
                      <td colSpan={2} className="px-2 py-1.5">Total</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(r.total_percepciones)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="rounded-md border">
                <div className="border-b bg-destructive/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-destructive">
                  Deducciones
                </div>
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase text-muted-foreground">
                    <tr><th className="px-2 py-1 text-left">Clave</th><th className="px-2 py-1 text-left">Concepto</th><th className="px-2 py-1 text-right">Importe</th></tr>
                  </thead>
                  <tbody>
                    {deducs.length === 0 && <tr><td colSpan={3} className="px-2 py-3 text-center text-muted-foreground">Sin deducciones</td></tr>}
                    {deducs.map((l: any) => (
                      <tr key={l.id} className="border-t">
                        <td className="px-2 py-1 font-mono">{l.concepto_clave}</td>
                        <td className="px-2 py-1">{l.descripcion}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{fmtMoney(Number(l.importe_gravado) + Number(l.importe_exento))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-secondary/40 font-semibold">
                      <td colSpan={2} className="px-2 py-1.5">Total</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(r.total_deducciones)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Totales */}
            <div className="rounded-md border-2 border-primary/40 bg-primary/5 p-3">
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <Field label="Gravado" value={fmtMoney(r.total_gravado)} />
                <Field label="Exento" value={fmtMoney(r.total_exento)} />
                <Field label="Subsidio" value={fmtMoney(r.subsidio)} />
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Neto a pagar</div>
                  <div className="text-money text-lg font-bold text-primary">{fmtMoney(r.neto_pagar)}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="truncate font-medium">{value ?? "—"}</div>
    </div>
  );
}
