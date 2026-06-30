import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ mode: z.enum(["signin", "signup"]).optional() }).parse,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/app" });
  },
  head: () => ({
    meta: [
      { title: "Acceder · Dranur ERP" },
      { name: "description", content: "Inicia sesión o crea tu cuenta para acceder a Dranur ERP." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Cuenta creada. Bienvenido.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/app" });
    } catch (err: any) {
      toast.error(err.message ?? "Error de autenticación");
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/app",
    });
    if (result.error) {
      toast.error(result.error.message ?? "Error con Google");
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/app" });
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between bg-sidebar text-sidebar-foreground p-12">
        <Link to="/" className="flex items-center gap-3 font-semibold">
          <div className="grid h-11 w-11 place-items-center rounded-md bg-white p-1.5">
            <img src="/icon-192.png" alt="Logo" className="h-full w-full object-contain" />
          </div>
          <div className="leading-tight">
            <div>CPFiscalPro</div>
            <div className="text-[10px] font-normal uppercase tracking-wider text-sidebar-foreground/60">Contabilidad · Nómina · Facturación</div>
          </div>
        </Link>
        <div className="space-y-6">
          <p className="text-2xl font-medium leading-snug">
            "Todo el cumplimiento fiscal, laboral y de facturación de tus clientes en un solo lugar."
          </p>
          <ul className="space-y-2 text-sm text-sidebar-foreground/80">
            {[
              "Contabilidad electrónica SAT con cuadre automático",
              "Nómina CFDI 4.0 con ISR, IMSS y subsidio al empleo",
              "Asistencias con festivos LFT y horas extra automáticas",
              "Timbrado FacturAPI sandbox y producción",
              "Multi-RFC con aislamiento por organización (RLS)",
              "Importación directa desde Aspel COI y NOI",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sidebar-primary" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-sidebar-foreground/50">
          Cumplimiento SAT · LISR · IMSS · LFT · CFDI 4.0
        </p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-white p-1 ring-1 ring-border">
              <img src="/icon-192.png" alt="Logo" className="h-full w-full object-contain" />
            </div>
            <span className="font-semibold">CPFiscalPro</span>
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {mode === "signup" ? "Crear cuenta" : "Iniciar sesión"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "signup" ? "Accede a contabilidad y nómina multi-RFC." : "Bienvenido de vuelta."}
            </p>
          </div>

          <button
            onClick={google}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-md border bg-card px-4 py-2.5 text-sm font-medium hover:bg-secondary disabled:opacity-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.55c2.08-1.91 3.29-4.74 3.29-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.55-2.76c-.98.66-2.23 1.06-3.73 1.06-2.87 0-5.3-1.94-6.17-4.55H2.18v2.85A11 11 0 0 0 12 23z"/>
              <path fill="#FBBC05" d="M5.83 14.09a6.59 6.59 0 0 1 0-4.18V7.06H2.18a11.02 11.02 0 0 0 0 9.88l3.65-2.85z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.65 2.85C6.7 7.32 9.13 5.38 12 5.38z"/>
            </svg>
            Continuar con Google
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <span className="relative mx-auto block w-fit bg-background px-2 text-xs uppercase text-muted-foreground">o con correo</span>
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <input
                type="text"
                placeholder="Nombre completo"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                required
              />
            )}
            <input
              type="email"
              placeholder="correo@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              required
            />
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              className="w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Procesando..." : mode === "signup" ? "Crear cuenta" : "Entrar"}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {mode === "signup" ? "¿Ya tienes cuenta?" : "¿Eres nuevo?"}{" "}
            <button
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              className="font-medium text-primary hover:underline"
            >
              {mode === "signup" ? "Inicia sesión" : "Crea tu cuenta"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
