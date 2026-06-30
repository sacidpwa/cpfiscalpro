import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-ui";
import { adminListOrgModules, adminUpsertOrgModule } from "@/lib/admin-modules.functions";
import { adminUpsertPlan, adminGenerateInvoice } from "@/lib/billing-subs.functions";
import { adminListUsers, adminSetOrgRole } from "@/lib/admin-users.functions";
import { supabase } from "@/integrations/supabase/client";

const ROLE_OPTIONS = [
  { value: "owner", label: "Propietario" },
  { value: "admin", label: "Administrador" },
  { value: "contador", label: "Contador" },
  { value: "nomina", label: "Nómina" },
  { value: "recursos_humanos", label: "Recursos humanos" },
  { value: "lector", label: "Lector" },
] as const;

export const Route = createFileRoute("/_authenticated/admin/organizaciones/$orgId")({
  component: OrgDetail,
});

const MODULES = [
  { id: "nomina", label: "Nómina", desc: "Recibos CFDI 4.0, ISR, IMSS, subsidio" },
  { id: "facturacion", label: "Facturación", desc: "Timbrado CFDI vía FacturAPI" },
  { id: "contabilidad", label: "Contabilidad", desc: "Catálogo, pólizas, balanza" },
  { id: "asistencias", label: "Asistencias", desc: "Festivos LFT, horas extra, incidencias" },
  { id: "bancos", label: "Bancos", desc: "Conciliación bancaria" },
  { id: "declaraciones", label: "Declaraciones", desc: "Portal de cumplimiento fiscal" },
] as const;

function OrgDetail() {
  const { orgId } = useParams({ from: "/_authenticated/admin/organizaciones/$orgId" });
  const qc = useQueryClient();
  const modsFn = useServerFn(adminListOrgModules);
  const upsertMod = useServerFn(adminUpsertOrgModule);
  const upsertPlan = useServerFn(adminUpsertPlan);
  const genInvoice = useServerFn(adminGenerateInvoice);

  const { data: mods } = useQuery({
    queryKey: ["admin-org-modules", orgId],
    queryFn: () => modsFn({ data: { organizationId: orgId } }),
  });

  const { data: org } = useQuery({
    queryKey: ["admin-org", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("organizations").select("*").eq("id", orgId).single();
      return data;
    },
  });

  const { data: plan, refetch: refetchPlan } = useQuery({
    queryKey: ["admin-plan", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("subscription_plans").select("*").eq("organization_id", orgId).maybeSingle();
      return data;
    },
  });

  const totalModulos = mods
    ? MODULES.reduce((s, m) => s + (mods[m.id]?.activo ? Number(mods[m.id].costo) : 0), 0)
    : 0;

  return (
    <div>
      <PageHeader
        title={org?.razon_social ?? "Organización"}
        description={org ? `${org.rfc} · ${org.regimen_fiscal ?? "—"}` : ""}
        actions={
          <Link to="/admin/clientes" className="text-xs text-muted-foreground hover:underline">
            ← Volver
          </Link>
        }
      />
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        {/* MÓDULOS */}
        <section className="rounded-lg border bg-card p-4 sm:p-6">
          <h3 className="text-sm font-semibold">Módulos contratados</h3>
          <p className="text-xs text-muted-foreground">Activa los servicios que el cliente paga y define el costo mensual de cada uno.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {MODULES.map((m) => {
              const cur = mods?.[m.id] ?? { activo: false, costo: 0 };
              return (
                <ModuleRow
                  key={m.id}
                  label={m.label}
                  desc={m.desc}
                  active={cur.activo}
                  costo={cur.costo}
                  onSave={async (activo, costo) => {
                    try {
                      await upsertMod({ data: { organizationId: orgId, modulo: m.id, activo, costo_mensual: costo } });
                      toast.success(`${m.label} ${activo ? "activado" : "desactivado"}`);
                      qc.invalidateQueries({ queryKey: ["admin-org-modules", orgId] });
                    } catch (e: any) {
                      toast.error(e.message);
                    }
                  }}
                />
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Costo mensual por módulos activos</span>
            <span className="font-semibold tabular-nums">${totalModulos.toFixed(2)} MXN</span>
          </div>
        </section>

        {/* PLAN / SUSCRIPCIÓN */}
        <PlanCard
          orgId={orgId}
          plan={plan}
          onSave={async (payload) => {
            try {
              await upsertPlan({ data: { organizationId: orgId, ...payload } });
              toast.success("Plan actualizado");
              refetchPlan();
            } catch (e: any) {
              toast.error(e.message);
            }
          }}
        />

        {/* MIEMBROS */}
        <MembersCard orgId={orgId} />

        {/* GENERAR FACTURA MES ACTUAL */}
        <section className="rounded-lg border bg-card p-4 sm:p-6">
          <h3 className="text-sm font-semibold">Generar factura del mes</h3>
          <p className="text-xs text-muted-foreground">
            Crea (o actualiza) la mensualidad del periodo seleccionado. Stripe agrega un recargo del 20%.
          </p>
          <GenerateInvoiceForm
            onGenerate={async (ejercicio, mes, metodo) => {
              try {
                const r = await genInvoice({ data: { organizationId: orgId, ejercicio, mes, metodo } });
                toast.success(`Factura generada por $${r.total.toFixed(2)}`);
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
          />
        </section>
      </div>
    </div>
  );
}

function ModuleRow({
  label,
  desc,
  active,
  costo,
  onSave,
}: {
  label: string;
  desc: string;
  active: boolean;
  costo: number;
  onSave: (active: boolean, costo: number) => void;
}) {
  const [chk, setChk] = useState(active);
  const [c, setC] = useState(costo);
  useEffect(() => {
    setChk(active);
    setC(costo);
  }, [active, costo]);
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <label className="flex flex-1 cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={chk}
          onChange={(e) => {
            setChk(e.target.checked);
            onSave(e.target.checked, c);
          }}
          className="mt-1"
        />
        <div className="min-w-0">
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
      </label>
      <div className="flex items-center gap-1">
        <span className="text-xs">$</span>
        <input
          type="number"
          min="0"
          value={c}
          onChange={(e) => setC(Number(e.target.value))}
          onBlur={() => onSave(chk, c)}
          className="w-20 rounded border bg-background px-2 py-1 text-right text-sm tabular-nums"
        />
      </div>
    </div>
  );
}

function PlanCard({ orgId, plan, onSave }: { orgId: string; plan: any; onSave: (p: any) => void }) {
  const [f, setF] = useState({
    plan_name: plan?.plan_name ?? "Básico",
    mensualidad: Number(plan?.mensualidad ?? 0),
    dia_pago: plan?.dia_pago ?? 10,
    fecha_inicio: plan?.fecha_inicio ?? new Date().toISOString().slice(0, 10),
    fecha_vencimiento: plan?.fecha_vencimiento ?? "",
    estatus: (plan?.estatus as "activa" | "suspendida" | "cancelada") ?? "activa",
    metodo_pago_preferido: (plan?.metodo_pago_preferido as any) ?? "transferencia",
    notas_admin: plan?.notas_admin ?? "",
  });
  useEffect(() => {
    if (plan) {
      setF({
        plan_name: plan.plan_name ?? "Básico",
        mensualidad: Number(plan.mensualidad ?? 0),
        dia_pago: plan.dia_pago ?? 10,
        fecha_inicio: plan.fecha_inicio ?? new Date().toISOString().slice(0, 10),
        fecha_vencimiento: plan.fecha_vencimiento ?? "",
        estatus: plan.estatus ?? "activa",
        metodo_pago_preferido: plan.metodo_pago_preferido ?? "transferencia",
        notas_admin: plan.notas_admin ?? "",
      });
    }
  }, [plan]);

  return (
    <section className="rounded-lg border bg-card p-4 sm:p-6">
      <h3 className="text-sm font-semibold">Plan y vigencia</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Nombre del plan">
          <input value={f.plan_name} onChange={(e) => setF({ ...f, plan_name: e.target.value })} className={inp} />
        </Field>
        <Field label="Mensualidad fija (extra a módulos)">
          <input
            type="number"
            value={f.mensualidad}
            onChange={(e) => setF({ ...f, mensualidad: Number(e.target.value) })}
            className={inp}
          />
        </Field>
        <Field label="Día de pago (1–28)">
          <input
            type="number"
            min="1"
            max="28"
            value={f.dia_pago}
            onChange={(e) => setF({ ...f, dia_pago: Number(e.target.value) })}
            className={inp}
          />
        </Field>
        <Field label="Fecha de inicio">
          <input
            type="date"
            value={f.fecha_inicio}
            onChange={(e) => setF({ ...f, fecha_inicio: e.target.value })}
            className={inp}
          />
        </Field>
        <Field label="Fecha de vencimiento (opcional)">
          <input
            type="date"
            value={f.fecha_vencimiento}
            onChange={(e) => setF({ ...f, fecha_vencimiento: e.target.value })}
            className={inp}
          />
        </Field>
        <Field label="Estatus">
          <select value={f.estatus} onChange={(e) => setF({ ...f, estatus: e.target.value as any })} className={inp}>
            <option value="activa">Activa</option>
            <option value="suspendida">Suspendida</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </Field>
        <Field label="Método de pago preferido">
          <select
            value={f.metodo_pago_preferido}
            onChange={(e) => setF({ ...f, metodo_pago_preferido: e.target.value as any })}
            className={inp}
          >
            <option value="transferencia">Transferencia</option>
            <option value="efectivo">Efectivo</option>
            <option value="stripe">Stripe (+20%)</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="otro">Otro</option>
          </select>
        </Field>
        <Field label="Notas internas">
          <input value={f.notas_admin} onChange={(e) => setF({ ...f, notas_admin: e.target.value })} className={inp} />
        </Field>
      </div>
      <div className="mt-4 text-right">
        <button
          onClick={() => onSave({ ...f, fecha_vencimiento: f.fecha_vencimiento || null })}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Guardar plan
        </button>
      </div>
    </section>
  );
}

function GenerateInvoiceForm({
  onGenerate,
}: {
  onGenerate: (ejercicio: number, mes: number, metodo: "transferencia" | "efectivo" | "stripe" | "tarjeta" | "otro") => void;
}) {
  const now = new Date();
  const [ejercicio, setEjercicio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [metodo, setMetodo] = useState<"transferencia" | "efectivo" | "stripe" | "tarjeta" | "otro">("transferencia");
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <Field label="Año">
        <input type="number" value={ejercicio} onChange={(e) => setEjercicio(Number(e.target.value))} className={inp} />
      </Field>
      <Field label="Mes">
        <input type="number" min="1" max="12" value={mes} onChange={(e) => setMes(Number(e.target.value))} className={inp} />
      </Field>
      <Field label="Método">
        <select value={metodo} onChange={(e) => setMetodo(e.target.value as any)} className={inp}>
          <option value="transferencia">Transferencia</option>
          <option value="efectivo">Efectivo</option>
          <option value="stripe">Stripe (+20%)</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="otro">Otro</option>
        </select>
      </Field>
      <button
        onClick={() => onGenerate(ejercicio, mes, metodo)}
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        Generar
      </button>
    </div>
  );
}

function MembersCard({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const listUsersFn = useServerFn(adminListUsers);
  const setRoleFn = useServerFn(adminSetOrgRole);

  const { data: users } = useQuery({
    queryKey: ["admin-all-users"],
    queryFn: () => listUsersFn(),
  });

  const { data: members, refetch } = useQuery({
    queryKey: ["admin-org-members", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_members")
        .select("user_id, role, created_at")
        .eq("organization_id", orgId);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const memberIds = new Set((members ?? []).map((m: any) => m.user_id));
  const userById = new Map((users ?? []).map((u: any) => [u.id, u]));
  const available = (users ?? []).filter((u: any) => !memberIds.has(u.id));

  const [selUser, setSelUser] = useState("");
  const [selRole, setSelRole] = useState<typeof ROLE_OPTIONS[number]["value"]>("admin");
  const [search, setSearch] = useState("");

  const filtered = available.filter((u: any) => {
    const q = search.toLowerCase();
    return !q || u.email?.toLowerCase().includes(q) || u.full_name?.toLowerCase().includes(q);
  });

  async function assign() {
    if (!selUser) return toast.error("Selecciona un usuario");
    try {
      await setRoleFn({ data: { userId: selUser, organizationId: orgId, role: selRole } });
      toast.success("Usuario asignado");
      setSelUser("");
      setSearch("");
      refetch();
      qc.invalidateQueries({ queryKey: ["admin-all-users"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function remove(userId: string) {
    if (!confirm("¿Quitar a este usuario de la organización?")) return;
    try {
      await setRoleFn({ data: { userId, organizationId: orgId, role: null } });
      toast.success("Usuario removido");
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function changeRole(userId: string, role: typeof ROLE_OPTIONS[number]["value"]) {
    try {
      await setRoleFn({ data: { userId, organizationId: orgId, role } });
      toast.success("Rol actualizado");
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <section className="rounded-lg border bg-card p-4 sm:p-6">
      <h3 className="text-sm font-semibold">Miembros</h3>
      <p className="text-xs text-muted-foreground">Asigna usuarios ya registrados a esta organización.</p>

      {/* Lista actual */}
      <div className="mt-3 divide-y rounded-md border">
        {(members ?? []).length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">Sin miembros todavía.</div>
        ) : (
          (members ?? []).map((m: any) => {
            const u = userById.get(m.user_id) as any;
            return (
              <div key={m.user_id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{u?.full_name ?? u?.email ?? m.user_id}</div>
                  <div className="truncate text-xs text-muted-foreground">{u?.email ?? ""}</div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={m.role}
                    onChange={(e) => changeRole(m.user_id, e.target.value as any)}
                    className="rounded border bg-background px-2 py-1 text-xs"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => remove(m.user_id)}
                    className="rounded border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                  >
                    Quitar
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Asignar nuevo */}
      <div className="mt-4 rounded-md border bg-muted/30 p-3">
        <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Asignar usuario existente</div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <div>
            <input
              placeholder="Buscar por email o nombre…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelUser(""); }}
              className={inp}
            />
            {search && (
              <div className="mt-1 max-h-44 overflow-y-auto rounded-md border bg-background">
                {filtered.length === 0 ? (
                  <div className="p-2 text-xs text-muted-foreground">Sin resultados</div>
                ) : (
                  filtered.slice(0, 20).map((u: any) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => { setSelUser(u.id); setSearch(u.email ?? u.full_name ?? ""); }}
                      className={`flex w-full items-center justify-between px-2 py-1.5 text-left text-xs hover:bg-secondary ${selUser === u.id ? "bg-secondary" : ""}`}
                    >
                      <span className="truncate">{u.full_name ?? "—"}</span>
                      <span className="ml-2 truncate text-muted-foreground">{u.email}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <select value={selRole} onChange={(e) => setSelRole(e.target.value as any)} className={inp}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <button
            onClick={assign}
            disabled={!selUser}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            Asignar
          </button>
        </div>
      </div>
    </section>
  );
}

const inp = "rounded-md border bg-background px-2 py-1.5 text-sm w-full";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
