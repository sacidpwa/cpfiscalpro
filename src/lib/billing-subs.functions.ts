import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("platform_admins").select("id").eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("Forbidden");
}

const STATUS = ["pendiente", "pagada", "vencida", "cancelada"] as const;
const METHODS = ["transferencia", "efectivo", "stripe", "tarjeta", "otro"] as const;
const STRIPE_SURCHARGE = 0.2;

/** Cliente: facturas y estatus de su org */
export const listMyBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
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

    const today = new Date().toISOString().slice(0, 10);
    const pendientes = (invs.data as any[] | null)?.filter((i) => i.estatus !== "pagada" && i.estatus !== "cancelada") ?? [];
    const vencidas = pendientes.filter((i) => i.fecha_vencimiento < today);
    const adeudoTotal = pendientes.reduce((s, i) => s + Number(i.monto_total), 0);

    return {
      plan: plan.data ?? null,
      invoices: invs.data ?? [],
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
    const baseTotal = (Number(plan?.mensualidad ?? 0) || 0) + baseModulos;
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
