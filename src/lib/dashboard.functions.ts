import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  mes: z.number().int().min(1).max(12).optional(),
  ejercicio: z.number().int().optional(),
});

export const getDashboardKpis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => inputSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const today = new Date();
    const year = data.ejercicio ?? today.getFullYear();
    const month = data.mes ?? today.getMonth() + 1;
    const startMonth = `${year}-${String(month).padStart(2, "0")}-01`;
    const endMonth = new Date(year, month, 0).toISOString().slice(0, 10);

    const [emp, polizas, periodos, lineas, recibos] = await Promise.all([
      supabase.from("employees").select("id", { count: "exact", head: true })
        .eq("organization_id", data.organizationId).eq("estatus", "activo"),
      supabase.from("journal_entries").select("id, tipo, total_cargo, fecha, estatus")
        .eq("organization_id", data.organizationId)
        .gte("fecha", startMonth).lte("fecha", endMonth),
      supabase.from("payroll_periods").select("id, estatus")
        .eq("organization_id", data.organizationId).eq("ejercicio", year),
      supabase.from("journal_lines").select("cargo, abono, account:accounts!inner(codigo, naturaleza)")
        .eq("organization_id", data.organizationId),
      supabase.from("payroll_receipts").select("neto_pagar")
        .eq("organization_id", data.organizationId)
        .gte("created_at", startMonth),
    ]);

    const empleadosActivos = emp.count ?? 0;
    const polizasMes = polizas.data?.length ?? 0;
    const pendientes = polizas.data?.filter((p) => p.estatus === "borrador").length ?? 0;
    const ingresos = polizas.data
      ?.filter((p) => p.tipo === "ingreso" && p.estatus !== "cancelada")
      .reduce((s, p) => s + Number(p.total_cargo ?? 0), 0) ?? 0;
    const egresos = polizas.data
      ?.filter((p) => p.tipo === "egreso" && p.estatus !== "cancelada")
      .reduce((s, p) => s + Number(p.total_cargo ?? 0), 0) ?? 0;
    const nomMes = recibos.data?.reduce((s, r) => s + Number(r.neto_pagar ?? 0), 0) ?? 0;
    const periodosActivos = periodos.data?.filter((p) => p.estatus !== "cerrado").length ?? 0;

    // Build 6-month trend ending at the selected month
    const trendStart = new Date(year, month - 6, 1).toISOString().slice(0, 10);
    const [hist, nomHist] = await Promise.all([
      supabase
        .from("journal_entries")
        .select("fecha, tipo, total_cargo, estatus")
        .eq("organization_id", data.organizationId)
        .gte("fecha", trendStart)
        .neq("estatus", "cancelada"),
      supabase
        .from("payroll_receipts")
        .select("neto_pagar, created_at")
        .eq("organization_id", data.organizationId)
        .gte("created_at", trendStart),
    ]);
    const buckets: Record<string, { ingresos: number; egresos: number; nomina: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets[k] = { ingresos: 0, egresos: 0, nomina: 0 };
    }
    (hist.data ?? []).forEach((r: any) => {
      const k = (r.fecha as string).slice(0, 7);
      if (!buckets[k]) return;
      const v = Number(r.total_cargo ?? 0);
      if (r.tipo === "ingreso") buckets[k].ingresos += v;
      else if (r.tipo === "egreso") buckets[k].egresos += v;
    });
    (nomHist.data ?? []).forEach((r: any) => {
      const k = (r.created_at as string).slice(0, 7);
      if (!buckets[k]) return;
      buckets[k].nomina += Number(r.neto_pagar ?? 0);
    });
    const trend = Object.entries(buckets).map(([mes, v]) => ({
      mes, ...v,
      utilidad: v.ingresos - v.egresos - v.nomina,
    }));

    return {
      empleadosActivos,
      polizasMes,
      polizasPendientes: pendientes,
      ingresos,
      egresos,
      utilidad: ingresos - egresos - nomMes,
      nominaMes: nomMes,
      periodosActivos,
      trend,
      totalLineas: lineas.data?.length ?? 0,
    };
  });
