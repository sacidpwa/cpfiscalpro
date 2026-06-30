import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FACTURAPI_BASE = "https://www.facturapi.io/v2";

// Mapeo periodicidad interna -> clave SAT (catálogo "PeriodicidadPago")
const FREQ_SAT: Record<string, string> = {
  semanal: "02",
  catorcenal: "03",
  quincenal: "04",
  mensual: "05",
};

// CP → clave estado SAT (subset común MX). Para producción se debe poblar tabla completa.
function estadoFromCP(cp: string): string {
  const n = parseInt(cp ?? "00000", 10);
  if (n >= 50000 && n <= 57940) return "MEX"; // Estado de México
  if (n >= 1000 && n <= 16999) return "CMX";
  if (n >= 20000 && n <= 20999) return "AGU";
  if (n >= 22000 && n <= 22999) return "BCN";
  if (n >= 23000 && n <= 23999) return "BCS";
  if (n >= 24000 && n <= 24999) return "CAM";
  if (n >= 25000 && n <= 27999) return "COA";
  if (n >= 28000 && n <= 28999) return "COL";
  if (n >= 29000 && n <= 30999) return "CHP";
  if (n >= 31000 && n <= 33999) return "CHH";
  if (n >= 34000 && n <= 35999) return "DUR";
  if (n >= 36000 && n <= 38999) return "GUA";
  if (n >= 39000 && n <= 41999) return "GRO";
  if (n >= 42000 && n <= 43999) return "HID";
  if (n >= 44000 && n <= 49999) return "JAL";
  if (n >= 58000 && n <= 61999) return "MIC";
  if (n >= 62000 && n <= 62999) return "MOR";
  if (n >= 63000 && n <= 63999) return "NAY";
  if (n >= 64000 && n <= 67999) return "NLE";
  if (n >= 68000 && n <= 71999) return "OAX";
  if (n >= 72000 && n <= 75999) return "PUE";
  if (n >= 76000 && n <= 76999) return "QUE";
  if (n >= 77000 && n <= 77999) return "ROO";
  if (n >= 78000 && n <= 79999) return "SLP";
  if (n >= 80000 && n <= 82999) return "SIN";
  if (n >= 83000 && n <= 85999) return "SON";
  if (n >= 86000 && n <= 86999) return "TAB";
  if (n >= 87000 && n <= 89999) return "TAM";
  if (n >= 90000 && n <= 90999) return "TLA";
  if (n >= 91000 && n <= 95999) return "VER";
  if (n >= 97000 && n <= 97999) return "YUC";
  if (n >= 98000 && n <= 99999) return "ZAC";
  return "MEX";
}

function normalizeCp(value: unknown, fallback = "00000"): string {
  return String(value ?? "").match(/\d{5}/)?.[0] ?? fallback;
}

function numericFolioFromReceipt(receipt: any, period: any, emp: any): number {
  const employeeDigits = String(emp?.numero ?? "").replace(/\D/g, "").slice(-4).padStart(4, "0");
  const receiptDigits = String(receipt?.id ?? "").replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  const periodNumber = String(period?.numero ?? "0").replace(/\D/g, "").slice(-4).padStart(4, "0");
  return Number(`${periodNumber}${employeeDigits}${receiptDigits}`);
}

async function getApiKey(orgId: string): Promise<{ key: string; environment: "test" | "live" }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("org_billing_config")
    .select("environment, facturapi_test_key, facturapi_live_key")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Esta organización no tiene configurada la integración con FacturAPI.");
  const env = data.environment as "test" | "live";
  const key = env === "test" ? data.facturapi_test_key : data.facturapi_live_key;
  if (!key) throw new Error(`No hay llave de FacturAPI configurada para el ambiente "${env}".`);
  return { key, environment: env };
}

async function callFacturapi(key: string, path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${FACTURAPI_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try { msg = JSON.parse(text).message ?? text; } catch {}
    throw new Error(`FacturAPI ${res.status}: ${msg}`);
  }
  return text ? JSON.parse(text) : null;
}

async function downloadFile(key: string, path: string): Promise<ArrayBuffer> {
  const res = await fetch(`${FACTURAPI_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`FacturAPI download ${res.status}`);
  return res.arrayBuffer();
}

async function assertCanStamp(supabase: any, orgId: string, userId: string) {
  const { data, error } = await supabase.rpc("has_org_role", {
    _org: orgId,
    _user: userId,
    _roles: ["owner", "admin", "nomina", "contador"],
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No tienes permiso para timbrar en esta organización.");
}

export const listReceiptStamps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ periodId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: receipts } = await context.supabase
      .from("payroll_receipts")
      .select("id")
      .eq("payroll_period_id", data.periodId);
    const ids = (receipts ?? []).map((r: any) => r.id);
    if (!ids.length) return [] as any[];
    const { data: stamps, error } = await (context.supabase as any)
      .from("cfdi_stamps")
      .select("id, reference_id, uuid_sat, estatus, ambiente, error_message, created_at, xml_path, pdf_path")
      .eq("kind", "nomina")
      .in("reference_id", ids)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return stamps ?? [];
  });

export const stampPayrollReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ receiptId: z.string().uuid(), force: z.boolean().optional().default(false) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return stampPayrollReceiptInternal({ receiptId: data.receiptId, supabase, supabaseAdmin, userId, forceStamp: data.force });
  });

export const stampPayrollPeriodBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      periodId: z.string().uuid(),
      limit: z.number().int().min(1).max(6).default(4),
      excludeReceiptIds: z.array(z.string().uuid()).optional().default([]),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: period, error: periodError } = await supabaseAdmin
      .from("payroll_periods")
      .select("id, organization_id")
      .eq("id", data.periodId)
      .single();
    if (periodError || !period) throw new Error(periodError?.message ?? "Periodo no encontrado");

    await assertCanStamp(supabase, period.organization_id, userId);
    const apiKeyInfo = await getApiKey(period.organization_id);

    const { data: receipts, error: receiptsError } = await supabaseAdmin
      .from("payroll_receipts")
      .select("id, employee:employees(numero, nombre, apellido_paterno)")
      .eq("payroll_period_id", data.periodId)
      .order("created_at");
    if (receiptsError) throw new Error(receiptsError.message);

    const receiptIds = (receipts ?? []).map((r: any) => r.id);
    if (!receiptIds.length) return { processed: 0, stamped: 0, errors: [], results: [], remainingPending: 0 };

    const { data: alreadyStamped } = await (supabaseAdmin as any)
      .from("cfdi_stamps")
      .select("reference_id")
      .eq("kind", "nomina")
      .eq("estatus", "timbrado")
      .eq("ambiente", apiKeyInfo.environment)
      .in("reference_id", receiptIds);
    const stampedIds = new Set((alreadyStamped ?? []).map((s: any) => s.reference_id));
    const excluded = new Set(data.excludeReceiptIds);
    const pending = (receipts ?? []).filter((r: any) => !stampedIds.has(r.id) && !excluded.has(r.id));
    const target = pending.slice(0, data.limit);
    const results: Array<{ receiptId: string; ok: boolean; alreadyStamped?: boolean; uuid?: string; employee?: string; error?: string }> = [];

    for (const receipt of target) {
      const emp = (receipt as any).employee;
      const employee = [emp?.numero, emp?.nombre, emp?.apellido_paterno].filter(Boolean).join(" · ") || receipt.id.slice(0, 8);
      try {
        const res = await stampPayrollReceiptInternal({ receiptId: receipt.id, supabase, supabaseAdmin, userId, apiKeyInfo, skipPermissionCheck: true });
        results.push({ receiptId: receipt.id, ok: true, alreadyStamped: res.alreadyStamped, uuid: res.uuid, employee });
      } catch (e: any) {
        results.push({ receiptId: receipt.id, ok: false, employee, error: e?.message ?? "Error al timbrar" });
      }
    }

    return {
      processed: results.length,
      stamped: results.filter((r) => r.ok).length,
      errors: results.filter((r) => !r.ok),
      results,
      remainingPending: Math.max(0, pending.length - target.length),
    };
  });

async function stampPayrollReceiptInternal({
  receiptId,
  supabase,
  supabaseAdmin,
  userId,
  apiKeyInfo,
  skipPermissionCheck = false,
  forceStamp = false,
}: {
  receiptId: string;
  supabase: any;
  supabaseAdmin: any;
  userId: string;
  apiKeyInfo?: { key: string; environment: "test" | "live" };
  skipPermissionCheck?: boolean;
  forceStamp?: boolean;
}) {

    // 1) Cargar recibo + empleado + periodo + organización
    const { data: receipt, error: re } = await supabaseAdmin
      .from("payroll_receipts")
      .select(`
        *,
        employee:employees(*),
        period:payroll_periods(*),
        organization:organizations(rfc, razon_social, regimen_fiscal, codigo_postal),
        lines:payroll_receipt_lines(concepto_clave, descripcion, tipo, importe_gravado, importe_exento)
      `)
      .eq("id", receiptId)
      .single();
    if (re || !receipt) throw new Error(re?.message ?? "Recibo no encontrado");

    if (!skipPermissionCheck) await assertCanStamp(supabase, receipt.organization_id, userId);

    const { key, environment } = apiKeyInfo ?? (await getApiKey(receipt.organization_id));

    // 2) Evitar duplicado timbrado en el MISMO ambiente
    //    (un timbre de prueba no bloquea el timbrado real en live)
    const { data: existing } = await (supabaseAdmin as any)
      .from("cfdi_stamps")
      .select("id, uuid_sat, estatus, ambiente")
      .eq("reference_id", receiptId)
      .eq("kind", "nomina")
      .eq("estatus", "timbrado")
      .eq("ambiente", environment)
      .maybeSingle();
    if (existing && !forceStamp) {
      return { ok: true, alreadyStamped: true, uuid: existing.uuid_sat };
    }

    const emp = receipt.employee;
    const period = receipt.period;
    const org = receipt.organization;

    if (!emp?.rfc) throw new Error(`El empleado ${emp?.nombre ?? ""} no tiene RFC`);
    if (!emp?.curp) throw new Error(`El empleado ${emp?.nombre ?? ""} no tiene CURP`);

    const fullName = [emp.nombre, emp.apellido_paterno, emp.apellido_materno]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    // Para nómina, SAT exige RFC real del empleado con régimen 605, incluso en pruebas
    const isTest = false;
    const cpEmisor = normalizeCp(org.codigo_postal);
    const cpReceptor = normalizeCp((emp as any).cp_fiscal, cpEmisor);

    // 3) Mapear percepciones y deducciones (esquema FacturAPI v2 - español)
    const percepcionesArr = (receipt.lines ?? [])
      .filter((l: any) => l.tipo === "percepcion")
      .map((l: any) => ({
        tipo_percepcion: l.concepto_clave || "001",
        clave: l.concepto_clave || "001",
        importe_gravado: Number(l.importe_gravado || 0),
        importe_exento: Number(l.importe_exento || 0),
      }));

    if (!percepcionesArr.length) {
      percepcionesArr.push({
        tipo_percepcion: "001",
        clave: "001",
        importe_gravado: Number(receipt.total_gravado || receipt.total_percepciones || 0),
        importe_exento: Number(receipt.total_exento || 0),
      });
    }

    const deduccionesArr = (receipt.lines ?? [])
      .filter((l: any) => l.tipo === "deduccion")
      .map((l: any) => ({
        tipo_deduccion: l.concepto_clave || "002",
        clave: l.concepto_clave || "002",
        importe: Number(l.importe_gravado || 0) + Number(l.importe_exento || 0),
      }))
      .filter((d: any) => d.importe > 0);


    const totalGravado = percepcionesArr.reduce((s: number, p: any) => s + p.importe_gravado, 0);
    const totalExento = percepcionesArr.reduce((s: number, p: any) => s + p.importe_exento, 0);
    const totalSueldos = totalGravado + totalExento;

    const isrDed = deduccionesArr.filter((d: any) => d.tipo_deduccion === "002");
    const otrasDed = deduccionesArr.filter((d: any) => d.tipo_deduccion !== "002");
    const totalImpRet = isrDed.reduce((s: number, d: any) => s + d.importe, 0);
    const totalOtrasDed = otrasDed.reduce((s: number, d: any) => s + d.importe, 0);

    const total = Number(receipt.neto_pagar ?? receipt.total_percepciones ?? totalSueldos);
    const subsidio = Math.max(0, Number(receipt.subsidio || 0));

    // 4) Armar payload FacturAPI
    const rfcReceptor = isTest ? "XAXX010101000" : emp.rfc.toUpperCase().trim();
    if (rfcReceptor.length !== 13) {
      throw new Error(`El RFC del empleado debe tener 13 caracteres (persona física). Actual: "${rfcReceptor}" (${rfcReceptor.length}).`);
    }

    const payload: any = {
      type: "N",
      customer: {
        legal_name: isTest ? "PUBLICO EN GENERAL" : fullName.toUpperCase(),
        tax_id: rfcReceptor,
        tax_system: "605",
        address: { country: "MEX", zip: cpReceptor },
      },
      use: "CN01",
      payment_form: "99",
      payment_method: "PUE",
      folio_number: numericFolioFromReceipt(receipt, period, emp),
      complements: [
        {
          type: "nomina",
          data: {
            tipo_nomina: "O",
            fecha_pago: period.fecha_pago,
            fecha_inicial_pago: period.fecha_inicio,
            fecha_final_pago: period.fecha_fin,
            num_dias_pagados: Number(receipt.dias_pagados || period.dias),
            emisor: {
              registro_patronal: (org as any).registro_patronal || "C6767873105",
            },
            receptor: {
              curp: emp.curp,
              num_seguridad_social: emp.nss || "00000000000",
              fecha_inicio_rel_laboral: emp.fecha_alta,
              tipo_contrato: "01",
              tipo_regimen: "02",
              sindicalizado: false,
              tipo_jornada: "01",
              periodicidad_pago: FREQ_SAT[period.periodicidad] || "04",
              departamento: emp.departamento || undefined,
              puesto: emp.puesto || undefined,
              riesgo_puesto: "1",
              salario_base_cot_apor: Number(emp.sdi),
              salario_diario_integrado: Number(emp.sdi),
              clave_ent_fed: estadoFromCP(cpReceptor),
              num_empleado: emp.numero || receipt.id.slice(0, 8),
            },
            percepciones: { percepcion: percepcionesArr },
            deducciones: deduccionesArr.length ? deduccionesArr : undefined,
            otros_pagos: [
              {
                tipo_otro_pago: "002",
                clave: "002",
                concepto: "Subsidio para el empleo",
                importe: subsidio,
                subsidio_causado: subsidio,
              },
            ],
          },
        },
      ],
    };

    // 5) Llamar a FacturAPI
    let stampedResp: any;
    try {
      stampedResp = await callFacturapi(key, "/invoices", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (err) {
      const msg = `${(err as Error).message} | Datos enviados receptor: ${fullName.toUpperCase()} · RFC ${rfcReceptor} · CP ${cpReceptor} · Régimen 605`;
      await (supabaseAdmin as any).from("cfdi_stamps").insert({
        organization_id: receipt.organization_id,
        kind: "nomina",
        reference_id: receipt.id,
        ambiente: environment,
        estatus: "error",
        error_message: msg,
        payload,
        timbrado_por: userId,
      });
      throw new Error(msg);
    }

    const fapiId: string = stampedResp.id;
    const uuid: string = stampedResp.uuid;
    const serie: string | undefined = stampedResp.series;
    const folio: string | undefined = String(stampedResp.folio_number ?? "");
    const fecha: string | undefined = stampedResp.date;

    // 6) Descargar XML y PDF y subir a Storage
    let xmlPath: string | null = null;
    let pdfPath: string | null = null;
    try {
      const xml = await downloadFile(key, `/invoices/${fapiId}/xml`);
      const pdf = await downloadFile(key, `/invoices/${fapiId}/pdf`);
      const base = `${receipt.organization_id}/${period.id}/${receipt.id}_${uuid}`;
      const xmlUp = await supabaseAdmin.storage.from("cfdi-xml").upload(`${base}.xml`, new Uint8Array(xml), {
        contentType: "application/xml", upsert: true,
      });
      if (!xmlUp.error) xmlPath = xmlUp.data.path;
      const pdfUp = await supabaseAdmin.storage.from("cfdi-pdf").upload(`${base}.pdf`, new Uint8Array(pdf), {
        contentType: "application/pdf", upsert: true,
      });
      if (!pdfUp.error) pdfPath = pdfUp.data.path;
    } catch (e) {
      // No-fatal: ya está timbrado, solo log
      console.warn("No se pudo guardar XML/PDF en storage:", e);
    }

    await (supabaseAdmin as any).from("cfdi_stamps").insert({
      organization_id: receipt.organization_id,
      kind: "nomina",
      reference_id: receipt.id,
      facturapi_id: fapiId,
      uuid_sat: uuid,
      serie,
      folio,
      fecha_timbrado: fecha,
      xml_path: xmlPath,
      pdf_path: pdfPath,
      ambiente: environment,
      estatus: "timbrado",
      payload,
      total,
      timbrado_por: userId,
    });

    return { ok: true, uuid, facturapi_id: fapiId, ambiente: environment };
}

export const cancelCfdiStamp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      stampId: z.string().uuid(),
      motive: z.enum(["01", "02", "03", "04"]).default("02"),
      substitution: z.string().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: stamp, error } = await (supabaseAdmin as any)
      .from("cfdi_stamps")
      .select("*")
      .eq("id", data.stampId)
      .single();
    if (error || !stamp) throw new Error("Timbrado no encontrado");
    await assertCanStamp(supabase, stamp.organization_id, userId);
    if (stamp.estatus !== "timbrado") throw new Error(`El CFDI no está timbrado (estatus: ${stamp.estatus}).`);
    if (!stamp.facturapi_id) throw new Error("No hay folio FacturAPI asociado al timbre.");
    const { key } = await getApiKey(stamp.organization_id);
    const params = new URLSearchParams({ motive: data.motive });
    if (data.substitution) params.set("substitution", data.substitution);
    const res = await fetch(`${FACTURAPI_BASE}/invoices/${stamp.facturapi_id}?${params.toString()}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}` },
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = text;
      try { msg = JSON.parse(text).message ?? text; } catch {}
      throw new Error(`FacturAPI cancel ${res.status}: ${msg}`);
    }
    let parsed: any = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch {}
    await (supabaseAdmin as any)
      .from("cfdi_stamps")
      .update({
        estatus: "cancelado",
        error_message: `Cancelado · motivo ${data.motive}${parsed?.status ? ` · ${parsed.status}` : ""}`,
      })
      .eq("id", stamp.id);
    return { ok: true, status: parsed?.status ?? "canceled", uuid: stamp.uuid_sat };
  });

export const getCfdiDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      stampId: z.string().uuid(),
      kind: z.enum(["xml", "pdf"]),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: stamp, error } = await admin
      .from("cfdi_stamps")
      .select("organization_id, xml_path, pdf_path")
      .eq("id", data.stampId)
      .single();
    if (error || !stamp) throw new Error("Timbrado no encontrado");
    const { data: ok } = await context.supabase.rpc("is_org_member", {
      _org: stamp.organization_id, _user: context.userId,
    });
    if (!ok) throw new Error("Sin acceso");
    const path = data.kind === "xml" ? stamp.xml_path : stamp.pdf_path;
    if (!path) throw new Error(`Archivo ${data.kind.toUpperCase()} no disponible`);
    const bucket = data.kind === "xml" ? "cfdi-xml" : "cfdi-pdf";
    const { data: signed, error: se } = await admin.storage.from(bucket).createSignedUrl(path, 300);
    if (se || !signed?.signedUrl) throw new Error(se?.message ?? "Error al generar enlace de descarga");
    const resp = await fetch(signed.signedUrl);
    if (!resp.ok) throw new Error("Error al descargar el archivo del almacenamiento");
    const buffer = await resp.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mime = data.kind === "xml" ? "application/xml" : "application/pdf";
    return { base64, mime, filename: `${data.stampId.slice(0, 8)}.${data.kind}` };
  });

// =====================================================================
// Conciliación con FacturAPI: verifica si los recibos del periodo están
// realmente timbrados en FacturAPI y compara totales contra el cálculo
// actual local. Si encuentra un CFDI vigente en FacturAPI sin registro
// local en cfdi_stamps, lo importa para poder operarlo (cancelar / descargar).
// =====================================================================
export const reconcilePeriodWithFacturapi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ periodId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: period, error: pe } = await supabaseAdmin
      .from("payroll_periods")
      .select("id, organization_id, fecha_inicio, fecha_fin")
      .eq("id", data.periodId)
      .single();
    if (pe || !period) throw new Error(pe?.message ?? "Periodo no encontrado");

    await assertCanStamp(supabase, period.organization_id, userId);
    const { key, environment } = await getApiKey(period.organization_id);

    const { data: receipts, error: re } = await supabaseAdmin
      .from("payroll_receipts")
      .select("id, employee_id, total_percepciones, total_deducciones, neto_pagar, subsidio, employee:employees(numero, nombre, apellido_paterno, apellido_materno, rfc)")
      .eq("payroll_period_id", data.periodId);
    if (re) throw new Error(re.message);
    const recList = receipts ?? [];
    if (!recList.length) return { results: [] as any[] };

    const ids = recList.map((r: any) => r.id);
    const { data: stamps } = await (supabaseAdmin as any)
      .from("cfdi_stamps")
      .select("id, reference_id, facturapi_id, uuid_sat, estatus, ambiente, total, created_at")
      .eq("kind", "nomina")
      .in("reference_id", ids)
      .order("created_at", { ascending: false });

    const stampByRec = new Map<string, any>();
    (stamps ?? []).forEach((s: any) => {
      if (!stampByRec.has(s.reference_id)) stampByRec.set(s.reference_id, s);
    });

    const results: any[] = [];
    for (const r of recList as any[]) {
      const folio = r.id.slice(0, 8);
      const localStamp = stampByRec.get(r.id);
      let invoice: any = null;

      try {
        if (localStamp?.facturapi_id) {
          // Verificar el CFDI ya enlazado
          try {
            invoice = await callFacturapi(key, `/invoices/${localStamp.facturapi_id}`);
          } catch {/* no existe */}
        }
        if (!invoice) {
          // Buscar por RFC + rango de fechas del periodo (folio_number en FacturAPI debe ser numérico,
          // pero nuestros folios son prefijos de UUID alfanuméricos, así que no podemos filtrar por folio).
          const rfc = (r.employee?.rfc ?? "").toUpperCase();
          if (rfc) {
            const start = new Date(period.fecha_inicio + "T00:00:00");
            const end = new Date(period.fecha_fin + "T23:59:59");
            // Margen de ±3 días por si el timbrado ocurrió fuera del rango exacto
            start.setDate(start.getDate() - 3);
            end.setDate(end.getDate() + 3);
            const params = new URLSearchParams({
              type: "N",
              q: rfc,
              "date[gt]": start.toISOString(),
              "date[lt]": end.toISOString(),
              limit: "25",
            });
            const search = await callFacturapi(key, `/invoices?${params.toString()}`);
            const candidates = (search?.data ?? []).filter((inv: any) =>
              inv.status !== "canceled" &&
              (inv.customer?.tax_id ?? "").toUpperCase() === rfc
            );
            // Preferir match exacto de total (FacturAPI devuelve el NETO en CFDI de nómina)
            const totalActual = Number(r.neto_pagar ?? 0);
            invoice =
              candidates.find((inv: any) => Math.abs(Number(inv.total ?? 0) - totalActual) < 0.01) ??
              candidates[0] ??
              null;

          }
        }
      } catch (e: any) {
        results.push({
          receiptId: r.id,
          employee: [r.employee?.numero, r.employee?.nombre, r.employee?.apellido_paterno].filter(Boolean).join(" "),
          rfc: r.employee?.rfc,
          neto_actual: Number(r.neto_pagar),
          total_actual: Number(r.total_percepciones),
          total_facturapi: null,
          uuid: localStamp?.uuid_sat ?? null,
          facturapi_id: localStamp?.facturapi_id ?? null,
          stampId: localStamp?.id ?? null,
          status: "error",
          diff: 0,
          message: e?.message ?? "Error consultando FacturAPI",
        });
        continue;
      }

      if (!invoice) {
        results.push({
          receiptId: r.id,
          employee: [r.employee?.numero, r.employee?.nombre, r.employee?.apellido_paterno].filter(Boolean).join(" "),
          rfc: r.employee?.rfc,
          neto_actual: Number(r.neto_pagar),
          total_actual: Number(r.total_percepciones),
          total_facturapi: null,
          uuid: null,
          facturapi_id: null,
          stampId: localStamp?.id ?? null,
          status: "no_stamp",
          diff: 0,
        });
        continue;
      }

      const totalFapi = Number(invoice.total ?? 0);
      // En CFDI de nómina, el "total" SAT/FacturAPI corresponde al NETO a pagar
      const totalActual = Number(r.neto_pagar ?? 0);
      const diff = Number((totalFapi - totalActual).toFixed(2));


      // Importar si no existe localmente
      let stampId = localStamp?.id ?? null;
      if (!localStamp || !localStamp.facturapi_id) {
        const ins = await (supabaseAdmin as any).from("cfdi_stamps").insert({
          organization_id: period.organization_id,
          kind: "nomina",
          reference_id: r.id,
          facturapi_id: invoice.id,
          uuid_sat: invoice.uuid,
          serie: invoice.series ?? null,
          folio: String(invoice.folio_number ?? ""),
          fecha_timbrado: invoice.date ?? null,
          ambiente: environment,
          estatus: invoice.status === "canceled" ? "cancelado" : "timbrado",
          total: totalFapi,
          timbrado_por: userId,
        }).select("id").single();
        if (!ins.error) stampId = ins.data.id;
      }

      results.push({
        receiptId: r.id,
        employee: [r.employee?.numero, r.employee?.nombre, r.employee?.apellido_paterno].filter(Boolean).join(" "),
        rfc: r.employee?.rfc,
        neto_actual: Number(r.neto_pagar),
        total_actual: totalActual,
        total_facturapi: totalFapi,
        uuid: invoice.uuid,
        facturapi_id: invoice.id,
        stampId,
        status: Math.abs(diff) <= 0.02 ? "match" : "diff",
        diff,
      });
    }

    return { results };
  });

// =====================================================================
// Lista los CFDIs de nómina emitidos en FacturAPI dentro del rango del
// periodo (independientemente de si están enlazados localmente o no).
// =====================================================================
export const listFacturapiPeriodInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ periodId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: period, error: pe } = await supabaseAdmin
      .from("payroll_periods")
      .select("id, organization_id, fecha_inicio, fecha_fin")
      .eq("id", data.periodId)
      .single();
    if (pe || !period) throw new Error(pe?.message ?? "Periodo no encontrado");
    await assertCanStamp(supabase, period.organization_id, userId);
    const { key } = await getApiKey(period.organization_id);

    const start = new Date(period.fecha_inicio + "T00:00:00");
    const end = new Date(period.fecha_fin + "T23:59:59");
    start.setDate(start.getDate() - 3);
    end.setDate(end.getDate() + 3);

    const all: any[] = [];
    let page = 1;
    while (page <= 20) {
      const params = new URLSearchParams({
        type: "N",
        "date[gt]": start.toISOString(),
        "date[lt]": end.toISOString(),
        limit: "50",
        page: String(page),
      });
      const res = await callFacturapi(key, `/invoices?${params.toString()}`);
      const items = res?.data ?? [];
      all.push(...items);
      const totalPages = Number(res?.total_pages ?? 1);
      if (page >= totalPages || items.length === 0) break;
      page++;
    }

    // Enlazar con stamps locales para localizar receipt
    const fapiIds = all.map((i: any) => i.id).filter(Boolean);
    let stampsByFapi = new Map<string, any>();
    if (fapiIds.length) {
      const { data: stamps } = await (supabaseAdmin as any)
        .from("cfdi_stamps")
        .select("id, facturapi_id, reference_id, estatus, error_message")
        .in("facturapi_id", fapiIds);
      (stamps ?? []).forEach((s: any) => stampsByFapi.set(s.facturapi_id, s));
    }

    // Traer periodo de cada receipt vinculado
    const receiptIds = Array.from(new Set(
      Array.from(stampsByFapi.values()).map((s: any) => s.reference_id).filter(Boolean),
    ));
    let periodByReceipt = new Map<string, { numero: number; ejercicio: number }>();
    if (receiptIds.length) {
      const { data: rows } = await (supabaseAdmin as any)
        .from("payroll_receipts")
        .select("id, period_id, payroll_periods(numero, ejercicio)")
        .in("id", receiptIds);
      (rows ?? []).forEach((r: any) => {
        if (r.period_id && r.payroll_periods) {
          periodByReceipt.set(r.id, { numero: r.payroll_periods.numero, ejercicio: r.payroll_periods.ejercicio });
        }
      });
    }

    return {
      invoices: all.map((inv: any) => {
        const s = stampsByFapi.get(inv.id);
        const period = s?.reference_id ? periodByReceipt.get(s.reference_id) : null;
        return {
          facturapi_id: inv.id,
          uuid: inv.uuid,
          folio: inv.folio_number,
          serie: inv.series,
          date: inv.date,
          status: inv.status, // valid | canceled | pending_cancelation
          cancellation_status: inv.cancellation_status ?? null,
          total: Number(inv.total ?? 0),
          customer_name: inv.customer?.legal_name,
          customer_rfc: inv.customer?.tax_id,
          stampId: s?.id ?? null,
          receiptId: s?.reference_id ?? null,
          localStatus: s?.estatus ?? null,
          periodNumber: period?.numero ?? null,
          periodYear: period?.ejercicio ?? null,
        };
      }).sort((a, b) => (a.customer_name ?? "").localeCompare(b.customer_name ?? "")),
    };
  });

// =====================================================================
// Descarga el acuse de cancelación (XML o PDF) desde FacturAPI.
// Devuelve base64 para que el cliente lo descargue.
// =====================================================================
export const getCancellationReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      facturapiId: z.string().min(1),
      kind: z.enum(["xml", "pdf"]),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanStamp(supabase, data.organizationId, userId);
    const { key } = await getApiKey(data.organizationId);

    // 1) Verifica el estado en FacturAPI primero para dar feedback claro.
    const invRes = await fetch(`${FACTURAPI_BASE}/invoices/${data.facturapiId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!invRes.ok) {
      const text = await invRes.text().catch(() => "");
      throw new Error(`FacturAPI invoice ${invRes.status}: ${text}`);
    }
    const inv: any = await invRes.json().catch(() => ({}));
    const cstatus: string = inv?.cancellation_status ?? inv?.status ?? "";

    // 2) Intenta descargar el acuse con reintentos (SAT puede tardar unos segundos
    //    aun cuando la web de FacturAPI ya lo muestre — su UI hace polling interno).
    const url = `${FACTURAPI_BASE}/invoices/${data.facturapiId}/cancellation_receipt/${data.kind}`;
    let res: Response | null = null;
    let lastDetail = "";
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
      if (res.ok) break;
      if (res.status !== 404 && res.status !== 400) break;
      lastDetail = await res.text().catch(() => "");
      // backoff: 1.5s, 3s, 4.5s
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    if (!res || (!res.ok && (res.status === 404 || res.status === 400))) {
      return {
        notReady: true as const,
        message:
          `El SAT aún no expone el acuse (estatus FacturAPI: ${cstatus || "desconocido"}). ` +
          `Intenta de nuevo en 1-2 minutos.${lastDetail ? ` Detalle: ${lastDetail.slice(0, 200)}` : ""}`,
      };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`FacturAPI download ${res.status}: ${text}`);
    }

    const buf = await res.arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const base64 = btoa(bin);
    return {
      notReady: false as const,
      base64,
      filename: `acuse_${data.facturapiId}.${data.kind}`,
      mime: data.kind === "xml" ? "application/xml" : "application/pdf",
    };
  });


// =====================================================================
// Cancela un CFDI directamente por su facturapi_id (no requiere stamp local).
// Usado desde el visor de CFDIs sincronizados con FacturAPI.
// =====================================================================
export const cancelFacturapiInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      facturapiId: z.string().min(1),
      motive: z.enum(["01", "02", "03", "04"]).default("02"),
      substitution: z.string().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanStamp(supabase, data.organizationId, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { key } = await getApiKey(data.organizationId);
    const params = new URLSearchParams({ motive: data.motive });
    if (data.substitution) params.set("substitution", data.substitution);
    const res = await fetch(`${FACTURAPI_BASE}/invoices/${data.facturapiId}?${params.toString()}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}` },
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = text;
      try { msg = JSON.parse(text).message ?? text; } catch {}
      // Idempotente: si ya está cancelada, reflejarlo localmente y devolver ok
      if (res.status === 409 && /cancel/i.test(msg)) {
        await (supabaseAdmin as any)
          .from("cfdi_stamps")
          .update({ estatus: "cancelado", error_message: "Ya cancelada en FacturAPI" })
          .eq("facturapi_id", data.facturapiId);
        return { ok: true, status: "canceled", alreadyCanceled: true };
      }
      throw new Error(`FacturAPI cancel ${res.status}: ${msg}`);
    }
    let parsed: any = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch {}
    // Refleja en stamp local si existe
    await (supabaseAdmin as any)
      .from("cfdi_stamps")
      .update({
        estatus: "cancelado",
        error_message: `Cancelado · motivo ${data.motive}${parsed?.status ? ` · ${parsed.status}` : ""}`,
      })
      .eq("facturapi_id", data.facturapiId);
    return { ok: true, status: parsed?.status ?? "canceled" };
  });


