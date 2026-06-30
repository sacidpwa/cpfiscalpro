import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;

async function assertPlatformAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("platform_admins")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: requiere super administrador");
}

export const requestNewOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        rfc: z.string().trim().regex(RFC_RE, "RFC inválido"),
        razon_social: z.string().trim().min(1).max(200),
        regimen_fiscal: z.string().trim().max(20).optional().nullable(),
        codigo_postal: z.string().trim().max(10).optional().nullable(),
        motivo: z.string().trim().max(500).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("organization_requests")
      .insert({
        requested_by: userId,
        rfc: data.rfc.toUpperCase(),
        razon_social: data.razon_social,
        regimen_fiscal: data.regimen_fiscal || null,
        codigo_postal: data.codigo_postal || null,
        motivo: data.motivo || null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const listMyOrgRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("organization_requests")
      .select("*")
      .eq("requested_by", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listAllOrgRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    await assertPlatformAdmin(userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("organization_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((data ?? []).map((r) => r.requested_by)));
    let profiles: Record<string, { email: string | null; full_name: string | null }> = {};
    if (ids.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, email, full_name")
        .in("id", ids);
      profiles = Object.fromEntries(
        (profs ?? []).map((p: any) => [p.id, { email: p.email, full_name: p.full_name }]),
      );
    }
    return (data ?? []).map((r: any) => ({ ...r, requester: profiles[r.requested_by] ?? null }));
  });

export const approveOrgRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ requestId: z.string().uuid(), notes: z.string().max(500).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    await assertPlatformAdmin(userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req, error: rErr } = await supabaseAdmin
      .from("organization_requests")
      .select("*")
      .eq("id", data.requestId)
      .single();
    if (rErr) throw new Error(rErr.message);
    if (req.status !== "pendiente") throw new Error("La solicitud ya fue resuelta");

    const { data: org, error: oErr } = await supabaseAdmin
      .from("organizations")
      .insert({
        rfc: req.rfc.toUpperCase(),
        razon_social: req.razon_social,
        regimen_fiscal: req.regimen_fiscal,
        codigo_postal: req.codigo_postal,
        created_by: req.requested_by,
      })
      .select()
      .single();
    if (oErr) throw new Error(`Org: ${oErr.message}`);

    const { error: mErr } = await supabaseAdmin.from("organization_members").insert({
      organization_id: org.id,
      user_id: req.requested_by,
      role: "owner",
    });
    if (mErr) throw new Error(`Membresía: ${mErr.message}`);

    await supabaseAdmin
      .from("organization_requests")
      .update({
        status: "aprobada",
        admin_notes: data.notes ?? null,
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
        created_organization_id: org.id,
      })
      .eq("id", data.requestId);

    return { organizationId: org.id };
  });

export const rejectOrgRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ requestId: z.string().uuid(), notes: z.string().max(500).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    await assertPlatformAdmin(userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("organization_requests")
      .update({
        status: "rechazada",
        admin_notes: data.notes ?? null,
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", data.requestId)
      .eq("status", "pendiente");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
