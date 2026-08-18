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
  empresa: z.string().min(1, "Empresa es requerida"),
  salario_diario: z.number().min(0),
  periodicidad: z.enum(["semanal", "catorcenal", "quincenal", "mensual"]),
  forma_pago: z.string().optional(),
  banco: z.string().optional(),
  clabe: z.string().optional(),
  email: z.string().optional().nullable(),
  telefono: z.string().optional().nullable(),
  estatus: z.enum(["activo", "baja", "suspendido", "renuncia"]).default("activo"),
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
  const smgVal = Number(smg.data?.valor ?? 0);
  return {
    isrMensual: isr.data,
    subsidioMensual: sub.data ?? [],
    umaDiaria: Number(uma.data?.valor ?? 113.14),
    salarioMinimo: smgVal || undefined,
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

    // Códigos de incidencia según su efecto en el cálculo
    const { data: tipos } = await supabase.from("incident_types").select("codigo,paga,cuenta_falta");
    // Faltas que descuentan día + proporción del 7° día (cuenta_falta=true, paga=false)
    const faltaCodes = new Set((tipos ?? []).filter((t: any) => !t.paga && t.cuenta_falta).map((t: any) => t.codigo));
    // Incidencias no pagadas que NO afectan el 7° día (paga=false, cuenta_falta=false): incapacidad, PS
    const otherUnpaidCodes = new Set((tipos ?? []).filter((t: any) => !t.paga && !t.cuenta_falta).map((t: any) => t.codigo));

    // Asistencias del periodo para todos los empleados
    const { data: asist } = await supabase
      .from("attendance_entries")
      .select("employee_id, incident_code, extra_codes")
      .eq("organization_id", data.organizationId)
      .gte("fecha", period.fecha_inicio)
      .lte("fecha", period.fecha_fin);

    const faltasPorEmp = new Map<string, number>();
    const otrosDiasPorEmp = new Map<string, number>();
    (asist ?? []).forEach((a: any) => {
      const codes = [a.incident_code, ...(a.extra_codes ?? [])];
      if (codes.some((c: string) => faltaCodes.has(c))) {
        faltasPorEmp.set(a.employee_id, (faltasPorEmp.get(a.employee_id) ?? 0) + 1);
      }
      if (codes.some((c: string) => otherUnpaidCodes.has(c))) {
        otrosDiasPorEmp.set(a.employee_id, (otrosDiasPorEmp.get(a.employee_id) ?? 0) + 1);
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

    let skipped = 0;
    for (const emp of emps ?? []) {
      // Siempre se asiste por defecto; solo se descuenta si hay falta o modificador explícito
      const faltas = faltasPorEmp.get(emp.id) ?? 0;
      const otrosDias = otrosDiasPorEmp.get(emp.id) ?? 0;
      const diasDescontados = Math.round((faltas * fFalta + otrosDias) * 10000) / 10000;
      const diasPagados = Math.max(0, Math.round((period.dias - diasDescontados) * 10000) / 10000);
      if (diasPagados <= 0) { skipped++; continue; }
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
      if (importeFalta > 0) extraDed.push({ importe: importeFalta });

      const result = calcPayroll(
        {
          salarioDiario: Number(emp.salario_diario),
          sdi: Number(emp.sdi),
          diasPagados: period.dias,
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
          dias_pagados: period.dias,
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
          observaciones: faltas > 0 || otrosDias > 0
            ? [faltas > 0 && `${faltas} falta(s)`, otrosDias > 0 && `${otrosDias} día(s) sin goce`].filter(Boolean).join(" · ") + ` · ${diasDescontados} día(s) descontado(s)`
            : null,
        })
        .select("id")
        .single();
      if (re) throw new Error(re.message);

      const lines: Array<{ concepto_clave: string; descripcion: string; tipo: "percepcion" | "deduccion"; importe_gravado: number; importe_exento: number }> = [
        { concepto_clave: "001", descripcion: `Sueldo (${period.dias} días)`, tipo: "percepcion", importe_gravado: result.total_gravado, importe_exento: 0 },
        { concepto_clave: "002", descripcion: "ISR", tipo: "deduccion", importe_gravado: result.isr, importe_exento: 0 },
      ];
      if (data.incluirImss && result.imss_obrero > 0) {
        lines.push({ concepto_clave: "001", descripcion: "IMSS Obrero", tipo: "deduccion", importe_gravado: result.imss_obrero, importe_exento: 0 });
      }

      if (faltas > 0) {
        const desc = `Faltas: ${faltas} día${faltas === 1 ? "" : "s"} · ${diasDescontados} día(s) desc.`;
        lines.push({ concepto_clave: "020", descripcion: desc, tipo: "deduccion", importe_gravado: importeFalta, importe_exento: 0 });
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
    return { calculados: results.length, saltados: skipped, totalNeto: results.reduce((s: number, r: any) => s + r.neto, 0) };
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

    const { data: tipos } = await supabase.from("incident_types").select("codigo,paga,cuenta_falta");
    const faltaCodes = new Set((tipos ?? []).filter((t: any) => !t.paga && t.cuenta_falta).map((t: any) => t.codigo));
    const otherUnpaidCodes = new Set((tipos ?? []).filter((t: any) => !t.paga && !t.cuenta_falta).map((t: any) => t.codigo));
    const allUnpaidCodes = new Set([...faltaCodes, ...otherUnpaidCodes]);

    const { data: asist } = await supabase
      .from("attendance_entries")
      .select("incident_code, extra_codes")
      .eq("organization_id", receipt.organization_id)
      .eq("employee_id", emp.id)
      .gte("fecha", period.fecha_inicio)
      .lte("fecha", period.fecha_fin);
    let trabajados = 0;
    let faltas = 0;
    let otrosDias = 0;
    (asist ?? []).forEach((a: any) => {
      const codes = [a.incident_code, ...(a.extra_codes ?? [])];
      if (codes.some((c: string) => faltaCodes.has(c))) faltas++;
      if (codes.some((c: string) => otherUnpaidCodes.has(c))) otrosDias++;
      if (!codes.some((c: string) => allUnpaidCodes.has(c))) trabajados++;
    });

    const factorFalta: Record<Periodicity, number> = {
      semanal: 7 / 6, catorcenal: 7 / 6, quincenal: 1, mensual: 1,
    };
    const fFalta = factorFalta[period.periodicidad as Periodicity];
    const diasDescontados = Math.round((faltas * fFalta + otrosDias) * 10000) / 10000;
    const diasPagados = Math.max(0, Math.round((period.dias - diasDescontados) * 10000) / 10000);
    if (diasPagados <= 0) {
      await supabase.from("payroll_receipt_lines").delete().eq("receipt_id", receipt.id);
      await supabase.from("payroll_receipts").delete().eq("id", receipt.id);
      throw new Error(`${emp.nombre} está sin días pagados (incapacidad total en el periodo). Recibo eliminado.`);
    }
    const importeFalta = Math.round(Number(emp.salario_diario) * diasDescontados * 100) / 100;

    const cuotaMensualInf = Number(emp.infonavit_cuota_mensual ?? 0);
    let infonavit = 0;
    if (cuotaMensualInf > 0) {
      const divisor: Record<Periodicity, number> = { semanal: 4, catorcenal: 2, quincenal: 2, mensual: 1 };
      infonavit = Math.round((cuotaMensualInf / divisor[period.periodicidad as Periodicity]) * 100) / 100;
    }
    const extraDed: { importe: number }[] = [];
    if (infonavit > 0) extraDed.push({ importe: infonavit });
    if (importeFalta > 0) extraDed.push({ importe: importeFalta });

    const result = calcPayroll(
      {
        salarioDiario: Number(emp.salario_diario),
        sdi: Number(emp.sdi),
        diasPagados: period.dias,
        periodicidad: period.periodicidad as Periodicity,
        deduccionesExtra: extraDed.length ? extraDed : undefined,
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
      dias_pagados: period.dias,
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
      observaciones: faltas > 0 || otrosDias > 0
        ? [faltas > 0 && `${faltas} falta(s)`, otrosDias > 0 && `${otrosDias} día(s) sin goce`].filter(Boolean).join(" · ") + ` · ${diasDescontados} día(s) descontado(s)`
        : null,
    }).eq("id", receipt.id);
    if (upErr) throw new Error(upErr.message);

    const lines: Array<{ concepto_clave: string; descripcion: string; tipo: "percepcion" | "deduccion"; importe_gravado: number; importe_exento: number }> = [
      { concepto_clave: "001", descripcion: `Sueldo (${period.dias} días)`, tipo: "percepcion", importe_gravado: result.total_gravado, importe_exento: 0 },
      { concepto_clave: "002", descripcion: "ISR", tipo: "deduccion", importe_gravado: result.isr, importe_exento: 0 },
    ];
    if (data.incluirImss && result.imss_obrero > 0) {
      lines.push({ concepto_clave: "001", descripcion: "IMSS Obrero", tipo: "deduccion", importe_gravado: result.imss_obrero, importe_exento: 0 });
    }
    if (faltas > 0) {
      const desc = `Faltas: ${faltas} día${faltas === 1 ? "" : "s"} · ${diasDescontados} día(s) desc.`;
      lines.push({ concepto_clave: "020", descripcion: desc, tipo: "deduccion", importe_gravado: importeFalta, importe_exento: 0 });
    }
    if (infonavit > 0) {
      lines.push({ concepto_clave: "010", descripcion: "Crédito INFONAVIT", tipo: "deduccion", importe_gravado: infonavit, importe_exento: 0 });
    }
    await supabase.from("payroll_receipt_lines").insert(
      lines.map((l) => ({ ...l, receipt_id: receipt.id, organization_id: receipt.organization_id })),
    );

    return { ok: true, neto: netoPagar, faltas, diasPagados };
  });

// ============ PAYROLL PERSONAL (recibo individualizado para empleado dado de baja) ============

const personalReceiptSchema = z.object({
  organizationId: z.string().uuid(),
  employeeId: z.string().uuid(),
  salarioDiario: z.number().min(0),
  diasPagados: z.number().min(0).max(31),
  periodicidad: z.enum(["quincenal", "mensual"]),
  percepciones: z.array(z.object({
    clave: z.string().min(1),
    descripcion: z.string().optional(),
    importe_gravado: z.number().min(0),
    importe_exento: z.number().min(0),
  })).default([]),
  deducciones: z.array(z.object({
    clave: z.string().min(1),
    descripcion: z.string().optional(),
    importe: z.number().min(0),
  })).default([]),
  incluirImss: z.boolean().optional().default(true),
  timbrar: z.boolean().optional().default(false),
  esLiquidacion: z.boolean().optional().default(false),
});

export const runPayrollPersonal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => personalReceiptSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { organizationId, employeeId, salarioDiario, diasPagados, periodicidad, percepciones, deducciones, incluirImss, timbrar, esLiquidacion } = data;

    const ejercicio = new Date().getFullYear();

    // Cargar empleado
    const { data: emp, error: empErr } = await supabase
      .from("employees")
      .select("*")
      .eq("id", employeeId)
      .eq("organization_id", organizationId)
      .single();
    if (empErr || !emp) throw new Error(empErr?.message ?? "Empleado no encontrado");

    // Calcular totales según el tipo de recibo
    let totalGravado: number;
    let totalExento: number;
    let totalPercepciones: number;
    let isr: number;
    let subsidio: number;
    let imssObrero: number;
    let totalDeducciones: number;
    let neto: number;

    if (esLiquidacion) {
      // Para liquidación: los totales vienen directo de las percepciones del usuario
      totalGravado = percepciones.reduce((s, p) => s + p.importe_gravado, 0);
      totalExento = percepciones.reduce((s, p) => s + p.importe_exento, 0);
      totalPercepciones = totalGravado + totalExento;
      // En liquidación con percepciones exentas Art. 93 LISR, ISR = 0
      isr = 0;
      subsidio = 0;
      imssObrero = 0;
      const deduccionesExtraTotal = deducciones.reduce((s, d) => s + d.importe, 0);
      totalDeducciones = deduccionesExtraTotal;
      neto = totalPercepciones - totalDeducciones;
    } else {
      // Para recibo normal: usar calcPayroll
      const tables = await loadTables(supabase, ejercicio);
      const percepcionesExtra = percepciones.map(p => ({
        gravado: p.importe_gravado,
        exento: p.importe_exento,
      }));
      const deduccionesExtra = deducciones.map(d => ({
        importe: d.importe,
      }));
      const sdi = emp.sdi ? Number(emp.sdi) : calcSDI(salarioDiario);
      const result = calcPayroll(
        {
          salarioDiario,
          sdi,
          diasPagados,
          periodicidad: periodicidad as Periodicity,
          percepcionesExtra: percepcionesExtra.length ? percepcionesExtra : undefined,
          deduccionesExtra: deduccionesExtra.length ? deduccionesExtra : undefined,
        },
        tables,
      );
      totalGravado = result.total_gravado;
      totalExento = result.total_exento;
      totalPercepciones = result.total_percepciones;
      isr = result.isr;
      subsidio = result.subsidio;
      imssObrero = incluirImss ? result.imss_obrero : 0;
      totalDeducciones = result.total_deducciones;
      neto = incluirImss ? result.neto : Math.round((result.neto + result.imss_obrero) * 100) / 100;
    }

    // Crear periodo "personal" para este recibo
    const now = new Date();
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const fechaInicio = localDate;
    const fechaFin = localDate;
    const fechaPago = localDate;

    // Buscar o crear periodo personal (numero 99999)
    let periodNum = 99999;
    const { data: existingPeriod } = await supabase
      .from("payroll_periods")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("ejercicio", ejercicio)
      .eq("numero", periodNum)
      .maybeSingle();

    let periodId: string;
    if (existingPeriod) {
      periodId = existingPeriod.id;
      // Actualizar fechas del periodo personal a hoy (hora local)
      await supabase
        .from("payroll_periods")
        .update({ fecha_inicio: fechaInicio, fecha_fin: fechaFin, fecha_pago: fechaPago })
        .eq("id", periodId);
      // Borrar recibo previo del mismo empleado en este periodo personal (permite regenerar)
      const { data: prevReceipt } = await supabase
        .from("payroll_receipts")
        .select("id")
        .eq("payroll_period_id", periodId)
        .eq("employee_id", employeeId)
        .maybeSingle();
      if (prevReceipt) {
        await supabase.from("payroll_receipt_lines").delete().eq("receipt_id", prevReceipt.id);
        await supabase.from("payroll_receipts").delete().eq("id", prevReceipt.id);
      }
    } else {
      const { data: newPeriod, error: periodErr } = await supabase
        .from("payroll_periods")
        .insert({
          organization_id: organizationId,
          ejercicio,
          numero: periodNum,
          periodicidad,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          fecha_pago: fechaPago,
          dias: diasPagados,
          estatus: "calculado",
        })
        .select("id")
        .single();
      if (periodErr) throw new Error(periodErr.message);
      periodId = newPeriod.id;
    }

    // Crear recibo
    const { data: receipt, error: re } = await supabase
      .from("payroll_receipts")
      .insert({
        organization_id: organizationId,
        payroll_period_id: periodId,
        employee_id: employeeId,
        dias_pagados: diasPagados,
        sueldo_diario: salarioDiario,
        sdi: emp.sdi ? Number(emp.sdi) : calcSDI(salarioDiario),
        total_percepciones: totalPercepciones,
        total_deducciones: totalDeducciones,
        total_gravado: totalGravado,
        total_exento: totalExento,
        isr,
        subsidio,
        imss_obrero: imssObrero,
        neto_pagar: neto,
        observaciones: esLiquidacion ? "Liquidación / Finiquito - empleado dado de baja por renuncia" : "Recibo personal - empleado dado de baja",
      })
      .select("id")
      .single();
    if (re) throw new Error(re.message);

    // Líneas del recibo
    const lines: Array<{
      concepto_clave: string;
      descripcion: string;
      tipo: "percepcion" | "deduccion";
      importe_gravado: number;
      importe_exento: number;
    }> = [];

    if (!esLiquidacion) {
      // Para recibo normal: agregar línea de sueldo
      lines.push({
        concepto_clave: "001",
        descripcion: `Sueldo (${diasPagados} días)`,
        tipo: "percepcion",
        importe_gravado: totalGravado,
        importe_exento: 0,
      });
    }

    // Percepciones personalizadas del usuario
    for (const p of percepciones) {
      lines.push({
        concepto_clave: p.clave,
        descripcion: p.descripcion ?? p.clave,
        tipo: "percepcion",
        importe_gravado: p.importe_gravado,
        importe_exento: p.importe_exento,
      });
    }

    // ISR
    if (isr > 0) {
      lines.push({
        concepto_clave: "002",
        descripcion: "ISR",
        tipo: "deduccion",
        importe_gravado: isr,
        importe_exento: 0,
      });
    }

    // IMSS Obrero
    if (incluirImss && imssObrero > 0) {
      lines.push({
        concepto_clave: "001",
        descripcion: "IMSS Obrero",
        tipo: "deduccion",
        importe_gravado: imssObrero,
        importe_exento: 0,
      });
    }

    // Deducciones personalizadas del usuario
    for (const d of deducciones) {
      lines.push({
        concepto_clave: d.clave,
        descripcion: d.descripcion ?? d.clave,
        tipo: "deduccion",
        importe_gravado: d.importe,
        importe_exento: 0,
      });
    }

    await supabase.from("payroll_receipt_lines").insert(
      lines.map(l => ({ ...l, receipt_id: receipt.id, organization_id: organizationId })),
    );

    // Opcionalmente timbrar
    let stampResult = null;
    if (timbrar) {
      try {
        const { stampPayrollReceipt } = await import("@/lib/cfdi.functions");
        stampResult = await stampPayrollReceipt({ data: { receiptId: receipt.id } });
      } catch (e: any) {
        stampResult = { error: e.message };
      }
    }

    return {
      receiptId: receipt.id,
      neto,
      isr,
      subsidio,
      imss_obrero: imssObrero,
      total_percepciones: totalPercepciones,
      total_deducciones: totalDeducciones,
      timbrado: stampResult,
    };
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

export const listPersonalReceipts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: receipts, error } = await context.supabase
      .from("payroll_receipts")
      .select("id, employee_id, total_percepciones, total_deducciones, neto_pagar, isr, subsidio, dias_pagados, observaciones, created_at")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!receipts?.length) return [];

    const receiptIds = receipts.map((r: any) => r.id);
    const { data: stamps } = await context.supabase
      .from("cfdi_stamps")
      .select("id, uuid_sat, estatus, kind, reference_id")
      .in("reference_id", receiptIds)
      .eq("kind", "nomina");

    const empIds = [...new Set(receipts.map((r: any) => r.employee_id).filter(Boolean))];
    const { data: employees } = empIds.length
      ? await context.supabase.from("employees").select("id, nombre, apellido_paterno, apellido_materno").in("id", empIds)
      : { data: [] };

    const empMap = new Map((employees ?? []).map((e: any) => [e.id, e]));

    return receipts
      .map((r: any) => ({
        ...r,
        employee: empMap.get(r.employee_id) ?? null,
        stamp: (stamps ?? []).find((s: any) => s.reference_id === r.id && s.estatus === "timbrado"),
      }))
      .filter((r: any) => r.stamp);
  });

