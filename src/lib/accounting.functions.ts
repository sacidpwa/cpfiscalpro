import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";

const orgId = z.object({ organizationId: z.string().uuid() });

export const listAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => orgId.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("accounts")
      .select("*")
      .eq("organization_id", data.organizationId)
      .order("codigo");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        id: z.string().uuid().optional(),
        codigo: z.string().min(1),
        nombre: z.string().min(1),
        codigo_agrupador: z.string().optional(),
        naturaleza: z.enum(["deudora", "acreedora"]),
        nivel: z.number().int().min(1).max(6).default(2),
        acumulativa: z.boolean().default(false),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { organizationId, id, ...rest } = data;
    if (id) {
      const { error } = await context.supabase.from("accounts").update(rest).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: created, error } = await context.supabase
      .from("accounts")
      .insert({ ...rest, organization_id: organizationId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

// ============ JOURNAL ENTRIES ============
export const listJournalEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        desde: z.string().optional(),
        hasta: z.string().optional(),
        q: z.string().optional(),
        tipo: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("journal_entries")
      .select("*")
      .eq("organization_id", data.organizationId)
      .order("fecha", { ascending: false })
      .order("numero", { ascending: false });
    if (data.desde) q = q.gte("fecha", data.desde);
    if (data.hasta) q = q.lte("fecha", data.hasta);
    if (data.tipo) q = q.eq("tipo", data.tipo as any);
    if (data.q) q = q.or(`concepto.ilike.%${data.q}%,referencia.ilike.%${data.q}%`);
    const { data: rows, error } = await q.limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const lineSchema = z.object({
  account_id: z.string().uuid(),
  concepto: z.string().optional(),
  cargo: z.number().min(0),
  abono: z.number().min(0),
});

const entrySchema = z.object({
  organizationId: z.string().uuid(),
  id: z.string().uuid().optional(),
  tipo: z.enum(["ingreso", "egreso", "diario", "cheque", "transferencia"]),
  fecha: z.string(),
  concepto: z.string().min(1),
  referencia: z.string().optional(),
  lines: z.array(lineSchema).min(2),
});

export const upsertJournalEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => entrySchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const total_cargo = data.lines.reduce((s, l) => s + l.cargo, 0);
    const total_abono = data.lines.reduce((s, l) => s + l.abono, 0);
    if (Math.abs(total_cargo - total_abono) > 0.005) {
      throw new Error(
        `La póliza no cuadra. Cargo ${total_cargo.toFixed(2)} ≠ Abono ${total_abono.toFixed(2)}`,
      );
    }

    let entryId = data.id;
    if (entryId) {
      const { error } = await supabase
        .from("journal_entries")
        .update({
          tipo: data.tipo,
          fecha: data.fecha,
          concepto: data.concepto,
          referencia: data.referencia,
          total_cargo,
          total_abono,
        })
        .eq("id", entryId);
      if (error) throw new Error(error.message);
      await supabase.from("journal_lines").delete().eq("entry_id", entryId);
    } else {
      // next numero for tipo/year
      const year = new Date(data.fecha).getFullYear();
      const { data: max } = await supabase
        .from("journal_entries")
        .select("numero")
        .eq("organization_id", data.organizationId)
        .eq("tipo", data.tipo)
        .gte("fecha", `${year}-01-01`)
        .lte("fecha", `${year}-12-31`)
        .order("numero", { ascending: false })
        .limit(1)
        .maybeSingle();
      const numero = (max?.numero ?? 0) + 1;
      const { data: created, error } = await supabase
        .from("journal_entries")
        .insert({
          organization_id: data.organizationId,
          tipo: data.tipo,
          numero,
          fecha: data.fecha,
          concepto: data.concepto,
          referencia: data.referencia,
          total_cargo,
          total_abono,
          estatus: "confirmada",
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      entryId = created.id;
    }

    const { error: lerr } = await supabase.from("journal_lines").insert(
      data.lines.map((l, idx) => ({
        entry_id: entryId,
        organization_id: data.organizationId,
        account_id: l.account_id,
        concepto: l.concepto ?? null,
        cargo: l.cargo,
        abono: l.abono,
        orden: idx,
      })),
    );
    if (lerr) throw new Error(lerr.message);
    return { id: entryId, total_cargo, total_abono };
  });

export const getJournalEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: entry, error } = await context.supabase
      .from("journal_entries")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const { data: lines } = await context.supabase
      .from("journal_lines")
      .select("*")
      .eq("entry_id", data.id)
      .order("orden");
    return { ...entry, lines: lines ?? [] };
  });

export const cancelJournalEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("journal_entries")
      .update({ estatus: "cancelada" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getBalanza = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ organizationId: z.string().uuid(), desde: z.string(), hasta: z.string() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: accts } = await supabase
      .from("accounts")
      .select("id, codigo, nombre, naturaleza")
      .eq("organization_id", data.organizationId)
      .order("codigo");

    const { data: lines, error } = await supabase
      .from("journal_lines")
      .select(
        "account_id, cargo, abono, entry:journal_entries!inner(fecha, estatus, organization_id)",
      )
      .eq("entry.organization_id", data.organizationId)
      .gte("entry.fecha", data.desde)
      .lte("entry.fecha", data.hasta)
      .neq("entry.estatus", "cancelada");
    if (error) throw new Error(error.message);

    const map: Record<string, { cargo: number; abono: number }> = {};
    (lines ?? []).forEach((l: any) => {
      const k = l.account_id;
      if (!map[k]) map[k] = { cargo: 0, abono: 0 };
      map[k].cargo += Number(l.cargo);
      map[k].abono += Number(l.abono);
    });

    return (accts ?? [])
      .map((a) => {
        const v = map[a.id] ?? { cargo: 0, abono: 0 };
        const saldo = a.naturaleza === "deudora" ? v.cargo - v.abono : v.abono - v.cargo;
        return { ...a, cargo: v.cargo, abono: v.abono, saldo };
      })
      .filter((r) => r.cargo > 0 || r.abono > 0);
  });

// ============ GET SALDOS ACUMULADOS (helper) ============
async function getSaldosToMonth(supabase: any, orgId: string, ejercicio: number, mes: number) {
  // Periodo 13 (cierre de ejercicio): si no hay saldos de periodo 13, usar periodo 12
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

  const { data: accts } = await supabase
    .from("accounts")
    .select("id, codigo, nombre, naturaleza, nivel, acumulativa, codigo_agrupador")
    .eq("organization_id", orgId)
    .eq("activa", true)
    .order("codigo");

  const { data: bals } = await supabase
    .from("account_balances")
    .select("account_codigo, saldo_final")
    .eq("organization_id", orgId)
    .eq("ejercicio", ejercicio)
    .eq("periodo", queryPer);

  const balMap: Record<string, number> = {};
  for (const b of bals ?? []) {
    balMap[b.account_codigo] = Number(b.saldo_final);
  }

  return (accts ?? []).map((a: any) => {
    const saldo = balMap[a.codigo] ?? 0;
    return { ...a, debe: 0, haber: 0, saldo };
  });
}

// ============ ESTADO DE RESULTADOS ============
export const getEstadoResultados = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        ejercicio: z.number(),
        desdeMes: z.number(),
        hastaMes: z.number(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const saldosHasta = await getSaldosToMonth(
      context.supabase,
      data.organizationId,
      data.ejercicio,
      data.hastaMes,
    );
    const saldosAnt =
      data.desdeMes > 1
        ? await getSaldosToMonth(
            context.supabase,
            data.organizationId,
            data.ejercicio,
            data.desdeMes - 1,
          )
        : null;
    const antMap: Record<string, number> = {};
    if (saldosAnt) {
      for (const s of saldosAnt) {
        antMap[s.codigo] = s.naturaleza === "deudora" ? -s.saldo : s.saldo;
      }
    }

    function signed(s: any) {
      return s.naturaleza === "deudora" ? -s.saldo : s.saldo;
    }

    // Gastos de operación sub-groups (6xxx)
    const gastosOpDef: Record<string, { label: string; prefix: string }> = {
      venta: { label: "Gastos de Operación", prefix: "61" },
      admin: { label: "Gastos de Administración", prefix: "62" },
      depreciacion: { label: "Depreciación de Planta y Equipo", prefix: "63" },
      amortizacion: { label: "Amortización de Gastos Diferidos", prefix: "64" },
      otros: { label: "Otros Gastos", prefix: "" },
    };
    function getGastoGroup(codigo: string) {
      const d2 = codigo.replace(/^0+/, "").substring(0, 2);
      for (const [k, v] of Object.entries(gastosOpDef)) {
        if (d2 === v.prefix) return k;
      }
      return "otros";
    }

    // Otros ingresos/gastos sub-groups (7xxx)
    const otrosDef: Record<string, { label: string; prefix: string }> = {
      productosFinancieros: { label: "Productos Financieros", prefix: "71" },
      gastosFinancieros: { label: "Gastos Financieros", prefix: "72" },
      otrosProductos: { label: "Otros Productos", prefix: "73" },
      otrosGastos: { label: "Otros Gastos", prefix: "74" },
    };
    function getOtrosGroup(codigo: string) {
      const d2 = codigo.replace(/^0+/, "").substring(0, 2);
      for (const [k, v] of Object.entries(otrosDef)) {
        if (d2 === v.prefix) return k;
      }
      return null;
    }

    // Pre-populate groups from ALL 6xxx/7xxx leaf accounts
    const allAccts = saldosHasta;
    const gastosOp: Record<string, any[]> = {
      venta: [],
      admin: [],
      depreciacion: [],
      amortizacion: [],
      otros: [],
    };
    const otrosGrupos: Record<string, any[]> = {
      productosFinancieros: [],
      gastosFinancieros: [],
      otrosProductos: [],
      otrosGastos: [],
    };
    for (const a of allAccts) {
      const d = a.codigo.replace(/^0+/, "")[0];
      if (d === "6") {
        const grp = getGastoGroup(a.codigo);
        if (gastosOp[grp])
          gastosOp[grp].push({
            codigo: a.codigo,
            nombre: a.nombre,
            perVal: 0,
            ytdVal: 0,
            perPct: 0,
            ytdPct: 0,
          });
      }
      if (d === "7") {
        const grp = getOtrosGroup(a.codigo);
        if (grp && otrosGrupos[grp])
          otrosGrupos[grp].push({
            codigo: a.codigo,
            nombre: a.nombre,
            perVal: 0,
            ytdVal: 0,
            perPct: 0,
            ytdPct: 0,
          });
      }
    }

    const cats: Record<string, any[]> = { "4": [], "5": [] };
    let ventasPer = 0,
      ventasYTD = 0;

    for (const s of saldosHasta) {
      if (s.acumulativa) continue;
      const d = s.codigo.replace(/^0+/, "")[0];
      if (d !== "4" && d !== "5" && d !== "6" && d !== "7") continue;
      const ytd = signed(s);
      const per = ytd - (antMap[s.codigo] || 0);
      if (Math.abs(ytd) < 0.01 && Math.abs(per) < 0.01 && d !== "6") continue;

      if (d === "7") {
        const grp = getOtrosGroup(s.codigo);
        if (grp && otrosGrupos[grp]) {
          const ytdVal = s.naturaleza === "deudora" ? Math.abs(ytd) : ytd;
          const perVal = s.naturaleza === "deudora" ? Math.abs(per) : per;
          const existing = otrosGrupos[grp].find((x: any) => x.codigo === s.codigo);
          if (existing) {
            existing.perVal = perVal;
            existing.ytdVal = ytdVal;
          }
        }
        continue;
      }

      let key = d;
      const ytdVal = d === "5" || d === "6" ? Math.abs(ytd) : ytd;
      const perVal = d === "5" || d === "6" ? Math.abs(per) : per;

      if (d === "6") {
        const grp = getGastoGroup(s.codigo);
        if (gastosOp[grp]) {
          const existing = gastosOp[grp].find((x: any) => x.codigo === s.codigo);
          if (existing) {
            existing.perVal = perVal;
            existing.ytdVal = ytdVal;
          }
        }
      } else if (cats[key]) {
        cats[key].push({
          codigo: s.codigo,
          nombre: s.nombre,
          perVal,
          ytdVal,
          perPct: 0,
          ytdPct: 0,
        });
      }
      if (key === "4") {
        ventasPer += perVal;
        ventasYTD += ytdVal;
      }
    }

    function pct(v: number, base: number) {
      return base !== 0 ? (v / base) * 100 : 0;
    }
    function addPct(arr: any[]) {
      arr.forEach((c) => {
        c.perPct = pct(c.perVal, ventasPer);
        c.ytdPct = pct(c.ytdVal, ventasYTD);
      });
    }
    function sum(arr: any[], f: string) {
      return arr.reduce((a: number, c: any) => a + c[f], 0);
    }

    addPct(cats["4"]);
    addPct(cats["5"]);

    // Flatten gastosOp for percentage + totals
    const gastosFlat: any[] = [];
    const gastosOpTotals: Record<string, { perVal: number; ytdVal: number }> = {};
    for (const [k, items] of Object.entries(gastosOp)) {
      addPct(items);
      gastosFlat.push(...items);
      gastosOpTotals[k] = {
        perVal: Math.abs(sum(items, "perVal")),
        ytdVal: Math.abs(sum(items, "ytdVal")),
      };
    }

    const otrosGrupoTotals: Record<string, { perVal: number; ytdVal: number }> = {};
    for (const [k, items] of Object.entries(otrosGrupos)) {
      addPct(items);
      otrosGrupoTotals[k] = { perVal: sum(items, "perVal"), ytdVal: sum(items, "ytdVal") };
    }

    const tIngPer = sum(cats["4"], "perVal");
    const tIngYTD = sum(cats["4"], "ytdVal");
    const tCosPer = Math.abs(sum(cats["5"], "perVal"));
    const tCosYTD = Math.abs(sum(cats["5"], "ytdVal"));
    const tGasPer = Math.abs(sum(gastosFlat, "perVal"));
    const tGasYTD = Math.abs(sum(gastosFlat, "ytdVal"));
    const tOIPer =
      sum(otrosGrupos.productosFinancieros, "perVal") + sum(otrosGrupos.otrosProductos, "perVal");
    const tOIYTD =
      sum(otrosGrupos.productosFinancieros, "ytdVal") + sum(otrosGrupos.otrosProductos, "ytdVal");
    const tOGPer =
      Math.abs(sum(otrosGrupos.gastosFinancieros, "perVal")) +
      Math.abs(sum(otrosGrupos.otrosGastos, "perVal"));
    const tOGYTD =
      Math.abs(sum(otrosGrupos.gastosFinancieros, "ytdVal")) +
      Math.abs(sum(otrosGrupos.otrosGastos, "ytdVal"));

    const uBrutaPer = tIngPer - tCosPer;
    const uBrutaYTD = tIngYTD - tCosYTD;
    const uOperPer = uBrutaPer - tGasPer;
    const uOperYTD = uBrutaYTD - tGasYTD;
    const uNetaPer = uOperPer + tOIPer - tOGPer;
    const uNetaYTD = uOperYTD + tOIYTD - tOGYTD;

    return {
      ingresos: cats["4"],
      costos: cats["5"],
      gastosOp,
      gastosOpTotals,
      gastosOpDef,
      otrosGrupos,
      otrosGrupoTotals,
      otrosDef,
      ventasPer,
      ventasYTD,
      totalIngresosPer: tIngPer,
      totalIngresosYTD: tIngYTD,
      totalCostosPer: tCosPer,
      totalCostosYTD: tCosYTD,
      totalGastosPer: tGasPer,
      totalGastosYTD: tGasYTD,
      totalOtrosIngresosPer: tOIPer,
      totalOtrosIngresosYTD: tOIYTD,
      totalOtrosGastosPer: tOGPer,
      totalOtrosGastosYTD: tOGYTD,
      utilidadBrutaPer: uBrutaPer,
      utilidadBrutaYTD: uBrutaYTD,
      utilidadOperacionPer: uOperPer,
      utilidadOperacionYTD: uOperYTD,
      utilidadNetaPer: uNetaPer,
      utilidadNetaYTD: uNetaYTD,
    };
  });

// ============ SPLIT NÓMINA POR EMPRESA (HELIX / HELIX-LAROSS) ============
export const getHelixLarossSplit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        ejercicio: z.number(),
        desdeMes: z.number(),
        hastaMes: z.number(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    // Employee count by empresa
    const { data: empCount } = await admin
      .from("employees")
      .select("empresa")
      .eq("organization_id", data.organizationId)
      .eq("estatus", "activo");
    let hCount = 0,
      lCount = 0;
    for (const e of empCount ?? []) {
      const emp = (e.empresa || "HELIX-LAROSS").trim() || "HELIX-LAROSS";
      if (emp === "HELIX") hCount++;
      else lCount++;
    }
    const totalEmp = hCount + lCount || 1;
    const hRatio = hCount / totalEmp;
    const lRatio = lCount / totalEmp;

    // Account balances for honorarios and ISN
    const honorariosAccts = [
      "610003000000000000002",
      "610003100000000000002",
      "620002900000000000002",
      "620003000000000000002",
    ];
    const isnAccts = ["610002000000000000002"];
    async function getBalSum(accts: string[], mes: number) {
      const { data: bals } = await admin
        .from("account_balances")
        .select("account_codigo, saldo_final")
        .eq("organization_id", data.organizationId)
        .eq("ejercicio", data.ejercicio)
        .eq("periodo", mes)
        .in("account_codigo", accts);
      return (bals ?? []).reduce((s: number, b: any) => s + Number(b.saldo_final ?? 0), 0);
    }
    const honorariosHasta = await getBalSum(honorariosAccts, data.hastaMes);
    const honorariosDesde =
      data.desdeMes > 1 ? await getBalSum(honorariosAccts, data.desdeMes - 1) : 0;
    const honorariosPer = honorariosHasta - honorariosDesde;
    const isnHasta = await getBalSum(isnAccts, data.hastaMes);
    const isnDesde = data.desdeMes > 1 ? await getBalSum(isnAccts, data.desdeMes - 1) : 0;
    const isnPer = isnHasta - isnDesde;

    // Payroll split by empresa
    const desde = `${data.ejercicio}-${String(data.desdeMes).padStart(2, "0")}-01`;
    const hasta = new Date(data.ejercicio, data.hastaMes, 0).toISOString().slice(0, 10);
    const { data: periods } = await admin
      .from("payroll_periods")
      .select("id")
      .eq("organization_id", data.organizationId)
      .eq("ejercicio", data.ejercicio)
      .gte("fecha_pago", desde)
      .lte("fecha_pago", hasta);
    const periodIds = (periods ?? []).map((p: any) => p.id);
    const payrollSplit: Record<string, { nomina: number; isr: number; imss: number }> = {};
    if (periodIds.length) {
      const { data: rows } = await admin
        .from("payroll_receipts")
        .select("total_percepciones, isr, imss_obrero, employee:employees(empresa)")
        .in("payroll_period_id", periodIds);
      for (const r of rows ?? []) {
        const emp = (r.employee?.empresa || "HELIX-LAROSS").trim() || "HELIX-LAROSS";
        if (!payrollSplit[emp]) payrollSplit[emp] = { nomina: 0, isr: 0, imss: 0 };
        payrollSplit[emp].nomina += Number(r.total_percepciones ?? 0);
        payrollSplit[emp].isr += Number(r.isr ?? 0);
        payrollSplit[emp].imss += Number(r.imss_obrero ?? 0);
      }
    }

    function orZero(o: any) {
      return o ?? { nomina: 0, isr: 0, imss: 0 };
    }
    const hPay = orZero(payrollSplit["HELIX"]);
    const lPay = orZero(payrollSplit["HELIX-LAROSS"]);

    return {
      helix: {
        nomina: hPay.nomina,
        isr: hPay.isr,
        imss: hPay.imss,
        isn: isnPer * hRatio,
        honorarios: honorariosPer * hRatio,
      },
      laross: {
        nomina: lPay.nomina,
        isr: lPay.isr,
        imss: lPay.imss,
        isn: isnPer * lRatio,
        honorarios: honorariosPer * lRatio,
      },
      ratios: { helix: hCount, laross: lCount },
    };
  });

// ============ BALANCE GENERAL ============
export const getBalanceGeneral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ organizationId: z.string().uuid(), ejercicio: z.number(), mes: z.number() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const saldos = await getSaldosToMonth(
      context.supabase,
      data.organizationId,
      data.ejercicio,
      data.mes,
    );

    const activoCirculante: any[] = [];
    const activoNoCirculante: any[] = [];
    const pasivoCirculante: any[] = [];
    const pasivoNoCirculante: any[] = [];
    const capital: any[] = [];

    let totalActivo = 0,
      totalPasivo = 0,
      totalCapital = 0;

    for (const s of saldos) {
      if (s.acumulativa) continue;
      const d = s.codigo.replace(/^0+/, "")[0];
      let signedSaldo: number;
      if (d === "1") signedSaldo = s.naturaleza === "deudora" ? s.saldo : -s.saldo;
      else signedSaldo = s.naturaleza === "deudora" ? -s.saldo : s.saldo;

      if (Math.abs(signedSaldo) < 0.01) continue;

      const item = { codigo: s.codigo, nombre: s.nombre, saldo: signedSaldo };
      const p2 = s.codigo.replace(/^0+/, "").substring(0, 2);

      if (d === "1") {
        if (["11", "12", "13", "14"].includes(p2)) activoCirculante.push(item);
        else activoNoCirculante.push(item);
        totalActivo += signedSaldo;
      } else if (d === "2") {
        if (["21", "21"].includes(p2)) pasivoCirculante.push(item);
        else pasivoNoCirculante.push(item);
        totalPasivo += signedSaldo;
      } else if (d === "3") {
        capital.push(item);
        totalCapital += signedSaldo;
      }
    }

    let utilidadNeta = 0;
    for (const s of saldos) {
      if (s.acumulativa) continue;
      const d = s.codigo.replace(/^0+/, "")[0];
      if (d !== "4" && d !== "5" && d !== "6" && d !== "7") continue;
      if (d === "4") utilidadNeta += s.naturaleza === "deudora" ? -s.saldo : s.saldo;
      else if (d === "5") utilidadNeta -= s.naturaleza === "deudora" ? -s.saldo : s.saldo;
      else if (d === "6") utilidadNeta -= s.naturaleza === "deudora" ? -s.saldo : s.saldo;
      else if (d === "7") utilidadNeta += s.naturaleza === "deudora" ? -s.saldo : s.saldo;
    }
    if (Math.abs(utilidadNeta) > 0.01) {
      capital.push({ codigo: "", nombre: "Utilidad del Ejercicio", saldo: utilidadNeta });
      totalCapital += utilidadNeta;
    }

    return {
      activoCirculante,
      activoNoCirculante,
      pasivoCirculante,
      pasivoNoCirculante,
      capital,
      totalActivo,
      totalPasivo,
      totalCapital,
      totalPasivoCapital: totalPasivo + totalCapital,
    };
  });

// ============ IMPORT LEGACY (Aspel COI / similar) ============
const legacyPayloadSchema = z.object({
  organizationId: z.string().uuid(),
  payload: z.string().min(2),
});

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export const importLegacyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => legacyPayloadSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;
    const orgId = data.organizationId;

    let parsed: any;
    try {
      parsed = JSON.parse(data.payload);
    } catch (e: any) {
      throw new Error(`JSON inválido: ${e.message}`);
    }

    const cuentas: any[] = Array.isArray(parsed.cuentas) ? parsed.cuentas : [];
    const polizas: any[] = Array.isArray(parsed.polizas) ? parsed.polizas : [];
    const detalles: any[] = Array.isArray(parsed.detalles) ? parsed.detalles : [];
    const saldos: any[] = Array.isArray(parsed.saldos) ? parsed.saldos : [];

    let cuentasInsertadas = 0;
    let polizasInsertadas = 0;
    let detallesInsertados = 0;
    let saldosInsertados = 0;

    // ---------- CUENTAS ----------
    const accountIdByLegacy = new Map<string, string>(); // legacy id -> uuid
    const accountIdByCodigo = new Map<string, string>(); // codigo -> uuid

    if (cuentas.length) {
      const rows = cuentas.map((c) => ({
        organization_id: orgId,
        codigo: String(c.codigo),
        nombre: String(c.nombre ?? c.codigo),
        codigo_agrupador: c.tipo_sat ? String(c.tipo_sat) : null,
        naturaleza: (String(c.naturaleza).toUpperCase() === "A" ? "acreedora" : "deudora") as
          | "acreedora"
          | "deudora",
        nivel: Number(c.nivel ?? 1),
        acumulativa: Number(c.acepta_movimientos ?? 1) === 0,
        activa: c.activo === undefined ? true : !!Number(c.activo),
      }));

      for (const batch of chunk(rows, 100)) {
        const { data: ins, error } = await supabaseAdmin
          .from("accounts")
          .upsert(batch, { onConflict: "organization_id,codigo" })
          .select("id, codigo");
        if (error) throw new Error(`accounts: ${error.message}`);
        (ins ?? []).forEach((r: any) => accountIdByCodigo.set(r.codigo, r.id));
        cuentasInsertadas += ins?.length ?? 0;
      }
      // Map legacy id -> uuid
      cuentas.forEach((c) => {
        const uuid = accountIdByCodigo.get(String(c.codigo));
        if (uuid && c.id !== undefined && c.id !== null) {
          accountIdByLegacy.set(String(c.id), uuid);
        }
      });
    }

    // ---------- POLIZAS ----------
    const entryIdByLegacy = new Map<string, string>();
    const tipoMap: Record<string, string> = {
      I: "ingreso",
      E: "egreso",
      D: "diario",
      Ig: "ingreso",
      Eg: "egreso",
      Dr: "diario",
      Ch: "cheque",
      Tr: "transferencia",
      O: "diario",
    };

    if (polizas.length) {
      const rows = polizas.map((p) => ({
        legacy_id: p.id !== undefined ? String(p.id) : `${p.tipo}-${p.numero}-${p.fecha}`,
        row: {
          organization_id: orgId,
          tipo: (tipoMap[String(p.tipo).toUpperCase()] ?? "diario") as
            | "ingreso"
            | "egreso"
            | "diario"
            | "cheque"
            | "transferencia",
          numero: Number(p.numero ?? 0),
          fecha: String(p.fecha),
          concepto: String(p.concepto ?? ""),
          estatus: "confirmada" as const,
          total_cargo: 0,
          total_abono: 0,
          referencia: p.mes != null && p.ejercicio != null ? `${p.ejercicio}-${p.mes}` : null,
          created_by: userId,
        },
      }));

      for (const batch of chunk(rows, 100)) {
        const { data: ins, error } = await supabaseAdmin
          .from("journal_entries")
          .insert(batch.map((b) => b.row))
          .select("id");
        if (error) throw new Error(`journal_entries: ${error.message}`);
        (ins ?? []).forEach((r: any, idx: number) => {
          entryIdByLegacy.set(batch[idx].legacy_id, r.id);
        });
        polizasInsertadas += ins?.length ?? 0;
      }
    }

    // ---------- DETALLES ----------
    if (detalles.length) {
      const totalsByEntry: Record<string, { c: number; a: number }> = {};
      const ordenByEntry: Record<string, number> = {};
      const rows: any[] = [];

      for (const d of detalles) {
        const legacyP = String(d.poliza_id);
        const entryId = entryIdByLegacy.get(legacyP);
        if (!entryId) continue;

        const legacyA = String(d.cuenta_id);
        let acctId = accountIdByLegacy.get(legacyA) ?? accountIdByCodigo.get(legacyA);
        if (!acctId) continue;

        const cargo = Number(d.debe ?? 0);
        const abono = Number(d.haber ?? 0);
        const orden = ordenByEntry[entryId] ?? 0;
        ordenByEntry[entryId] = orden + 1;

        if (!totalsByEntry[entryId]) totalsByEntry[entryId] = { c: 0, a: 0 };
        totalsByEntry[entryId].c += cargo;
        totalsByEntry[entryId].a += abono;

        rows.push({
          entry_id: entryId,
          organization_id: orgId,
          account_id: acctId,
          concepto: d.concepto ? String(d.concepto) : null,
          cargo,
          abono,
          orden,
        });
      }

      for (const batch of chunk(rows, 100)) {
        const { error } = await supabaseAdmin.from("journal_lines").insert(batch);
        if (error) throw new Error(`journal_lines: ${error.message}`);
        detallesInsertados += batch.length;
      }

      // Update totals
      const totalEntries = Object.entries(totalsByEntry);
      for (const [entryId, t] of totalEntries) {
        await supabaseAdmin
          .from("journal_entries")
          .update({ total_cargo: t.c, total_abono: t.a })
          .eq("id", entryId);
      }
    }

    // ---------- SALDOS ----------
    if (saldos.length) {
      const rows: any[] = [];
      for (const s of saldos) {
        const key = String(s.clave ?? "");
        const parts = key.split("_");
        if (parts.length < 4 || parts[0] !== "saldo") continue;
        const ejercicio = Number(parts[1]);
        const periodo = Number(parts[2]);
        const codigo = parts.slice(3).join("_");
        if (!ejercicio || !periodo || !codigo) continue;
        const saldoFinal = Number(s.valor ?? 0);
        if (!Number.isFinite(saldoFinal)) continue;
        rows.push({
          organization_id: orgId,
          account_codigo: codigo,
          ejercicio,
          periodo,
          saldo_inicial: 0,
          cargos: 0,
          abonos: 0,
          saldo_final: saldoFinal,
        });
      }

      for (const batch of chunk(rows, 100)) {
        const { error } = await supabaseAdmin
          .from("account_balances")
          .upsert(batch, { onConflict: "organization_id,account_codigo,ejercicio,periodo" });
        if (error) throw new Error(`account_balances: ${error.message}`);
        saldosInsertados += batch.length;
      }
    }

    return {
      ok: true,
      cuentas: cuentasInsertadas,
      polizas: polizasInsertadas,
      detalles: detallesInsertados,
      saldos: saldosInsertados,
    };
  });

// ============ EXPORT ALL DATA ============
const TABLES_WITH_ORG = [
  "accounts",
  "journal_entries",
  "journal_lines",
  "account_balances",
  "employees",
  "payroll_receipts",
  "payroll_receipt_lines",
  "payroll_concepts",
  "payroll_periods",
  "payroll_email_logs",
  "attendance_entries",
  "customers",
  "products",
  "customer_items",
  "cost_centers",
  "fiscal_years",
  "currencies",
  "aspel_raw_imports",
  "aspel_raw_rows",
  "sat_account_map",
  "journal_types_catalog",
  "fiscal_params",
] as const;

const TABLES_GLOBAL = [
  "organizations",
  "profiles",
  "organization_members",
  "org_modules",
  "org_billing_config",
  "subscription_plans",
  "subscription_invoices",
  "platform_admins",
  "incident_types",
  "cfdi_stamps",
  "tax_tables",
  "vehicles",
  "operators",
  "tax_filings",
  "imss_patrones",
  "imss_pagos",
  "imss_movimientos",
  "imss_mensuales",
  "imss_mensual_detalle",
  "imss_bimestres",
  "imss_bimestre_detalle",
  "imss_primas_rt",
  "stamp_usage_log",
  "import_jobs",
  "organization_requests",
] as const;

async function fetchTable(supabase: SupabaseClient, table: string, orgId?: string) {
  if (orgId && TABLES_WITH_ORG.includes(table as any)) {
    const { data } = await supabase.from(table).select("*").eq("organization_id", orgId);
    return data ?? [];
  }
  if (!TABLES_GLOBAL.includes(table as any)) return [];
  const { data } = await supabase.from(table).select("*");
  return data ?? [];
}

export const exportAllData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const orgId = data.organizationId;

    const result: Record<string, any[]> = {};
    const allTables = [...new Set([...TABLES_WITH_ORG, ...TABLES_GLOBAL])];

    for (const table of allTables) {
      const rows = await fetchTable(supabaseAdmin, table, orgId);
      if (rows.length) result[table] = rows;
    }

    return {
      exported_at: new Date().toISOString(),
      organization_id: orgId,
      tables: result,
      counts: Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v.length])),
    };
  });
