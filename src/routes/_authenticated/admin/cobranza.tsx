import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-ui";
import { adminListBilling, adminMarkInvoicePaid } from "@/lib/billing-subs.functions";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/cobranza")({
  component: Cobranza,
});

function Cobranza() {
  const fn = useServerFn(adminListBilling);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-billing"], queryFn: () => fn() });
  const [payInv, setPayInv] = useState<any | null>(null);
  const mark = useServerFn(adminMarkInvoicePaid);

  return (
    <div>
      <PageHeader title="Cobranza" description="Suscripciones, mensualidades y adeudos por cliente" />
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Plan</th>
                  <th className="px-3 py-2 text-right">Adeudo</th>
                  <th className="px-3 py-2">Última factura</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data?.rows.map((r: any) => {
                  const ultima = r.invoices[0];
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-mono text-xs">{r.rfc}</div>
                        <div className="text-xs text-muted-foreground">{r.razon_social}</div>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.plan ? (
                          <>
                            <div>{r.plan.plan_name}</div>
                            <div className="text-muted-foreground">${Number(r.plan.mensualidad).toFixed(2)} · día {r.plan.dia_pago}</div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Sin plan</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.adeudo > 0 ? (
                          <span className="font-semibold text-destructive">${r.adeudo.toFixed(2)}</span>
                        ) : (
                          <span className="text-emerald-600">$0.00</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {ultima ? (
                          <div>
                            <div>
                              {ultima.ejercicio}/{String(ultima.mes).padStart(2, "0")} · $
                              {Number(ultima.monto_total).toFixed(2)}
                            </div>
                            <div className="text-muted-foreground">
                              Vence: {ultima.fecha_vencimiento} ·{" "}
                              <span className={ultima.estatus === "pagada" ? "text-emerald-600" : "text-amber-600"}>
                                {ultima.estatus}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {ultima && ultima.estatus !== "pagada" && (
                            <button
                              onClick={() => setPayInv(ultima)}
                              className="rounded border px-2 py-1 text-xs hover:bg-secondary"
                            >
                              <CheckCircle2 className="inline h-3 w-3" /> Marcar pagada
                            </button>
                          )}
                          <Link
                            to="/admin/organizaciones/$orgId"
                            params={{ orgId: r.id }}
                            className="rounded border px-2 py-1 text-xs hover:bg-secondary"
                          >
                            Gestionar
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {payInv && (
        <PayDialog
          invoice={payInv}
          onClose={() => setPayInv(null)}
          onConfirm={async (payload) => {
            try {
              await mark({ data: { invoiceId: payInv.id, ...payload } });
              toast.success("Pago registrado");
              qc.invalidateQueries({ queryKey: ["admin-billing"] });
              setPayInv(null);
            } catch (e: any) {
              toast.error(e.message);
            }
          }}
        />
      )}
    </div>
  );
}

function PayDialog({
  invoice,
  onClose,
  onConfirm,
}: {
  invoice: any;
  onClose: () => void;
  onConfirm: (p: { fecha_pago: string; metodo: any; comprobante_url: string | null; notas: string | null }) => void;
}) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [metodo, setMetodo] = useState(invoice.metodo_pago ?? "transferencia");
  const [notas, setNotas] = useState("");
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md space-y-3 rounded-xl border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">Registrar pago</h3>
        <p className="text-xs text-muted-foreground">
          {invoice.ejercicio}/{String(invoice.mes).padStart(2, "0")} · ${Number(invoice.monto_total).toFixed(2)}
        </p>
        <label className="block text-xs">
          Fecha de pago
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm" />
        </label>
        <label className="block text-xs">
          Método
          <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm">
            <option value="transferencia">Transferencia</option>
            <option value="efectivo">Efectivo</option>
            <option value="stripe">Stripe</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="otro">Otro</option>
          </select>
        </label>
        <label className="block text-xs">
          Notas (opcional)
          <input value={notas} onChange={(e) => setNotas(e.target.value)} className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm" />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-sm">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm({ fecha_pago: fecha, metodo, comprobante_url: null, notas: notas || null })}
            className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground"
          >
            Registrar
          </button>
        </div>
      </div>
    </div>
  );
}
