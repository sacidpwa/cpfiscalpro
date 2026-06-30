import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAllOrgRequests, approveOrgRequest, rejectOrgRequest } from "@/lib/org-requests.functions";
import { useState } from "react";
import { Check, X, Clock, Building2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/solicitudes")({
  component: Solicitudes,
});

function Solicitudes() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllOrgRequests);
  const approveFn = useServerFn(approveOrgRequest);
  const rejectFn = useServerFn(rejectOrgRequest);

  const { data, isLoading } = useQuery({
    queryKey: ["org-requests-admin"],
    queryFn: () => listFn(),
  });

  const [tab, setTab] = useState<"pendiente" | "aprobada" | "rechazada">("pendiente");
  const [acting, setActing] = useState<string | null>(null);

  const filtered = (data ?? []).filter((r: any) => r.status === tab);

  async function approve(id: string) {
    const notes = prompt("Notas (opcional):") ?? undefined;
    setActing(id);
    try {
      await approveFn({ data: { requestId: id, notes } });
      toast.success("Organización creada para el solicitante");
      qc.invalidateQueries({ queryKey: ["org-requests-admin"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally { setActing(null); }
  }
  async function reject(id: string) {
    const notes = prompt("Motivo del rechazo (opcional):") ?? undefined;
    setActing(id);
    try {
      await rejectFn({ data: { requestId: id, notes } });
      toast.success("Solicitud rechazada");
      qc.invalidateQueries({ queryKey: ["org-requests-admin"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally { setActing(null); }
  }

  return (
    <div className="p-6 md:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Solicitudes de organizaciones</h1>
        <p className="mt-1 text-sm text-muted-foreground">Aprueba o rechaza solicitudes de los clientes para crear nuevas organizaciones.</p>
      </header>

      <div className="mb-4 inline-flex rounded-md border bg-card p-1">
        {(["pendiente", "aprobada", "rechazada"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded px-3 py-1.5 text-sm capitalize ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
          >
            {t}s ({(data ?? []).filter((r: any) => r.status === t).length})
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : !filtered.length ? (
        <div className="grid place-items-center rounded-lg border bg-card p-10 text-center">
          <Clock className="h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No hay solicitudes {tab}s.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r: any) => (
            <div key={r.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold">{r.razon_social}</h3>
                    <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">{r.rfc}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Solicitada por <span className="font-medium text-foreground">{r.requester?.full_name ?? r.requester?.email ?? "—"}</span>
                    {" · "}{new Date(r.created_at).toLocaleString("es-MX")}
                  </p>
                  {r.regimen_fiscal && <p className="mt-1 text-xs">Régimen: <span className="font-mono">{r.regimen_fiscal}</span></p>}
                  {r.codigo_postal && <p className="mt-1 text-xs">CP: <span className="font-mono">{r.codigo_postal}</span></p>}
                  {r.motivo && <p className="mt-2 rounded bg-secondary/50 p-2 text-xs italic">"{r.motivo}"</p>}
                  {r.admin_notes && <p className="mt-2 text-xs text-muted-foreground">Notas admin: {r.admin_notes}</p>}
                </div>
                {r.status === "pendiente" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => approve(r.id)}
                      disabled={acting === r.id}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" /> Aprobar
                    </button>
                    <button
                      onClick={() => reject(r.id)}
                      disabled={acting === r.id}
                      className="inline-flex items-center gap-1 rounded-md border bg-card px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" /> Rechazar
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
