import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-ui";
import {
  adminListFilings,
  adminUpsertFiling,
  adminUploadAcuse,
  getFilingFileUrl,
  TAX_LABELS,
} from "@/lib/tax-filings.functions";
import { supabase } from "@/integrations/supabase/client";
import { Upload, FileText, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/declaraciones")({
  component: AdminFilings,
});

const TYPES = Object.keys(TAX_LABELS) as Array<keyof typeof TAX_LABELS>;
const STATUS = ["pendiente", "en_revision", "presentada", "con_observaciones"] as const;

function AdminFilings() {
  const qc = useQueryClient();
  const now = new Date();
  const [ejercicio, setEjercicio] = useState(now.getFullYear());
  const [orgId, setOrgId] = useState<string | "">("");
  const [editing, setEditing] = useState<any | null>(null);

  const { data: orgs } = useQuery({
    queryKey: ["admin-orgs-list"],
    queryFn: async () => {
      const { data } = await supabase.from("organizations").select("id, rfc, razon_social").order("razon_social");
      return data ?? [];
    },
  });

  const fn = useServerFn(adminListFilings);
  const { data: rows } = useQuery({
    queryKey: ["admin-filings", ejercicio, orgId],
    queryFn: () => fn({ data: { ejercicio, organizationId: orgId || undefined } }),
  });

  const upsert = useServerFn(adminUpsertFiling);

  return (
    <div>
      <PageHeader title="Declaraciones" description="Sube acuses y captura la información fiscal por cliente" />
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs">
            Ejercicio
            <input
              type="number"
              value={ejercicio}
              onChange={(e) => setEjercicio(Number(e.target.value))}
              className="ml-2 w-24 rounded border bg-background px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs">
            Cliente
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              className="ml-2 rounded border bg-background px-2 py-1 text-sm"
            >
              <option value="">Todos</option>
              {orgs?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.rfc} — {o.razon_social}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={!orgId}
            onClick={() => setEditing({ new: true, organizationId: orgId, ejercicio })}
            className="ml-auto rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            + Nueva declaración
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Periodo</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Estatus</th>
                <th className="px-3 py-2">Fecha límite</th>
                <th className="px-3 py-2 text-right">Monto</th>
                <th className="px-3 py-2 text-right">Acuse</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 text-xs">
                    <div className="font-mono">{r.organizations?.rfc}</div>
                    <div className="text-muted-foreground">{r.organizations?.razon_social}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.ejercicio}
                    {r.mes ? `/${String(r.mes).padStart(2, "0")}` : " anual"}
                  </td>
                  <td className="px-3 py-2 text-xs">{TAX_LABELS[r.tipo as keyof typeof TAX_LABELS]}</td>
                  <td className="px-3 py-2 text-xs">
                    <StatusBadge value={r.estatus} />
                  </td>
                  <td className="px-3 py-2 text-xs">{r.fecha_limite}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">
                    ${Number(r.monto_pagar).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      {r.acuse_path && <FileLink path={r.acuse_path} label="Acuse" />}
                      <button
                        onClick={() => setEditing(r)}
                        className="rounded border px-2 py-1 text-xs hover:bg-secondary"
                      >
                        Editar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows?.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-xs text-muted-foreground">
                    No hay declaraciones registradas en este ejercicio
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <FilingDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            try {
              await upsert({ data: payload });
              toast.success("Declaración guardada");
              qc.invalidateQueries({ queryKey: ["admin-filings"] });
              setEditing(null);
            } catch (e: any) {
              toast.error(e.message);
            }
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  const map: Record<string, string> = {
    pendiente: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    en_revision: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    presentada: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    con_observaciones: "bg-destructive/15 text-destructive",
  };
  return <span className={`rounded px-2 py-0.5 ${map[value] ?? ""}`}>{value.replace("_", " ")}</span>;
}

function FileLink({ path, label }: { path: string; label: string }) {
  const fn = useServerFn(getFilingFileUrl);
  return (
    <button
      onClick={async () => {
        try {
          const r = await fn({ data: { path } });
          window.open(r.url, "_blank");
        } catch (e: any) {
          toast.error(e.message);
        }
      }}
      className="rounded border px-2 py-1 text-xs hover:bg-secondary"
    >
      <Download className="inline h-3 w-3" /> {label}
    </button>
  );
}

function FilingDialog({
  row,
  onClose,
  onSave,
}: {
  row: any;
  onClose: () => void;
  onSave: (p: any) => void;
}) {
  const upload = useServerFn(adminUploadAcuse);
  const isNew = !!row.new;
  const [f, setF] = useState({
    id: isNew ? null : row.id,
    organizationId: row.organizationId ?? row.organization_id,
    ejercicio: row.ejercicio,
    mes: isNew ? new Date().getMonth() + 1 : row.mes,
    tipo: (isNew ? "isr_mensual" : row.tipo) as keyof typeof TAX_LABELS,
    estatus: (isNew ? "pendiente" : row.estatus) as (typeof STATUS)[number],
    fecha_limite: isNew ? new Date().toISOString().slice(0, 10) : row.fecha_limite,
    fecha_presentacion: row.fecha_presentacion ?? "",
    monto_pagar: Number(row.monto_pagar ?? 0),
    monto_a_favor: Number(row.monto_a_favor ?? 0),
    linea_captura: row.linea_captura ?? "",
    acuse_path: row.acuse_path ?? "",
    notas: row.notas ?? "",
  });
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const r = await upload({
        data: {
          organizationId: f.organizationId,
          filename: file.name,
          contentType: file.type || "application/pdf",
          base64,
        },
      });
      setF({ ...f, acuse_path: r.path });
      toast.success("Acuse subido");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg space-y-3 rounded-xl border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">{isNew ? "Nueva declaración" : "Editar declaración"}</h3>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <label>
            Tipo
            <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as any })} className={inp}>
              {Object.entries(TAX_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Mes (vacío = anual)
            <input
              type="number"
              min="1"
              max="12"
              value={f.mes ?? ""}
              onChange={(e) => setF({ ...f, mes: e.target.value ? Number(e.target.value) : (null as any) })}
              className={inp}
            />
          </label>
          <label>
            Estatus
            <select value={f.estatus} onChange={(e) => setF({ ...f, estatus: e.target.value as any })} className={inp}>
              {STATUS.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fecha límite
            <input type="date" value={f.fecha_limite} onChange={(e) => setF({ ...f, fecha_limite: e.target.value })} className={inp} />
          </label>
          <label>
            Fecha de presentación
            <input
              type="date"
              value={f.fecha_presentacion}
              onChange={(e) => setF({ ...f, fecha_presentacion: e.target.value })}
              className={inp}
            />
          </label>
          <label>
            Línea de captura
            <input value={f.linea_captura} onChange={(e) => setF({ ...f, linea_captura: e.target.value })} className={inp} />
          </label>
          <label>
            Monto a pagar
            <input
              type="number"
              value={f.monto_pagar}
              onChange={(e) => setF({ ...f, monto_pagar: Number(e.target.value) })}
              className={inp}
            />
          </label>
          <label>
            Monto a favor
            <input
              type="number"
              value={f.monto_a_favor}
              onChange={(e) => setF({ ...f, monto_a_favor: Number(e.target.value) })}
              className={inp}
            />
          </label>
          <label className="col-span-2">
            Notas
            <input value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} className={inp} />
          </label>
          <label className="col-span-2">
            Acuse PDF
            <input type="file" accept="application/pdf,image/*" onChange={handleFile} className="mt-1 block w-full text-xs" />
            {uploading && <span className="text-muted-foreground">Subiendo…</span>}
            {f.acuse_path && (
              <span className="mt-1 block break-all text-[10px] text-muted-foreground">{f.acuse_path}</span>
            )}
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-sm">
            Cancelar
          </button>
          <button
            onClick={() =>
              onSave({
                ...f,
                fecha_presentacion: f.fecha_presentacion || null,
                linea_captura: f.linea_captura || null,
                acuse_path: f.acuse_path || null,
                notas: f.notas || null,
              })
            }
            className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

const inp = "mt-1 block w-full rounded border bg-background px-2 py-1.5 text-sm";
