import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight, Calculator, FileSpreadsheet, Users, Building2, ShieldCheck, FileBarChart,
  Receipt, Stamp, BookOpen, Library, Scale, Upload, UserSquare, Package, Calendar,
  CheckCircle2, Lock, Cloud, Smartphone,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CPFiscalPro — Contabilidad, nómina y facturación multi-RFC para México" },
      {
        name: "description",
        content:
          "Plataforma ERP en la nube para despachos contables y empresas mexicanas. Contabilidad electrónica SAT, nómina CFDI 4.0 con cálculo ISR/IMSS, facturación, asistencias e importación Aspel COI/NOI.",
      },
      { property: "og:title", content: "CPFiscalPro — Contabilidad y nómina multi-RFC para México" },
      { property: "og:description", content: "CFDI 4.0, ISR, IMSS, LFT, pólizas, asistencias y facturación en un solo lugar." },
      { name: "theme-color", content: "#0d6e5a" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-white p-1 ring-1 ring-border">
              <img src="/icon-192.png" alt="Logo" className="h-full w-full object-contain" />
            </div>
            <span className="font-semibold tracking-tight">CPFiscalPro</span>
          </Link>
          <nav className="hidden gap-6 text-sm text-muted-foreground md:flex">
            <a href="#modulos" className="hover:text-foreground">Módulos</a>
            <a href="#cumplimiento" className="hover:text-foreground">Cumplimiento</a>
            <a href="#seguridad" className="hover:text-foreground">Seguridad</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">Iniciar sesión</Link>
            <Link
              to="/auth" search={{ mode: "signup" }}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Entrar
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--color-primary)_18%,transparent),transparent)]"
        />
        <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-16 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" /> CFDI 4.0 · SAT · IMSS · LFT
          </span>
          <h1 className="mx-auto mt-6 max-w-4xl text-5xl font-bold tracking-tight md:text-6xl">
            El ERP completo para <span className="text-primary">contabilidad, nómina y facturación</span> de empresas mexicanas.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Multi-RFC nativo. Importa tus respaldos Aspel COI/NOI, captura pólizas con cuadre automático,
            calcula nómina con ISR e IMSS, registra asistencias e incidencias y timbra CFDI 4.0 — todo desde la nube.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/auth" search={{ mode: "signup" }}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Comenzar ahora <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-md border bg-card px-5 py-3 text-sm font-medium hover:bg-secondary"
            >
              Iniciar sesión
            </Link>
          </div>

          <div className="mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-6 text-left sm:grid-cols-4">
            {[
              ["100%", "Cumplimiento SAT"],
              ["CFDI 4.0", "Nómina + Ingresos"],
              ["Multi-RFC", "Sin límite de razones"],
              ["LFT 2024+", "ISR · IMSS · SBC"],
            ].map(([k, v]) => (
              <div key={v} className="rounded-lg border bg-card/60 p-4 backdrop-blur">
                <div className="text-2xl font-bold tracking-tight text-primary">{k}</div>
                <div className="mt-1 text-xs text-muted-foreground">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MÓDULOS */}
      <section id="modulos" className="border-t bg-card">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight">Un sistema, todos los módulos</h2>
            <p className="mt-3 text-muted-foreground">Desde el catálogo SAT hasta el envío de recibos por correo.</p>
          </div>
          <div className="grid gap-px overflow-hidden rounded-lg bg-border md:grid-cols-3">
            {MODULES.map((f) => (
              <div key={f.title} className="bg-card p-7">
                <div className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CUMPLIMIENTO */}
      <section id="cumplimiento" className="border-t">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Cumplimiento normativo</h2>
            <p className="mt-3 text-muted-foreground">
              Diseñado por contadores mexicanos para apegarse al marco fiscal y laboral vigente.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {COMPLIANCE.map((c) => (
                <li key={c} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Especificaciones técnicas</h3>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              {SPECS.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* SEGURIDAD */}
      <section id="seguridad" className="border-t bg-card">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-8 md:grid-cols-3">
            {[
              { icon: Lock, title: "Row-Level Security", desc: "Aislamiento por organización en la base de datos. Cada cliente solo ve sus propios datos." },
              { icon: Cloud, title: "Backups continuos", desc: "Tu información se respalda automáticamente. Disponibilidad y recuperación gestionadas en la nube." },
              { icon: Smartphone, title: "PWA instalable", desc: "Funciona en escritorio, tablet y móvil. Instálala como app y consulta desde donde estés." },
            ].map((f) => (
              <div key={f.title}>
                <f.icon className="h-6 w-6 text-primary" />
                <h3 className="mt-3 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Lleva tu despacho al siguiente nivel</h2>
          <p className="mt-3 text-muted-foreground">Centraliza la contabilidad, nómina y facturación de todos tus clientes en una sola plataforma.</p>
          <Link
            to="/auth" search={{ mode: "signup" }}
            className="mt-8 inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Crear cuenta <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="grid h-6 w-6 place-items-center rounded bg-primary text-primary-foreground text-xs font-bold">D</div>
            <span>© {new Date().getFullYear()} Dranur ERP</span>
          </div>
          <div className="text-xs">Construido para contadores y empresas mexicanas.</div>
        </div>
      </footer>
    </div>
  );
}

const MODULES = [
  { icon: BookOpen, title: "Contabilidad electrónica", desc: "Catálogo SAT, pólizas con cuadre obligatorio, balanza, libro diario y mayor." },
  { icon: Library, title: "Catálogo de cuentas", desc: "Códigos agrupadores SAT predefinidos, multinivel y editables por organización." },
  { icon: Scale, title: "Balanza de comprobación", desc: "Saldos por periodo en tiempo real con desglose por cuenta." },
  { icon: Receipt, title: "Nómina CFDI 4.0", desc: "Recibos calculados con ISR Art. 96, subsidio al empleo, IMSS obrero y SBC con factor LFT." },
  { icon: Calendar, title: "Asistencias e incidencias", desc: "Festivos LFT Art. 74, descanso 1×6, horas extra dobles/triples, retardos y suspensiones." },
  { icon: Stamp, title: "Timbrado vía FacturAPI", desc: "Sandbox y producción. Descarga XML + PDF y envío por correo a cada empleado." },
  { icon: UserSquare, title: "Facturación de ingresos", desc: "Clientes, productos, CFDI 4.0 con catálogos SAT (ClaveProdServ, ClaveUnidad)." },
  { icon: Package, title: "Productos y servicios", desc: "IVA, IEPS, retenciones y precios por moneda. Listo para PUE o PPD." },
  { icon: Upload, title: "Importación Aspel COI/NOI", desc: "Sube tus respaldos DBF y migra catálogo, empleados y movimientos sin recapturar." },
  { icon: Building2, title: "Multi-RFC", desc: "Una sola cuenta administra todas las razones sociales con aislamiento total." },
  { icon: Users, title: "Roles y permisos", desc: "Owner, admin, contador, nómina, recursos humanos y lector. Permisos por módulo." },
  { icon: FileBarChart, title: "Dashboard ejecutivo", desc: "KPIs en tiempo real: ingresos, egresos, nómina, utilidad y pólizas pendientes." },
];

const COMPLIANCE = [
  "CFDI 4.0 — comprobantes de Ingreso y de Nómina con complemento Nómina 1.2",
  "LISR Art. 96 — tarifas mensuales actualizadas y tablas del subsidio al empleo",
  "Ley del Seguro Social — cuotas obrero/patronal, SDI con factor de integración LFT 2024+",
  "LFT Art. 74 — calendario de días festivos automático por ejercicio",
  "LFT Art. 66-68 — horas extra: primeras 9 hrs/semana dobles, excedente triple",
  "LFT Art. 69 — día de descanso pagado por cada 6 días trabajados",
  "Catálogos SAT vigentes (RegimenFiscal, UsoCFDI, ClaveProdServ, ClaveUnidad)",
];

const SPECS = [
  ["Stack", "TanStack Start + React 19"],
  ["Base de datos", "PostgreSQL (RLS)"],
  ["Timbrado", "FacturAPI · CFDI 4.0"],
  ["Correo", "Resend transaccional"],
  ["PDF", "jsPDF (recibos / resúmenes)"],
  ["Importación", "Aspel COI / NOI (DBF)"],
];
