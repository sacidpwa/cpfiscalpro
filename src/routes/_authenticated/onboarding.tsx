import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { createOrganization } from "@/lib/orgs.functions";
import { requestNewOrganization, listMyOrgRequests } from "@/lib/org-requests.functions";
import { useOrg } from "@/lib/use-current-org";
import { toast } from "sonner";
import { Building2, ArrowLeft, Clock, CheckCircle2, XCircle, Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
  head: () => ({ meta: [{ title: "Organizaciones · Dranur" }] }),
});

const REGIMENES = [
  ["601", "General de Ley Personas Morales"],
  ["603", "Personas Morales con Fines no Lucrativos"],
  ["605", "Sueldos y Salarios"],
  ["606", "Arrendamiento"],
  ["612", "Personas Físicas con Actividades Empresariales"],
  ["621", "Incorporación Fiscal"],
  ["625", "Plataformas Tecnológicas"],
  ["626", "RESICO"],
] as const;

function Onboarding() {
  const navigate = useNavigate();
  const { refresh, organizations, setCurrent } = useOrg();
  const createFn = useServerFn(createOrganization);
  const requestFn = useServerFn(requestNewOrganization);
  const listMyReqs = useServerFn(listMyOrgRequests);

  const isFirst = organizations.length === 0;
  const { data: myReqs, refetch: refetchReqs } = useQuery({
    queryKey: ["my-org-requests"],
    queryFn: () => listMyReqs(),
    enabled: !isFirst,
  });

  const [form, setForm] = useState({
    rfc: "",
    razon_social: "",
    nombre_comercial: "",
    regimen_fiscal: "626",
    codigo_postal: "",
    direccion: "",
    motivo: "",
  });
  const [loading, setLoading] = useState(false);

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await createFn({ data: form });
      toast.success("Organización creada");
      refresh();
      setCurrent({
        id: res.id,
        rfc: form.rfc.toUpperCase(),
        razon_social: form.razon_social,
        regimen_fiscal: form.regimen_fiscal,
        role: "owner",
      });
      navigate({ to: "/app" });
    } catch (err: any) {
      toast.error(err.message ?? "Error creando organización");
    } finally { setLoading(false); }
  }

  async function submitRequest(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await requestFn({
        data: {
          rfc: form.rfc,
          razon_social: form.razon_social,
          regimen_fiscal: form.regimen_fiscal || null,
          codigo_postal: form.codigo_postal || null,
          motivo: form.motivo || null,
        },
      });
      toast.success("Solicitud enviada al super administrador");
      setForm({ ...form, rfc: "", razon_social: "", motivo: "" });
      refetchReqs();
    } catch (err: any) {
      toast.error(err.message ?? "Error enviando solicitud");
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-12">
        {!isFirst && (
          <Link to="/app" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Volver
          </Link>
        )}
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {isFirst ? "Crea tu primera organización" : "Solicitar nueva organización"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isFirst
                ? "Cada organización representa un RFC con su contabilidad y nómina independientes."
                : "El alta de organizaciones adicionales requiere aprobación del super administrador."}
            </p>
          </div>
        </div>

        <form
          onSubmit={isFirst ? submitCreate : submitRequest}
          className="space-y-4 rounded-lg border bg-card p-6"
        >
          <Field label="RFC" required>
            <input
              value={form.rfc}
              onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })}
              required maxLength={13} placeholder="XAXX010101000"
              className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm uppercase outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>
          <Field label="Razón social" required>
            <input
              value={form.razon_social}
              onChange={(e) => setForm({ ...form, razon_social: e.target.value })}
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>
          <Field label="Régimen fiscal">
            <select
              value={form.regimen_fiscal}
              onChange={(e) => setForm({ ...form, regimen_fiscal: e.target.value })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {REGIMENES.map(([c, n]) => (<option key={c} value={c}>{c} — {n}</option>))}
            </select>
          </Field>
          {isFirst ? (
            <>
              <Field label="Nombre comercial">
                <input
                  value={form.nombre_comercial}
                  onChange={(e) => setForm({ ...form, nombre_comercial: e.target.value })}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <div><Field label="C.P.">
                  <input value={form.codigo_postal} onChange={(e) => setForm({ ...form, codigo_postal: e.target.value })} maxLength={5}
                    className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"/>
                </Field></div>
                <div className="col-span-2"><Field label="Dirección">
                  <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"/>
                </Field></div>
              </div>
            </>
          ) : (
            <>
              <Field label="C.P. (opcional)">
                <input value={form.codigo_postal} onChange={(e) => setForm({ ...form, codigo_postal: e.target.value })} maxLength={5}
                  className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"/>
              </Field>
              <Field label="Motivo (opcional)">
                <textarea
                  value={form.motivo}
                  onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                  rows={3} maxLength={500}
                  placeholder="¿Por qué necesitas esta organización adicional?"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </Field>
            </>
          )}
          <button
            type="submit" disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Procesando..." : isFirst ? "Crear organización" : (<><Send className="h-4 w-4"/>Enviar solicitud</>)}
          </button>
          <p className="text-xs text-muted-foreground">
            {isFirst
              ? "Se creará un catálogo de cuentas básico SAT y los conceptos de nómina más comunes."
              : "El super administrador recibirá tu solicitud y, una vez aprobada, la organización aparecerá automáticamente en tu selector."}
          </p>
        </form>

        {!isFirst && myReqs && myReqs.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold">Mis solicitudes</h2>
            <div className="space-y-2">
              {myReqs.map((r: any) => (
                <div key={r.id} className="flex items-start gap-3 rounded-lg border bg-card p-3">
                  <StatusIcon status={r.status} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{r.razon_social} <span className="ml-2 font-mono text-xs text-muted-foreground">{r.rfc}</span></div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("es-MX")} · <span className="capitalize">{r.status}</span>
                    </div>
                    {r.admin_notes && <p className="mt-1 text-xs italic text-muted-foreground">"{r.admin_notes}"</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "aprobada") return <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />;
  if (status === "rechazada") return <XCircle className="mt-0.5 h-4 w-4 text-destructive" />;
  return <Clock className="mt-0.5 h-4 w-4 text-amber-600" />;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-destructive"> *</span>}
      </span>
      {children}
    </label>
  );
}
