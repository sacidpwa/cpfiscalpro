import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, EmptyState } from "@/components/app-ui";
import { useOrg } from "@/lib/use-current-org";
import { listMyBilling } from "@/lib/billing-subs.functions";
import { Receipt, AlertCircle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/cobranza")({
  component: MyBilling,
});

function MyBilling() {
  const { current } = useOrg();
  const fn = useServerFn(listMyBilling);
  const { data } = useQuery({
    queryKey: ["my-billing", current?.id],
    queryFn: () => fn({ data: { organizationId: current!.id } }),
    enabled: !!current,
  });

  return (
    <div>
      <PageHeader title="Mi suscripción" description="Plan, módulos contratados y estatus de pagos" />
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        {data?.adeudoTotal && data.adeudoTotal > 0 ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <div className="flex items-center gap-2 font-semibold text-destructive">
              <AlertCircle className="h-4 w-4" /> Adeudo pendiente
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Tienes ${data.adeudoTotal.toFixed(2)} pendiente
              {data.diasMasVencida > 0 ? ` · ${data.diasMasVencida} días de atraso` : ""}.
              Contacta a tu administrador para regularizar el pago.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" /> Tu cuenta está al corriente
          </div>
        )}

        <section className="rounded-lg border bg-card p-4 sm:p-6">
          <h3 className="text-sm font-semibold">Plan actual</h3>
          {data?.plan ? (
            <div className="mt-2 grid gap-3 text-sm sm:grid-cols-3">
              <Stat label="Plan" value={(data.plan as any).plan_name} />
              <Stat label="Mensualidad base" value={`$${Number((data.plan as any).mensualidad).toFixed(2)}`} />
              <Stat label="Día de pago" value={String((data.plan as any).dia_pago)} />
              <Stat label="Estatus" value={(data.plan as any).estatus} />
              <Stat label="Método preferido" value={(data.plan as any).metodo_pago_preferido} />
              <Stat label="Vigencia" value={(data.plan as any).fecha_vencimiento ?? "indefinida"} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No tienes un plan asignado.</p>
          )}
        </section>

        <section className="rounded-lg border bg-card p-4 sm:p-6">
          <h3 className="text-sm font-semibold">Módulos contratados</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {data?.modulesActive.length ? (
              data.modulesActive.map((m: any) => (
                <div key={m.modulo} className="flex justify-between rounded border p-3 text-sm">
                  <span className="capitalize">{m.modulo}</span>
                  <span className="font-medium tabular-nums">${Number(m.costo_mensual).toFixed(2)}</span>
                </div>
              ))
            ) : (
              <p className="col-span-2 text-sm text-muted-foreground">Sin módulos activos.</p>
            )}
          </div>
        </section>

        <section className="rounded-lg border bg-card p-4 sm:p-6">
          <h3 className="text-sm font-semibold">Historial de mensualidades</h3>
          {!data?.invoices.length ? (
            <p className="mt-2 text-sm text-muted-foreground">Sin facturas registradas.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1">Periodo</th>
                    <th className="py-1">Vence</th>
                    <th className="py-1">Estatus</th>
                    <th className="py-1 text-right">Total</th>
                    <th className="py-1">Método</th>
                    <th className="py-1">Fecha pago</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.map((i: any) => (
                    <tr key={i.id} className="border-t">
                      <td className="py-1">{i.ejercicio}/{String(i.mes).padStart(2, "0")}</td>
                      <td className="py-1 text-xs">{i.fecha_vencimiento}</td>
                      <td className="py-1 text-xs capitalize">{i.estatus}</td>
                      <td className="py-1 text-right tabular-nums">${Number(i.monto_total).toFixed(2)}</td>
                      <td className="py-1 text-xs capitalize">{i.metodo_pago ?? "—"}</td>
                      <td className="py-1 text-xs">{i.fecha_pago ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium capitalize">{value}</div>
    </div>
  );
}
