import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TYPES = [
  "isr_mensual",
  "iva_mensual",
  "diot",
  "isr_anual",
  "retenciones_sueldos",
  "retenciones_honorarios",
  "informativa_nomina",
] as const;
const STATUS = ["pendiente", "en_revision", "presentada", "con_observaciones"] as const;

export const TAX_LABELS: Record<(typeof TYPES)[number], string> = {
  isr_mensual: "ISR mensual",
  iva_mensual: "IVA mensual",
  diot: "DIOT",
  isr_anual: "ISR anual",
  retenciones_sueldos: "Retenciones por sueldos",
  retenciones_honorarios: "Retenciones por honorarios",
  informativa_nomina: "Informativa de nómina",
};

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("platform_admins").select("id").eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("Forbidden");
}

/** Cliente: declaraciones de su org */
export const listMyFilings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ organizationId: z.string().uuid(), ejercicio: z.number().int() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("tax_filings" as any)
      .select("*")
      .eq("organization_id", data.organizationId)
      .eq("ejercicio", data.ejercicio)
      .order("mes", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** URL firmada para descargar acuse (cliente o admin) */
export const getFilingFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ path: z.string().min(1) }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("tax-filings")
      .createSignedUrl(data.path, 60 * 10);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

/** Admin: declaraciones de cualquier org */
export const adminListFilings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ organizationId: z.string().uuid().optional(), ejercicio: z.number().int() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("tax_filings" as any).select("*").eq("ejercicio", data.ejercicio);
    if (data.organizationId) q = q.eq("organization_id", data.organizationId);
    const { data: rows, error } = await q.order("mes", { ascending: false });
    if (error) throw new Error(error.message);

    const filings = (rows as any[]) ?? [];
    const orgIds = Array.from(new Set(filings.map((row) => row.organization_id).filter(Boolean)));
    if (!orgIds.length) return filings;

    const { data: orgs, error: orgsError } = await supabaseAdmin
      .from("organizations")
      .select("id, rfc, razon_social")
      .in("id", orgIds);
    if (orgsError) throw new Error(orgsError.message);

    const orgById = new Map((orgs ?? []).map((org) => [org.id, { rfc: org.rfc, razon_social: org.razon_social }]));
    return filings.map((row) => ({ ...row, organizations: orgById.get(row.organization_id) ?? null }));
  });

export const adminUpsertFiling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid().optional().nullable(),
        organizationId: z.string().uuid(),
        ejercicio: z.number().int(),
        mes: z.number().int().min(1).max(12).nullable(),
        tipo: z.enum(TYPES),
        estatus: z.enum(STATUS),
        fecha_limite: z.string(),
        fecha_presentacion: z.string().nullable().optional(),
        monto_pagar: z.number().default(0),
        monto_a_favor: z.number().default(0),
        linea_captura: z.string().max(100).nullable().optional(),
        acuse_path: z.string().nullable().optional(),
        acuse_pago_path: z.string().nullable().optional(),
        notas: z.string().max(500).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload: any = {
      organization_id: data.organizationId,
      ejercicio: data.ejercicio,
      mes: data.mes,
      tipo: data.tipo,
      estatus: data.estatus,
      fecha_limite: data.fecha_limite,
      fecha_presentacion: data.fecha_presentacion ?? null,
      monto_pagar: data.monto_pagar,
      monto_a_favor: data.monto_a_favor,
      linea_captura: data.linea_captura ?? null,
      acuse_path: data.acuse_path ?? null,
      acuse_pago_path: data.acuse_pago_path ?? null,
      notas: data.notas ?? null,
      uploaded_by: context.userId,
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("tax_filings" as any).update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("tax_filings" as any)
        .upsert(payload, { onConflict: "organization_id,ejercicio,mes,tipo" } as any);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/** Sube PDF base64 al bucket privado y devuelve path */
export const adminUploadAcuse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        filename: z.string().min(1).max(120),
        contentType: z.string().min(1).max(80),
        base64: z.string().min(1),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${data.organizationId}/${Date.now()}-${data.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const buf = Buffer.from(data.base64, "base64");
    const { error } = await supabaseAdmin.storage
      .from("tax-filings")
      .upload(path, buf, { contentType: data.contentType, upsert: false });
    if (error) throw new Error(error.message);
    return { path };
  });
