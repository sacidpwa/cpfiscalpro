import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("platform_admins").select("id").eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("Forbidden");
}

const ROLES = ["owner", "admin", "contador", "nomina", "recursos_humanos", "lector"] as const;

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new Error(error.message);

    const ids = list.users.map((u) => u.id);
    const [{ data: profiles }, { data: members }, { data: admins }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, email").in("id", ids),
      supabaseAdmin
        .from("organization_members")
        .select("user_id, role, organization_id, organizations(rfc, razon_social)")
        .in("user_id", ids),
      supabaseAdmin.from("platform_admins").select("user_id"),
    ]);
    const profMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p]));
    const memMap: Record<string, any[]> = {};
    for (const m of (members as any[]) ?? []) (memMap[m.user_id] ||= []).push(m);
    const adminSet = new Set((admins ?? []).map((a: any) => a.user_id));

    return list.users.map((u) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      banned_until: (u as any).banned_until ?? null,
      full_name: profMap[u.id]?.full_name ?? null,
      is_platform_admin: adminSet.has(u.id),
      memberships: memMap[u.id] ?? [],
    }));
  });

export const adminResetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ userId: z.string().uuid(), newPassword: z.string().min(8).max(72) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.newPassword });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSendMagicLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ email: z.string().email() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: data.email,
    });
    if (error) throw new Error(error.message);
    return { actionLink: link?.properties?.action_link ?? null };
  });

export const adminToggleBan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ userId: z.string().uuid(), ban: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.ban ? "8760h" : "none",
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId) throw new Error("No puedes borrarte a ti mismo");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminTogglePlatformAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ userId: z.string().uuid(), make: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.make) {
      const { error } = await supabaseAdmin.from("platform_admins").insert({ user_id: data.userId });
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    } else {
      if (data.userId === context.userId) throw new Error("No puedes quitarte el rol a ti mismo");
      const { error } = await supabaseAdmin.from("platform_admins").delete().eq("user_id", data.userId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminSetOrgRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        organizationId: z.string().uuid(),
        role: z.enum(ROLES).nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.role === null) {
      const { error } = await supabaseAdmin
        .from("organization_members")
        .delete()
        .eq("user_id", data.userId)
        .eq("organization_id", data.organizationId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("organization_members")
        .upsert(
          { user_id: data.userId, organization_id: data.organizationId, role: data.role as any },
          { onConflict: "organization_id,user_id" } as any,
        );
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
