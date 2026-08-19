import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-ui";
import {
  adminListPendingInvoices,
  adminAutoGenerateInvoices,
  adminStampSubscriptionInvoice,
  adminEmailSubscriptionInvoice,
  adminMarkInvoicePaid,
  adminUpdateInvoiceMetodo,
  adminCancelSubscriptionInvoice,
} from "@/lib/billing-subs.functions";
import { getCfdiDownloadUrl } from "@/lib/cfdi.functions";
import { Loader2, CheckCircle2, Send, Stamp, Plus, Download, Eye, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/cobranza")({
  component: Cobranza,
});

const ESTATUS_CLASSES: Record<string, string> = {
  pendiente: "text-amber-600",
  generada: "text-blue-600",
  pagada: "text-emerald-600",
  vencida: "text-red-600",
  cancelada: "text-muted-foreground line-through",
};

function Cobranza() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListPendingInvoices);
  const generateFn = useServerFn(adminAutoGenerateInvoices);
  const stampFn = useServerFn(adminStampSubscriptionInvoice);
  const emailFn = useServerFn(adminEmailSubscriptionInvoice);
  const markPaidFn = useServerFn(adminMarkInvoicePaid);
  const updateMetodoFn = useServerFn(adminUpdateInvoiceMetodo);
  const cancelFn = useServerFn(adminCancelSubscriptionInvoice);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["admin-pending-invoices"],
    queryFn: () => listFn(),
  });

  const getUrl = useServerFn(getCfdiDownloadUrl);

  const [generating, setGenerating] = useState(false);
  const [stampingId, setStampingId] = useState<string | null>(null);
  const [emailingId, setEmailingId] = useState<string | null>(null);

  async function download(stampId: string, kind: "xml" | "pdf") {
    try {
      const { base64, mime, filename } = await getUrl({ data: { stampId, kind } });
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
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(objUrl);
      }, 1000);
    } catch (e: any) { toast.error(e.message); }
  }

  async function previewPdf(stampId: string) {
    try {
      const { base64, mime } = await getUrl({ data: { stampId, kind: "pdf" } });
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime });
      const objUrl = URL.createObjectURL(blob);
      window.open(objUrl, "_blank");
    } catch (e: any) { toast.error(e.message); }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const r = await generateFn();
      toast.success(`Facturas generadas: ${r.created}`);
      qc.invalidateQueries({ queryKey: ["admin-pending-invoices"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleStamp(invoice: any) {
    setStampingId(invoice.id);
    try {
      const r = await stampFn({ data: { invoiceId: invoice.id } });
      toast.success(`Factura timbrada · UUID: ${r.uuid?.slice(0, 8)}…`);
      qc.invalidateQueries({ queryKey: ["admin-pending-invoices"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setStampingId(null);
    }
  }

  async function handleEmail(invoice: any) {
    setEmailingId(invoice.id);
    try {
      const r = await emailFn({ data: { invoiceId: invoice.id } });
      toast.success(`Correo enviado a ${r.to}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setEmailingId(null);
    }
  }

  async function handleMarkPaid(invoice: any) {
    try {
      await markPaidFn({
        data: {
          invoiceId: invoice.id,
          fecha_pago: new Date().toISOString().slice(0, 10),
          metodo: invoice.metodo_pago ?? "transferencia",
        },
      });
      toast.success("Pago registrado");
      qc.invalidateQueries({ queryKey: ["admin-pending-invoices"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleCancel(invoice: any) {
    if (!confirm(`¿Cancelar el CFDI de ${invoice.organizations?.razon_social}?`)) return;
    try {
      await cancelFn({ data: { invoiceId: invoice.id } });
      toast.success("CFDI cancelado");
      qc.invalidateQueries({ queryKey: ["admin-pending-invoices"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const pendientes = (invoices ?? []).filter(
    (i: any) => i.estatus !== "pagada" && i.estatus !== "cancelada"
  );

  return (
    <div>
      <PageHeader
        title="Cobranza"
        description="Facturas de suscripción pendientes · SAC → Cliente"
        actions={
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {generating ? "Generando…" : "Generar pendientes"}
          </button>
        }
      />
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : pendientes.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
            No hay facturas pendientes.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Periodo</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                  <th className="px-3 py-2">Vencimiento</th>
                  <th className="px-3 py-2">Estatus</th>
                  <th className="px-3 py-2">CFDI</th>
                  <th className="px-3 py-2">Método pago</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((inv: any) => {
                  const org = inv.organizations ?? {};
                  const cfdiExists = !!inv.cfdi_stamp;
                  const stampId = stampingId === inv.id;
                  const emailId = emailingId === inv.id;
                  return (
                    <tr key={inv.id} className="border-t hover:bg-secondary/20">
                      <td className="px-3 py-2">
                        <div className="font-mono text-xs">{org.rfc}</div>
                        <div className="text-xs text-muted-foreground">{org.razon_social}</div>
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {inv.ejercicio}/{String(inv.mes).padStart(2, "0")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        ${Number(inv.monto_total).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-xs">{inv.fecha_vencimiento}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs font-medium ${ESTATUS_CLASSES[inv.estatus] ?? ""}`}>
                          {inv.estatus}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {cfdiExists ? (
                          <span className="text-emerald-600">Timbrado</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <MetodoPagoSelect
                          value={inv.metodo_pago ?? "transferencia"}
                          onChange={async (metodo) => {
                            try {
                              await updateMetodoFn({ data: { invoiceId: inv.id, metodo } });
                              qc.invalidateQueries({ queryKey: ["admin-pending-invoices"] });
                            } catch (e: any) {
                              toast.error(e.message);
                            }
                          }}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1 flex-wrap">
                          {cfdiExists ? (
                            <>
                              <span className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 font-medium">
                                <Stamp className="h-3 w-3" />
                                Timbrada
                              </span>
                              <button
                                onClick={() => previewPdf(inv.cfdi_stamp.id)}
                                className="rounded p-1 hover:bg-secondary"
                                title="Vista previa"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => download(inv.cfdi_stamp.id, "pdf")}
                                className="rounded p-1 hover:bg-secondary"
                                title="Descargar PDF"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => download(inv.cfdi_stamp.id, "xml")}
                                className="rounded border px-1.5 py-0.5 text-[10px] font-mono hover:bg-secondary"
                                title="Descargar XML"
                              >
                                XML
                              </button>
                              <button
                                onClick={() => handleEmail(inv)}
                                disabled={emailId}
                                className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50"
                                title="Enviar por correo"
                              >
                                {emailId ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Send className="h-3 w-3" />
                                )}
                                Enviar
                              </button>
                              {inv.estatus !== "pagada" && inv.estatus !== "cancelada" && (
                                <button
                                  onClick={() => handleCancel(inv)}
                                  className="inline-flex items-center gap-1 rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                                  title="Cancelar CFDI"
                                >
                                  <XCircle className="h-3 w-3" />
                                  Cancelar
                                </button>
                              )}
                            </>
                          ) : (
                            <button
                              onClick={() => handleStamp(inv)}
                              disabled={stampId}
                              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50"
                            >
                              {stampId ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Stamp className="h-3 w-3" />
                              )}
                              Timbrar
                            </button>
                          )}
                          {inv.estatus !== "pagada" && inv.estatus !== "cancelada" && !cfdiExists && (
                            <button
                              onClick={() => handleMarkPaid(inv)}
                              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-secondary"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Pagada
                            </button>
                          )}
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
    </div>
  );
}

function MetodoPagoSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border bg-background px-1.5 py-1 text-xs"
    >
      <option value="transferencia">Transferencia</option>
      <option value="efectivo">Efectivo</option>
      <option value="stripe">Stripe</option>
      <option value="tarjeta">Tarjeta</option>
      <option value="otro">Otro</option>
    </select>
  );
}
