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


export const importInvoicesFromFacturapi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      limit: z.number().int().min(1).max(100).default(100),
      pages: z.number().int().min(1).max(10).default(5),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: canWrite } = await context.supabase.rpc("has_org_role", {
      _org: data.organizationId,
      _user: context.userId,
      _roles: ["owner", "admin", "contador", "nomina"],
    });
    if (!canWrite) throw new Error("Sin permiso para importar facturas en esta organización.");

    const { key, environment } = await getApiKey(data.organizationId);

    const invoicesById = new Map<string, any>();
    let previousFirstId: string | null = null;
    for (let page = 1; page <= data.pages; page++) {
      const params = new URLSearchParams({ limit: String(data.limit), page: String(page) });
      const res = await callFacturapi(key, `/invoices?${params.toString()}`);
      const pageList: any[] = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      const firstId = pageList[0]?.id ?? null;
      if (page > 1 && firstId && firstId === previousFirstId) break;
      previousFirstId = firstId;
      for (const inv of pageList) {
        if (inv?.id) invoicesById.set(inv.id, inv);
      }
      if (pageList.length < data.limit || (typeof res?.total_pages === "number" && page >= res.total_pages) || res?.has_more === false) break;
    }
    const list = [...invoicesById.values()];

    // Las que ya tenemos
    const fapiIds = list.map((i) => i.id).filter(Boolean);
    const { data: existing } = await (supabaseAdmin as any)
      .from("cfdi_stamps")
      .select("facturapi_id")
      .eq("organization_id", data.organizationId)
      .in("facturapi_id", fapiIds.length ? fapiIds : ["__none__"]);
    const have = new Set((existing ?? []).map((r: any) => r.facturapi_id));

    let imported = 0;
    let failed = 0;
    for (const inv of list) {
      if (!inv?.id || have.has(inv.id)) continue;
      // referencia: cliente local con mismo RFC si existe
      let referenceId: string | null = null;
      const taxId = inv?.customer?.tax_id;
      if (taxId) {
        const { data: cust } = await supabaseAdmin
          .from("customers").select("id")
          .eq("organization_id", data.organizationId)
          .ilike("rfc", taxId)
          .maybeSingle();
        if (cust) referenceId = (cust as any).id;
      }
      if (!referenceId) referenceId = data.organizationId; // fallback

      const status = (inv?.status ?? "valid") === "canceled" ? "cancelado" : "timbrado";
      const { data: inserted, error: insertError } = await (supabaseAdmin as any).from("cfdi_stamps").insert({
        organization_id: data.organizationId,
        kind: "ingreso",
        reference_id: referenceId,
        facturapi_id: inv.id,
        uuid_sat: inv.uuid ?? null,
        serie: inv.series ?? null,
        folio: inv.folio_number != null ? String(inv.folio_number) : null,
        fecha_timbrado: inv.date ?? inv.created_at ?? null,
        ambiente: environment,
        estatus: status,
        payload: { imported: true, response: inv },
        total: Number(inv.total ?? 0),
        timbrado_por: context.userId,
      }).select("id").single();

      if (insertError) {
        failed++;
        console.error("import: no se pudo guardar factura", inv.id, insertError);
        continue;
      }

      have.add(inv.id);
      imported++;

      // Guardar archivos después de tener el registro local, para que no desaparezca si la descarga falla.
      let xmlPath: string | null = null;
      let pdfPath: string | null = null;
      try {
        const xml = await downloadFile(key, `/invoices/${inv.id}/xml`);
        const pdf = await downloadFile(key, `/invoices/${inv.id}/pdf`);
        const base = `${data.organizationId}/ingreso/${inv.id}_${inv.uuid ?? "noid"}`;
        const xu = await supabaseAdmin.storage.from("cfdi-xml").upload(`${base}.xml`, new Uint8Array(xml), { contentType: "application/xml", upsert: true });
        if (!xu.error) xmlPath = xu.data.path;
        const pu = await supabaseAdmin.storage.from("cfdi-pdf").upload(`${base}.pdf`, new Uint8Array(pdf), { contentType: "application/pdf", upsert: true });
        if (!pu.error) pdfPath = pu.data.path;
        if (inserted?.id && (xmlPath || pdfPath)) {
          await (supabaseAdmin as any).from("cfdi_stamps").update({ xml_path: xmlPath, pdf_path: pdfPath }).eq("id", inserted.id);
        }
      } catch (e) {
        console.warn("import: no se pudo descargar XML/PDF", inv.id, e);
      }
    }
    return { ok: true, imported, failed, scanned: list.length };
  });


export const listInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("cfdi_stamps")
      .select("id, uuid_sat, serie, folio, fecha_timbrado, total, estatus, ambiente, error_message, xml_path, pdf_path, payload, created_at")
      .eq("organization_id", data.organizationId)
      .eq("kind", "ingreso")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const itemSchema = z.object({
  product_id: z.string().uuid().optional(),
  customer_item_id: z.string().uuid().optional(),
  cantidad: z.coerce.number().positive(),
  descuento: z.coerce.number().min(0).default(0),
  descripcion: z.string().trim().min(1).max(1000).optional(),
  precio_unitario: z.coerce.number().min(0).optional(),
}).refine((v) => !!(v.product_id || v.customer_item_id), {
  message: "Cada concepto requiere product_id o customer_item_id",
});


export const stampIncomeInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      customerId: z.string().uuid(),
      items: z.array(itemSchema).min(1).max(50),
      uso_cfdi: z.string().min(2).max(4).default("G03"),
      forma_pago: z.string().min(2).max(2).default("03"),
      metodo_pago: z.enum(["PUE", "PPD"]).default("PUE"),
      serie: z.string().max(25).optional(),
      condiciones_pago: z.string().max(1000).optional(),
      moneda: z.string().min(3).max(3).default("MXN"),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    // permiso
    const { data: canWrite } = await context.supabase.rpc("has_org_role", {
      _org: data.organizationId,
      _user: userId,
      _roles: ["owner", "admin", "contador", "nomina"],
    });
    if (!canWrite) throw new Error("No tienes permiso para emitir facturas en esta organización.");

    // Cliente
    const { data: cust, error: ce } = await supabaseAdmin
      .from("customers").select("*").eq("id", data.customerId).single();
    if (ce || !cust) throw new Error("Cliente no encontrado");
    if (cust.organization_id !== data.organizationId) throw new Error("Cliente no pertenece a la organización");

    // Productos del catálogo
    const productIds = data.items.map((i) => i.product_id).filter(Boolean) as string[];
    const customerItemIds = data.items.map((i) => i.customer_item_id).filter(Boolean) as string[];

    const productsById = new Map<string, any>();
    if (productIds.length) {
      const { data: products, error: pe } = await supabaseAdmin
        .from("products").select("*").in("id", productIds);
      if (pe) throw new Error(pe.message);
      for (const p of products ?? []) productsById.set(p.id, p);
    }

    const itemsById = new Map<string, any>();
    if (customerItemIds.length) {
      const { data: cItems, error: cie } = await supabaseAdmin
        .from("customer_items").select("*").in("id", customerItemIds);
      if (cie) throw new Error(cie.message);
      for (const ci of cItems ?? []) {
        if (ci.customer_id !== data.customerId) throw new Error("Concepto no pertenece al cliente seleccionado");
        itemsById.set(ci.id, ci);
      }
    }

    const fapiItems = data.items.map((it) => {
      let source: any;
      if (it.product_id) {
        source = productsById.get(it.product_id);
        if (!source) throw new Error(`Producto no encontrado: ${it.product_id}`);
        if (source.organization_id !== data.organizationId) throw new Error("Producto no pertenece a la organización");
      } else if (it.customer_item_id) {
        source = itemsById.get(it.customer_item_id);
        if (!source) throw new Error(`Concepto guardado no encontrado: ${it.customer_item_id}`);
      } else {
        throw new Error("Concepto inválido");
      }

      const taxes: any[] = [];
      const ivaTipo = source.iva_tipo ?? "tasa";
      if (ivaTipo === "tasa") {
        taxes.push({ type: "IVA", rate: Number(source.iva_tasa), withholding: false });
      } else if (ivaTipo === "exento") {
        taxes.push({ type: "IVA", rate: 0, withholding: false, factor: "Exento" });
      }
      if (Number(source.ieps_tasa ?? 0) > 0) taxes.push({ type: "IEPS", rate: Number(source.ieps_tasa), withholding: false });
      if (Number(source.ret_iva_tasa ?? 0) > 0) taxes.push({ type: "IVA", rate: Number(source.ret_iva_tasa), withholding: true });
      if (Number(source.ret_isr_tasa ?? 0) > 0) taxes.push({ type: "ISR", rate: Number(source.ret_isr_tasa), withholding: true });

      return {
        quantity: it.cantidad,
        discount: it.descuento || 0,
        product: {
          description: (it.descripcion?.trim() || source.descripcion),

          product_key: source.clave_prod_serv,
          unit_key: source.clave_unidad,
          unit_name: source.unidad || undefined,
          price: Number(it.precio_unitario ?? source.precio_unitario),
          taxability: source.objeto_imp,
          taxes,
          tax_included: false,
        },
      };
    });

    const { key, environment } = await getApiKey(data.organizationId);

    const customerAddress: any = { country: "MEX", zip: cust.codigo_postal };
    const payload: any = {
      type: "I",
      customer: {
        legal_name: cust.razon_social,
        tax_id: cust.rfc,
        tax_system: cust.regimen_fiscal,
        email: cust.email || undefined,
        address: customerAddress,
      },
      use: data.uso_cfdi,
      payment_form: data.forma_pago,
      payment_method: data.metodo_pago,
      currency: data.moneda,
      ...(data.serie ? { series: data.serie } : {}),
      ...(data.condiciones_pago ? { payment_conditions: data.condiciones_pago } : {}),
      items: fapiItems,
    };

    let resp: any;
    try {
      resp = await callFacturapi(key, "/invoices", { method: "POST", body: JSON.stringify(payload) });
    } catch (err) {
      const msg = (err as Error).message;
      await (supabaseAdmin as any).from("cfdi_stamps").insert({
        organization_id: data.organizationId,
        kind: "ingreso",
        reference_id: data.customerId,
        ambiente: environment,
        estatus: "error",
        error_message: msg,
        payload,
        timbrado_por: userId,
      });
      throw new Error(msg);
    }

    const fapiId: string = resp.id;
    const uuid: string = resp.uuid;
    const serie: string | undefined = resp.series;
    const folio: string | undefined = String(resp.folio_number ?? "");
    const fecha: string | undefined = resp.date;
    const total: number = Number(resp.total ?? 0);

    // PRIMERO: guardar registro local del timbre (idempotente por facturapi_id)
    // Así, si la descarga de XML/PDF falla o el cliente cancela, no perdemos la referencia.
    const { data: existingStamp } = await (supabaseAdmin as any)
      .from("cfdi_stamps")
      .select("id")
      .eq("organization_id", data.organizationId)
      .eq("facturapi_id", fapiId)
      .maybeSingle();

    let stampId: string | null = existingStamp?.id ?? null;
    if (!stampId) {
      const { data: inserted, error: insErr } = await (supabaseAdmin as any)
        .from("cfdi_stamps")
        .insert({
          organization_id: data.organizationId,
          kind: "ingreso",
          reference_id: data.customerId,
          facturapi_id: fapiId,
          uuid_sat: uuid,
          serie,
          folio,
          fecha_timbrado: fecha,
          ambiente: environment,
          estatus: "timbrado",
          payload: { request: payload, response: { id: fapiId, uuid, total } },
          total,
          timbrado_por: userId,
        })
        .select("id")
        .single();
      if (insErr) {
        console.error("No se pudo guardar cfdi_stamps tras timbrar:", insErr);
      } else {
        stampId = inserted?.id ?? null;
      }
    }

    // DESPUÉS: descargar PDF y XML y actualizar el registro
    let xmlPath: string | null = null;
    let pdfPath: string | null = null;
    try {
      const xml = await downloadFile(key, `/invoices/${fapiId}/xml`);
      const pdf = await downloadFile(key, `/invoices/${fapiId}/pdf`);
      const base = `${data.organizationId}/ingreso/${fapiId}_${uuid}`;
      const xmlUp = await supabaseAdmin.storage.from("cfdi-xml").upload(`${base}.xml`, new Uint8Array(xml), {
        contentType: "application/xml", upsert: true,
      });
      if (!xmlUp.error) xmlPath = xmlUp.data.path;
      const pdfUp = await supabaseAdmin.storage.from("cfdi-pdf").upload(`${base}.pdf`, new Uint8Array(pdf), {
        contentType: "application/pdf", upsert: true,
      });
      if (!pdfUp.error) pdfPath = pdfUp.data.path;
      if (stampId && (xmlPath || pdfPath)) {
        await (supabaseAdmin as any)
          .from("cfdi_stamps")
          .update({ xml_path: xmlPath, pdf_path: pdfPath })
          .eq("id", stampId);
      }
    } catch (e) {
      console.warn("No se pudo guardar XML/PDF de factura:", e);
    }

    return { ok: true, uuid, facturapi_id: fapiId, ambiente: environment, total };
  });

export const cancelInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      stampId: z.string().uuid(),
      motivo: z.enum(["01", "02", "03", "04"]).default("02"),
      folio_sustitucion: z.string().max(64).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: stamp, error } = await (supabaseAdmin as any)
      .from("cfdi_stamps")
      .select("organization_id, facturapi_id, kind, estatus")
      .eq("id", data.stampId)
      .single();
    if (error || !stamp) throw new Error("Timbrado no encontrado");
    const { data: canWrite } = await context.supabase.rpc("has_org_role", {
      _org: stamp.organization_id,
      _user: context.userId,
      _roles: ["owner", "admin", "contador"],
    });
    if (!canWrite) throw new Error("Sin permiso para cancelar");
    if (!stamp.facturapi_id) throw new Error("Esta factura no tiene ID de FacturAPI");

    const { key } = await getApiKey(stamp.organization_id);
    const qs = new URLSearchParams({ motive: data.motivo });
    if (data.folio_sustitucion) qs.set("substitution", data.folio_sustitucion);
    await callFacturapi(key, `/invoices/${stamp.facturapi_id}?${qs.toString()}`, { method: "DELETE" });

    await (supabaseAdmin as any)
      .from("cfdi_stamps")
      .update({ estatus: "cancelado" })
      .eq("id", data.stampId);

    return { ok: true };
  });
