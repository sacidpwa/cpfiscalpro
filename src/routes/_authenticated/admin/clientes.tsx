import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAllClients, createClient } from "@/lib/admin.functions";
import { adminListUsers } from "@/lib/admin-users.functions";
import { parseConstancia } from "@/lib/constancia.functions";
import { PageHeader, EmptyState } from "@/components/app-ui";
import { Users, Plus, Building2, X, FileUp, Loader2, CheckCircle2 } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/clientes")({
  component: ClientesPage,
});

function ClientesPage() {
  const fn = useServerFn(listAllClients);
  const { data, isLoading } = useQuery({ queryKey: ["admin-clients"], queryFn: () => fn() });
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Todas las organizaciones de la plataforma"
        actions={
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nuevo cliente
          </button>
        }
      />
      <div className="p-4 sm:p-6 lg:p-8">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : !data?.length ? (
          <EmptyState
            icon={Users}
            title="Aún no hay clientes"
            description="Crea el primer cliente para asignarle su organización, usuario y plan."
            action={
              <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                <Plus className="h-4 w-4" /> Crear cliente
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="min-w-[760px] text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">RFC</th>
                  <th className="px-4 py-3 text-right">Empleados</th>
                  <th className="px-4 py-3 text-left">Plan</th>
                  <th className="px-4 py-3 text-right">Timbres mes</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.map((c: any) => {
                  const planTimbres = (c.plan?.timbres_factura_incluidos ?? 0) + (c.plan?.timbres_nomina_incluidos ?? 0);
                  const usados = c.uso_mes.factura + c.uso_mes.nomina;
                  const pct = planTimbres ? Math.min(100, (usados / planTimbres) * 100) : 0;
                  return (
                    <tr key={c.id} className="hover:bg-secondary/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="grid h-8 w-8 place-items-center rounded-md bg-secondary text-muted-foreground">
                            <Building2 className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-medium">{c.razon_social}</div>
                            <div className="text-xs text-muted-foreground">{c.regimen_fiscal ?? "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono">{c.rfc}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{c.empleados_activos}</td>
                      <td className="px-4 py-3">
                        {c.plan ? (
                          <div>
                            <div className="font-medium">{c.plan.plan_name}</div>
                            <div className="text-xs text-muted-foreground">{fmtMoney(Number(c.plan.mensualidad))}/mes</div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sin plan</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <div>{usados} / {planTimbres}</div>
                        <div className="mt-1 h-1.5 w-24 overflow-hidden rounded bg-secondary ml-auto">
                          <div
                            className={`h-full ${pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-primary"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to="/admin/clientes/$orgId" params={{ orgId: c.id }} className="text-xs font-medium text-primary hover:underline">
                          Detalle →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showForm && <NewClientDialog onClose={() => setShowForm(false)} />}
    </div>
  );
}

function NewClientDialog({ onClose }: { onClose: () => void }) {
  const fn = useServerFn(createClient);
  const parseFn = useServerFn(parseConstancia);
  const listUsersFn = useServerFn(adminListUsers);
  const qc = useQueryClient();
  const { data: users } = useQuery({ queryKey: ["admin-all-users"], queryFn: () => listUsersFn() });
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [existingUserId, setExistingUserId] = useState<string>("");
  const [userSearch, setUserSearch] = useState("");
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    rfc: "",
    razon_social: "",
    regimen_fiscal: "601",
    codigo_postal: "",
    direccion: "",
    plan_name: "Básico",
    mensualidad: 0,
    timbres_factura_incluidos: 50,
    timbres_nomina_incluidos: 200,
  });
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(false);
  const m = useMutation({
    mutationFn: () =>
      fn({
        data:
          mode === "existing"
            ? { ...form, existing_user_id: existingUserId, email: null, password: null, full_name: null }
            : { ...form, existing_user_id: null },
      }),
    onSuccess: () => {
      toast.success("Cliente creado correctamente");
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filteredUsers = (users ?? []).filter((u: any) => {
    const q = userSearch.toLowerCase();
    return !q || u.email?.toLowerCase().includes(q) || u.full_name?.toLowerCase().includes(q);
  });

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onConstancia(file: File) {
    setParsing(true);
    setParsed(false);
    try {
      const buf = await file.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const b64 = btoa(bin);
      const res = await parseFn({ data: { fileBase64: b64, fileName: file.name } });
      setForm((f) => ({
        ...f,
        rfc: res.rfc ?? f.rfc,
        razon_social: res.razon_social ?? f.razon_social,
        regimen_fiscal: res.regimen_fiscal ?? f.regimen_fiscal,
        codigo_postal: res.codigo_postal ?? f.codigo_postal,
        direccion: res.direccion ?? f.direccion,
      }));
      setParsed(true);
      toast.success("Constancia leída. Revisa los datos extraídos.");
    } catch (e: any) {
      toast.error(`No se pudo leer la constancia: ${e.message}`);
    } finally {
      setParsing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-card p-4 shadow-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b pb-3">
          <h2 className="text-lg font-semibold">Nuevo cliente</h2>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => { e.preventDefault(); m.mutate(); }}
        >
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase text-muted-foreground">Constancia de Situación Fiscal (opcional)</legend>
            <label className="flex cursor-pointer items-center gap-3 rounded-md border-2 border-dashed bg-secondary/30 px-4 py-3 hover:bg-secondary/50">
              {parsing ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                : parsed ? <CheckCircle2 className="h-5 w-5 text-success" />
                : <FileUp className="h-5 w-5 text-muted-foreground" />}
              <div className="flex-1">
                <div className="text-sm font-medium">{parsed ? "Datos extraídos · puedes editar abajo" : "Sube la Constancia (PDF) para autollenar"}</div>
                <div className="text-xs text-muted-foreground">Extrae RFC, razón social, régimen, CP y dirección</div>
              </div>
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                disabled={parsing}
                onChange={(e) => e.target.files?.[0] && onConstancia(e.target.files[0])}
              />
            </label>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase text-muted-foreground">Usuario propietario</legend>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setMode("new")}
                className={`rounded-md border px-3 py-1.5 ${mode === "new" ? "bg-primary text-primary-foreground" : ""}`}
              >
                Crear usuario nuevo
              </button>
              <button
                type="button"
                onClick={() => setMode("existing")}
                className={`rounded-md border px-3 py-1.5 ${mode === "existing" ? "bg-primary text-primary-foreground" : ""}`}
              >
                Asignar usuario existente
              </button>
            </div>

            {mode === "new" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nombre completo"><input required value={form.full_name} onChange={(e) => set("full_name", e.target.value)} className="input" /></Field>
                <Field label="Email"><input required type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="input" /></Field>
                <Field label="Contraseña (min 8 caracteres)" className="sm:col-span-2">
                  <input required type="text" minLength={8} value={form.password} onChange={(e) => set("password", e.target.value)} className="input font-mono" />
                </Field>
              </div>
            ) : (
              <div>
                <input
                  placeholder="Buscar por email o nombre…"
                  value={userSearch}
                  onChange={(e) => { setUserSearch(e.target.value); setExistingUserId(""); }}
                  className="input"
                />
                <div className="mt-2 max-h-48 overflow-y-auto rounded-md border">
                  {filteredUsers.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground">Sin resultados</div>
                  ) : (
                    filteredUsers.slice(0, 30).map((u: any) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => { setExistingUserId(u.id); setUserSearch(u.email ?? u.full_name ?? ""); }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-secondary ${existingUserId === u.id ? "bg-secondary" : ""}`}
                      >
                        <span className="truncate font-medium">{u.full_name ?? "—"}</span>
                        <span className="ml-2 truncate text-muted-foreground">{u.email}</span>
                      </button>
                    ))
                  )}
                </div>
                {existingUserId && (
                  <p className="mt-1 text-xs text-muted-foreground">Usuario seleccionado ✓</p>
                )}
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase text-muted-foreground">Organización</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="RFC"><input required value={form.rfc} onChange={(e) => set("rfc", e.target.value.toUpperCase())} className="input font-mono uppercase" /></Field>
              <Field label="Régimen fiscal"><input value={form.regimen_fiscal} onChange={(e) => set("regimen_fiscal", e.target.value)} className="input" /></Field>
              <Field label="Razón social" className="sm:col-span-2"><input required value={form.razon_social} onChange={(e) => set("razon_social", e.target.value)} className="input" /></Field>
              <Field label="Código postal"><input value={form.codigo_postal} onChange={(e) => set("codigo_postal", e.target.value)} className="input font-mono" /></Field>
              <Field label="Dirección"><input value={form.direccion} onChange={(e) => set("direccion", e.target.value)} className="input" /></Field>
            </div>
          </fieldset>


          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase text-muted-foreground">Plan</legend>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Nombre"><input value={form.plan_name} onChange={(e) => set("plan_name", e.target.value)} className="input" /></Field>
              <Field label="Mensualidad"><input type="number" value={form.mensualidad} onChange={(e) => set("mensualidad", Number(e.target.value))} className="input" /></Field>
              <Field label="Timbres factura"><input type="number" value={form.timbres_factura_incluidos} onChange={(e) => set("timbres_factura_incluidos", Number(e.target.value))} className="input" /></Field>
              <Field label="Timbres nómina"><input type="number" value={form.timbres_nomina_incluidos} onChange={(e) => set("timbres_nomina_incluidos", Number(e.target.value))} className="input" /></Field>
            </div>
          </fieldset>

          <div className="flex justify-end gap-2 border-t pt-4">
            <button type="button" onClick={onClose} className="rounded-md border px-4 py-2 text-sm">Cancelar</button>
            <button
              type="submit"
              disabled={m.isPending || (mode === "existing" && !existingUserId)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {m.isPending ? "Creando…" : "Crear cliente"}
            </button>
          </div>
        </form>
        <style>{`.input { width: 100%; border: 1px solid var(--color-border); background: var(--color-background); padding: 0.5rem 0.75rem; border-radius: 0.375rem; font-size: 0.875rem; }`}</style>
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
