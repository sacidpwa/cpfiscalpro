import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("platform_admins").select("id").eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("Forbidden");
}

const STATUS = ["pendiente", "generada", "pagada", "vencida", "cancelada"] as const;
const METHODS = ["transferencia", "efectivo", "stripe", "tarjeta", "otro"] as const;
const STRIPE_SURCHARGE = 0.2;

/** Cliente: facturas y estatus de su org */
export const listMyBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [plan, invs, mods] = await Promise.all([
      supabase.from("subscription_plans").select("*").eq("organization_id", data.organizationId).maybeSingle(),
      supabase
        .from("subscription_invoices" as any)
        .select("*")
        .eq("organization_id", data.organizationId)
        .order("ejercicio", { ascending: false })
        .order("mes", { ascending: false })
        .limit(24),
      supabase
        .from("org_modules" as any)
        .select("modulo, activo, costo_mensual")
        .eq("organization_id", data.organizationId)
        .eq("activo", true),
    ]);
    if (plan.error) throw new Error(plan.error.message);
    if (invs.error) throw new Error(invs.error.message);
    if (mods.error) throw new Error(mods.error.message);

    const invIds = (invs.data as any[] | undefined)?.map((i) => i.id) ?? [];
    const { data: stamps } = await (supabaseAdmin as any)
      .from("cfdi_stamps")
      .select("id, reference_id, pdf_path, xml_path, uuid_sat, serie, folio, estatus")
      .in("reference_id", invIds.length ? invIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("kind", "ingreso")
      .eq("organization_id", SAC_ORG_ID);

    const stampsByInv = new Map<string, any>();
    for (const s of (stamps as any[] | undefined) ?? []) {
      stampsByInv.set(s.reference_id, s);
    }

    const invoices = ((invs.data as any[]) ?? []).map((i) => ({
      ...i,
      stamp: stampsByInv.get(i.id) ?? null,
    }));

    const today = new Date().toISOString().slice(0, 10);
    const pendientes = invoices.filter((i) => i.estatus !== "pagada" && i.estatus !== "cancelada");
    const vencidas = pendientes.filter((i) => i.fecha_vencimiento < today);
    const adeudoTotal = pendientes.reduce((s, i) => s + Number(i.monto_total), 0);

    return {
      plan: plan.data ?? null,
      invoices,
      modulesActive: mods.data ?? [],
      adeudoTotal,
      vencidasCount: vencidas.length,
      diasMasVencida: vencidas.length
        ? Math.max(
            ...vencidas.map((i) =>
              Math.floor((Date.now() - new Date(i.fecha_vencimiento).getTime()) / 86400000),
            ),
          )
        : 0,
    };
  });

/** Super admin: cobranza global */
export const adminListBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [orgs, invs, plans] = await Promise.all([
      supabaseAdmin.from("organizations").select("id, rfc, razon_social"),
      supabaseAdmin
        .from("subscription_invoices" as any)
        .select("*")
        .order("fecha_vencimiento", { ascending: false }),
      supabaseAdmin.from("subscription_plans").select("*"),
    ]);
    if (orgs.error) throw new Error(orgs.error.message);
    const today = new Date().toISOString().slice(0, 10);
    const byOrg = new Map<string, any>();
    for (const o of orgs.data ?? []) byOrg.set(o.id, { ...o, invoices: [], plan: null, adeudo: 0 });
    for (const p of (plans.data as any[] | null) ?? []) {
      const e = byOrg.get(p.organization_id);
      if (e) e.plan = p;
    }
    for (const i of (invs.data as any[] | null) ?? []) {
      const e = byOrg.get(i.organization_id);
      if (!e) continue;
      e.invoices.push(i);
      if (i.estatus !== "pagada" && i.estatus !== "cancelada") {
        e.adeudo += Number(i.monto_total);
      }
    }
    return { rows: Array.from(byOrg.values()), today };
  });

export const adminUpsertPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        plan_name: z.string().trim().min(1).max(80),
        mensualidad: z.number().min(0),
        billing_type: z.enum(["fijo", "modulos"]).default("modulos"),
        dia_pago: z.number().min(1).max(28),
        fecha_inicio: z.string(),
        fecha_vencimiento: z.string().nullable().optional(),
        estatus: z.enum(["activa", "suspendida", "cancelada"]),
        metodo_pago_preferido: z.enum(METHODS).optional().default("transferencia"),
        notas_admin: z.string().max(500).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("subscription_plans")
      .select("id")
      .eq("organization_id", data.organizationId)
      .maybeSingle();

    const payload: any = {
      organization_id: data.organizationId,
      plan_name: data.plan_name,
      mensualidad: data.mensualidad,
      billing_type: data.billing_type,
      dia_pago: data.dia_pago,
      fecha_inicio: data.fecha_inicio,
      fecha_vencimiento: data.fecha_vencimiento ?? null,
      estatus: data.estatus,
      metodo_pago_preferido: data.metodo_pago_preferido,
      notas_admin: data.notas_admin ?? null,
    };

    if (existing) {
      const { error } = await supabaseAdmin.from("subscription_plans").update(payload).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("subscription_plans").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/** Genera (o regenera idempotente) la factura del mes para una org */
export const adminGenerateInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        ejercicio: z.number().int(),
        mes: z.number().int().min(1).max(12),
        metodo: z.enum(METHODS).default("transferencia"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: plan } = await supabaseAdmin
      .from("subscription_plans")
      .select("*")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    const { data: mods } = await supabaseAdmin
      .from("org_modules" as any)
      .select("costo_mensual")
      .eq("organization_id", data.organizationId)
      .eq("activo", true);

    const baseModulos = ((mods as any[]) ?? []).reduce((s, m) => s + Number(m.costo_mensual), 0);
    const baseTotal = plan?.billing_type === 'fijo'
      ? Number(plan?.mensualidad ?? 0)
      : baseModulos;
    const surcharge = data.metodo === "stripe" ? baseTotal * STRIPE_SURCHARGE : 0;
    const total = baseTotal + surcharge;

    const venc = new Date(data.ejercicio, data.mes - 1, (plan as any)?.dia_pago ?? 10);

    const { error } = await supabaseAdmin
      .from("subscription_invoices" as any)
      .upsert(
        {
          organization_id: data.organizationId,
          ejercicio: data.ejercicio,
          mes: data.mes,
          monto_base: baseTotal,
          surcharge,
          monto_total: total,
          fecha_emision: new Date().toISOString().slice(0, 10),
          fecha_vencimiento: venc.toISOString().slice(0, 10),
          estatus: "pendiente",
          metodo_pago: data.metodo,
          created_by: context.userId,
        },
        { onConflict: "organization_id,ejercicio,mes" } as any,
      );
    if (error) throw new Error(error.message);
    return { ok: true, total };
  });

export const adminMarkInvoicePaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        invoiceId: z.string().uuid(),
        fecha_pago: z.string(),
        metodo: z.enum(METHODS),
        comprobante_url: z.string().nullable().optional(),
        notas: z.string().max(500).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("subscription_invoices" as any)
      .update({
        estatus: "pagada",
        fecha_pago: data.fecha_pago,
        metodo_pago: data.metodo,
        comprobante_url: data.comprobante_url ?? null,
        notas: data.notas ?? null,
      })
      .eq("id", data.invoiceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SAC_ORG_ID = "a87f7ba3-10cf-4024-94f7-fe4ff3e8f474";

/** Look up cfdi_stamps linked to subscription invoices */
function stampForInvoice(invId: string, stamps: any[]): any | undefined {
  return stamps.find((s: any) => s.reference_id === invId && s.kind === "ingreso" && s.estatus === "timbrado");
}

const FACTURAPI_BASE = "https://www.facturapi.io/v2";

async function getSacFacturApiKey(): Promise<{ key: string; environment: "test" | "live" }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("org_billing_config")
    .select("environment, facturapi_test_key, facturapi_live_key")
    .eq("organization_id", SAC_ORG_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("SAC no tiene configurada FacturAPI");
  const env = data.environment as "test" | "live";
  const key = env === "test" ? data.facturapi_test_key : data.facturapi_live_key;
  if (!key) throw new Error(`SAC no tiene llave FacturAPI para ambiente "${env}"`);
  return { key, environment: env };
}

async function callFacturApi(key: string, path: string, init: RequestInit = {}): Promise<any> {
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

async function downloadFacturApiFile(key: string, path: string): Promise<ArrayBuffer> {
  const res = await fetch(`${FACTURAPI_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`FacturAPI download ${res.status}`);
  return res.arrayBuffer();
}

/** Admin: lista subscription_invoices con datos de la org y estado del timbre */
export const adminListPendingInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [invRes, stampsRes] = await Promise.all([
      supabaseAdmin
        .from("subscription_invoices" as any)
        .select("*, organizations(id, rfc, razon_social)")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("cfdi_stamps" as any)
        .select("id, reference_id, estatus, uuid_sat, pdf_path, xml_path, created_at")
        .eq("organization_id", SAC_ORG_ID)
        .eq("kind", "ingreso")
        .not("reference_id", "is", null)
        .order("created_at", { ascending: false }),
    ]);
    if (invRes.error) throw new Error(invRes.error.message);
    const stampsByRef = new Map<string, any>();
    for (const s of (stampsRes.data ?? []) as any[]) {
      const ref = s.reference_id;
      if (!stampsByRef.has(ref)) stampsByRef.set(ref, s);
    }
    const invoices = (invRes.data ?? []).map((inv: any) => ({
      ...inv,
      cfdi_stamp: stampsByRef.get(inv.id) ?? null,
    }));
    return invoices;
  });

/** Admin: auto-genera subscription_invoices para meses faltantes de todas las orgs con plan activo */
export const adminAutoGenerateInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: plans, error: pe } = await supabaseAdmin
      .from("subscription_plans")
      .select("*, organizations!inner(id, rfc, razon_social)")
      .eq("estatus", "activa");
    if (pe) throw new Error(pe.message);
    if (!plans?.length) return { created: 0 };

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    let created = 0;

    for (const plan of (plans as any[])) {
      const planStart = new Date(plan.fecha_inicio);
      let y = planStart.getFullYear();
      let m = planStart.getMonth() + 1;
      while (y < currentYear || (y === currentYear && m <= currentMonth)) {
        const { data: existing } = await supabaseAdmin
          .from("subscription_invoices" as any)
          .select("id")
          .eq("organization_id", plan.organization_id)
          .eq("ejercicio", y)
          .eq("mes", m)
          .maybeSingle();
        if (!existing) {
          const { data: mods } = await supabaseAdmin
            .from("org_modules" as any)
            .select("costo_mensual")
            .eq("organization_id", plan.organization_id)
            .eq("activo", true);
          const baseModulos = ((mods as any[]) ?? []).reduce((s, m) => s + Number(m.costo_mensual), 0);
          const total = plan.billing_type === 'fijo'
            ? Number(plan.mensualidad)
            : baseModulos;
          const venc = new Date(y, m - 1, plan.dia_pago ?? 10);
          const { error: ie } = await supabaseAdmin
            .from("subscription_invoices" as any)
            .insert({
              organization_id: plan.organization_id,
              ejercicio: y,
              mes: m,
              monto_base: total,
              surcharge: 0,
              monto_total: total,
              fecha_emision: now.toISOString().slice(0, 10),
              fecha_vencimiento: venc.toISOString().slice(0, 10),
              estatus: "pendiente",
              metodo_pago: plan.metodo_pago_preferido ?? "transferencia",
              created_by: context.userId,
            });
          if (ie) throw new Error(ie.message);
          created++;
        }
        m++;
        if (m > 12) { m = 1; y++; }
      }
    }
    return { created };
  });

/** Admin: actualiza metodo_pago de una subscription_invoice */
export const adminUpdateInvoiceMetodo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ invoiceId: z.string().uuid(), metodo: z.enum(METHODS) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("subscription_invoices" as any)
      .update({ metodo_pago: data.metodo })
      .eq("id", data.invoiceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin: timbra una subscription_invoice como CFDI ingreso (SAC→cliente) */
export const adminStampSubscriptionInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ invoiceId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: inv, error: ie } = await supabaseAdmin
      .from("subscription_invoices" as any)
      .select("*, organizations(id, rfc, razon_social, regimen_fiscal, codigo_postal)")
      .eq("id", data.invoiceId)
      .single();
    if (ie || !inv) throw new Error("Factura no encontrada");
    if (inv.estatus === "pagada" || inv.estatus === "cancelada") throw new Error("La factura ya está pagada o cancelada");

    const org = (inv as any).organizations;
    const periodo = `${inv.ejercicio}/${String(inv.mes).padStart(2, "0")}`;
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const mesNombre = meses[(inv.mes - 1)] ?? "";
    const descripcion = `Mensualidad correspondiente al mes de ${mesNombre} ${inv.ejercicio}`;

    const { key, environment } = await getSacFacturApiKey();

    const payload: any = {
      type: "I",
      customer: {
        legal_name: org.razon_social,
        tax_id: org.rfc,
        tax_system: org.regimen_fiscal ?? "601",
        address: { country: "MEX", zip: org.codigo_postal ?? "00000" },
      },
      use: "G03",
      payment_form: "03",
      payment_method: "PUE",
      currency: "MXN",
      items: [
        {
          quantity: 1,
          discount: 0,
          product: {
            description: descripcion,
            product_key: "84111506",
            unit_key: "ACT",
            unit_name: "Servicio",
            price: Number(inv.monto_total),
            taxability: "02",
            taxes: [{ type: "IVA", rate: 0.16, withholding: false }],
            tax_included: true,
          },
        },
      ],
    };

    let resp: any;
    try {
      resp = await callFacturApi(key, "/invoices", { method: "POST", body: JSON.stringify(payload) });
    } catch (err) {
      await (supabaseAdmin as any).from("cfdi_stamps").insert({
        organization_id: SAC_ORG_ID,
        kind: "ingreso",
        reference_id: inv.id,
        ambiente: environment,
        estatus: "error",
        error_message: (err as Error).message,
        payload,
        timbrado_por: context.userId,
      });
      throw err;
    }

    const fapiId: string = resp.id;
    const uuid: string = resp.uuid;
    const serie: string | undefined = resp.series;
    const folio: string | undefined = String(resp.folio_number ?? "");
    const fecha: string | undefined = resp.date;
    const total: number = Number(resp.total ?? 0);

    const { data: existingStamp } = await (supabaseAdmin as any)
      .from("cfdi_stamps")
      .select("id")
      .eq("organization_id", SAC_ORG_ID)
      .eq("facturapi_id", fapiId)
      .maybeSingle();
    let stampId: string | null = existingStamp?.id ?? null;
    if (!stampId) {
      const { data: inserted } = await (supabaseAdmin as any)
        .from("cfdi_stamps")
        .insert({
          organization_id: SAC_ORG_ID,
          kind: "ingreso",
          reference_id: inv.id,
          facturapi_id: fapiId,
          uuid_sat: uuid,
          serie,
          folio,
          fecha_timbrado: fecha,
          ambiente: environment,
          estatus: "timbrado",
          payload: { request: payload, response: { id: fapiId, uuid, total } },
          total,
          timbrado_por: context.userId,
        })
        .select("id")
        .single();
      if (inserted) stampId = inserted.id;
    }

    let xmlPath: string | null = null;
    let pdfPath: string | null = null;
    try {
      const xml = await downloadFacturApiFile(key, `/invoices/${fapiId}/xml`);
      const pdf = await downloadFacturApiFile(key, `/invoices/${fapiId}/pdf`);
      const base = `${SAC_ORG_ID}/subscription/${fapiId}_${uuid}`;
      const xmlUp = await supabaseAdmin.storage.from("cfdi-xml").upload(`${base}.xml`, new Uint8Array(xml), {
        contentType: "application/xml", upsert: true,
      });
      if (!xmlUp.error) xmlPath = xmlUp.data.path;
      const pdfUp = await supabaseAdmin.storage.from("cfdi-pdf").upload(`${base}.pdf`, new Uint8Array(pdf), {
        contentType: "application/pdf", upsert: true,
      });
      if (!pdfUp.error) pdfPath = pdfUp.data.path;
      if (stampId && (xmlPath || pdfPath)) {
        await (supabaseAdmin as any).from("cfdi_stamps").update({ xml_path: xmlPath, pdf_path: pdfPath }).eq("id", stampId);
      }
    } catch (e) {
      console.warn("No se pudo guardar XML/PDF de factura:", e);
    }

    await supabaseAdmin
      .from("subscription_invoices" as any)
      .update({ estatus: "generada" })
      .eq("id", inv.id);

    return { ok: true, uuid, facturapi_id: fapiId, total, stampId };
  });

/** Admin: envía por email la factura timbrada */
export const adminEmailSubscriptionInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ invoiceId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) throw new Error("Conecta Resend para enviar correos");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: inv, error: ie } = await supabaseAdmin
      .from("subscription_invoices" as any)
      .select("*, organizations(id, rfc, razon_social)")
      .eq("id", data.invoiceId)
      .single();
    if (ie || !inv) throw new Error("Factura no encontrada");

    const org = (inv as any).organizations;

    const { data: member } = await (supabaseAdmin as any)
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", org.id)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();
    const { data: profile } = await (supabaseAdmin as any)
      .from("profiles")
      .select("email")
      .eq("id", member?.user_id)
      .maybeSingle();
    const to = profile?.email;
    if (!to) throw new Error("El cliente no tiene email registrado");

    const { data: stamp } = await (supabaseAdmin as any)
      .from("cfdi_stamps")
      .select("id, pdf_path, xml_path, uuid_sat")
      .eq("reference_id", inv.id)
      .eq("kind", "ingreso")
      .eq("organization_id", SAC_ORG_ID)
      .eq("estatus", "timbrado")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!stamp) throw new Error("La factura aún no está timbrada");

    const attachments: Array<{ filename: string; content: string }> = [];
    for (const kind of ["pdf", "xml"] as const) {
      const path = kind === "pdf" ? stamp.pdf_path : stamp.xml_path;
      if (!path) continue;
      const bucket = kind === "pdf" ? "cfdi-pdf" : "cfdi-xml";
      const { data: file } = await supabaseAdmin.storage.from(bucket).download(path);
      if (!file) continue;
      const buf = Buffer.from(await file.arrayBuffer());
      attachments.push({ filename: `factura_${inv.ejercicio}_${String(inv.mes).padStart(2, "0")}.${kind}`, content: buf.toString("base64") });
    }

    const periodo = `${inv.ejercicio}/${String(inv.mes).padStart(2, "0")}`;
    const subject = `Factura CPFiscalPro · Periodo ${periodo}`;
    const html = `
      <div style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 12px">Hola,</h2>
        <p>Adjunto encontrarás tu factura (PDF y XML) del periodo <strong>${periodo}</strong> por <strong>$${Number(inv.monto_total).toFixed(2)} MXN</strong>.</p>
        <p style="font-size:13px;color:#555">UUID SAT: <code>${stamp.uuid_sat ?? ""}</code></p>
        <p style="margin-top:24px;font-size:13px;color:#555">Saludos,<br/>CPFiscalPro</p>
      </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "CPFiscalPro <facturacion@sacid.site>",
        to: [to],
        subject,
        html,
        attachments: attachments.length > 0 ? attachments : undefined,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Resend ${res.status}: ${txt.slice(0, 300)}`);
    }
    return { ok: true, to };
  });

/** Admin: cancela CFDI de una factura de suscripción */
export const adminCancelSubscriptionInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ invoiceId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: inv, error: ie } = await supabaseAdmin
      .from("subscription_invoices" as any)
      .select("id, estatus")
      .eq("id", data.invoiceId)
      .single();
    if (ie || !inv) throw new Error("Factura no encontrada");
    if (inv.estatus === "cancelada") throw new Error("La factura ya está cancelada");

    const { data: stamp } = await (supabaseAdmin as any)
      .from("cfdi_stamps")
      .select("id, facturapi_id, organization_id")
      .eq("reference_id", inv.id)
      .eq("kind", "ingreso")
      .eq("estatus", "timbrado")
      .maybeSingle();
    if (!stamp) throw new Error("No hay CFDI timbrado para cancelar");

    const { cancelCfdiStamp } = await import("@/lib/cfdi.functions");
    await cancelCfdiStamp({ data: { stampId: stamp.id, motive: "02" } });

    await supabaseAdmin
      .from("subscription_invoices" as any)
      .update({ estatus: "cancelada" })
      .eq("id", inv.id);

    return { ok: true };
  });
