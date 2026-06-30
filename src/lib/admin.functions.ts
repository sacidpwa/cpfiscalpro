import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;

async function assertPlatformAdmin(supabase: any, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("platform_admins")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: requiere super administrador");
}

export const checkPlatformAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data }, { count }] = await Promise.all([
      supabaseAdmin.from("platform_admins").select("id").eq("user_id", userId).maybeSingle(),
      supabaseAdmin
      .from("platform_admins")
      .select("*", { count: "exact", head: true }),
    ]);
    return { isAdmin: !!data, hasAnyAdmin: (count ?? 0) > 0 };
  });

export const claimSuperadmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error: countError } = await supabaseAdmin
      .from("platform_admins")
      .select("*", { count: "exact", head: true });
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) > 0) return { claimed: false };
    const { error } = await supabaseAdmin.from("platform_admins").insert({ user_id: userId, notes: "bootstrap" });
    if (error) {
      if (error.code === "23505") return { claimed: false };
      throw new Error(error.message);
    }
    return { claimed: true };
  });

export const listAllClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertPlatformAdmin(supabase, userId);

    const { data: orgs, error } = await supabase
      .from("organizations")
      .select("id, rfc, razon_social, regimen_fiscal, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (orgs ?? []).map((o: any) => o.id);
    if (ids.length === 0) return [];

    const [empCnt, plans, stamps] = await Promise.all([
      supabase.from("employees").select("organization_id", { count: "exact" }).in("organization_id", ids).eq("estatus", "activo"),
      supabase.from("subscription_plans").select("*").in("organization_id", ids),
      supabase.from("stamp_usage_log").select("organization_id, kind, costo, created_at").in("organization_id", ids),
    ]);

    const empByOrg = new Map<string, number>();
    (empCnt.data ?? []).forEach((r: any) => {
      empByOrg.set(r.organization_id, (empByOrg.get(r.organization_id) ?? 0) + 1);
    });
    const planByOrg = new Map<string, any>();
    (plans.data ?? []).forEach((p: any) => planByOrg.set(p.organization_id, p));

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const stampsByOrg = new Map<string, { factura: number; nomina: number }>();
    (stamps.data ?? [])
      .filter((s: any) => s.created_at >= monthStart)
      .forEach((s: any) => {
        const cur = stampsByOrg.get(s.organization_id) ?? { factura: 0, nomina: 0 };
        if (s.kind === "nomina") cur.nomina += s.costo;
        else cur.factura += s.costo;
        stampsByOrg.set(s.organization_id, cur);
      });

    return (orgs ?? []).map((o: any) => ({
      ...o,
      empleados_activos: empByOrg.get(o.id) ?? 0,
      plan: planByOrg.get(o.id) ?? null,
      uso_mes: stampsByOrg.get(o.id) ?? { factura: 0, nomina: 0 },
    }));
  });

export const getGlobalDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertPlatformAdmin(supabase, userId);

    const [orgCnt, empCnt, recCnt, stamps] = await Promise.all([
      supabase.from("organizations").select("id", { count: "exact", head: true }),
      supabase.from("employees").select("id", { count: "exact", head: true }).eq("estatus", "activo"),
      supabase.from("payroll_receipts").select("id", { count: "exact", head: true }),
      supabase.from("stamp_usage_log").select("kind, costo, created_at").order("created_at", { ascending: false }).limit(10000),
    ]);

    const monthly = new Map<string, { mes: string; factura: number; nomina: number }>();
    (stamps.data ?? []).forEach((s: any) => {
      const d = new Date(s.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const cur = monthly.get(key) ?? { mes: key, factura: 0, nomina: 0 };
      if (s.kind === "nomina") cur.nomina += s.costo;
      else cur.factura += s.costo;
      monthly.set(key, cur);
    });
    const trend = Array.from(monthly.values()).sort((a, b) => a.mes.localeCompare(b.mes)).slice(-6);

    return {
      totalOrgs: orgCnt.count ?? 0,
      totalEmpleados: empCnt.count ?? 0,
      totalRecibos: recCnt.count ?? 0,
      timbresFacturaMes: trend[trend.length - 1]?.factura ?? 0,
      timbresNominaMes: trend[trend.length - 1]?.nomina ?? 0,
      trend,
    };
  });

export const createClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        existing_user_id: z.string().uuid().optional().nullable(),
        email: z.string().email().max(255).optional().nullable(),
        password: z.string().min(8).max(72).optional().nullable(),
        full_name: z.string().min(1).max(120).optional().nullable(),
        rfc: z.string().trim().regex(RFC_RE, "RFC inválido"),
        razon_social: z.string().trim().min(1).transform((s) => s.slice(0, 500)),
        regimen_fiscal: z.string().trim().transform((s) => s.slice(0, 200)).optional().nullable(),
        codigo_postal: z.string().trim().max(10).optional().nullable(),
        direccion: z.string().trim().transform((s) => s.slice(0, 1000)).optional().nullable(),
        plan_name: z.string().default("Básico"),
        mensualidad: z.number().min(0).default(0),
        timbres_factura_incluidos: z.number().int().min(0).default(50),
        timbres_nomina_incluidos: z.number().int().min(0).default(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPlatformAdmin(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let newUserId: string;
    let userEmail: string | null = null;
    let userFullName: string | null = null;

    if (data.existing_user_id) {
      // Asignar a usuario ya existente
      const { data: existing, error: gErr } = await supabaseAdmin.auth.admin.getUserById(data.existing_user_id);
      if (gErr || !existing?.user) throw new Error(`Usuario no encontrado: ${gErr?.message ?? "n/a"}`);
      newUserId = existing.user.id;
      userEmail = existing.user.email ?? null;
      userFullName = (existing.user.user_metadata as any)?.full_name ?? userEmail;
    } else {
      if (!data.email || !data.password || !data.full_name) {
        throw new Error("Faltan datos: email, contraseña y nombre son requeridos para crear un usuario nuevo.");
      }
      // Si el email ya existe, sugerir asignación
      const { data: existingList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const dupe = existingList?.users?.find((u) => u.email?.toLowerCase() === data.email!.toLowerCase());
      if (dupe) {
        throw new Error(
          `El correo ${data.email} ya está registrado. Usa la opción "Asignar usuario existente" y selecciónalo.`,
        );
      }
      const { data: newUser, error: uErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.full_name },
      });
      if (uErr) throw new Error(`Auth: ${uErr.message}`);
      newUserId = newUser.user!.id;
      userEmail = data.email;
      userFullName = data.full_name;
    }

    // Asegura profile
    await supabaseAdmin
      .from("profiles")
      .upsert({ id: newUserId, email: userEmail, full_name: userFullName });

    // Create organization
    const { data: org, error: oErr } = await supabaseAdmin
      .from("organizations")
      .insert({
        rfc: data.rfc.toUpperCase(),
        razon_social: data.razon_social,
        regimen_fiscal: data.regimen_fiscal || null,
        codigo_postal: data.codigo_postal || null,
        direccion: data.direccion || null,
        created_by: newUserId,
      })
      .select()
      .single();
    if (oErr) throw new Error(`Org: ${oErr.message}`);

    await supabaseAdmin.from("organization_members").insert({
      organization_id: org.id,
      user_id: newUserId,
      role: "owner",
    });

    await supabaseAdmin.from("subscription_plans").insert({
      organization_id: org.id,
      plan_name: data.plan_name,
      mensualidad: data.mensualidad,
      timbres_factura_incluidos: data.timbres_factura_incluidos,
      timbres_nomina_incluidos: data.timbres_nomina_incluidos,
    });

    return { organizationId: org.id, userId: newUserId };
  });


export const upsertPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organization_id: z.string().uuid(),
        plan_name: z.string().min(1).max(80),
        mensualidad: z.number().min(0),
        timbres_factura_incluidos: z.number().int().min(0),
        timbres_nomina_incluidos: z.number().int().min(0),
        dia_corte: z.number().int().min(1).max(28).default(1),
        activo: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPlatformAdmin(supabase, userId);
    const { error } = await supabase
      .from("subscription_plans")
      .upsert(data, { onConflict: "organization_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getClientDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPlatformAdmin(supabase, userId);

    const [org, plan, members, usage] = await Promise.all([
      supabase.from("organizations").select("*").eq("id", data.organizationId).single(),
      supabase.from("subscription_plans").select("*").eq("organization_id", data.organizationId).maybeSingle(),
      supabase.from("organization_members").select("user_id, role, created_at").eq("organization_id", data.organizationId),
      supabase
        .from("stamp_usage_log")
        .select("kind, costo, created_at, uuid_cfdi")
        .eq("organization_id", data.organizationId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (org.error) throw new Error(org.error.message);
    return {
      organization: org.data,
      plan: plan.data,
      members: members.data ?? [],
      usage: usage.data ?? [],
    };
  });
