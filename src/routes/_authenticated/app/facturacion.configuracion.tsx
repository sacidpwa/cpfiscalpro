import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRequireOrg } from "@/lib/use-current-org";
import { PageHeader } from "@/components/app-ui";
import {
  getBillingConfig,
  upsertBillingConfig,
  testFacturapiConnection,
} from "@/lib/billing.functions";
import { checkPlatformAdmin } from "@/lib/admin.functions";
import { updateOrgLogo } from "@/lib/orgs.functions";
import { listVehicles, upsertVehicle, deleteVehicle, listOperators, upsertOperator, deleteOperator } from "@/lib/complements.functions";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, KeyRound, Loader2, ExternalLink, Lock, Image as ImageIcon, Upload, Trash2, Truck, UserCircle2, Plus, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/facturacion/configuracion")({
  component: FacturacionConfig,
});

function FacturacionConfig() {
  const org = useRequireOrg();
  const qc = useQueryClient();
  const getCfg = useServerFn(getBillingConfig);
  const saveCfg = useServerFn(upsertBillingConfig);
  const testCfg = useServerFn(testFacturapiConnection);
  const adminFn = useServerFn(checkPlatformAdmin);

  const { data: adminData } = useQuery({ queryKey: ["check-platform-admin"], queryFn: () => adminFn() });
  const isAdmin = !!adminData?.isAdmin;

  const { data, isLoading } = useQuery({
    queryKey: ["billing-config", org.id],
    queryFn: () => getCfg({ data: { organization_id: org.id } }),
  });

  const [testKey, setTestKey] = useState("");
  const [liveKey, setLiveKey] = useState("");
  const [environment, setEnvironment] = useState<"test" | "live">("test");
  const [facturapiOrgId, setFacturapiOrgId] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Sync defaults when data loads
  if (data && environment !== data.environment && testKey === "" && liveKey === "" && !facturapiOrgId) {
    setEnvironment(data.environment);
    setFacturapiOrgId(data.facturapi_org_id ?? "");
  }

  const saveMut = useMutation({
    mutationFn: () =>
      saveCfg({
        data: {
          organization_id: org.id,
          environment,
          facturapi_org_id: facturapiOrgId || null,
          facturapi_test_key: testKey || null,
          facturapi_live_key: liveKey || null,
        },
      }),
    onSuccess: () => {
      toast.success("Configuración guardada");
      setTestKey("");
      setLiveKey("");
      qc.invalidateQueries({ queryKey: ["billing-config", org.id] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const testMut = useMutation({
    mutationFn: (env: "test" | "live") =>
      testCfg({ data: { organization_id: org.id, environment: env } }),
    onSuccess: (res) => {
      setTestResult({ ok: res.ok, message: res.message });
      if (res.ok && res.org_id && !facturapiOrgId) {
        setFacturapiOrgId(res.org_id);
        toast.success(`Conectado a ${res.legal_name ?? res.tax_id ?? res.org_id}`);
      } else if (!res.ok) {
        toast.error(res.message);
      } else {
        toast.success(res.message);
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Ajustes" description="Logo, importación de CFDI y estado de la conexión" />
        <div className="grid gap-6 p-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <LogoSection orgId={org.id} />
            <FleetSection orgId={org.id} />
            <div className="rounded-lg border bg-card p-6">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Conexión con FacturAPI</h3>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Las llaves de FacturAPI solo las administra el super administrador de la plataforma.
              </p>
              <div className="mt-5 grid gap-2 rounded-md border bg-secondary/30 p-4 text-sm">
                <Row k="Organización" v={org.razon_social} />
                <Row k="RFC" v={org.rfc} mono />
                <Row k="Estado de conexión" v={isLoading ? "Cargando…" : (data?.test.set || data?.live.set ? "Configurada ✓" : "Pendiente")} />
                <Row k="Ambiente activo" v={(data?.environment ?? "—").toString()} />
              </div>
              <Link to="/app" className="mt-5 inline-flex text-sm font-medium text-primary hover:underline">← Volver al dashboard</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Ajustes"
        description="Logo, importación de CFDI y configuración de FacturAPI"
      />
      <div className="grid gap-6 p-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <LogoSection orgId={org.id} />
          <FleetSection orgId={org.id} />
          
          <section className="rounded-lg border bg-card p-6">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Llaves de API de FacturAPI</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Cada organización en FacturAPI tiene su propio par de llaves. Guarda aquí las llaves de{" "}
              <span className="font-medium">{org.razon_social}</span>. Solo el servidor las usa al timbrar;
              en pantalla solo se muestran los últimos 4 caracteres.
            </p>

            {isLoading ? (
              <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                <Field label="Llave de prueba (sk_test_…)" hint={data?.test.set ? `Configurada (…${data.test.last4})` : "No configurada"}>
                  <input
                    type="password"
                    autoComplete="off"
                    value={testKey}
                    onChange={(e) => setTestKey(e.target.value)}
                    placeholder={data?.test.set ? "Dejar en blanco para conservar la actual" : "sk_test_…"}
                    className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
                  />
                  <button
                    onClick={() => testMut.mutate("test")}
                    disabled={testMut.isPending || (!data?.test.set && !testKey)}
                    className="mt-2 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                  >
                    {testMut.isPending && testMut.variables === "test" ? "Probando…" : "Probar conexión de prueba"}
                  </button>
                </Field>

                <Field label="Llave de producción (sk_live_…)" hint={data?.live.set ? `Configurada (…${data.live.last4})` : "No configurada"}>
                  <input
                    type="password"
                    autoComplete="off"
                    value={liveKey}
                    onChange={(e) => setLiveKey(e.target.value)}
                    placeholder={data?.live.set ? "Dejar en blanco para conservar la actual" : "sk_live_… (opcional hasta pasar a producción)"}
                    className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
                  />
                  <button
                    onClick={() => testMut.mutate("live")}
                    disabled={testMut.isPending || (!data?.live.set && !liveKey)}
                    className="mt-2 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                  >
                    {testMut.isPending && testMut.variables === "live" ? "Probando…" : "Probar conexión de producción"}
                  </button>
                </Field>

                <Field label="Ambiente activo" hint="Determina cuál llave se usa al timbrar">
                  <div className="flex gap-2">
                    {(["test", "live"] as const).map((env) => (
                      <button
                        key={env}
                        type="button"
                        onClick={() => setEnvironment(env)}
                        className={`rounded-md border px-4 py-2 text-sm font-medium ${
                          environment === env
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:bg-secondary"
                        }`}
                      >
                        {env === "test" ? "Sandbox (prueba)" : "Producción (live)"}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="ID de organización en FacturAPI" hint="Se autocompleta al probar la conexión">
                  <input
                    value={facturapiOrgId}
                    onChange={(e) => setFacturapiOrgId(e.target.value)}
                    placeholder="6xxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
                  />
                </Field>

                {testResult && (
                  <div
                    className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                      testResult.ok
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border-destructive/30 bg-destructive/10 text-destructive"
                    }`}
                  >
                    {testResult.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4" /> : <AlertCircle className="mt-0.5 h-4 w-4" />}
                    <span>{testResult.message}</span>
                  </div>
                )}

                <div className="flex justify-end border-t pt-4">
                  <button
                    onClick={() => saveMut.mutate()}
                    disabled={saveMut.isPending}
                    className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {saveMut.isPending ? "Guardando…" : "Guardar configuración"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border bg-card p-5 text-sm">
            <h4 className="font-semibold">¿Dónde encuentro mis llaves?</h4>
            <ol className="mt-3 list-decimal space-y-2 pl-4 text-muted-foreground">
              <li>Entra a tu cuenta de FacturAPI</li>
              <li>Selecciona la organización <span className="font-medium text-foreground">{org.razon_social}</span></li>
              <li>Ve a <span className="font-medium text-foreground">Configuración → API Keys</span></li>
              <li>Copia la llave secreta del ambiente que vas a configurar</li>
            </ol>
            <a
              href="https://dashboard.facturapi.io"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Abrir FacturAPI <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div className="rounded-lg border bg-card p-5 text-sm">
            <h4 className="font-semibold">Seguridad</h4>
            <ul className="mt-3 space-y-2 text-muted-foreground">
              <li>• Las llaves se guardan cifradas en la BD del servidor</li>
              <li>• Nunca se envían al navegador (solo los últimos 4 caracteres)</li>
              <li>• Solo dueños y administradores pueden verlas o cambiarlas</li>
              <li>• Si crees que una llave fue expuesta, rótala en FacturAPI</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label className="text-sm font-medium">{label}</label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className={mono ? "font-mono" : "font-medium"}>{v}</span>
    </div>
  );
}

function LogoSection({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const saveLogo = useServerFn(updateOrgLogo);
  const { data: logoUrl, isLoading } = useQuery({
    queryKey: ["org-logo", orgId],
    queryFn: async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.from("organizations").select("logo_url").eq("id", orgId).maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.logo_url as string | null) ?? null;
    },
  });

  const mut = useMutation({
    mutationFn: (dataUrl: string | null) => saveLogo({ data: { organization_id: orgId, logo_data_url: dataUrl } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-logo", orgId] });
      toast.success("Logo actualizado");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 400_000) {
      toast.error("La imagen excede 400 KB. Reduce el tamaño antes de subir.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => mut.mutate(String(reader.result));
    reader.readAsDataURL(f);
  }

  return (
    <section className="rounded-lg border bg-card p-6">
      <div className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Logo de la organización</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Se mostrará en pantallas y recibos de la organización. PNG, JPG, SVG o WebP, máximo 400 KB.
      </p>
      <div className="mt-4 flex items-center gap-4">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={onFile} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={mut.isPending}
            className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-secondary disabled:opacity-50"
          >
            <Upload className="h-4 w-4" /> {logoUrl ? "Reemplazar" : "Subir logo"}
          </button>
          {logoUrl && (
            <button
              type="button"
              onClick={() => mut.mutate(null)}
              disabled={mut.isPending}
              className="inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" /> Quitar
            </button>
          )}
        </div>
      </div>
    </section>
  );
}


function FleetSection({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const lv = useServerFn(listVehicles);
  const lo = useServerFn(listOperators);
  const dv = useServerFn(deleteVehicle);
  const dop = useServerFn(deleteOperator);
  const { data: vehicles } = useQuery({ queryKey: ["vehicles", orgId], queryFn: () => lv({ data: { organizationId: orgId } }) });
  const { data: operators } = useQuery({ queryKey: ["operators", orgId], queryFn: () => lo({ data: { organizationId: orgId } }) });
  const [editVeh, setEditVeh] = useState<any | null>(null);
  const [editOp, setEditOp] = useState<any | null>(null);

  async function removeVeh(id: string) {
    if (!confirm("¿Eliminar vehículo?")) return;
    try { await dv({ data: { id, organizationId: orgId } }); qc.invalidateQueries({ queryKey: ["vehicles", orgId] }); toast.success("Eliminado"); }
    catch (e: any) { toast.error(e.message); }
  }
  async function removeOp(id: string) {
    if (!confirm("¿Eliminar operador?")) return;
    try { await dop({ data: { id, organizationId: orgId } }); qc.invalidateQueries({ queryKey: ["operators", orgId] }); toast.success("Eliminado"); }
    catch (e: any) { toast.error(e.message); }
  }

  return (
    <section className="rounded-lg border bg-card p-6">
      <div className="flex items-center gap-2">
        <Truck className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Carta Porte · Vehículos y operadores</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Estos catálogos se usan al generar complementos de carta porte.</p>

      {/* Vehículos */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vehículos</h4>
          <button onClick={() => setEditVeh({})} className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs hover:bg-secondary"><Plus className="h-3 w-3" /> Agregar</button>
        </div>
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
              <tr><th className="px-2 py-1.5 text-left">Alias</th><th className="px-2 py-1.5 text-left">Config</th><th className="px-2 py-1.5 text-left">Placa</th><th className="px-2 py-1.5 text-left">Año</th><th className="px-2 py-1.5 text-left">Permiso SCT</th><th></th></tr>
            </thead>
            <tbody className="divide-y">
              {(vehicles ?? []).length === 0 && <tr><td colSpan={6} className="px-2 py-4 text-center text-xs text-muted-foreground">Sin vehículos</td></tr>}
              {(vehicles ?? []).map((v: any) => (
                <tr key={v.id} className="hover:bg-secondary/30">
                  <td className="px-2 py-1.5">{v.alias ?? "—"}</td>
                  <td className="px-2 py-1.5 font-mono text-xs">{v.config_vehicular}</td>
                  <td className="px-2 py-1.5 font-mono text-xs">{v.placa_vm}</td>
                  <td className="px-2 py-1.5">{v.anio_modelo}</td>
                  <td className="px-2 py-1.5 text-xs">{v.perm_sct ?? "—"} {v.num_permiso_sct ? `· ${v.num_permiso_sct}` : ""}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button onClick={() => setEditVeh(v)} className="rounded px-2 py-0.5 text-xs hover:bg-secondary">Editar</button>
                    <button onClick={() => removeVeh(v.id)} className="rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Operadores */}
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"><UserCircle2 className="mr-1 inline h-3 w-3" /> Operadores</h4>
          <button onClick={() => setEditOp({})} className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs hover:bg-secondary"><Plus className="h-3 w-3" /> Agregar</button>
        </div>
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
              <tr><th className="px-2 py-1.5 text-left">Nombre</th><th className="px-2 py-1.5 text-left">RFC</th><th className="px-2 py-1.5 text-left">Licencia</th><th></th></tr>
            </thead>
            <tbody className="divide-y">
              {(operators ?? []).length === 0 && <tr><td colSpan={4} className="px-2 py-4 text-center text-xs text-muted-foreground">Sin operadores</td></tr>}
              {(operators ?? []).map((o: any) => (
                <tr key={o.id} className="hover:bg-secondary/30">
                  <td className="px-2 py-1.5">{o.nombre}</td>
                  <td className="px-2 py-1.5 font-mono text-xs">{o.rfc}</td>
                  <td className="px-2 py-1.5 font-mono text-xs">{o.num_licencia}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button onClick={() => setEditOp(o)} className="rounded px-2 py-0.5 text-xs hover:bg-secondary">Editar</button>
                    <button onClick={() => removeOp(o.id)} className="rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editVeh && <VehicleDialog orgId={orgId} initial={editVeh} onClose={() => setEditVeh(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ["vehicles", orgId] }); setEditVeh(null); }} />}
      {editOp && <OperatorDialog orgId={orgId} initial={editOp} onClose={() => setEditOp(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ["operators", orgId] }); setEditOp(null); }} />}
    </section>
  );
}

function VehicleDialog({ orgId, initial, onClose, onSaved }: { orgId: string; initial: any; onClose: () => void; onSaved: () => void }) {
  const up = useServerFn(upsertVehicle);
  const [v, setV] = useState<any>({
    alias: initial.alias ?? "",
    config_vehicular: initial.config_vehicular ?? "C2",
    placa_vm: initial.placa_vm ?? "",
    anio_modelo: initial.anio_modelo ?? new Date().getFullYear(),
    perm_sct: initial.perm_sct ?? "TPAF01",
    num_permiso_sct: initial.num_permiso_sct ?? "",
    peso_bruto_vehicular: initial.peso_bruto_vehicular ?? 0,
    asegura_resp_civil: initial.asegura_resp_civil ?? "",
    poliza_resp_civil: initial.poliza_resp_civil ?? "",
    tipo_remolque: initial.tipo_remolque ?? "",
    placa_remolque: initial.placa_remolque ?? "",
  });
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await up({ data: { id: initial.id, organizationId: orgId, ...v, peso_bruto_vehicular: Number(v.peso_bruto_vehicular) || null } });
      toast.success("Guardado"); onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  const set = (k: string) => (e: any) => setV({ ...v, [k]: e.target.value });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">{initial.id ? "Editar vehículo" : "Nuevo vehículo"}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <L lab="Alias (opcional)"><input value={v.alias} onChange={set("alias")} className="input" /></L>
          <L lab="Config vehicular SAT (ej. C2, C3, T3S2)"><input required value={v.config_vehicular} onChange={set("config_vehicular")} className="input font-mono" /></L>
          <L lab="Placa"><input required value={v.placa_vm} onChange={set("placa_vm")} className="input font-mono" /></L>
          <L lab="Año modelo"><input type="number" required value={v.anio_modelo} onChange={set("anio_modelo")} className="input" /></L>
          <L lab="Permiso SCT (ej. TPAF01)"><input value={v.perm_sct} onChange={set("perm_sct")} className="input font-mono" /></L>
          <L lab="Número de permiso SCT"><input value={v.num_permiso_sct} onChange={set("num_permiso_sct")} className="input" /></L>
          <L lab="Peso bruto vehicular (toneladas)"><input type="number" step="0.001" value={v.peso_bruto_vehicular} onChange={set("peso_bruto_vehicular")} className="input" /></L>
          <L lab="Aseguradora resp. civil"><input value={v.asegura_resp_civil} onChange={set("asegura_resp_civil")} className="input" /></L>
          <L lab="Póliza resp. civil"><input value={v.poliza_resp_civil} onChange={set("poliza_resp_civil")} className="input" /></L>
          <L lab="Sub-tipo remolque (CTR001…)"><input value={v.tipo_remolque} onChange={set("tipo_remolque")} className="input font-mono" /></L>
          <L lab="Placa remolque"><input value={v.placa_remolque} onChange={set("placa_remolque")} className="input font-mono" /></L>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm">Cancelar</button>
          <button disabled={busy} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60">{busy ? "Guardando…" : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}

function OperatorDialog({ orgId, initial, onClose, onSaved }: { orgId: string; initial: any; onClose: () => void; onSaved: () => void }) {
  const up = useServerFn(upsertOperator);
  const [v, setV] = useState<any>({
    nombre: initial.nombre ?? "",
    rfc: initial.rfc ?? "",
    num_licencia: initial.num_licencia ?? "",
    curp: initial.curp ?? "",
    residencia_fiscal: initial.residencia_fiscal ?? "",
    num_reg_id_trib: initial.num_reg_id_trib ?? "",
  });
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { await up({ data: { id: initial.id, organizationId: orgId, ...v } }); toast.success("Guardado"); onSaved(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  const set = (k: string) => (e: any) => setV({ ...v, [k]: e.target.value });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-xl rounded-lg border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">{initial.id ? "Editar operador" : "Nuevo operador"}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <L lab="Nombre completo"><input required value={v.nombre} onChange={set("nombre")} className="input" /></L>
          <L lab="RFC"><input required value={v.rfc} onChange={(e) => setV({ ...v, rfc: e.target.value.toUpperCase() })} className="input font-mono" /></L>
          <L lab="Número de licencia"><input required value={v.num_licencia} onChange={set("num_licencia")} className="input font-mono" /></L>
          <L lab="CURP"><input value={v.curp} onChange={(e) => setV({ ...v, curp: e.target.value.toUpperCase() })} className="input font-mono" /></L>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm">Cancelar</button>
          <button disabled={busy} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60">{busy ? "Guardando…" : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}

function L({ lab, children }: { lab: string; children: React.ReactNode }) {
  return (<label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">{lab}</span>{children}</label>);
}
