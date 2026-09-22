import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-ui";
import { supabase } from "@/integrations/supabase/client";
import {
  listDocTemplates,
  upsertDocTemplate,
  deleteDocTemplate,
} from "@/lib/document-templates.functions";
import {
  TEMPLATE_DEFAULTS,
  RIT_DEFAULTS,
} from "@/lib/document-templates.defaults";
import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  X,
  Copy,
  RotateCcw,
} from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/admin/document-templates",
)({
  component: AdminDocTemplates,
});

const DOC_TYPES = [
  { value: "contrato_trabajo", label: "Contrato de Trabajo" },
  { value: "renuncia", label: "Carta de Renuncia" },
  { value: "rit", label: "Reglamento Interior de Trabajo" },
] as const;

const GIROS = [
  { value: "salud", label: "Salud (clínica, hospital, laboratorio)" },
  { value: "comercio", label: "Comercio (tiendas, retail, e-commerce)" },
  { value: "industrial", label: "Industrial (manufactura, fábrica)" },
  { value: "servicios", label: "Servicios (oficina, consultoría)" },
] as const;

function AdminDocTemplates() {
  const qc = useQueryClient();
  const [orgId, setOrgId] = useState<string>("");
  const [editing, setEditing] = useState<any>(null);

  const { data: orgs } = useQuery({
    queryKey: ["admin-orgs-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("organizations")
        .select("id, rfc, razon_social")
        .order("razon_social");
      return data ?? [];
    },
  });

  const fn = useServerFn(listDocTemplates);
  const { data: templates } = useQuery({
    queryKey: ["admin-doc-templates", orgId],
    queryFn: () => fn({ data: { organizationId: orgId } }),
    enabled: !!orgId,
  });

  const upsert = useServerFn(upsertDocTemplate);
  const del = useServerFn(deleteDocTemplate);

  return (
    <div>
      <PageHeader
        title="Plantillas de Documentos"
        description="Contratos, renuncias y reglamentos por organización"
      />
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs">
            Organización
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              className="ml-2 rounded border bg-background px-2 py-1 text-sm"
            >
              <option value="">Selecciona una organización</option>
              {orgs?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.rfc} — {o.razon_social}
                </option>
              ))}
            </select>
          </label>
          {orgId && (
            <button
              onClick={() =>
                setEditing({
                  new: true,
                  organizationId: orgId,
                  tipo: "contrato_trabajo",
                })
              }
              className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Nueva plantilla
            </button>
          )}
        </div>

        {orgId && templates && (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Giro</th>
                  <th className="px-3 py-2">Activo</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t: any) => (
                  <tr key={t.id} className="border-t">
                    <td className="px-3 py-2 text-xs">
                      {DOC_TYPES.find((d) => d.value === t.tipo)?.label ?? t.tipo}
                    </td>
                    <td className="px-3 py-2 text-xs font-medium">
                      {t.nombre}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {t.giro
                        ? GIROS.find((g) => g.value === t.giro)?.label ?? t.giro
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {t.activo ? "✅" : "❌"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setEditing(t)}
                          className="rounded border px-2 py-1 text-xs hover:bg-secondary"
                        >
                          <Pencil className="inline h-3 w-3" /> Editar
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm("¿Eliminar esta plantilla?")) return;
                            await del({ data: { id: t.id } });
                            toast.success("Plantilla eliminada");
                            qc.invalidateQueries({
                              queryKey: ["admin-doc-templates"],
                            });
                          }}
                          className="rounded border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="inline h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!templates.length && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-8 text-center text-xs text-muted-foreground"
                    >
                      No hay plantillas para esta organización. Crea una nueva
                      para generar contratos, renuncias y reglamentos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <TemplateDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            try {
              await upsert({ data: payload });
              toast.success("Plantilla guardada");
              qc.invalidateQueries({ queryKey: ["admin-doc-templates"] });
              setEditing(null);
            } catch (e: any) {
              toast.error(e.message);
            }
          }}
          onUseDefault={async (tipo, giro) => {
            const defaultHtml =
              tipo === "rit"
                ? RIT_DEFAULTS[giro || "servicios"] || RIT_DEFAULTS.servicios
                : TEMPLATE_DEFAULTS[tipo] || "";
            const nombre =
              tipo === "contrato_trabajo"
                ? "Contrato de Trabajo (estándar)"
                : tipo === "renuncia"
                  ? "Carta de Renuncia (estándar)"
                  : `RIT - ${GIROS.find((g) => g.value === giro)?.label || giro}`;
            try {
              await upsert({
                data: {
                  organizationId: editing.organizationId,
                  tipo,
                  giro: giro || null,
                  nombre,
                  contenido_html: defaultHtml,
                  activo: true,
                },
              });
              toast.success("Plantilla estándar cargada");
              qc.invalidateQueries({ queryKey: ["admin-doc-templates"] });
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

function TemplateDialog({
  row,
  onClose,
  onSave,
  onUseDefault,
}: {
  row: any;
  onClose: () => void;
  onSave: (p: any) => void;
  onUseDefault: (tipo: string, giro?: string) => void;
}) {
  const isNew = !!row.new;
  const [f, setF] = useState({
    id: isNew ? null : row.id,
    organizationId: row.organizationId ?? row.organization_id,
    tipo: (row.tipo || "contrato_trabajo") as string,
    giro: (row.giro || "") as string,
    nombre: row.nombre || "",
    contenido_html: row.contenido_html || "",
    activo: row.activo ?? true,
  });

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl space-y-3 rounded-xl border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {isNew ? "Nueva plantilla" : "Editar plantilla"}
          </h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <label>
            Tipo
            <select
              value={f.tipo}
              onChange={(e) => setF({ ...f, tipo: e.target.value })}
              className="mt-1 block w-full rounded border bg-background px-2 py-1.5 text-sm"
            >
              {DOC_TYPES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          {f.tipo === "rit" && (
            <label>
              Giro
              <select
                value={f.giro}
                onChange={(e) => setF({ ...f, giro: e.target.value })}
                className="mt-1 block w-full rounded border bg-background px-2 py-1.5 text-sm"
              >
                <option value="">Selecciona giro</option>
                {GIROS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="col-span-2">
            Nombre
            <input
              value={f.nombre}
              onChange={(e) => setF({ ...f, nombre: e.target.value })}
              className="mt-1 block w-full rounded border bg-background px-2 py-1.5 text-sm"
              placeholder="Ej: Contrato de trabajo estándar"
            />
          </label>

          <div className="col-span-2 flex items-center gap-2">
            <button
              onClick={() => onUseDefault(f.tipo, f.giro || undefined)}
              className="inline-flex items-center gap-1 rounded border bg-secondary/50 px-2 py-1 text-xs hover:bg-secondary"
            >
              <RotateCcw className="h-3 w-3" /> Cargar plantilla estándar
            </button>
            <span className="text-[10px] text-muted-foreground">
              Esto reemplazará el contenido actual con la plantilla por defecto
            </span>
          </div>

          <label className="col-span-2">
            Contenido HTML
            <textarea
              value={f.contenido_html}
              onChange={(e) =>
                setF({ ...f, contenido_html: e.target.value })
              }
              className="mt-1 block w-full rounded border bg-background px-2 py-1.5 font-mono text-xs"
              rows={20}
              placeholder="Pega aquí el HTML de la plantilla. Usa placeholders como {{RAZON_SOCIAL}}, {{NOMBRE_COMPLETO}}, {{RFC_EMP}}, etc."
            />
          </label>

          <div className="col-span-2 rounded-md bg-secondary/30 p-3">
            <p className="mb-1 text-xs font-medium">
              Placeholders disponibles:
            </p>
            <div className="grid grid-cols-4 gap-1 text-[10px] text-muted-foreground">
              <span>{"{{RAZON_SOCIAL}}"}</span>
              <span>{"{{NOMBRE_COMERCIAL}}"}</span>
              <span>{"{{RFC}}"}</span>
              <span>{"{{DOMICILIO}}"}</span>
              <span>{"{{CIUDAD}}"}</span>
              <span>{"{{ESTADO}}"}</span>
              <span>{"{{NOMBRE_COMPLETO}}"}</span>
              <span>{"{{RFC_EMP}}"}</span>
              <span>{"{{CURP_EMP}}"}</span>
              <span>{"{{NSS}}"}</span>
              <span>{"{{PUESTO}}"}</span>
              <span>{"{{SALARIO_NUM}}"}</span>
              <span>{"{{SALARIO_LETRA}}"}</span>
              <span>{"{{SALARIO_SEMANAL}}"}</span>
              <span>{"{{SALARIO_SEMANAL_LETRA}}"}</span>
              <span>{"{{FECHA_ALTA}}"}</span>
              <span>{"{{FECHA_BAJA}}"}</span>
              <span>{"{{MOTIVO_BAJA}}"}</span>
              <span>{"{{CIUDAD_ORG}}"}</span>
              <span>{"{{FECHA_ACTUAL}}"}</span>
              <span>{"{{PLAZO_CONTRATO}}"}</span>
              <span>{"{{TIPO_PATRON}}"}</span>
              <span>{"{{REPRESENTANTE_LEGAL}}"}</span>
              <span>{"{{HORARIO}}"}</span>
              <span>{"{{FECHA_INICIO_TEXTO}}"}</span>
              <span>{"{{NOMBRE_TESTIGO_1}}"}</span>
              <span>{"{{NOMBRE_TESTIGO_2}}"}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={() =>
              onSave({
                ...f,
                giro: f.giro || null,
                activo: f.activo,
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
