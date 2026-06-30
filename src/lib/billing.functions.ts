import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UpsertSchema = z.object({
  organization_id: z.string().uuid(),
  facturapi_org_id: z.string().trim().max(64).optional().nullable(),
  facturapi_test_key: z.string().trim().max(200).optional().nullable(),
  facturapi_live_key: z.string().trim().max(200).optional().nullable(),
  environment: z.enum(["test", "live"]).optional(),
});

function mask(key: string | null | undefined): { last4: string; set: boolean } {
  if (!key) return { last4: "", set: false };
  return { last4: key.slice(-4), set: true };
}

async function assertOrgAdmin(supabase: any, orgId: string, userId: string) {
  const { data, error } = await supabase.rpc("has_org_role", {
    _org: orgId,
    _user: userId,
    _roles: ["owner", "admin"],
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No tienes permiso para configurar la facturación de esta organización.");
}

export const getBillingConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organization_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOrgAdmin(supabase, data.organization_id, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("org_billing_config")
      .select("*")
      .eq("organization_id", data.organization_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) {
      return {
        exists: false,
        environment: "test" as const,
        facturapi_org_id: null as string | null,
        test: { last4: "", set: false },
        live: { last4: "", set: false },
        csd_uploaded_at: null as string | null,
        csd_expires_at: null as string | null,
        updated_at: null as string | null,
      };
    }
    return {
      exists: true,
      environment: row.environment as "test" | "live",
      facturapi_org_id: row.facturapi_org_id,
      test: mask(row.facturapi_test_key),
      live: mask(row.facturapi_live_key),
      csd_uploaded_at: row.csd_uploaded_at,
      csd_expires_at: row.csd_expires_at,
      updated_at: row.updated_at,
    };
  });

export const upsertBillingConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpsertSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOrgAdmin(supabase, data.organization_id, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const patch: Record<string, any> = {
      organization_id: data.organization_id,
      updated_by: userId,
    };
    if (data.facturapi_org_id !== undefined) patch.facturapi_org_id = data.facturapi_org_id;
    if (data.environment !== undefined) patch.environment = data.environment;
    // Solo escribimos las llaves si vienen no vacías (evita borrar al editar parcialmente)
    if (data.facturapi_test_key) patch.facturapi_test_key = data.facturapi_test_key;
    if (data.facturapi_live_key) patch.facturapi_live_key = data.facturapi_live_key;

    const { error } = await supabaseAdmin
      .from("org_billing_config")
      .upsert(patch, { onConflict: "organization_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testFacturapiConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      organization_id: z.string().uuid(),
      environment: z.enum(["test", "live"]),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOrgAdmin(supabase, data.organization_id, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("org_billing_config")
      .select("facturapi_test_key, facturapi_live_key")
      .eq("organization_id", data.organization_id)
      .maybeSingle();

    const key = data.environment === "test" ? row?.facturapi_test_key : row?.facturapi_live_key;
    if (!key) {
      return { ok: false, message: `No hay llave ${data.environment === "test" ? "de prueba" : "de producción"} guardada.` };
    }

    try {
      // FacturAPI: GET /v2/organizations/me devuelve la org dueña de la llave
      const res = await fetch("https://www.facturapi.io/v2/organizations/me", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        const txt = await res.text();
        return { ok: false, message: `FacturAPI respondió ${res.status}: ${txt.slice(0, 200)}` };
      }
      const org = (await res.json()) as { id?: string; legal_name?: string; tax_id?: string };
      return {
        ok: true,
        message: "Conexión exitosa",
        org_id: org.id ?? null,
        legal_name: org.legal_name ?? null,
        tax_id: org.tax_id ?? null,
      };
    } catch (e) {
      return { ok: false, message: `Error de red: ${(e as Error).message}` };
    }
  });
