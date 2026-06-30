import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildIDSEFile, dateIDSE, type MovimientoIDSE } from "@/lib/sua/idse-layout";
import { calcEmpleado, bimestreToMonths, type Params, type CalcInput } from "@/lib/sua/calc";
import { calcEmpleadoMensual } from "@/lib/sua/calc-mensual";

const orgId = z.object({ organizationId: z.string().uuid() });

// ============ PATRONES ============

export const listPatrones = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => orgId.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("imss_patrones")
      .select("*")
      .eq("organization_id", data.organizationId)
      .order("created_at");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const patronSchema = z.object({
  organizationId: z.string().uuid(),
  id: z.string().uuid().optional(),
  registro_patronal: z.string().min(11).max(11),
  rfc_patron: z.string().min(12).max(13),
  razon_social: z.string().min(1),
  curp_patron: z.string().optional().nullable(),
  prima_riesgo: z.number().min(0).max(15),
  prima_riesgo_vigencia: z.string().optional().nullable(),
  clase_riesgo: z.string().optional().nullable(),
  fraccion: z.string().optional().nullable(),
  modalidad: z.string().default("40"),
  domicilio: z.string().optional().nullable(),
  cp: z.string().optional().nullable(),
  municipio: z.string().optional().nullable(),
  estado: z.string().optional().nullable(),
  zona_salario: z.enum(["general", "frontera"]).default("general"),
});

export const upsertPatron = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => patronSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { organizationId, id, ...rest } = data;
    const row = { organization_id: organizationId, ...rest };
    if (id) {
      const { error } = await context.supabase.from("imss_patrones").update(row).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: created, error } = await context.supabase
      .from("imss_patrones").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const deletePatron = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("imss_patrones").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ MOVIMIENTOS IDSE ============

export const listMovimientos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    patronId: z.string().uuid().optional(),
    estatus: z.string().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("imss_movimientos")
      .select("*, employee:employees(numero, nombre, apellido_paterno, apellido_materno, rfc, curp, nss)")
      .eq("organization_id", data.organizationId)
      .order("fecha_movimiento", { ascending: false });
    if (data.patronId) q = q.eq("patron_id", data.patronId);
    if (data.estatus) q = q.eq("estatus", data.estatus);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const movSchema = z.object({
  organizationId: z.string().uuid(),
  id: z.string().uuid().optional(),
  patron_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  tipo: z.enum(["alta", "baja", "modificacion", "reingreso", "ausentismo", "incapacidad"]),
  fecha_movimiento: z.string(),
  fecha_fin: z.string().optional().nullable(),
  dias: z.number().int().min(0).max(365).optional().nullable(),
  sdi_anterior: z.number().min(0).optional().nullable(),
  sdi_nuevo: z.number().min(0).optional().nullable(),
  motivo_baja: z.string().optional().nullable(),
  tipo_incapacidad: z.string().optional().nullable(),
  ramo_incapacidad: z.string().optional().nullable(),
  observaciones: z.string().optional().nullable(),
});

export const upsertMovimiento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => movSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { organizationId, id, ...rest } = data;
    const row = { organization_id: organizationId, ...rest };
    if (id) {
      const { error } = await context.supabase.from("imss_movimientos").update(row).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: created, error } = await context.supabase
      .from("imss_movimientos").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const deleteMovimiento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("imss_movimientos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateMovimientoFolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    id: z.string().uuid(),
    folio_idse: z.string().min(1),
    estatus: z.enum(["enviado", "aceptado", "rechazado"]),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("imss_movimientos")
      .update({ folio_idse: data.folio_idse, estatus: data.estatus, enviado_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ GENERADOR ARCHIVO IDSE ============

const TIPO_IMSS: Record<string, MovimientoIDSE["tipo_movimiento"]> = {
  alta: "08",
  reingreso: "08",
  baja: "02",
  modificacion: "07",
  ausentismo: "11",
  incapacidad: "12",
};

export const generateIDSEFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    movimientoIds: z.array(z.string().uuid()).min(1),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: movs, error } = await context.supabase
      .from("imss_movimientos")
      .select("*, employee:employees(*), patron:imss_patrones(*)")
      .in("id", data.movimientoIds)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    if (!movs?.length) throw new Error("No se encontraron movimientos");

    const records: MovimientoIDSE[] = movs.map((m: any) => {
      const emp = m.employee;
      const pat = m.patron;
      const nombreFull = [emp.apellido_paterno, emp.apellido_materno, emp.nombre]
        .filter(Boolean).join(" ").toUpperCase();
      const sdi = m.tipo === "modificacion" ? Number(m.sdi_nuevo ?? emp.sdi) : Number(emp.sdi ?? 0);
      return {
        registro_patronal: pat.registro_patronal,
        nss: (emp.nss ?? "").replace(/\D/g, ""),
        rfc: emp.rfc ?? "",
        curp: emp.curp ?? "",
        nombre: nombreFull,
        tipo_trabajador: "1",
        tipo_salario: "0",
        jornada: "0",
        fecha_movimiento: dateIDSE(m.fecha_movimiento),
        tipo_movimiento: TIPO_IMSS[m.tipo],
        sdi,
        motivo_baja: m.motivo_baja ?? undefined,
        dias: m.dias ?? undefined,
        tipo_incapacidad: m.tipo_incapacidad ?? undefined,
        folio_incapacidad: m.ramo_incapacidad ?? undefined,
      };
    });
    const contenido = buildIDSEFile(records);
    return {
      filename: `IDSE_${new Date().toISOString().slice(0, 10)}.txt`,
      contenido,
      registros: records.length,
    };
  });

// ============ BIMESTRES (cálculo) ============

const PARAM_KEYS = [
  "uma_diaria","tope_sbc_imss",
  "imss_efm_cf_patron","imss_efm_exc_patron","imss_efm_exc_obrero",
  "imss_efm_din_patron","imss_efm_din_obrero",
  "imss_gmp_patron","imss_gmp_obrero",
  "imss_iv_patron","imss_iv_obrero",
  "imss_guard_patron","imss_retiro_patron",
  "imss_cv_patron","imss_cv_obrero",
] as const;

async function loadParams(supabase: any, ejercicio: number): Promise<Params> {
  const { data, error } = await supabase
    .from("fiscal_params")
    .select("clave, valor")
    .eq("ejercicio", ejercicio)
    .in("clave", PARAM_KEYS as unknown as string[]);
  if (error) throw new Error(error.message);
  const map: any = {};
  for (const r of data ?? []) map[r.clave] = Number(r.valor);
  for (const k of PARAM_KEYS) if (map[k] == null) throw new Error(`Falta parámetro fiscal ${k} para ${ejercicio}`);
  return map as Params;
}

export const listBimestres = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("imss_bimestres")
      .select("*, patron:imss_patrones(razon_social, registro_patronal)")
      .eq("organization_id", data.organizationId)
      .order("ejercicio", { ascending: false })
      .order("bimestre", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const calcularBimestre = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    patronId: z.string().uuid(),
    ejercicio: z.number().int().min(2020).max(2099),
    bimestre: z.number().int().min(1).max(6),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    // 1) Carga patrón + empleados + parámetros + movimientos del bimestre
    const { data: patron, error: ep } = await sb.from("imss_patrones").select("*").eq("id", data.patronId).single();
    if (ep) throw new Error(ep.message);
    const params = await loadParams(sb, data.ejercicio);
    const { data: emps, error: ee } = await sb
      .from("employees")
      .select("id, numero, nombre, apellido_paterno, apellido_materno, nss, rfc, curp, sdi, salario_diario, infonavit_cuota_mensual, fecha_alta, fecha_baja, estatus")
      .eq("organization_id", data.organizationId)
      .eq("patron_id", data.patronId);
    if (ee) throw new Error(ee.message);

    const { mes1, mes2 } = bimestreToMonths(data.bimestre, data.ejercicio);
    const m1Start = new Date(Date.UTC(mes1.year, mes1.month, 1));
    const m1End = new Date(Date.UTC(mes1.year, mes1.month, mes1.dias));
    const m2Start = new Date(Date.UTC(mes2.year, mes2.month, 1));
    const m2End = new Date(Date.UTC(mes2.year, mes2.month, mes2.dias));

    const { data: movs } = await sb
      .from("imss_movimientos")
      .select("*")
      .eq("organization_id", data.organizationId)
      .eq("patron_id", data.patronId)
      .lte("fecha_movimiento", m2End.toISOString().slice(0, 10));

    // 2) upsert encabezado
    const headerRow = {
      organization_id: data.organizationId,
      patron_id: data.patronId,
      ejercicio: data.ejercicio,
      bimestre: data.bimestre,
      estatus: "calculado",
      calculado_at: new Date().toISOString(),
    };
    const { data: hdr, error: eh } = await sb
      .from("imss_bimestres")
      .upsert(headerRow, { onConflict: "patron_id,ejercicio,bimestre" })
      .select("id").single();
    if (eh) throw new Error(eh.message);
    const bimestreId = hdr.id;

    // limpia detalle previo
    await sb.from("imss_bimestre_detalle").delete().eq("bimestre_id", bimestreId);

    // 3) por cada empleado calcular días efectivos + ausencias/incap del bimestre
    let totM1 = 0, totM2 = 0, totRcv = 0, totInf = 0;
    const detRows: any[] = [];

    for (const emp of emps ?? []) {
      const alta = emp.fecha_alta ? new Date(emp.fecha_alta + "T00:00:00Z") : null;
      const baja = emp.fecha_baja ? new Date(emp.fecha_baja + "T00:00:00Z") : null;
      const overlapDays = (s: Date, e: Date, ws: Date, we: Date) => {
        const a = s > ws ? s : ws;
        const b = e < we ? e : we;
        if (a > b) return 0;
        return Math.floor((b.getTime() - a.getTime()) / 86400000) + 1;
      };
      const empStart = alta ?? m1Start;
      const empEnd = baja ?? m2End;
      const dM1 = overlapDays(empStart, empEnd, m1Start, m1End);
      const dM2 = overlapDays(empStart, empEnd, m2Start, m2End);
      if (dM1 + dM2 === 0) continue;

      // ausencias e incapacidades del empleado dentro del bimestre
      let aus1 = 0, aus2 = 0, inc1 = 0, inc2 = 0;
      for (const m of (movs ?? []).filter((x: any) => x.employee_id === emp.id)) {
        if (m.tipo !== "ausentismo" && m.tipo !== "incapacidad") continue;
        const fIni = new Date(m.fecha_movimiento + "T00:00:00Z");
        const dias = Number(m.dias ?? 0);
        if (!dias) continue;
        const fFin = new Date(fIni.getTime() + (dias - 1) * 86400000);
        const d1 = overlapDays(fIni, fFin, m1Start, m1End);
        const d2 = overlapDays(fIni, fFin, m2Start, m2End);
        if (m.tipo === "ausentismo") { aus1 += d1; aus2 += d2; }
        else { inc1 += d1; inc2 += d2; }
      }

      const ci: CalcInput = {
        sdi: Number(emp.sdi ?? emp.salario_diario ?? 0),
        dias_mes1: dM1,
        dias_mes2: dM2,
        ausencias_mes1: aus1,
        ausencias_mes2: aus2,
        incap_mes1: inc1,
        incap_mes2: inc2,
        prima_rt: Number(patron.prima_riesgo ?? 0),
        infonavit_cuota_mensual: Number(emp.infonavit_cuota_mensual ?? 0),
      };
      const r = calcEmpleado(params, ci);
      totM1 += r.total_imss_mes1;
      totM2 += r.total_imss_mes2;
      totRcv += r.total_rcv;
      totInf += r.infonavit;

      detRows.push({
        bimestre_id: bimestreId,
        organization_id: data.organizationId,
        employee_id: emp.id,
        sbc: r.sbc,
        dias_mes1: dM1, dias_mes2: dM2,
        ausencias_mes1: aus1, ausencias_mes2: aus2,
        incap_mes1: inc1, incap_mes2: inc2,
        efm_cf_mes1: r.efm_cf_mes1, efm_cf_mes2: r.efm_cf_mes2,
        efm_exc_mes1: r.efm_exc_mes1, efm_exc_mes2: r.efm_exc_mes2,
        efm_din_mes1: r.efm_din_mes1, efm_din_mes2: r.efm_din_mes2,
        gmp_mes1: r.gmp_mes1, gmp_mes2: r.gmp_mes2,
        iv_mes1: r.iv_mes1, iv_mes2: r.iv_mes2,
        guard_mes1: r.guard_mes1, guard_mes2: r.guard_mes2,
        rt_mes1: r.rt_mes1, rt_mes2: r.rt_mes2,
        retiro: r.retiro, cv: r.cv, infonavit: r.infonavit,
        total_imss_mes1: r.total_imss_mes1, total_imss_mes2: r.total_imss_mes2,
        total_rcv: r.total_rcv, total: r.total,
      });
    }

    if (detRows.length) {
      const { error: ed } = await sb.from("imss_bimestre_detalle").insert(detRows);
      if (ed) throw new Error(ed.message);
    }

    const total = Math.round((totM1 + totM2 + totRcv + totInf) * 100) / 100;
    const { error: eu } = await sb.from("imss_bimestres").update({
      total_imss_mes1: totM1, total_imss_mes2: totM2,
      total_rcv: totRcv, total_infonavit: totInf, total_bimestre: total,
    }).eq("id", bimestreId);
    if (eu) throw new Error(eu.message);

    return { id: bimestreId, empleados: detRows.length, total };
  });

export const getBimestreDetalle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: hdr, error } = await context.supabase
      .from("imss_bimestres")
      .select("*, patron:imss_patrones(*)")
      .eq("id", data.id).single();
    if (error) throw new Error(error.message);
    const { data: det, error: ed } = await context.supabase
      .from("imss_bimestre_detalle")
      .select("*, employee:employees(numero, nombre, apellido_paterno, apellido_materno, nss, rfc)")
      .eq("bimestre_id", data.id);
    if (ed) throw new Error(ed.message);
    return { header: hdr, detalle: det ?? [] };
  });

export const deleteBimestre = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("imss_bimestres").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ IMPORTAR ARCHIVOS SUA / IDSE ============

import {
  parseAsegurados, parseAfiliacion, parseMovimientos,
  parseIncapacidades, parseCreditos, TIPO_MOV_TO_INTERNAL,
} from "@/lib/sua/import-parser";

const importSchema = z.object({
  organizationId: z.string().uuid(),
  asegText: z.string().optional(),
  afilText: z.string().optional(),
  movText: z.string().optional(),
  incapText: z.string().optional(),
  credText: z.string().optional(),
  razonSocial: z.string().optional(),
  rfcPatron: z.string().optional(),
  actividadEconomica: z.string().optional(),
  domicilio: z.string().optional(),
  cp: z.string().optional(),
  municipio: z.string().optional(),
  estado: z.string().optional(),
  telefono: z.string().optional(),
  representanteLegal: z.string().optional(),
  delegacion: z.string().optional(),
  subdelegacion: z.string().optional(),
  subdelegacionClave: z.string().optional(),
  areaGeografica: z.string().optional(),
  claseRiesgo: z.string().optional(),
  fraccion: z.string().optional(),
  primaRiesgo: z.number().optional(),
});

export const previewSuaImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => importSchema.parse(i))
  .handler(async ({ data }) => {
    const asegs = data.asegText ? parseAsegurados(data.asegText) : [];
    const afils = data.afilText ? parseAfiliacion(data.afilText) : [];
    const movs = data.movText ? parseMovimientos(data.movText) : [];
    const incaps = data.incapText ? parseIncapacidades(data.incapText) : [];
    const creds = data.credText ? parseCreditos(data.credText) : [];
    const registros = Array.from(new Set([
      ...asegs.map(a => a.registro_patronal),
      ...afils.map(a => a.registro_patronal),
      ...movs.map(m => m.registro_patronal),
      ...incaps.map(i => i.registro_patronal),
      ...creds.map(c => c.registro_patronal),
    ].filter(Boolean)));
    return { asegs, afils, movs, incaps, creds, registros };
  });

export const importSuaArchivos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => importSchema.parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const asegs = data.asegText ? parseAsegurados(data.asegText) : [];
    const afils = data.afilText ? parseAfiliacion(data.afilText) : [];
    const movs = data.movText ? parseMovimientos(data.movText) : [];
    const incaps = data.incapText ? parseIncapacidades(data.incapText) : [];
    const creds = data.credText ? parseCreditos(data.credText) : [];
    if (!asegs.length && !movs.length && !incaps.length && !afils.length && !creds.length) {
      throw new Error("No subiste ningún archivo");
    }

    const { data: orgCheck, error: oe } = await sb
      .from("organization_members").select("organization_id")
      .eq("organization_id", data.organizationId).eq("user_id", context.userId).maybeSingle();
    if (oe) throw new Error(oe.message);
    if (!orgCheck) throw new Error("No tienes acceso a esa organización");

    // ---- Patrones ----
    const regSet = Array.from(new Set([
      ...asegs.map(a => a.registro_patronal),
      ...afils.map(a => a.registro_patronal),
      ...movs.map(m => m.registro_patronal),
      ...incaps.map(i => i.registro_patronal),
      ...creds.map(c => c.registro_patronal),
    ].filter(Boolean)));
    const patronIdByReg = new Map<string, string>();
    const patronExtras: any = {
      actividad_economica: data.actividadEconomica || null,
      domicilio: data.domicilio || null,
      cp: data.cp || null,
      municipio: data.municipio || null,
      estado: data.estado || null,
      telefono: data.telefono || null,
      representante_legal: data.representanteLegal || null,
      delegacion: data.delegacion || null,
      subdelegacion: data.subdelegacion || null,
      subdelegacion_clave: data.subdelegacionClave || null,
      area_geografica: data.areaGeografica || null,
      clase_riesgo: data.claseRiesgo || null,
      fraccion: data.fraccion || null,
    };
    Object.keys(patronExtras).forEach(k => patronExtras[k] === null && delete patronExtras[k]);

    for (const reg of regSet) {
      const { data: existing } = await sb.from("imss_patrones").select("id")
        .eq("organization_id", data.organizationId).eq("registro_patronal", reg).maybeSingle();
      if (existing?.id) {
        patronIdByReg.set(reg, existing.id);
        if (Object.keys(patronExtras).length || data.razonSocial || data.rfcPatron || data.primaRiesgo) {
          const updates: any = { ...patronExtras };
          if (data.razonSocial) updates.razon_social = data.razonSocial;
          if (data.rfcPatron) updates.rfc_patron = data.rfcPatron;
          if (data.primaRiesgo) updates.prima_riesgo = data.primaRiesgo;
          if (Object.keys(updates).length) {
            await sb.from("imss_patrones").update(updates).eq("id", existing.id);
          }
        }
        continue;
      }
      const insertRow: any = {
        organization_id: data.organizationId,
        registro_patronal: reg,
        rfc_patron: data.rfcPatron || "XAXX010101000",
        razon_social: data.razonSocial || `Patrón ${reg}`,
        prima_riesgo: data.primaRiesgo ?? 0.5,
        modalidad: "40",
        zona_salario: data.areaGeografica === "C" ? "frontera" : "general",
        ...patronExtras,
      };
      const { data: created, error } = await sb.from("imss_patrones").insert(insertRow).select("id").single();
      if (error) throw new Error(`Patrón ${reg}: ${error.message}`);
      patronIdByReg.set(reg, created!.id);
    }

    // ---- Indexa empleados por NSS ----
    const allNss = Array.from(new Set([
      ...asegs.map(a => a.nss),
      ...afils.map(a => a.nss),
      ...movs.map(m => m.nss),
      ...incaps.map(i => i.nss),
      ...creds.map(c => c.nss),
    ].filter(Boolean)));
    const employeeIdByNss = new Map<string, string>();
    const employeeSdiByNss = new Map<string, number>();
    if (allNss.length) {
      const { data: existing } = await sb.from("employees")
        .select("id, nss, sdi, salario_diario").eq("organization_id", data.organizationId).in("nss", allNss);
      for (const e of existing ?? []) if (e.nss) {
        employeeIdByNss.set(e.nss, e.id);
        employeeSdiByNss.set(e.nss, Number(e.sdi ?? e.salario_diario ?? 0));
      }
    }

    // ---- Asegurados ----
    let emp_creados = 0, emp_actualizados = 0;
    for (const a of asegs) {
      const patronId = patronIdByReg.get(a.registro_patronal) ?? null;
      const baseUpdate: any = {
        nombre: a.nombre || a.nombre_completo,
        apellido_paterno: a.apellido_paterno,
        apellido_materno: a.apellido_materno,
        rfc: a.rfc || null,
        curp: a.curp || null,
        nss: a.nss,
        fecha_alta: a.fecha_alta,
        sdi: a.sdi,
        salario_diario: a.sdi,
        patron_id: patronId,
        estatus: "activo" as const,
      };
      const existingId = employeeIdByNss.get(a.nss);
      if (existingId) {
        const { error } = await sb.from("employees").update(baseUpdate).eq("id", existingId);
        if (error) throw new Error(`Empleado NSS ${a.nss}: ${error.message}`);
        emp_actualizados++;
      } else {
        const insertRow = {
          ...baseUpdate,
          organization_id: data.organizationId,
          numero: a.nss,
          periodicidad: "mensual" as const,
          infonavit_cuota_mensual: 0,
        };
        const { data: created, error } = await sb.from("employees").insert(insertRow).select("id").single();
        if (error) throw new Error(`Empleado NSS ${a.nss}: ${error.message}`);
        employeeIdByNss.set(a.nss, created!.id);
        emp_creados++;
      }
      employeeSdiByNss.set(a.nss, a.sdi);
    }

    // ---- Afiliación (datos personales) ----
    let afil_aplicados = 0, afil_omitidos = 0;
    for (const af of afils) {
      const empId = employeeIdByNss.get(af.nss);
      if (!empId) { afil_omitidos++; continue; }
      const upd: any = {};
      if (af.fecha_nacimiento) upd.fecha_nacimiento = af.fecha_nacimiento;
      if (af.sexo) upd.sexo = af.sexo;
      if (af.entidad_nacimiento) upd.entidad_nacimiento = af.entidad_nacimiento;
      if (af.ocupacion) { upd.ocupacion = af.ocupacion; upd.puesto = af.ocupacion; }
      if (Object.keys(upd).length === 0) continue;
      const { error } = await sb.from("employees").update(upd).eq("id", empId);
      if (error) throw new Error(`Afiliación NSS ${af.nss}: ${error.message}`);
      afil_aplicados++;
    }

    // ---- Movimientos ----
    let mov_creados = 0, mov_omitidos = 0;
    for (const m of movs) {
      const empId = employeeIdByNss.get(m.nss);
      const patronId = patronIdByReg.get(m.registro_patronal);
      if (!empId || !patronId) { mov_omitidos++; continue; }
      const tipoInt = TIPO_MOV_TO_INTERNAL[m.tipo];
      if (!tipoInt) { mov_omitidos++; continue; }
      const previousSdi = employeeSdiByNss.get(m.nss) ?? null;
      const { data: dup } = await sb.from("imss_movimientos")
        .select("id, sdi_anterior").eq("organization_id", data.organizationId)
        .eq("employee_id", empId).eq("tipo", tipoInt)
        .eq("fecha_movimiento", m.fecha).maybeSingle();
      if (dup) {
        if (tipoInt === "modificacion" && m.sdi) {
          await sb.from("imss_movimientos").update({ sdi_anterior: dup.sdi_anterior ?? previousSdi, sdi_nuevo: m.sdi }).eq("id", dup.id);
          await sb.from("employees").update({ sdi: m.sdi, salario_diario: m.sdi }).eq("id", empId);
          employeeSdiByNss.set(m.nss, m.sdi);
        }
        mov_omitidos++;
        continue;
      }
      const row: any = {
        organization_id: data.organizationId,
        patron_id: patronId,
        employee_id: empId,
        tipo: tipoInt,
        fecha_movimiento: m.fecha,
        sdi_anterior: tipoInt === "modificacion" ? previousSdi : null,
        sdi_nuevo: m.sdi,
        dias: m.dias,
        folio_idse: m.folio,
        estatus: "aceptado",
        observaciones: "Importado desde SUA (Movt.TXT)",
      };
      const { error } = await sb.from("imss_movimientos").insert(row);
      if (error) throw new Error(`Movimiento NSS ${m.nss}: ${error.message}`);
      if (tipoInt === "modificacion" && m.sdi) {
        await sb.from("employees").update({ sdi: m.sdi, salario_diario: m.sdi }).eq("id", empId);
        employeeSdiByNss.set(m.nss, m.sdi);
      }
      if (tipoInt === "baja") {
        await sb.from("employees").update({ estatus: "baja", fecha_baja: m.fecha }).eq("id", empId);
      }
      if (tipoInt === "alta") {
        await sb.from("employees").update({ estatus: "activo", fecha_alta: m.fecha, fecha_baja: null }).eq("id", empId);
      }
      mov_creados++;
    }

    // ---- Incapacidades detalladas ----
    let incap_creadas = 0, incap_omitidas = 0;
    for (const ic of incaps) {
      const empId = employeeIdByNss.get(ic.nss);
      const patronId = patronIdByReg.get(ic.registro_patronal);
      if (!empId || !patronId) { incap_omitidas++; continue; }
      const { data: dup } = await sb.from("imss_movimientos").select("id")
        .eq("organization_id", data.organizationId).eq("employee_id", empId)
        .eq("tipo", "incapacidad").eq("fecha_movimiento", ic.fecha_inicio).maybeSingle();
      if (dup) {
        await sb.from("imss_movimientos").update({
          fecha_fin: ic.fecha_fin, dias: ic.dias, folio_idse: ic.folio, tipo_incapacidad: ic.tipo,
        }).eq("id", dup.id);
        continue;
      }
      const { error } = await sb.from("imss_movimientos").insert({
        organization_id: data.organizationId,
        patron_id: patronId,
        employee_id: empId,
        tipo: "incapacidad",
        fecha_movimiento: ic.fecha_inicio,
        fecha_fin: ic.fecha_fin,
        dias: ic.dias,
        folio_idse: ic.folio,
        tipo_incapacidad: ic.tipo,
        estatus: "aceptado",
        observaciones: "Importado desde SUA (Incap.TXT)",
      });
      if (error) throw new Error(`Incapacidad NSS ${ic.nss}: ${error.message}`);
      incap_creadas++;
    }

    // ---- Créditos INFONAVIT ----
    let cred_aplicados = 0, cred_omitidos = 0;
    for (const c of creds) {
      const empId = employeeIdByNss.get(c.nss);
      if (!empId) { cred_omitidos++; continue; }
      const upd: any = {
        infonavit_credito: c.credito,
        infonavit_tipo_descuento: c.tipo_descuento,
        infonavit_factor_descuento: c.factor,
        infonavit_fecha_inicio: c.fecha_inicio,
      };
      // Si es cuota fija (tipo 2), usa el factor como cuota mensual
      if (c.tipo_descuento === "2" && c.factor) upd.infonavit_cuota_mensual = c.factor;
      const { error } = await sb.from("employees").update(upd).eq("id", empId);
      if (error) throw new Error(`Crédito NSS ${c.nss}: ${error.message}`);
      cred_aplicados++;
    }

    return {
      patrones: patronIdByReg.size,
      empleados_creados: emp_creados,
      empleados_actualizados: emp_actualizados,
      afiliacion_aplicados: afil_aplicados,
      afiliacion_omitidos: afil_omitidos,
      movimientos_creados: mov_creados,
      movimientos_omitidos: mov_omitidos,
      incapacidades_creadas: incap_creadas,
      incapacidades_omitidas: incap_omitidas,
      creditos_aplicados: cred_aplicados,
      creditos_omitidos: cred_omitidos,
    };
  });

// ============ MENSUALES (cálculo IMSS por mes) ============

export const listMensuales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("imss_mensuales")
      .select("*, patron:imss_patrones(razon_social, registro_patronal)")
      .eq("organization_id", data.organizationId)
      .order("ejercicio", { ascending: false })
      .order("mes", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const calcularMensual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    patronId: z.string().uuid(),
    ejercicio: z.number().int().min(2020).max(2099),
    mes: z.number().int().min(1).max(12),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: patron, error: ep } = await sb.from("imss_patrones").select("*").eq("id", data.patronId).single();
    if (ep) throw new Error(ep.message);
    const params = await loadParams(sb, data.ejercicio);
    const { data: emps, error: ee } = await sb
      .from("employees")
      .select("id, numero, nombre, apellido_paterno, apellido_materno, nss, rfc, sdi, salario_diario, fecha_alta, fecha_baja")
      .eq("organization_id", data.organizationId)
      .eq("patron_id", data.patronId);
    if (ee) throw new Error(ee.message);

    const monthIdx = data.mes - 1;
    const diasMes = new Date(data.ejercicio, data.mes, 0).getDate();
    const mStart = new Date(Date.UTC(data.ejercicio, monthIdx, 1));
    const mEnd = new Date(Date.UTC(data.ejercicio, monthIdx, diasMes));

    const { data: movs } = await sb
      .from("imss_movimientos")
      .select("*")
      .eq("organization_id", data.organizationId)
      .eq("patron_id", data.patronId)
      .lte("fecha_movimiento", mEnd.toISOString().slice(0, 10));

    const headerRow = {
      organization_id: data.organizationId,
      patron_id: data.patronId,
      ejercicio: data.ejercicio,
      mes: data.mes,
      estatus: "calculado",
      calculado_at: new Date().toISOString(),
    };
    const { data: hdr, error: eh } = await sb
      .from("imss_mensuales")
      .upsert(headerRow, { onConflict: "patron_id,ejercicio,mes" })
      .select("id").single();
    if (eh) throw new Error(eh.message);
    const mensualId = hdr.id;
    await sb.from("imss_mensual_detalle").delete().eq("mensual_id", mensualId);

    const overlapDays = (s: Date, e: Date, ws: Date, we: Date) => {
      const a = s > ws ? s : ws;
      const b = e < we ? e : we;
      if (a > b) return 0;
      return Math.floor((b.getTime() - a.getTime()) / 86400000) + 1;
    };
    const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86400000);
    const byEmployeeMovs = new Map<string, any[]>();
    for (const m of movs ?? []) {
      const arr = byEmployeeMovs.get(m.employee_id) ?? [];
      arr.push(m);
      byEmployeeMovs.set(m.employee_id, arr);
    }

    let tEfm = 0, tGmp = 0, tIv = 0, tGuard = 0, tRt = 0, tTot = 0;
    const detRows: any[] = [];

    for (const emp of emps ?? []) {
      const alta = emp.fecha_alta ? new Date(emp.fecha_alta + "T00:00:00Z") : null;
      const baja = emp.fecha_baja ? new Date(emp.fecha_baja + "T00:00:00Z") : null;
      const empStart = alta ?? mStart;
      const empEnd = baja ?? mEnd;
      const dM = overlapDays(empStart, empEnd, mStart, mEnd);
      if (dM === 0) continue;

      const empMovs = (byEmployeeMovs.get(emp.id) ?? []).sort((a: any, b: any) =>
        String(a.fecha_movimiento).localeCompare(String(b.fecha_movimiento))
      );
      const mods = empMovs.filter((m: any) => m.tipo === "modificacion" && Number(m.sdi_nuevo ?? 0) > 0);
      const priorMod = [...mods].reverse().find((m: any) => new Date(m.fecha_movimiento + "T00:00:00Z") < mStart);
      const monthMods = mods.filter((m: any) => {
        const f = new Date(m.fecha_movimiento + "T00:00:00Z");
        return f >= mStart && f <= mEnd;
      });
      const segments: Array<{ start: Date; end: Date; sdi: number }> = [];
      let cursor = empStart > mStart ? empStart : mStart;
      const segEnd = empEnd < mEnd ? empEnd : mEnd;
      let currentSdi = Number(
        priorMod?.sdi_nuevo ?? monthMods[0]?.sdi_anterior ?? emp.sdi ?? emp.salario_diario ?? 0
      );

      for (const mod of monthMods) {
        const modDate = new Date(mod.fecha_movimiento + "T00:00:00Z");
        if (modDate > segEnd) break;
        if (modDate > cursor) segments.push({ start: cursor, end: addDays(modDate, -1), sdi: currentSdi });
        currentSdi = Number(mod.sdi_nuevo ?? currentSdi);
        if (modDate > cursor) cursor = modDate;
      }
      if (cursor <= segEnd) segments.push({ start: cursor, end: segEnd, sdi: currentSdi });

      let aus = 0, inc = 0;
      let sbc = 0, dias_cot = 0, efm_cf = 0, efm_exc = 0, efm_din = 0, gmp = 0, iv = 0, guarderias = 0, rt = 0, total = 0;
      for (const seg of segments) {
        const diasSeg = overlapDays(seg.start, seg.end, mStart, mEnd);
        if (!diasSeg) continue;
        let ausSeg = 0, incSeg = 0;
        for (const m of empMovs) {
          if (m.tipo !== "ausentismo" && m.tipo !== "incapacidad") continue;
          const fIni = new Date(m.fecha_movimiento + "T00:00:00Z");
          const dias = Number(m.dias ?? 0);
          if (!dias) continue;
          const fFin = addDays(fIni, dias - 1);
          const d = overlapDays(fIni, fFin, seg.start, seg.end);
          if (m.tipo === "ausentismo") ausSeg += d; else incSeg += d;
        }
        const r = calcEmpleadoMensual(params, {
          sdi: seg.sdi,
          dias_mes: diasSeg,
          ausencias: ausSeg,
          incapacidades: incSeg,
          prima_rt: Number(patron.prima_riesgo ?? 0),
        });
        sbc = r.sbc; dias_cot += r.dias_cot; aus += ausSeg; inc += incSeg;
        efm_cf += r.efm_cf; efm_exc += r.efm_exc; efm_din += r.efm_din;
        gmp += r.gmp; iv += r.iv; guarderias += r.guarderias; rt += r.rt; total += r.total;
      }
      const r = { sbc, dias_cot, efm_cf, efm_exc, efm_din, gmp, iv, guarderias, rt, total };
      tEfm += r.efm_cf + r.efm_exc + r.efm_din;
      tGmp += r.gmp; tIv += r.iv; tGuard += r.guarderias; tRt += r.rt;
      tTot += r.total;

      detRows.push({
        mensual_id: mensualId,
        organization_id: data.organizationId,
        employee_id: emp.id,
        sbc: r.sbc, dias_cot: r.dias_cot,
        ausencias: aus, incapacidades: inc,
        efm_cf: r.efm_cf, efm_exc: r.efm_exc, efm_din: r.efm_din,
        gmp: r.gmp, iv: r.iv, guarderias: r.guarderias, rt: r.rt,
        total: r.total,
      });
    }

    if (detRows.length) {
      const { error: ed } = await sb.from("imss_mensual_detalle").insert(detRows);
      if (ed) throw new Error(ed.message);
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const { error: eu } = await sb.from("imss_mensuales").update({
      total_efm: round2(tEfm), total_gmp: round2(tGmp), total_iv: round2(tIv),
      total_guarderias: round2(tGuard), total_rt: round2(tRt),
      total_mes: round2(tTot),
    }).eq("id", mensualId);
    if (eu) throw new Error(eu.message);

    return { id: mensualId, empleados: detRows.length, total: round2(tTot) };
  });

export const getMensualDetalle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: hdr, error } = await context.supabase
      .from("imss_mensuales")
      .select("*, patron:imss_patrones(*)")
      .eq("id", data.id).single();
    if (error) throw new Error(error.message);
    const { data: det, error: ed } = await context.supabase
      .from("imss_mensual_detalle")
      .select("*, employee:employees(numero, nombre, apellido_paterno, apellido_materno, nss, rfc)")
      .eq("mensual_id", data.id);
    if (ed) throw new Error(ed.message);
    return { header: hdr, detalle: det ?? [] };
  });

export const deleteMensual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("imss_mensuales").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });



