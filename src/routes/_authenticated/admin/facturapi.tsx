import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  fapiListOrgs,
  fapiGetOrg,
  fapiCreateOrg,
  fapiUpdateLegal,
  fapiDeleteOrg,
  fapiGetApiKey,
  fapiRenewApiKey,
  fapiSaveKeyToOrg,
  fapiListLocalOrgs,
  fapiListLocalUnlinked,
  fapiUploadCertificate,
  fapiGetLocalBilling,
  fapiSetEnvironment,
} from "@/lib/facturapi-admin.functions";
import { PageHeader } from "@/components/app-ui";
import {
  Building2, KeyRound, Plus, RefreshCw, Trash2, Eye, Copy, Save, X, Loader2, Link2, ShieldCheck, Upload, ExternalLink, Check,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/facturapi")({
  component: FacturapiAdmin,
});

function FacturapiAdmin() {
  const list = useServerFn(fapiListOrgs);
  const create = useServerFn(fapiCreateOrg);
  const listLocalUnlinked = useServerFn(fapiListLocalUnlinked);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<{ kind: 'fapi'; id: string } | { kind: 'local'; data: any } | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");

  const orgsQ = useQuery({
    queryKey: ["fapi-orgs", q],
    queryFn: () => list({ data: { q: q || undefined, limit: 50 } }),
  });

  const localUnlinkedQ = useQuery({
    queryKey: ["fapi-local-unlinked"],
    queryFn: () => listLocalUnlinked(),
  });

  const createMut = useMutation({
    mutationFn: () => create({ data: { name: newName.trim() } }),
    onSuccess: (org: any) => {
      toast.success(`Organización creada: ${org.id}`);
      setShowNew(false);
      setNewName("");
      qc.invalidateQueries({ queryKey: ["fapi-orgs"] });
      setSelected({ kind: 'fapi', id: org.id });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const orgs: any[] = (orgsQ.data as any)?.data ?? (Array.isArray(orgsQ.data) ? orgsQ.data : []);
  const localUnlinked: any[] = localUnlinkedQ.data ?? [];

  return (
    <div>
      <PageHeader
        title="FacturAPI · Organizaciones"
        description="Crea y administra organizaciones directamente en FacturAPI, genera sus llaves y vincúlalas a un cliente."
      />
      <div className="grid gap-6 p-6 lg:grid-cols-[22rem_1fr]">
        <aside className="rounded-lg border bg-card">
          <div className="flex items-center justify-between gap-2 border-b p-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre…"
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            />
            <button
              onClick={() => setShowNew(true)}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Nueva
            </button>
          </div>

          {showNew && (
            <div className="border-b bg-secondary/40 p-3">
              <label className="text-xs font-medium">Nombre comercial</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Mi Empresa SA de CV"
                className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              />
              <div className="mt-2 flex gap-2">
                <button
                  disabled={createMut.isPending || newName.trim().length < 2}
                  onClick={() => createMut.mutate()}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Crear
                </button>
                <button
                  onClick={() => { setShowNew(false); setNewName(""); }}
                  className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-secondary"
                >
                  <X className="h-3.5 w-3.5" /> Cancelar
                </button>
              </div>
            </div>
          )}

          <div className="max-h-[70vh] overflow-y-auto">
            {/* ── FacturAPI orgs ── */}
            {orgsQ.isLoading ? (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
            ) : orgsQ.error ? (
              <div className="p-4 text-sm text-destructive">Error: {(orgsQ.error as Error).message}</div>
            ) : (
              <>
                {orgs.length > 0 && (
                  <>
                    <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Registradas en FacturAPI</div>
                    <ul className="divide-y">
                      {orgs.map((o: any) => {
                        const active = selected?.kind === 'fapi' && o.id === selected.id;
                        return (
                          <li key={o.id}>
                            <button
                              onClick={() => setSelected({ kind: 'fapi', id: o.id })}
                              className={`flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-secondary ${active ? "bg-secondary" : ""}`}
                            >
                              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium">{o.legal?.legal_name || o.legal?.name || o.name || "—"}</div>
                                <div className="truncate text-xs text-muted-foreground">{o.legal?.tax_id ?? "Sin RFC"}</div>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  <ReadyBadge ok={o.certificate?.has_certificate} label="CSD" />
                                  <ReadyBadge ok={o.is_production_ready} label="Manifiesto" />
                                  <ReadyBadge ok={o._local?.hasLiveKey} label="Llave live" />
                                </div>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </>
            )}
            {/* ── Local orgs without FacturAPI ── */}
            {localUnlinkedQ.isLoading ? (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
            ) : localUnlinked.length > 0 ? (
              <>
                <div className="border-t px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sin registrar en FacturAPI</div>
                <ul className="divide-y">
                  {localUnlinked.map((o: any) => {
                    const active = selected?.kind === 'local' && o.id === selected.data.id;
                    return (
                          <li key={o.id}>
                            <button
                              onClick={() => setSelected({ kind: 'local', data: o })}
                              className={`flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-secondary ${active ? "bg-secondary" : ""}`}
                            >
                          <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{o.razon_social || "—"}</div>
                            <div className="truncate text-xs text-muted-foreground">{o.rfc ?? "Sin RFC"}</div>
                            <div className="mt-1"><span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">No registrada</span></div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : orgs.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No hay organizaciones.</div>
            ) : null}
          </div>
        </aside>

        <section>
          {selected?.kind === 'fapi' ? (
            <OrgDetail id={selected.id} localOrgId={selected._local?.localOrgId} onDeleted={() => { setSelected(null); qc.invalidateQueries({ queryKey: ["fapi-orgs"] }); }} />
          ) : selected?.kind === 'local' ? (
            <LocalOrgDetail
              org={selected.data}
              onCreate={(fapiId) => { setSelected({ kind: 'fapi', id: fapiId }); qc.invalidateQueries({ queryKey: ["fapi-orgs"] }); qc.invalidateQueries({ queryKey: ["fapi-local-unlinked"] }); }}
            />
          ) : (
            <div className="grid h-full place-items-center rounded-lg border bg-card p-12 text-sm text-muted-foreground">
              Selecciona una organización para ver el detalle.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ReadyBadge({ ok, label }: { ok: boolean | undefined | null; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-tight ${
        ok ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
      {label}
    </span>
  );
}

function LocalOrgDetail({ org, onCreate }: { org: any; onCreate: (fapiId: string) => void }) {
  const create = useServerFn(fapiCreateOrg);
  const updateLegal = useServerFn(fapiUpdateLegal);
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!org.razon_social) return;
    setCreating(true);
    try {
      const fapiOrg: any = await create({ data: { name: org.nombre_comercial || org.razon_social } });
      if (org.rfc) {
        await updateLegal({
          data: {
            id: fapiOrg.id,
            legal: {
              name: org.nombre_comercial || org.razon_social,
              legal_name: org.razon_social,
              tax_id: org.rfc,
              tax_system: org.regimen_fiscal || "601",
              address: { zip: org.codigo_postal || "00000" },
            },
          },
        });
      }
      toast.success(`Organización creada en FacturAPI: ${fapiOrg.id}`);
      qc.invalidateQueries({ queryKey: ["fapi-orgs"] });
      qc.invalidateQueries({ queryKey: ["fapi-local-unlinked"] });
      onCreate(fapiOrg.id);
    } catch (e) { toast.error((e as Error).message); }
    finally { setCreating(false); }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              {org.razon_social || "—"}
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">Local</span>
            </h2>
            <div className="mt-1 space-y-1 text-xs text-muted-foreground">
              <div>RFC: <span className="font-mono">{org.rfc ?? "Sin RFC"}</span></div>
              {org.regimen_fiscal && <div>Régimen fiscal: <span className="font-mono">{org.regimen_fiscal}</span></div>}
              {org.nombre_comercial && <div>Nombre comercial: {org.nombre_comercial}</div>}
              {org.codigo_postal && <div>CP: <span className="font-mono">{org.codigo_postal}</span></div>}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold">Registrar en FacturAPI</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Esta organización solo existe en la base de datos local. Créala en FacturAPI para poder administrar su CSD, firmar el manifiesto y generar llaves de API.
        </p>
        <button
          onClick={handleCreate}
          disabled={creating || !org.razon_social}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {creating ? "Creando…" : `Crear "${org.razon_social}" en FacturAPI`}
        </button>
      </div>
    </div>
  );
}

function OrgDetail({ id, localOrgId, onDeleted }: { id: string; localOrgId?: string | null; onDeleted: () => void }) {
  const getFn = useServerFn(fapiGetOrg);
  const updateLegalFn = useServerFn(fapiUpdateLegal);
  const deleteFn = useServerFn(fapiDeleteOrg);
  const getKeyFn = useServerFn(fapiGetApiKey);
  const renewKeyFn = useServerFn(fapiRenewApiKey);
  const saveKeyFn = useServerFn(fapiSaveKeyToOrg);
  const listLocalFn = useServerFn(fapiListLocalOrgs);
  const qc = useQueryClient();

  const orgQ = useQuery({ queryKey: ["fapi-org", id], queryFn: () => getFn({ data: { id } }) });
  const localOrgsQ = useQuery({ queryKey: ["fapi-local-orgs"], queryFn: () => listLocalFn() });

  const org: any = orgQ.data ?? {};
  const legal0 = org.legal ?? {};
  const addr0 = legal0.address ?? {};

  const [legal, setLegal] = useState<any>(null);
  const formLegal = legal ?? {
    name: legal0.name ?? org.name ?? "",
    legal_name: legal0.legal_name ?? "",
    tax_system: legal0.tax_system ?? "",
    tax_id: (legal0.tax_id ?? "").toUpperCase(),
    website: legal0.website ?? "",
    phone: legal0.phone ?? "",
    address: {
      street: addr0.street ?? "",
      exterior: addr0.exterior ?? "",
      interior: addr0.interior ?? "",
      neighborhood: addr0.neighborhood ?? "",
      city: addr0.city ?? "",
      municipality: addr0.municipality ?? "",
      state: addr0.state ?? "",
      country: addr0.country ?? "MEX",
      zip: addr0.zip ?? "",
    },
  };

  const setL = (patch: any) => setLegal({ ...formLegal, ...patch });
  const setA = (patch: any) => setLegal({ ...formLegal, address: { ...formLegal.address, ...patch } });

  const saveMut = useMutation({
    mutationFn: () => updateLegalFn({ data: { id, legal: formLegal } }),
    onSuccess: () => {
      toast.success("Datos fiscales actualizados");
      setLegal(null);
      qc.invalidateQueries({ queryKey: ["fapi-org", id] });
      qc.invalidateQueries({ queryKey: ["fapi-orgs"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const billingFn = useServerFn(fapiGetLocalBilling);
  const setEnvFn = useServerFn(fapiSetEnvironment);
  const billingQ = useQuery({
    queryKey: ["fapi-billing", id],
    queryFn: () => billingFn({ data: { facturapi_org_id: id } }),
  });
  const currentEnv = billingQ.data?.environment ?? "test";
  const setEnvMut = useMutation({
    mutationFn: (env: "test" | "live") => setEnvFn({ data: { facturapi_org_id: id, organization_id: localOrgId, environment: env } }),
    onSuccess: () => {
      toast.success("Modo cambiado");
      billingQ.refetch();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const delMut = useMutation({
    mutationFn: () => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Organización eliminada"); onDeleted(); },
    onError: (e) => toast.error((e as Error).message),
  });

  if (orgQ.isLoading) {
    return <div className="grid place-items-center rounded-lg border bg-card p-12 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  if (orgQ.error) {
    return <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">{(orgQ.error as Error).message}</div>;
  }

  const hasCert = org.certificate?.has_certificate;
  const pendingSteps: { type: string; description: string }[] = org.pending_steps ?? [];
  const manifiestoDone = !pendingSteps.some((s) => s.type === "manifiesto");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase text-muted-foreground">FacturAPI Org ID</div>
            <div className="font-mono text-sm">{org.id}</div>
            <h2 className="mt-2 text-lg font-semibold">{formLegal.legal_name || formLegal.name || "—"}</h2>
            <div className="mt-0.5 text-xs text-muted-foreground">{legal0.tax_id ?? "Sin RFC asignado"}</div>
          </div>
          <div className="flex shrink-0 gap-2">
            <div className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs">
              <span className="text-muted-foreground">Modo:</span>
              <button
                onClick={() => {
                  if (currentEnv === "live" && !confirm("¿Cambiar a modo test? Las facturas se timbrarán en ambiente de pruebas.")) return;
                  setEnvMut.mutate(currentEnv === "test" ? "live" : "test");
                }}
                disabled={setEnvMut.isPending}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${currentEnv === "live" ? "bg-amber-500" : "bg-muted-foreground/30"}`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${currentEnv === "live" ? "translate-x-[18px]" : "translate-x-0.5"}`} />
              </button>
              <span className={`font-semibold ${currentEnv === "live" ? "text-amber-700" : "text-muted-foreground"}`}>
                {currentEnv === "live" ? "Live" : "Test"}
              </span>
            </div>
            <button
              onClick={() => { if (confirm("¿Eliminar esta organización de FacturAPI? Esta acción es definitiva.")) delMut.mutate(); }}
              disabled={delMut.isPending}
              className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> Eliminar
            </button>
          </div>
        </div>
      </div>

      {/* Step 1 — CSD */}
      <details className="rounded-lg border bg-card" open={!hasCert}>
        <summary className="flex cursor-pointer items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${hasCert ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground"}`}>
              {hasCert ? <Check className="h-3 w-3" /> : 1}
            </span>
            CSD
            {hasCert && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">Completado</span>}
          </div>
          <span className="text-[10px] text-muted-foreground">{hasCert ? "Expandir" : "Pendiente"}</span>
        </summary>
        <div className="border-t px-5 py-4">
          <CertificateCard orgId={id} />
        </div>
      </details>

      {/* Step 2 — Manifiesto */}
      <details className="rounded-lg border bg-card" open={hasCert && !manifiestoDone}>
        <summary className="flex cursor-pointer items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${manifiestoDone ? "bg-emerald-500 text-white" : hasCert ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {manifiestoDone ? <Check className="h-3 w-3" /> : 2}
            </span>
            Manifiesto
            {manifiestoDone && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">Completado</span>}
          </div>
          <span className="text-[10px] text-muted-foreground">{manifiestoDone ? "Expandir" : hasCert ? "Pendiente" : "Bloqueado"}</span>
        </summary>
        {!manifiestoDone && (
          <div className="border-t px-5 py-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Firmar Carta Manifiesto</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {hasCert
                ? "Ingresa al dashboard de FacturAPI para firmar la carta manifiesto."
                : "Primero carga el CSD en el paso anterior."}
            </p>
            <div className="mt-3 flex gap-2">
              <a
                href="https://dashboard.facturapi.io/settings/manifiesto"
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium ${hasCert ? "border-primary/40 text-primary hover:bg-primary/10" : "pointer-events-none opacity-40"}`}
              >
                <ExternalLink className="h-3.5 w-3.5" /> Ir a firmar manifiesto
              </a>
            </div>
          </div>
        )}
      </details>

      {/* Step 3 — Llaves */}
      <details className="rounded-lg border bg-card" open={!!(hasCert && manifiestoDone)}>
        <summary className="flex cursor-pointer items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${hasCert && manifiestoDone ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>3</span>
            Llaves (test → live)
          </div>
          <span className="text-[10px] text-muted-foreground">{hasCert && manifiestoDone ? "Expandir" : "Bloqueado"}</span>
        </summary>
        <div className="border-t px-5 py-4">
          <ApiKeysCard
            orgId={id}
            getKeyFn={(env) => getKeyFn({ data: { id, env } })}
            renewKeyFn={(env) => renewKeyFn({ data: { id, env } })}
            saveKeyFn={(env, key, organization_id) => saveKeyFn({ data: { organization_id, facturapi_org_id: id, env, key } })}
            localOrgs={(localOrgsQ.data as any[]) ?? []}
          />
        </div>
      </details>

      {/* Datos fiscales */}
      <details className="rounded-lg border bg-card">
        <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground">
          Datos fiscales (editar)
        </summary>
        <div className="border-t px-5 py-4">
          {legal && (
            <div className="mb-4 flex justify-end gap-2">
              <button onClick={() => setLegal(null)} className="rounded-md border px-3 py-1.5 text-xs hover:bg-secondary">Cancelar</button>
              <button
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Guardar
              </button>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="RFC" value={formLegal.tax_id} onChange={(v) => setL({ tax_id: v.toUpperCase() })} placeholder="XAXX010101000" />
            <Input label="Régimen fiscal (SAT)" value={formLegal.tax_system} onChange={(v) => setL({ tax_system: v })} placeholder="601, 612, 626…" />
            <Input label="Nombre comercial" value={formLegal.name} onChange={(v) => setL({ name: v })} />
            <Input label="Razón social" value={formLegal.legal_name} onChange={(v) => setL({ legal_name: v })} />
            <Input label="Teléfono" value={formLegal.phone} onChange={(v) => setL({ phone: v })} />
            <Input label="Sitio web" value={formLegal.website} onChange={(v) => setL({ website: v })} />
          </div>
          <h4 className="mt-5 mb-2 text-xs font-semibold uppercase text-muted-foreground">Domicilio fiscal</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Calle" value={formLegal.address.street} onChange={(v) => setA({ street: v })} className="sm:col-span-2" />
            <Input label="No. exterior" value={formLegal.address.exterior} onChange={(v) => setA({ exterior: v })} />
            <Input label="No. interior" value={formLegal.address.interior} onChange={(v) => setA({ interior: v })} />
            <Input label="Colonia" value={formLegal.address.neighborhood} onChange={(v) => setA({ neighborhood: v })} />
            <Input label="C.P." value={formLegal.address.zip} onChange={(v) => setA({ zip: v })} />
            <Input label="Ciudad" value={formLegal.address.city} onChange={(v) => setA({ city: v })} />
            <Input label="Municipio/Alcaldía" value={formLegal.address.municipality} onChange={(v) => setA({ municipality: v })} />
            <Input label="Estado" value={formLegal.address.state} onChange={(v) => setA({ state: v })} />
            <Input label="País" value={formLegal.address.country} onChange={(v) => setA({ country: v })} />
          </div>
        </div>
      </details>
    </div>
  );
}

function ApiKeysCard({
  orgId, getKeyFn, renewKeyFn, saveKeyFn, localOrgs,
}: {
  orgId: string;
  getKeyFn: (env: "test" | "live") => Promise<{ key: string; raw?: any }>;
  renewKeyFn: (env: "test" | "live") => Promise<{ key: string; raw?: any }>;
  saveKeyFn: (env: "test" | "live", key: string, organization_id: string) => Promise<{ ok: boolean }>;
  localOrgs: { id: string; razon_social: string; rfc: string }[];
}) {
  const [env, setEnv] = useState<"test" | "live">("test");
  return (
    <div>
      <div className="mb-4 flex items-center gap-1 rounded-lg bg-secondary/50 p-0.5 text-xs font-medium">
        <button
          onClick={() => setEnv("test")}
          className={`flex-1 rounded-md px-3 py-1.5 text-center transition ${env === "test" ? "bg-card shadow-sm font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Test
        </button>
        <button
          onClick={() => setEnv("live")}
          className={`flex-1 rounded-md px-3 py-1.5 text-center transition ${env === "live" ? "bg-card shadow-sm font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Live
        </button>
      </div>
      {env === "test" && (
        <div className="rounded-md border bg-secondary/20 p-3">
          <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Llave de prueba (test)</div>
          <p className="mb-3 text-[10px] text-muted-foreground">Usa <b>Obtener</b> para recuperar la llave test existente o <b>Regenerar</b> para crear una nueva.</p>
          <KeyRow env="test" orgId={orgId} getKeyFn={getKeyFn} renewKeyFn={renewKeyFn} saveKeyFn={saveKeyFn} localOrgs={localOrgs} />
        </div>
      )}
      {env === "live" && (
        <div className="rounded-md border bg-amber-50/50 p-3">
          <div className="mb-2 text-xs font-semibold uppercase text-amber-700">Llave de producción (live)</div>
          <p className="mb-3 text-[10px] text-amber-600">Necesitas tener el CSD cargado y el manifiesto firmado. Usa <b>Generar</b> para crear una nueva llave live.</p>
          <KeyRow env="live" orgId={orgId} getKeyFn={getKeyFn} renewKeyFn={renewKeyFn} saveKeyFn={saveKeyFn} localOrgs={localOrgs} />
        </div>
      )}
    </div>
  );
}

function KeyRow({
  env, orgId, getKeyFn, renewKeyFn, saveKeyFn, localOrgs,
}: {
  env: "test" | "live";
  orgId: string;
  getKeyFn: (env: "test" | "live") => Promise<{ key: string; raw?: any }>;
  renewKeyFn: (env: "test" | "live") => Promise<{ key: string; raw?: any }>;
  saveKeyFn: (env: "test" | "live", key: string, organization_id: string) => Promise<{ ok: boolean }>;
  localOrgs: { id: string; razon_social: string; rfc: string }[];
}) {
  const [key, setKey] = useState<string>("");
  const [linkTo, setLinkTo] = useState<string>("");
  const [busy, setBusy] = useState<"get" | "renew" | "save" | null>(null);
  const [debug, setDebug] = useState<string>("");

  const label = env === "test" ? "Sandbox (test)" : "Producción (live)";
  const describeRaw = (raw: any) => {
    if (env === "live" && Array.isArray(raw)) {
      if (raw.length === 0) return "No hay llaves live existentes. Usa Generar para crear una nueva llave secreta.";
      return `Llaves live existentes (FacturAPI no vuelve a mostrar el secreto):\n${JSON.stringify(raw, null, 2)}`;
    }
    return JSON.stringify(raw, null, 2);
  };

  const handleGet = async () => {
    setBusy("get"); setDebug("");
    try {
      const r = await getKeyFn(env);
      setKey(r.key || "");
      setDebug(describeRaw(r.raw ?? r));
      if (!r.key) toast.error(env === "live" ? "FacturAPI no muestra llaves live existentes; genera una nueva." : `FacturAPI no devolvió llave ${label}.`);
      else toast.success("Llave obtenida");
    } catch (e) { toast.error((e as Error).message); setDebug((e as Error).message); }
    finally { setBusy(null); }
  };
  const handleRenew = async () => {
    if (!confirm(env === "live" ? "¿Generar una nueva llave live? Las llaves live anteriores seguirán funcionando." : `Regenerar la llave ${label}? La actual dejará de funcionar.`)) return;
    setBusy("renew"); setDebug("");
    try {
      const r = await renewKeyFn(env);
      setKey(r.key || "");
      setDebug(describeRaw(r.raw ?? r));
      if (!r.key) toast.error(`FacturAPI no devolvió llave nueva ${label}. Detalle abajo.`);
      else toast.success(env === "live" ? "Llave live generada" : "Llave regenerada");
    } catch (e) { toast.error((e as Error).message); setDebug((e as Error).message); }
    finally { setBusy(null); }
  };
  const handleSave = async () => {
    if (!linkTo) return toast.error("Selecciona un cliente local");
    if (!key) return toast.error("Primero obtén o regenera la llave");
    setBusy("save");
    try { await saveKeyFn(env, key, linkTo); toast.success("Llave vinculada al cliente"); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="flex gap-2">
        <input
          readOnly
          value={key}
          placeholder="sk_…"
          className="w-full rounded-md border bg-secondary/40 px-2 py-1.5 font-mono text-xs"
        />
        <button
          disabled={!key}
          onClick={() => { navigator.clipboard.writeText(key); toast.success("Copiado"); }}
          className="rounded-md border px-2 py-1.5 text-xs hover:bg-secondary disabled:opacity-40"
          title="Copiar"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button onClick={env === "live" ? handleRenew : handleGet} disabled={busy !== null} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-secondary disabled:opacity-50">
          {busy === (env === "live" ? "renew" : "get") ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />} {env === "live" ? "Generar" : "Obtener"}
        </button>
        <button onClick={env === "live" ? handleGet : handleRenew} disabled={busy !== null} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-secondary disabled:opacity-50">
          {busy === (env === "live" ? "get" : "renew") ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} {env === "live" ? "Listar" : "Regenerar"}
        </button>
      </div>
      {debug && (
        <pre className="mt-2 max-h-40 overflow-auto rounded border bg-muted/40 p-2 text-[10px] leading-tight">{debug}</pre>
      )}
      <div className="mt-3 border-t pt-3">
        <label className="text-xs font-medium">Vincular a cliente local</label>
        <div className="mt-1 flex gap-2">
          <select
            value={linkTo}
            onChange={(e) => setLinkTo(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
          >
            <option value="">— selecciona —</option>
            {localOrgs.map((o) => (
              <option key={o.id} value={o.id}>{o.razon_social} ({o.rfc})</option>
            ))}
          </select>
          <button
            onClick={handleSave}
            disabled={busy !== null || !linkTo || !key}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy === "save" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />} Guardar
          </button>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Se guarda en <span className="font-mono">org_billing_config</span> con el Org ID <span className="font-mono">{orgId}</span>.
        </p>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, className }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
      />
    </div>
  );
}

function CertificateCard({ orgId }: { orgId: string }) {
  const uploadFn = useServerFn(fapiUploadCertificate);
  const [cerFile, setCerFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const fileToB64 = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const s = String(r.result || "");
        const idx = s.indexOf("base64,");
        resolve(idx >= 0 ? s.slice(idx + 7) : s);
      };
      r.onerror = () => reject(r.error);
      r.readAsDataURL(f);
    });

  const handleUpload = async () => {
    if (!cerFile || !keyFile || !password) {
      toast.error("Selecciona .cer, .key y escribe la contraseña");
      return;
    }
    setBusy(true);
    try {
      const [cer_b64, key_b64] = await Promise.all([fileToB64(cerFile), fileToB64(keyFile)]);
      await uploadFn({
        data: {
          id: orgId,
          cer_b64,
          key_b64,
          password,
          cer_name: cerFile.name,
          key_name: keyFile.name,
        },
      });
      toast.success("CSD cargado correctamente. La organización quedará lista para producción.");
      setCerFile(null);
      setKeyFile(null);
      setPassword("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Sellos digitales (CSD)</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Sube el certificado <span className="font-mono">.cer</span>, la llave privada <span className="font-mono">.key</span> y la contraseña del CSD del SAT.
        Una vez cargado, FacturAPI permitirá generar la llave <b>live</b>.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium">Certificado (.cer)</label>
          <input
            type="file"
            accept=".cer,application/x-x509-ca-cert,application/octet-stream"
            onChange={(e) => setCerFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full rounded-md border bg-background px-2 py-1.5 text-xs file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs"
          />
          {cerFile && <div className="mt-1 truncate text-[10px] text-muted-foreground">{cerFile.name} · {Math.round(cerFile.size / 1024)} KB</div>}
        </div>
        <div>
          <label className="text-xs font-medium">Llave privada (.key)</label>
          <input
            type="file"
            accept=".key,application/octet-stream"
            onChange={(e) => setKeyFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full rounded-md border bg-background px-2 py-1.5 text-xs file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs"
          />
          {keyFile && <div className="mt-1 truncate text-[10px] text-muted-foreground">{keyFile.name} · {Math.round(keyFile.size / 1024)} KB</div>}
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-medium">Contraseña del CSD</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña que firmaste con el SAT"
            className="mt-1 block w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            autoComplete="new-password"
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={handleUpload}
          disabled={busy || !cerFile || !keyFile || !password}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Cargar CSD
        </button>
        <span className="text-[10px] text-muted-foreground">Los archivos se envían cifrados a FacturAPI y no se almacenan localmente.</span>
      </div>
    </div>
  );
}
