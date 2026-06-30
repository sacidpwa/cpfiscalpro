import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MODULES = ["nomina", "facturacion", "contabilidad", "asistencias", "bancos", "declaraciones"] as const;
export type ServiceModule = (typeof MODULES)[number];

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("platform_admins").select("id").eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("Forbidden");
}

/** Cliente: módulos activos en su organización */
export const listEnabledModules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("org_modules" as any)
      .select("modulo, activo, costo_mensual")
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    const map: Record<string, { activo: boolean; costo: number }> = {};
    for (const m of MODULES) map[m] = { activo: false, costo: 0 };
    for (const r of (rows as any[]) ?? []) {
      map[r.modulo] = { activo: !!r.activo, costo: Number(r.costo_mensual) };
    }
    return map;
  });

/** Super admin: módulos de cualquier org */
export const adminListOrgModules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("org_modules" as any)
      .select("*")
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    const map: Record<string, { activo: boolean; costo: number; id: string | null }> = {};
    for (const m of MODULES) map[m] = { activo: false, costo: 0, id: null };
    for (const r of (rows as any[]) ?? []) {
      map[r.modulo] = { activo: !!r.activo, costo: Number(r.costo_mensual), id: r.id };
    }
    return map;
  });

export const adminUpsertOrgModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        modulo: z.enum(MODULES),
        activo: z.boolean(),
        costo_mensual: z.number().min(0).max(999999).default(0),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("org_modules" as any)
      .upsert(
        {
          organization_id: data.organizationId,
          modulo: data.modulo,
          activo: data.activo,
          costo_mensual: data.costo_mensual,
          activado_por: context.userId,
        },
        { onConflict: "organization_id,modulo" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
