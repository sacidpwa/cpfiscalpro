import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  mes: z.number().int().min(1).max(13).optional(),
  ejercicio: z.number().int().optional(),
});

async function getSaldos(supabase: any, orgId: string, ejercicio: number, mes: number) {
  let queryPer = mes;
  if (mes === 13) {
    const { count } = await supabase
      .from("account_balances")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("ejercicio", ejercicio)
      .eq("periodo", 13);
    if (count === 0) queryPer = 12;
  }
  const { data: bals } = await supabase
    .from("account_balances")
    .select("account_codigo, saldo_final")
    .eq("organization_id", orgId)
    .eq("ejercicio", ejercicio)
    .eq("periodo", queryPer);
  const map: Record<string, number> = {};
  for (const b of bals ?? []) map[b.account_codigo] = Number(b.saldo_final ?? 0);
  return map;
}

// calcER ahora recibe naturalezaMap para aplicar el signo correctamente
// (igual que getEstadoResultados: deudora = -saldo, acreedora = +saldo)
function calcER(
  saldos: Record<string, number>,
  saldosAnt: Record<string, number> | null,
  naturalezaMap: Record<string, string>,
) {
  let ingresos = 0,
    costos = 0,
    gastos = 0,
    otrosIng = 0,
    otrosGast = 0;
  for (const [codigo, saldo] of Object.entries(saldos)) {
    const d = codigo.replace(/^0+/, "")[0];
    if (d !== "4" && d !== "5" && d !== "6" && d !== "7") continue;
    const nat = naturalezaMap[codigo] ?? "deudora";
    // signed: deudora = -saldo, acreedora = +saldo (igual que ER)
    const signedSaldo = nat === "deudora" ? -saldo : saldo;
    const signedAnt = saldosAnt
      ? nat === "deudora"
        ? -(saldosAnt[codigo] ?? 0)
        : (saldosAnt[codigo] ?? 0)
      : 0;
    const per = signedSaldo - signedAnt; // delta con signo aplicado

    if (d === "4") {
      ingresos += per; // puede ser negativo (descuentos/contra-revenue)
    } else if (d === "5") {
      costos += Math.abs(per);
    } else if (d === "6") {
      gastos += Math.abs(per);
    } else if (d === "7") {
      const d2 = codigo.replace(/^0+/, "").substring(0, 2);
      if (d2 === "71" || d2 === "73") otrosIng += per;
      else otrosGast += Math.abs(per);
    }
  }
  const utilidad = ingresos - costos - gastos + otrosIng - otrosGast;
  return { ingresos, costos, gastos, otrosIng, otrosGast, utilidad };
}

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

    // Cargar cuentas con naturaleza (necesario para calcER)
    const { data: accts } = await supabase
      .from("accounts")
      .select("codigo, naturaleza")
      .eq("organization_id", data.organizationId);
    const naturalezaMap: Record<string, string> = {};
    (accts ?? []).forEach((a: any) => {
      naturalezaMap[a.codigo] = a.naturaleza;
    });

    // Obtener ID de cuenta de sueldos
    const sueldosAcctId = (accts ?? []).find((a: any) => a.codigo === "610000100000000000002")?.id;

    // 1. Saldos para el ER del mes seleccionado
    // mes=1 (enero): saldosAnt=null (saldos se reinician al iniciar ejercicio)
    const [saldosMes, saldosAnt] = await Promise.all([
      getSaldos(supabase, data.organizationId, year, month),
      month > 1 ? getSaldos(supabase, data.organizationId, year, month - 1) : Promise.resolve(null),
    ]);
    const er = calcER(saldosMes, saldosAnt, naturalezaMap);

    // 2. Conteos de pólizas y empleados
    const [emp, polizas, periodos, lineasCount] = await Promise.all([
      supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", data.organizationId)
        .eq("estatus", "activo"),
      supabase
        .from("journal_entries")
        .select("id, tipo, total_cargo, fecha, estatus")
        .eq("organization_id", data.organizationId)
        .gte("fecha", startMonth)
        .lte("fecha", endMonth),
      supabase
        .from("payroll_periods")
        .select("id, estatus")
        .eq("organization_id", data.organizationId)
        .eq("ejercicio", year),
      supabase
        .from("journal_lines")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", data.organizationId),
    ]);

    const empleadosActivos = emp.count ?? 0;
    const polizasMes = polizas.data?.length ?? 0;
    const pendientes = polizas.data?.filter((p) => p.estatus === "borrador").length ?? 0;
    const periodosActivos = periodos.data?.filter((p) => p.estatus !== "cerrado").length ?? 0;

    // 3. Nómina del mes (cargo a cuenta de sueldos)
    let nominaMes = 0;
    if (sueldosAcctId) {
      const { data: nominaLines } = await supabase
        .from("journal_lines")
        .select("cargo, entry:journal_entries!inner(fecha, estatus, organization_id)")
        .eq("entry.organization_id", data.organizationId)
        .neq("entry.estatus", "cancelada")
        .gte("entry.fecha", startMonth)
        .lte("entry.fecha", endMonth)
        .eq("account_id", sueldosAcctId);
      nominaMes = (nominaLines ?? []).reduce((s: number, l: any) => s + Number(l.cargo ?? 0), 0);
    }

    // 4. Tendencia de 6 meses (usando account_balances, congruente con ER)
    const trend: any[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1);
      const tEj = d.getFullYear();
      const tMes = d.getMonth() + 1;
      const [tSaldos, tSaldosAnt] = await Promise.all([
        getSaldos(supabase, data.organizationId, tEj, tMes),
        tMes > 1 ? getSaldos(supabase, data.organizationId, tEj, tMes - 1) : Promise.resolve(null),
      ]);
      const tER = calcER(tSaldos, tSaldosAnt, naturalezaMap);
      const k = `${tEj}-${String(tMes).padStart(2, "0")}`;
      trend.push({
        mes: k,
        ingresos: tER.ingresos,
        egresos: tER.costos + tER.gastos,
        nomina: 0,
        utilidad: tER.utilidad,
      });
    }

    // Nómina para el trend (una sola consulta batch)
    if (sueldosAcctId && trend.length > 0) {
      const tStart = trend[0].mes + "-01";
      const tEndYear = Number(trend[trend.length - 1].mes.slice(0, 4));
      const tEndMonth = Number(trend[trend.length - 1].mes.slice(5, 7));
      const tEnd = new Date(tEndYear, tEndMonth, 0).toISOString().slice(0, 10);
      const { data: nomHist } = await supabase
        .from("journal_lines")
        .select("cargo, entry:journal_entries!inner(fecha, estatus, organization_id)")
        .eq("entry.organization_id", data.organizationId)
        .neq("entry.estatus", "cancelada")
        .gte("entry.fecha", tStart)
        .lte("entry.fecha", tEnd)
        .eq("account_id", sueldosAcctId);
      const nomByMonth: Record<string, number> = {};
      (nomHist ?? []).forEach((r: any) => {
        const k = r.entry?.fecha?.slice(0, 7);
        if (k) nomByMonth[k] = (nomByMonth[k] ?? 0) + Number(r.cargo ?? 0);
      });
      trend.forEach((t) => {
        t.nomina = nomByMonth[t.mes] ?? 0;
      });
    }

    return {
      empleadosActivos,
      polizasMes,
      polizasPendientes: pendientes,
      ingresos: er.ingresos,
      costos: er.costos,
      gastos: er.gastos,
      egresos: er.costos + er.gastos,
      utilidad: er.utilidad,
      nominaMes,
      periodosActivos,
      trend,
      totalLineas: lineasCount.count ?? 0,
    };
  });
