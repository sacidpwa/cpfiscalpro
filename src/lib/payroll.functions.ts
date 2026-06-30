import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calcPayroll, calcSDI, DAYS_FACTOR, type Periodicity } from "@/lib/payroll.calc";

const orgId = z.object({ organizationId: z.string().uuid() });

export const listEmployees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => orgId.parse(i))
  .handler(async ({ data, context }) => {
    const { data: emps, error } = await context.supabase
      .from("employees")
      .select("*")
      .eq("organization_id", data.organizationId)
      .order("numero");
    if (error) throw new Error(error.message);
    return emps ?? [];
  });

const upsertSchema = z.object({
  organizationId: z.string().uuid(),
  id: z.string().uuid().optional(),
  numero: z.string().min(1).max(20),
  nombre: z.string().min(1),
  apellido_paterno: z.string().optional(),
  apellido_materno: z.string().optional(),
  rfc: z.string().optional(),
  curp: z.string().optional(),
  nss: z.string().optional(),
  fecha_nacimiento: z.string().optional().nullable(),
  fecha_alta: z.string(),
  fecha_baja: z.string().optional().nullable(),
  puesto: z.string().optional(),
  departamento: z.string().optional(),
  empresa: z.string().optional().nullable(),
  salario_diario: z.number().min(0),
  periodicidad: z.enum(["semanal", "catorcenal", "quincenal", "mensual"]),
  forma_pago: z.string().optional(),
  banco: z.string().optional(),
  clabe: z.string().optional(),
  email: z.string().optional().nullable(),
  telefono: z.string().optional().nullable(),
  estatus: z.enum(["activo", "baja", "suspendido"]).default("activo"),
  cp_fiscal: z.string().optional().nullable(),
  regimen_fiscal_receptor: z.string().optional().nullable(),
  tipo_regimen: z.string().optional().nullable(),
  riesgo_puesto: z.number().optional(),
  infonavit_cuota_mensual: z.number().optional(),
});

export const upsertEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => upsertSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { organizationId, id, fecha_alta, salario_diario, ...rest } = data;
    const sdi = calcSDI(salario_diario);
    const row = {
      organization_id: organizationId,
      fecha_alta,
      salario_diario,
      sdi,
      ...rest,
    };
    if (id) {
      const { error } = await context.supabase.from("employees").update(row).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: created, error } = await context.supabase
      .from("employees")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("employees").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ PAYROLL CALC ============

async function loadTables(supabase: any, ejercicio: number) {
  const [isr, sub, uma, smg, smf] = await Promise.all([
    supabase.from("tax_tables").select("*").eq("ejercicio", ejercicio).eq("tipo", "isr_mensual").order("orden"),
    supabase.from("tax_tables").select("*").eq("ejercicio", ejercicio).eq("tipo", "subsidio_mensual").order("orden"),
    supabase.from("fiscal_params").select("*").eq("ejercicio", ejercicio).eq("clave", "uma_diaria").maybeSingle(),
    supabase.from("fiscal_params").select("*").eq("ejercicio", ejercicio).eq("clave", "salario_minimo_general").maybeSingle(),
    supabase.from("fiscal_params").select("*").eq("ejercicio", ejercicio).eq("clave", "salario_minimo_frontera").maybeSingle(),
  ]);
  if (isr.error || sub.error) throw new Error("No se pudieron cargar las tarifas fiscales");
  if (!isr.data?.length) throw new Error(`Sin tarifa ISR para ${ejercicio}`);
  // Usar el SMG más alto vigente para la exención (cubre zona libre frontera norte si aplica).
  const smgVal = Number(smg.data?.valor ?? 0);
  const smfVal = Number(smf.data?.valor ?? 0);
  return {
    isrMensual: isr.data,
    subsidioMensual: sub.data ?? [],
    umaDiaria: Number(uma.data?.valor ?? 113.14),
    salarioMinimo: Math.max(smgVal, smfVal) || undefined,
  };
}




const calcPeriodSchema = z.object({
  organizationId: z.string().uuid(),
  periodicidad: z.enum(["semanal", "catorcenal", "quincenal", "mensual"]),
  fecha_inicio: z.string(),
  fecha_fin: z.string(),
  fecha_pago: z.string(),
  ejercicio: z.number().int().min(2020).max(2100),
  numero: z.number().int().min(1),
});

export const createPayrollPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => calcPeriodSchema.parse(i))
  .handler(async ({ data, context }) => {
    const dias = DAYS_FACTOR[data.periodicidad as Periodicity];
    const { data: period, error } = await context.supabase
      .from("payroll_periods")
      .insert({
        organization_id: data.organizationId,
        ejercicio: data.ejercicio,
        numero: data.numero,
        periodicidad: data.periodicidad,
        fecha_inicio: data.fecha_inicio,
        fecha_fin: data.fecha_fin,
        fecha_pago: data.fecha_pago,
        dias: Math.round(dias),
        estatus: "abierto",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return period;
  });

export const listPayrollPeriods = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => orgId.parse(i))
  .handler(async ({ data, context }) => {
    const { data: ps, error } = await context.supabase
      .from("payroll_periods")
      .select("*")
      .eq("organization_id", data.organizationId)
      .order("ejercicio", { ascending: false })
      .order("numero", { ascending: false });
    if (error) throw new Error(error.message);
    return ps ?? [];
  });

export const updatePayrollPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    periodId: z.string().uuid(),
    ejercicio: z.number().int().min(2020).max(2100),
    numero: z.number().int().min(1),
    periodicidad: z.enum(["semanal", "catorcenal", "quincenal", "mensual"]),
    fecha_inicio: z.string(),
    fecha_fin: z.string(),
    fecha_pago: z.string(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const dias = DAYS_FACTOR[data.periodicidad as Periodicity];
    const { data: p, error } = await context.supabase
      .from("payroll_periods")
      .update({
        ejercicio: data.ejercicio,
        numero: data.numero,
        periodicidad: data.periodicidad,
        fecha_inicio: data.fecha_inicio,
        fecha_fin: data.fecha_fin,
        fecha_pago: data.fecha_pago,
        dias: Math.round(dias),
      })
      .eq("id", data.periodId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return p;
  });

export const deletePayrollPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ periodId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // borrar líneas de recibos, recibos y luego el periodo
    const { data: receipts } = await supabase
      .from("payroll_receipts").select("id").eq("payroll_period_id", data.periodId);
    const ids = (receipts ?? []).map((r: any) => r.id);
    if (ids.length) {
      await supabase.from("payroll_receipt_lines").delete().in("receipt_id", ids);
      await supabase.from("payroll_receipts").delete().in("id", ids);
    }
    const { error } = await supabase.from("payroll_periods").delete().eq("id", data.periodId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


const calcRunSchema = z.object({
  organizationId: z.string().uuid(),
  periodId: z.string().uuid(),
  incluirImss: z.boolean().optional().default(true),
});


export const runPayroll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => calcRunSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: period, error: pe } = await supabase
      .from("payroll_periods").select("*").eq("id", data.periodId).single();
    if (pe || !period) throw new Error(pe?.message ?? "Periodo no encontrado");
    const tables = await loadTables(supabase, period.ejercicio);

    const { data: emps, error: ee } = await supabase
      .from("employees").select("*")
      .eq("organization_id", data.organizationId)
      .eq("estatus", "activo")
      .eq("periodicidad", period.periodicidad);
    if (ee) throw new Error(ee.message);
    if (!emps?.length) throw new Error(`No hay empleados activos con periodicidad "${period.periodicidad}" para este periodo`);

    // Códigos de incidencia que NO se pagan (cuentan como falta para descuento)
    const { data: tipos } = await supabase.from("incident_types").select("codigo,paga");
    const unpaidCodes = new Set((tipos ?? []).filter((t: any) => !t.paga).map((t: any) => t.codigo));

    // Asistencias del periodo para todos los empleados
    const { data: asist } = await supabase
      .from("attendance_entries")
      .select("employee_id, incident_code, extra_codes")
      .eq("organization_id", data.organizationId)
      .gte("fecha", period.fecha_inicio)
      .lte("fecha", period.fecha_fin);

    const faltasPorEmp = new Map<string, number>();
    (asist ?? []).forEach((a: any) => {
      const codes = [a.incident_code, ...(a.extra_codes ?? [])];
      if (codes.some((c: string) => unpaidCodes.has(c))) {
        faltasPorEmp.set(a.employee_id, (faltasPorEmp.get(a.employee_id) ?? 0) + 1);
      }
    });

    // borrar recibos previos del periodo (lines cascadean por FK)
    const { data: prevReceipts } = await supabase
      .from("payroll_receipts").select("id").eq("payroll_period_id", period.id);
    const prevIds = (prevReceipts ?? []).map((r: any) => r.id);
    if (prevIds.length) {
      await supabase.from("payroll_receipt_lines").delete().in("receipt_id", prevIds);
      const { error: delErr } = await supabase
        .from("payroll_receipts").delete().in("id", prevIds);
      if (delErr) throw new Error(`No se pudieron borrar recibos previos: ${delErr.message}`);
    }

    const results: any[] = [];
    // Factor de descuento por falta según periodicidad (Art. 72 LFT):
    // semanal/catorcenal descuentan el día + proporción del 7° (1 + 1/6 = 7/6).
    // quincenal/mensual: 1 día por falta (descansos prorrateados de forma fija).
    const factorFalta: Record<Periodicity, number> = {
      semanal: 7 / 6,
      catorcenal: 7 / 6,
      quincenal: 1,
      mensual: 1,
    };
    const fFalta = factorFalta[period.periodicidad as Periodicity];

    for (const emp of emps ?? []) {
      // Faltas e incidencias no pagadas en el periodo → descuentan días
      const faltas = faltasPorEmp.get(emp.id) ?? 0;
      const diasDescontados = Math.round(faltas * fFalta * 10000) / 10000;
      const diasPagados = Math.max(0, Math.round((period.dias - diasDescontados) * 10000) / 10000);
      const importeFalta = Math.round(Number(emp.salario_diario) * diasDescontados * 100) / 100;

      // INFONAVIT: cuota mensual prorrateada por periodicidad
      const cuotaMensualInf = Number(emp.infonavit_cuota_mensual ?? 0);
      let infonavit = 0;
      if (cuotaMensualInf > 0) {
        const divisor: Record<Periodicity, number> = { semanal: 4, catorcenal: 2, quincenal: 2, mensual: 1 };
        infonavit = Math.round((cuotaMensualInf / divisor[period.periodicidad as Periodicity]) * 100) / 100;
      }

      const extraDed: { importe: number }[] = [];
      if (infonavit > 0) extraDed.push({ importe: infonavit });

      const result = calcPayroll(
        {
          salarioDiario: Number(emp.salario_diario),
          sdi: Number(emp.sdi),
          diasPagados,
          periodicidad: period.periodicidad as Periodicity,
          deduccionesExtra: extraDed.length ? extraDed : undefined,
        },
        tables,
      );

      // Si el usuario eligió NO incluir IMSS obrero, lo removemos del recibo
      const imssObrero = data.incluirImss ? result.imss_obrero : 0;
      const totalDeducciones = data.incluirImss
        ? result.total_deducciones
        : Math.round((result.total_deducciones - result.imss_obrero) * 100) / 100;
      const netoPagar = data.incluirImss
        ? result.neto
        : Math.round((result.neto + result.imss_obrero) * 100) / 100;

      const { data: receipt, error: re } = await supabase
        .from("payroll_receipts")
        .insert({
          organization_id: data.organizationId,
          payroll_period_id: period.id,
          employee_id: emp.id,
          dias_pagados: diasPagados,
          sueldo_diario: emp.salario_diario,
          sdi: emp.sdi,
          total_percepciones: result.total_percepciones,
          total_deducciones: totalDeducciones,
          total_gravado: result.total_gravado,
          total_exento: result.total_exento,
          isr: result.isr,
          subsidio: result.subsidio,
          imss_obrero: imssObrero,
          neto_pagar: netoPagar,
          observaciones: faltas > 0 ? `${faltas} falta(s) · ${diasDescontados} día(s) descontado(s)` : null,
        })
        .select("id")
        .single();
      if (re) throw new Error(re.message);

      const lines: Array<{ concepto_clave: string; descripcion: string; tipo: "percepcion" | "deduccion"; importe_gravado: number; importe_exento: number }> = [
        { concepto_clave: "001", descripcion: `Sueldo (${diasPagados} días)`, tipo: "percepcion", importe_gravado: result.total_gravado, importe_exento: 0 },
        { concepto_clave: "002", descripcion: "ISR", tipo: "deduccion", importe_gravado: result.isr, importe_exento: 0 },
      ];
      if (data.incluirImss && result.imss_obrero > 0) {
        lines.push({ concepto_clave: "001", descripcion: "IMSS Obrero", tipo: "deduccion", importe_gravado: result.imss_obrero, importe_exento: 0 });
      }

      if (faltas > 0) {
        // Línea informativa: el descuento ya está reflejado al pagar menos días (incluye proporción del 7°).
        const desc = `Faltas: ${faltas} día${faltas === 1 ? "" : "s"} · ${diasDescontados} día(s) desc.`;
        lines.push({ concepto_clave: "006", descripcion: desc, tipo: "deduccion", importe_gravado: 0, importe_exento: 0 });
      }
      if (infonavit > 0) {
        // SAT c_TipoDeduccion 010 = Préstamos provenientes del Fondo Nacional para la Vivienda (Crédito INFONAVIT)
        lines.push({ concepto_clave: "010", descripcion: "Crédito INFONAVIT", tipo: "deduccion", importe_gravado: infonavit, importe_exento: 0 });
      }
      await supabase.from("payroll_receipt_lines").insert(
        lines.map((l) => ({ ...l, receipt_id: receipt.id, organization_id: data.organizationId })),
      );
      results.push({ empleado: emp.nombre, neto: netoPagar });
    }

    await supabase.from("payroll_periods").update({ estatus: "calculado" }).eq("id", period.id);
    return { calculados: results.length, totalNeto: results.reduce((s, r) => s + r.neto, 0) };
  });

export const getPeriodReceipts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ periodId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rec, error } = await context.supabase
      .from("payroll_receipts")
      .select("*, employee:employees(numero, nombre, apellido_paterno, apellido_materno, rfc, curp, nss, empresa, departamento, puesto, cp_fiscal, regimen_fiscal_receptor, email)")
      .eq("payroll_period_id", data.periodId)
      .order("created_at");
    if (error) throw new Error(error.message);
    const ids = (rec ?? []).map((r: any) => r.id);
    const infMap = new Map<string, number>();
    if (ids.length) {
      const { data: infLines } = await context.supabase
        .from("payroll_receipt_lines")
        .select("receipt_id, importe_gravado, importe_exento")
        .in("receipt_id", ids)
        .eq("concepto_clave", "010");
      for (const l of infLines ?? []) {
        const cur = infMap.get(l.receipt_id) ?? 0;
        infMap.set(l.receipt_id, cur + Number(l.importe_gravado ?? 0) + Number(l.importe_exento ?? 0));
      }
    }
    return (rec ?? []).map((r: any) => ({ ...r, infonavit: infMap.get(r.id) ?? 0 }));
  });

export const recalculateReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      receiptId: z.string().uuid(),
      incluirImss: z.boolean().optional().default(true),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: receipt, error: re } = await supabase
      .from("payroll_receipts")
      .select("*, employee:employees(*), period:payroll_periods(*)")
      .eq("id", data.receiptId)
      .single();
    if (re || !receipt) throw new Error(re?.message ?? "Recibo no encontrado");
    const period: any = (receipt as any).period;
    const emp: any = (receipt as any).employee;
    if (!period || !emp) throw new Error("Recibo incompleto (sin periodo o empleado)");

    const tables = await loadTables(supabase, period.ejercicio);

    const { data: tipos } = await supabase.from("incident_types").select("codigo,paga");
    const unpaidCodes = new Set((tipos ?? []).filter((t: any) => !t.paga).map((t: any) => t.codigo));

    const { data: asist } = await supabase
      .from("attendance_entries")
      .select("incident_code, extra_codes")
      .eq("organization_id", receipt.organization_id)
      .eq("employee_id", emp.id)
      .gte("fecha", period.fecha_inicio)
      .lte("fecha", period.fecha_fin);
    let faltas = 0;
    (asist ?? []).forEach((a: any) => {
      const codes = [a.incident_code, ...(a.extra_codes ?? [])];
      if (codes.some((c: string) => unpaidCodes.has(c))) faltas++;
    });

    const factorFalta: Record<Periodicity, number> = {
      semanal: 7 / 6, catorcenal: 7 / 6, quincenal: 1, mensual: 1,
    };
    const fFalta = factorFalta[period.periodicidad as Periodicity];
    const diasDescontados = Math.round(faltas * fFalta * 10000) / 10000;
    const diasPagados = Math.max(0, Math.round((period.dias - diasDescontados) * 10000) / 10000);
    const importeFalta = Math.round(Number(emp.salario_diario) * diasDescontados * 100) / 100;

    const cuotaMensualInf = Number(emp.infonavit_cuota_mensual ?? 0);
    let infonavit = 0;
    if (cuotaMensualInf > 0) {
      const divisor: Record<Periodicity, number> = { semanal: 4, catorcenal: 2, quincenal: 2, mensual: 1 };
      infonavit = Math.round((cuotaMensualInf / divisor[period.periodicidad as Periodicity]) * 100) / 100;
    }
    const extraDed = infonavit > 0 ? [{ importe: infonavit }] : undefined;

    const result = calcPayroll(
      {
        salarioDiario: Number(emp.salario_diario),
        sdi: Number(emp.sdi),
        diasPagados,
        periodicidad: period.periodicidad as Periodicity,
        deduccionesExtra: extraDed,
      },
      tables,
    );

    const imssObrero = data.incluirImss ? result.imss_obrero : 0;
    const totalDeducciones = data.incluirImss
      ? result.total_deducciones
      : Math.round((result.total_deducciones - result.imss_obrero) * 100) / 100;
    const netoPagar = data.incluirImss
      ? result.neto
      : Math.round((result.neto + result.imss_obrero) * 100) / 100;

    const { error: delLinesErr } = await supabase
      .from("payroll_receipt_lines").delete().eq("receipt_id", receipt.id);
    if (delLinesErr) throw new Error(delLinesErr.message);

    const { error: upErr } = await supabase.from("payroll_receipts").update({
      dias_pagados: diasPagados,
      sueldo_diario: emp.salario_diario,
      sdi: emp.sdi,
      total_percepciones: result.total_percepciones,
      total_deducciones: totalDeducciones,
      total_gravado: result.total_gravado,
      total_exento: result.total_exento,
      isr: result.isr,
      subsidio: result.subsidio,
      imss_obrero: imssObrero,
      neto_pagar: netoPagar,
      observaciones: faltas > 0 ? `${faltas} falta(s) · ${diasDescontados} día(s) descontado(s)` : null,
    }).eq("id", receipt.id);
    if (upErr) throw new Error(upErr.message);

    const lines: Array<{ concepto_clave: string; descripcion: string; tipo: "percepcion" | "deduccion"; importe_gravado: number; importe_exento: number }> = [
      { concepto_clave: "001", descripcion: `Sueldo (${diasPagados} días)`, tipo: "percepcion", importe_gravado: result.total_gravado, importe_exento: 0 },
      { concepto_clave: "002", descripcion: "ISR", tipo: "deduccion", importe_gravado: result.isr, importe_exento: 0 },
    ];
    if (data.incluirImss && result.imss_obrero > 0) {
      lines.push({ concepto_clave: "001", descripcion: "IMSS Obrero", tipo: "deduccion", importe_gravado: result.imss_obrero, importe_exento: 0 });
    }
    if (faltas > 0) {
      const desc = `Faltas: ${faltas} día${faltas === 1 ? "" : "s"} · ${diasDescontados} día(s) desc.`;
      lines.push({ concepto_clave: "006", descripcion: desc, tipo: "deduccion", importe_gravado: 0, importe_exento: 0 });
    }
    if (infonavit > 0) {
      lines.push({ concepto_clave: "010", descripcion: "Crédito INFONAVIT", tipo: "deduccion", importe_gravado: infonavit, importe_exento: 0 });
    }
    await supabase.from("payroll_receipt_lines").insert(
      lines.map((l) => ({ ...l, receipt_id: receipt.id, organization_id: receipt.organization_id })),
    );

    return { ok: true, neto: netoPagar, faltas, diasPagados };
  });

export const getReceiptDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ receiptId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: receipt, error } = await context.supabase
      .from("payroll_receipts")
      .select("*, employee:employees(numero, nombre, apellido_paterno, apellido_materno, rfc, curp, nss, empresa, departamento, puesto, cp_fiscal, regimen_fiscal_receptor, email, fecha_alta, salario_diario, sdi, periodicidad, banco, clabe), period:payroll_periods(numero, ejercicio, fecha_inicio, fecha_fin, fecha_pago, periodicidad)")
      .eq("id", data.receiptId)
      .single();
    if (error) throw new Error(error.message);
    const { data: lines, error: lerr } = await context.supabase
      .from("payroll_receipt_lines")
      .select("*")
      .eq("receipt_id", data.receiptId)
      .order("tipo")
      .order("concepto_clave");
    if (lerr) throw new Error(lerr.message);
    return { receipt, lines: lines ?? [] };
  });

