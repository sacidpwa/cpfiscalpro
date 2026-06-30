import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FACTURAPI_BASE = "https://www.facturapi.io/v2";

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

async function assertWrite(supabase: any, userId: string, orgId: string) {
  const { data: canWrite } = await supabase.rpc("has_org_role", {
    _org: orgId,
    _user: userId,
    _roles: ["owner", "admin", "contador"],
  });
  if (!canWrite) throw new Error("Sin permiso en esta organización.");
}

async function saveFiles(orgId: string, kind: string, fapiId: string, uuid: string, key: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let xmlPath: string | null = null;
  let pdfPath: string | null = null;
  try {
    const xml = await downloadFile(key, `/invoices/${fapiId}/xml`);
    const pdf = await downloadFile(key, `/invoices/${fapiId}/pdf`);
    const base = `${orgId}/${kind}/${fapiId}_${uuid}`;
    const xu = await supabaseAdmin.storage.from("cfdi-xml").upload(`${base}.xml`, new Uint8Array(xml), { contentType: "application/xml", upsert: true });
    if (!xu.error) xmlPath = xu.data.path;
    const pu = await supabaseAdmin.storage.from("cfdi-pdf").upload(`${base}.pdf`, new Uint8Array(pdf), { contentType: "application/pdf", upsert: true });
    if (!pu.error) pdfPath = pu.data.path;
  } catch (e) { console.warn("save files", e); }
  return { xmlPath, pdfPath };
}

// ==================== VEHICLES ====================
export const listVehicles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("vehicles").select("*").eq("organization_id", data.organizationId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const vehicleSchema = z.object({
  id: z.string().uuid().optional(),
  organizationId: z.string().uuid(),
  alias: z.string().max(120).optional().nullable(),
  config_vehicular: z.string().min(2).max(10),
  placa_vm: z.string().min(1).max(20),
  anio_modelo: z.coerce.number().int().min(1950).max(2100),
  perm_sct: z.string().max(10).optional().nullable(),
  num_permiso_sct: z.string().max(60).optional().nullable(),
  peso_bruto_vehicular: z.coerce.number().min(0).optional().nullable(),
  asegura_resp_civil: z.string().max(200).optional().nullable(),
  poliza_resp_civil: z.string().max(60).optional().nullable(),
  tipo_remolque: z.string().max(10).optional().nullable(),
  placa_remolque: z.string().max(20).optional().nullable(),
});

export const upsertVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => vehicleSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertWrite(context.supabase, context.userId, data.organizationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, organizationId, ...rest } = data;
    const row = { organization_id: organizationId, ...rest };
    if (id) {
      const { error } = await (supabaseAdmin as any).from("vehicles").update(row).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }
    const { data: ins, error } = await (supabaseAdmin as any).from("vehicles").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: ins.id };
  });

export const deleteVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertWrite(context.supabase, context.userId, data.organizationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("vehicles").delete().eq("id", data.id).eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ==================== OPERATORS ====================
export const listOperators = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("operators").select("*").eq("organization_id", data.organizationId).order("nombre");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const operatorSchema = z.object({
  id: z.string().uuid().optional(),
  organizationId: z.string().uuid(),
  rfc: z.string().min(10).max(13),
  nombre: z.string().min(2).max(200),
  num_licencia: z.string().min(1).max(40),
  curp: z.string().max(18).optional().nullable(),
  residencia_fiscal: z.string().max(10).optional().nullable(),
  num_reg_id_trib: z.string().max(40).optional().nullable(),
});

export const upsertOperator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => operatorSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertWrite(context.supabase, context.userId, data.organizationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, organizationId, ...rest } = data;
    const row = { organization_id: organizationId, ...rest };
    if (id) {
      const { error } = await (supabaseAdmin as any).from("operators").update(row).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }
    const { data: ins, error } = await (supabaseAdmin as any).from("operators").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: ins.id };
  });

export const deleteOperator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertWrite(context.supabase, context.userId, data.organizationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("operators").delete().eq("id", data.id).eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ==================== LIST PPD INVOICES (origen para complemento de pago) ====================
export const listOriginInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("cfdi_stamps")
      .select("id, uuid_sat, serie, folio, fecha_timbrado, total, estatus, ambiente, payload, xml_path")
      .eq("organization_id", data.organizationId)
      .eq("kind", "ingreso")
      .eq("estatus", "timbrado")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    // Filtrar a PPD
    const ppd = (rows ?? []).filter((r: any) => (r.payload?.request?.payment_method ?? r.payload?.response?.payment_method) === "PPD");
    if (!ppd.some((r: any) => r.xml_path)) return ppd;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return Promise.all(ppd.map(async (r: any) => {
      if (!r.xml_path) return r;
      const xmlData = await getStoredXmlFiscalData(supabaseAdmin, r.xml_path);
      if (!xmlData?.subtotal && !xmlData?.total) return r;
      return {
        ...r,
        total: xmlData.total ?? r.total,
        payload: {
          ...(r.payload ?? {}),
          response: {
            ...(r.payload?.response ?? {}),
            subtotal: xmlData.subtotal ?? r.payload?.response?.subtotal,
            total: xmlData.total ?? r.payload?.response?.total,
          },
        },
      };
    }));
  });

// ==================== DELETE ORIGIN INVOICE ====================
export const deleteOriginInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertWrite(context.supabase, context.userId, data.organizationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("cfdi_stamps")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ==================== SYNC PPD FROM FACTURAPI ====================
export const syncOriginInvoicesFromFacturapi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertWrite(context.supabase, context.userId, data.organizationId);
    const { key, environment } = await getApiKey(data.organizationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let imported = 0;
    let updated = 0;
    let scanned = 0;
    let page = 1;
    const limit = 50;
    // Recorre hasta 10 páginas como tope de seguridad
    while (page <= 10) {
      const qs = new URLSearchParams({ type: "I", payment_method: "PPD", limit: String(limit), page: String(page) });
      const res: any = await callFacturapi(key, `/invoices?${qs.toString()}`);
      const items: any[] = res?.data ?? [];
      scanned += items.length;
      for (const inv of items) {
        const fapiId = inv.id as string;
        const uuid = (inv.uuid ?? "").toString().toUpperCase();
        if (!uuid) continue;
        // ¿Ya existe?
        const { data: existing } = await (supabaseAdmin as any)
          .from("cfdi_stamps")
          .select("id")
          .eq("organization_id", data.organizationId)
          .eq("kind", "ingreso")
          .eq("uuid_sat", uuid)
          .maybeSingle();
        const row = {
          organization_id: data.organizationId,
          kind: "ingreso",
          estatus: "timbrado",
          ambiente: environment,
          facturapi_id: fapiId,
          uuid_sat: uuid,
          serie: inv.series ?? null,
          folio: inv.folio_number != null ? String(inv.folio_number) : null,
          fecha_timbrado: inv.stamp?.date ?? inv.date ?? null,
          total: inv.total ?? null,
          payload: { imported: true, response: inv },
        };
        if (existing?.id) {
          await (supabaseAdmin as any).from("cfdi_stamps").update(row).eq("id", existing.id);
          updated++;
        } else {
          await (supabaseAdmin as any).from("cfdi_stamps").insert({ ...row, reference_id: crypto.randomUUID() });
          imported++;
        }
      }
      if (items.length < limit) break;
      page++;
    }
    return { ok: true, imported, updated, scanned };
  });

// ==================== IMPORT ORIGIN INVOICES FROM XML (SAT) ====================
function getAttr(xml: string, tagRegex: RegExp, attr: string): string | null {
  const m = xml.match(tagRegex);
  if (!m) return null;
  const a = new RegExp(`(?:^|\\s)${attr}="([^"]*)"`, "i").exec(m[0]);
  return a ? a[1] : null;
}

async function getStoredXmlFiscalData(supabaseAdmin: any, xmlPath?: string | null) {
  if (!xmlPath) return null;
  try {
    const { data, error } = await supabaseAdmin.storage.from("cfdi-xml").download(xmlPath);
    if (error || !data) return null;
    const xml = await data.text();
    const compTag = /<(?:\w+:)?Comprobante\b[^>]*>/i;
    const recTag = /<(?:\w+:)?Receptor\b[^>]*\/?>/i;
    return {
      legal_name: getAttr(xml, recTag, "Nombre"),
      tax_id: getAttr(xml, recTag, "Rfc"),
      tax_system: getAttr(xml, recTag, "RegimenFiscalReceptor"),
      uso_cfdi: getAttr(xml, recTag, "UsoCFDI"),
      zip: getAttr(xml, recTag, "DomicilioFiscalReceptor"),
      subtotal: parseFloat(getAttr(xml, compTag, "SubTotal") || "0") || null,
      total: parseFloat(getAttr(xml, compTag, "Total") || "0") || null,
    };
  } catch (e) {
    console.warn("read stored xml fiscal data", e);
    return null;
  }
}

export const importOriginInvoicesFromXml = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    files: z.array(z.object({
      name: z.string(),
      content: z.string().min(20).max(2_000_000),
    })).min(1).max(50),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertWrite(context.supabase, context.userId, data.organizationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let imported = 0, updated = 0, skipped = 0;
    const errors: string[] = [];

    for (const f of data.files) {
      try {
        const xml = f.content;
        const compTag = /<(?:\w+:)?Comprobante\b[^>]*>/i;
        const tfdTag = /<(?:\w+:)?TimbreFiscalDigital\b[^>]*\/?>/i;
        const recTag = /<(?:\w+:)?Receptor\b[^>]*\/?>/i;
        const emiTag = /<(?:\w+:)?Emisor\b[^>]*\/?>/i;

        const uuid = (getAttr(xml, tfdTag, "UUID") || "").toUpperCase();
        if (!uuid) { errors.push(`${f.name}: sin UUID (TimbreFiscalDigital)`); continue; }

        const tipo = getAttr(xml, compTag, "TipoDeComprobante") || "I";
        if (tipo.toUpperCase() !== "I") { skipped++; errors.push(`${f.name}: tipo ${tipo}, solo se importan Ingreso (I)`); continue; }

        const metodoPago = (getAttr(xml, compTag, "MetodoPago") || "").toUpperCase();
        if (metodoPago !== "PPD") { skipped++; errors.push(`${f.name}: MetodoPago ${metodoPago || "?"}, solo PPD`); continue; }

        const serie = getAttr(xml, compTag, "Serie");
        const folio = getAttr(xml, compTag, "Folio");
        const subtotal = parseFloat(getAttr(xml, compTag, "SubTotal") || "0") || null;
        const total = parseFloat(getAttr(xml, compTag, "Total") || "0") || null;
        const fechaTimbrado = getAttr(xml, tfdTag, "FechaTimbrado");
        const formaPago = getAttr(xml, compTag, "FormaPago");
        const moneda = getAttr(xml, compTag, "Moneda");
        const emisorRfc = getAttr(xml, emiTag, "Rfc");
        const receptorRfc = getAttr(xml, recTag, "Rfc");
        const receptorNombre = getAttr(xml, recTag, "Nombre");
        const usoCfdi = getAttr(xml, recTag, "UsoCFDI");
        const regimenFiscalReceptor = getAttr(xml, recTag, "RegimenFiscalReceptor");
        const zipReceptor = getAttr(xml, recTag, "DomicilioFiscalReceptor");

        const payload = {
          imported: true,
          source: "xml",
          filename: f.name,
          response: {
            uuid,
            type: "I",
            payment_method: "PPD",
            payment_form: formaPago,
            currency: moneda,
            subtotal,
            total,
            series: serie,
            folio_number: folio,
            date: fechaTimbrado,
            stamp: { date: fechaTimbrado },
            customer: {
              legal_name: receptorNombre,
              tax_id: receptorRfc,
              tax_system: regimenFiscalReceptor,
              use: usoCfdi,
              address: { country: "MEX", zip: zipReceptor ?? undefined },
            },
            issuer: { tax_id: emisorRfc },
          },
        };

        const { data: existing } = await (supabaseAdmin as any)
          .from("cfdi_stamps")
          .select("id")
          .eq("organization_id", data.organizationId)
          .eq("kind", "ingreso")
          .eq("uuid_sat", uuid)
          .maybeSingle();

        const row = {
          organization_id: data.organizationId,
          kind: "ingreso",
          estatus: "timbrado",
          ambiente: "live",
          uuid_sat: uuid,
          serie: serie,
          folio: folio,
          fecha_timbrado: fechaTimbrado,
          total,
          payload,
        };

        // Guarda el XML en storage
        const base = `${data.organizationId}/ingreso/import_${uuid}`;
        try {
          await supabaseAdmin.storage.from("cfdi-xml").upload(`${base}.xml`, new TextEncoder().encode(xml), { contentType: "application/xml", upsert: true });
        } catch {}

        if (existing?.id) {
          await (supabaseAdmin as any).from("cfdi_stamps").update({ ...row, xml_path: `${base}.xml` }).eq("id", existing.id);
          updated++;
        } else {
          await (supabaseAdmin as any).from("cfdi_stamps").insert({ ...row, reference_id: crypto.randomUUID(), xml_path: `${base}.xml` });
          imported++;
        }
      } catch (e: any) {
        errors.push(`${f.name}: ${e?.message ?? "error desconocido"}`);
      }
    }

    return { ok: true, imported, updated, skipped, errors };
  });

// ==================== STAMP PAYMENT COMPLEMENT ====================
const paymentRelationSchema = z.object({
  originStampId: z.string().uuid(),
  num_parcialidad: z.coerce.number().int().min(1).default(1),
  saldo_anterior: z.coerce.number().min(0),
  monto: z.coerce.number().positive(),
  saldo_insoluto: z.coerce.number().min(0),
});

const optionalZipSchema = z.preprocess(
  (v) => typeof v === "string" && v.trim() === "" ? undefined : v,
  z.string().regex(/^\d{5}$/).optional(),
);

const optionalTaxSystemSchema = z.preprocess(
  (v) => typeof v === "string" && v.trim() === "" ? undefined : v,
  z.string().regex(/^\d{3}$/).optional(),
);

const paymentSchema = z.object({
  organizationId: z.string().uuid(),
  fecha_pago: z.string(),
  forma_pago: z.string().min(2).max(2),
  moneda: z.string().min(3).max(3).default("MXN"),
  customer_zip: optionalZipSchema,
  customer_tax_system: optionalTaxSystemSchema,
  relations: z.array(paymentRelationSchema).min(1),
});

export const stampPaymentComplement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => paymentSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertWrite(context.supabase, context.userId, data.organizationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const ids = data.relations.map((r) => r.originStampId);
    const { data: origins, error: oe } = await (supabaseAdmin as any)
      .from("cfdi_stamps").select("*").in("id", ids);
    if (oe) throw new Error(oe.message);
    if (!origins || origins.length !== ids.length) throw new Error("Alguna factura origen no fue encontrada");
    for (const o of origins) {
      if (o.organization_id !== data.organizationId) throw new Error("Factura origen de otra organización");
      if (!o.uuid_sat) throw new Error("La factura origen no tiene UUID del SAT");
    }
    const byId = new Map<string, any>(origins.map((o: any) => [o.id, o]));
    const first: any = byId.get(ids[0]);
    const customer = first.payload?.response?.customer ?? first.payload?.customer;
    if (!customer) throw new Error("La factura origen no tiene datos del cliente");
    let xmlFiscalData = await getStoredXmlFiscalData(supabaseAdmin, first.xml_path);
    const originXmlData = new Map<string, Awaited<ReturnType<typeof getStoredXmlFiscalData>>>();
    if (first.xml_path) originXmlData.set(first.id, xmlFiscalData);
    for (const o of origins) {
      const c = o.payload?.response?.customer ?? o.payload?.customer;
      if (!c || c.tax_id !== customer.tax_id) {
        throw new Error("Todas las facturas deben ser del mismo cliente (RFC) para un mismo complemento de pago.");
      }
      if (o.xml_path && !originXmlData.has(o.id)) {
        const fiscalData = await getStoredXmlFiscalData(supabaseAdmin, o.xml_path);
        originXmlData.set(o.id, fiscalData);
        if (fiscalData?.zip) xmlFiscalData = fiscalData;
      } else if (!xmlFiscalData?.zip && originXmlData.get(o.id)?.zip) {
        xmlFiscalData = originXmlData.get(o.id) ?? null;
      }
    }

    const { key, environment } = await getApiKey(data.organizationId);
    const money = (n: number) => Math.round(Number(n) * 100) / 100;
    const validatedRelations = data.relations.map((r) => {
      const saldoAnterior = money(r.saldo_anterior);
      const monto = money(r.monto);
      if (saldoAnterior <= 0) throw new Error("El saldo anterior debe ser mayor a 0 para timbrar el complemento de pago.");
      if (monto <= 0) throw new Error("El monto pagado debe ser mayor a 0.");
      if (monto - saldoAnterior > 0.009) throw new Error("El monto pagado no puede ser mayor al saldo anterior.");
      return { ...r, saldo_anterior: saldoAnterior, monto, saldo_insoluto: money(saldoAnterior - monto) };
    });
    const totalPago = money(validatedRelations.reduce((s, r) => s + Number(r.monto), 0));

    // Fallback: si la dirección viene sin zip, buscar el cliente en la BD por RFC
    let custAddress = customer.address;
    let customerLegalName = customer.legal_name ?? xmlFiscalData?.legal_name;
    let customerTaxSystem = data.customer_tax_system ?? xmlFiscalData?.tax_system ?? customer.tax_system;
    if (!custAddress?.zip && xmlFiscalData?.zip) {
      custAddress = { country: customer.address?.country ?? "MEX", zip: xmlFiscalData.zip };
    }
    if (!custAddress?.zip && data.customer_zip) {
      custAddress = { country: customer.address?.country ?? "MEX", zip: data.customer_zip };
    }
    if (!custAddress?.zip) {
      const { data: dbCust } = await (supabaseAdmin as any)
        .from("customers").select("codigo_postal, pais, regimen_fiscal, razon_social")
        .eq("organization_id", data.organizationId)
        .eq("rfc", customer.tax_id)
        .maybeSingle();
      if (dbCust?.codigo_postal) custAddress = { country: dbCust.pais ?? "MEX", zip: dbCust.codigo_postal };
      if (!/^\d{3}$/.test(String(customerTaxSystem ?? "")) && dbCust?.regimen_fiscal) customerTaxSystem = dbCust.regimen_fiscal;
      if (!customerLegalName && dbCust?.razon_social) customerLegalName = dbCust.razon_social;
    }
    if (!custAddress?.zip) {
      throw new Error(`Falta el código postal fiscal del cliente ${customer.tax_id}. Captúralo en el complemento o agrégalo en Catálogo de Clientes.`);
    }
    if (!/^\d{3}$/.test(String(customerTaxSystem ?? ""))) {
      throw new Error(`Falta el régimen fiscal del cliente ${customer.tax_id}. Captúralo en el complemento o agrégalo en Catálogo de Clientes.`);
    }

    const payload: any = {
      type: "P",
      customer: {
        legal_name: customerLegalName,
        tax_id: customer.tax_id,
        tax_system: customerTaxSystem,
        email: customer.email ?? undefined,
        address: custAddress,
      },
      complements: [{
        type: "pago",
        data: [{
          payment_form: data.forma_pago,
          date: data.fecha_pago,
          currency: data.moneda,

          related_documents: validatedRelations.map((r) => {
            const o: any = byId.get(r.originStampId);
            const oResp = o.payload?.response ?? o.payload ?? {};
            const xmlAmounts = originXmlData.get(o.id);
            const oSubtotal = Number(xmlAmounts?.subtotal ?? oResp.subtotal ?? 0);
            const oTotal = Number(xmlAmounts?.total ?? oResp.total ?? o.total ?? 0);
            let rate = 0.16;
            if (oSubtotal > 0 && oTotal > 0) {
              const r2 = (oTotal - oSubtotal) / oSubtotal;
              rate = Math.round(r2 * 1000000) / 1000000;
              if (rate < 0) rate = 0;
            }
            const base = money(r.monto / (1 + rate));
            const taxAmount = money(r.monto - base);
            const taxes = rate > 0 ? [{
              base,
              type: "IVA",
              rate,
              factor: "Tasa",
              withholding: false,
            }] : [];

            return {
              uuid: o.uuid_sat,
              currency: data.moneda,
              amount: r.monto,
              last_balance: r.saldo_anterior,
              installment: r.num_parcialidad,
              taxability: "02",
              taxes,
            };

          }),
        }],
      }],
    };

    let resp: any;
    try {
      resp = await callFacturapi(key, "/invoices", { method: "POST", body: JSON.stringify(payload) });
    } catch (err) {
      const msg = (err as Error).message;
      await (supabaseAdmin as any).from("cfdi_stamps").insert({
        organization_id: data.organizationId,
        kind: "pago",
        reference_id: ids[0],
        ambiente: environment,
        estatus: "error",
        error_message: msg,
        payload,
        timbrado_por: context.userId,
      });
      throw new Error(msg);
    }

    const fapiId = resp.id;
    const uuid = resp.uuid;
    const { xmlPath, pdfPath } = await saveFiles(data.organizationId, "pago", fapiId, uuid, key);

    await (supabaseAdmin as any).from("cfdi_stamps").insert({
      organization_id: data.organizationId,
      kind: "pago",
      reference_id: ids[0],
      facturapi_id: fapiId,
      uuid_sat: uuid,
      serie: resp.series,
      folio: String(resp.folio_number ?? ""),
      fecha_timbrado: resp.date,
      xml_path: xmlPath,
      pdf_path: pdfPath,
      ambiente: environment,
      estatus: "timbrado",
      payload: { request: payload, response: resp, related_ids: ids },
      total: 0,
      timbrado_por: context.userId,
    });
    return { ok: true, uuid, facturapi_id: fapiId, related_ids: ids };
  });


// ==================== STAMP CARTA PORTE ====================
const ubicacionSchema = z.object({
  tipo_ubicacion: z.enum(["Origen", "Destino"]),
  rfc: z.string().min(10).max(13),
  nombre: z.string().min(2).max(200).optional(),
  fecha: z.string(),                            // ISO datetime salida/llegada
  distancia_recorrida: z.coerce.number().min(0).optional(),
  domicilio: z.object({
    calle: z.string().min(1).max(200),
    numero_exterior: z.string().max(20).optional(),
    colonia: z.string().min(1).max(100),
    municipio: z.string().min(1).max(100),
    estado: z.string().min(2).max(50),
    pais: z.string().min(3).max(3).default("MEX"),
    codigo_postal: z.string().min(5).max(5),
  }),
});

const mercanciaSchema = z.object({
  bienes_transp: z.string().min(2).max(10),     // ClaveProdServCP
  descripcion: z.string().min(2).max(500),
  cantidad: z.coerce.number().positive(),
  clave_unidad: z.string().min(2).max(5),
  peso_kg: z.coerce.number().positive(),
  material_peligroso: z.boolean().default(false),
  cve_material_peligroso: z.string().max(20).optional().nullable(),
  embalaje: z.string().max(20).optional().nullable(),
  valor_mercancia: z.coerce.number().min(0).optional(),
  moneda: z.string().min(3).max(3).default("MXN"),
  fraccion_arancelaria: z.string().max(20).optional().nullable(),
});

const cartaPorteSchema = z.object({
  organizationId: z.string().uuid(),
  cfdi_type: z.enum(["I", "T"]),                          // Ingreso o Traslado
  customer_id: z.string().uuid().optional(),               // requerido para I
  origin_stamp_id: z.string().uuid().optional(),           // factura ingreso origen para traslado complementario
  transp_internac: z.boolean().default(false),
  entrada_salida_merc: z.enum(["Entrada", "Salida"]).optional(),
  via_entrada_salida: z.string().max(10).optional(),
  pais_origen_destino: z.string().max(10).optional(),
  total_dist_rec: z.coerce.number().positive(),
  vehicle_id: z.string().uuid(),
  operator_id: z.string().uuid(),
  ubicaciones: z.array(ubicacionSchema).min(2),
  mercancias: z.array(mercanciaSchema).min(1),
  // Para tipo I: importe del servicio
  service_price: z.coerce.number().min(0).optional(),
  service_description: z.string().max(200).default("Servicio de transporte de carga"),
  service_product_key: z.string().min(2).max(10).default("78101800"),
  uso_cfdi: z.string().min(2).max(4).default("G03"),
  forma_pago: z.string().min(2).max(2).default("99"),
  metodo_pago: z.enum(["PUE", "PPD"]).default("PPD"),
});

export const stampCartaPorte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => cartaPorteSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertWrite(context.supabase, context.userId, data.organizationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Cliente (para tipo I)
    let customer: any = null;
    if (data.cfdi_type === "I") {
      if (!data.customer_id) throw new Error("Selecciona un cliente para CFDI Ingreso");
      const { data: c } = await supabaseAdmin.from("customers").select("*").eq("id", data.customer_id).single();
      if (!c || c.organization_id !== data.organizationId) throw new Error("Cliente inválido");
      customer = c;
    } else {
      // Traslado: emisor = receptor (emisor sin objeto de impuestos)
      const { data: org } = await supabaseAdmin.from("organizations").select("*").eq("id", data.organizationId).single();
      if (!org) throw new Error("Organización no encontrada");
      customer = {
        razon_social: org.razon_social,
        rfc: org.rfc,
        regimen_fiscal: org.regimen_fiscal,
        codigo_postal: (org as any).codigo_postal ?? "00000",
      };
    }

    // Vehículo y operador
    const { data: vehicle } = await (supabaseAdmin as any).from("vehicles").select("*").eq("id", data.vehicle_id).single();
    if (!vehicle || vehicle.organization_id !== data.organizationId) throw new Error("Vehículo inválido");
    const { data: operator } = await (supabaseAdmin as any).from("operators").select("*").eq("id", data.operator_id).single();
    if (!operator || operator.organization_id !== data.organizationId) throw new Error("Operador inválido");

    const { key, environment } = await getApiKey(data.organizationId);

    // Construir complemento
    const totalPeso = data.mercancias.reduce((s, m) => s + Number(m.peso_kg), 0);
    const numTotalMerc = data.mercancias.length;

    const cartaPorteComplement: any = {
      type: "carta_porte30",
      data: {
        transp_internac: data.transp_internac ? "Sí" : "No",
        total_dist_rec: data.total_dist_rec,
        ubicaciones: data.ubicaciones.map((u, idx) => ({
          tipo_ubicacion: u.tipo_ubicacion,
          id_ubicacion: u.tipo_ubicacion === "Origen" ? `OR${String(idx + 1).padStart(6, "0")}` : `DE${String(idx + 1).padStart(6, "0")}`,
          rfc_remitente_destinatario: u.rfc,
          nombre_remitente_destinatario: u.nombre,
          fecha_hora_salida_llegada: u.fecha,
          distancia_recorrida: u.distancia_recorrida ?? undefined,
          domicilio: {
            calle: u.domicilio.calle,
            numero_exterior: u.domicilio.numero_exterior,
            colonia: u.domicilio.colonia,
            municipio: u.domicilio.municipio,
            estado: u.domicilio.estado,
            pais: u.domicilio.pais,
            codigo_postal: u.domicilio.codigo_postal,
          },
        })),
        mercancias: {
          peso_bruto_total: totalPeso,
          unidad_peso: "KGM",
          num_total_mercancias: numTotalMerc,
          mercancia: data.mercancias.map((m) => ({
            bienes_transp: m.bienes_transp,
            descripcion: m.descripcion,
            cantidad: m.cantidad,
            clave_unidad: m.clave_unidad,
            peso_en_kg: m.peso_kg,
            material_peligroso: m.material_peligroso ? "Sí" : "No",
            cve_material_peligroso: m.cve_material_peligroso ?? undefined,
            embalaje: m.embalaje ?? undefined,
            valor_mercancia: m.valor_mercancia ?? undefined,
            moneda: m.moneda,
            fraccion_arancelaria: m.fraccion_arancelaria ?? undefined,
          })),
          autotransporte: {
            perm_sct: vehicle.perm_sct,
            num_permiso_sct: vehicle.num_permiso_sct,
            identificacion_vehicular: {
              config_vehicular: vehicle.config_vehicular,
              placa_vm: vehicle.placa_vm,
              anio_modelo_vm: vehicle.anio_modelo,
              peso_bruto_vehicular: vehicle.peso_bruto_vehicular ?? undefined,
            },
            seguros: {
              asegura_resp_civil: vehicle.asegura_resp_civil ?? undefined,
              poliza_resp_civil: vehicle.poliza_resp_civil ?? undefined,
            },
            remolques: vehicle.placa_remolque
              ? [{ sub_tipo_rem: vehicle.tipo_remolque ?? "CTR001", placa: vehicle.placa_remolque }]
              : undefined,
          },
        },
        figura_transporte: [{
          tipo_figura: "01",
          rfc_figura: operator.rfc,
          nombre_figura: operator.nombre,
          num_licencia: operator.num_licencia,
        }],
      },
    };

    if (data.transp_internac && data.entrada_salida_merc) {
      cartaPorteComplement.data.entrada_salida_merc = data.entrada_salida_merc;
      cartaPorteComplement.data.via_entrada_salida = data.via_entrada_salida;
      cartaPorteComplement.data.pais_origen_destino = data.pais_origen_destino;
    }

    // Items
    const items = data.cfdi_type === "I"
      ? [{
          quantity: 1,
          product: {
            description: data.service_description,
            product_key: data.service_product_key,
            unit_key: "E48",
            unit_name: "Unidad de servicio",
            price: data.service_price ?? 0,
            taxability: "02",
            taxes: [{ type: "IVA", rate: 0.16, withholding: false }],
            tax_included: false,
          },
        }]
      : data.mercancias.map((m) => ({
          quantity: m.cantidad,
          product: {
            description: m.descripcion,
            product_key: m.bienes_transp,
            unit_key: m.clave_unidad,
            price: 0,
            taxability: "01",
            taxes: [],
            tax_included: false,
          },
        }));

    const customerAddress: any = { country: "MEX", zip: customer.codigo_postal };
    const payload: any = {
      type: data.cfdi_type,
      customer: {
        legal_name: customer.razon_social,
        tax_id: customer.rfc,
        tax_system: customer.regimen_fiscal,
        email: customer.email || undefined,
        address: customerAddress,
      },
      ...(data.cfdi_type === "I" ? {
        use: data.uso_cfdi,
        payment_form: data.forma_pago,
        payment_method: data.metodo_pago,
      } : {}),
      items,
      complements: [cartaPorteComplement],
    };

    let resp: any;
    try {
      resp = await callFacturapi(key, "/invoices", { method: "POST", body: JSON.stringify(payload) });
    } catch (err) {
      const msg = (err as Error).message;
      await (supabaseAdmin as any).from("cfdi_stamps").insert({
        organization_id: data.organizationId,
        kind: data.cfdi_type === "T" ? "traslado" : "ingreso",
        reference_id: data.customer_id ?? data.organizationId,
        ambiente: environment,
        estatus: "error",
        error_message: msg,
        payload,
        timbrado_por: context.userId,
      });
      throw new Error(msg);
    }

    const fapiId = resp.id;
    const uuid = resp.uuid;
    const { xmlPath, pdfPath } = await saveFiles(data.organizationId, data.cfdi_type === "T" ? "traslado" : "ingreso", fapiId, uuid, key);

    await (supabaseAdmin as any).from("cfdi_stamps").insert({
      organization_id: data.organizationId,
      kind: data.cfdi_type === "T" ? "traslado" : "ingreso",
      reference_id: data.customer_id ?? data.organizationId,
      facturapi_id: fapiId,
      uuid_sat: uuid,
      serie: resp.series,
      folio: String(resp.folio_number ?? ""),
      fecha_timbrado: resp.date,
      xml_path: xmlPath,
      pdf_path: pdfPath,
      ambiente: environment,
      estatus: "timbrado",
      payload: { request: payload, response: resp, has_carta_porte: true },
      total: Number(resp.total ?? 0),
      timbrado_por: context.userId,
    });
    return { ok: true, uuid, facturapi_id: fapiId };
  });

// ==================== LIST STAMPED COMPLEMENTS (pago + carta porte) ====================
export const listStampedComplements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("cfdi_stamps")
      .select("id, kind, uuid_sat, serie, folio, fecha_timbrado, total, estatus, ambiente, xml_path, pdf_path, payload, created_at")
      .eq("organization_id", data.organizationId)
      .in("kind", ["pago", "carta_porte"])
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
