import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;

export const listMyOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("organization_members")
      .select("role, organization:organizations(id, rfc, razon_social, regimen_fiscal, timezone)")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      role: r.role as string,
      organization: r.organization as {
        id: string;
        rfc: string;
        razon_social: string;
        regimen_fiscal: string | null;
        timezone: string;
      },
    }));
  });

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        rfc: z.string().regex(RFC_RE, "RFC inválido"),
        razon_social: z.string().min(1).max(200),
        regimen_fiscal: z.string().optional(),
        nombre_comercial: z.string().optional(),
        codigo_postal: z.string().optional(),
        direccion: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: org, error } = await supabase
      .from("organizations")
      .insert({
        rfc: data.rfc.toUpperCase(),
        razon_social: data.razon_social,
        regimen_fiscal: data.regimen_fiscal || null,
        nombre_comercial: data.nombre_comercial || null,
        codigo_postal: data.codigo_postal || null,
        direccion: data.direccion || null,
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const { error: memErr } = await supabase.from("organization_members").insert({
      organization_id: org.id,
      user_id: userId,
      role: "owner",
    });
    if (memErr) throw new Error(memErr.message);

    // Sembrar catálogo SAT mínimo
    await seedStandardAccounts(supabase, org.id);
    await seedPayrollConcepts(supabase, org.id);

    return { id: org.id };
  });

export const updateOrgLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      organization_id: z.string().uuid(),
      // data URL (image/png|jpeg|svg+xml|webp) o cadena vacía/null para eliminar
      logo_data_url: z.string().max(500_000).nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("has_org_role", {
      _org: data.organization_id,
      _user: context.userId,
      _roles: ["owner", "admin"],
    });
    if (!ok) throw new Error("Sin permiso para cambiar el logo");
    const value = data.logo_data_url && data.logo_data_url.trim() !== "" ? data.logo_data_url : null;
    if (value && !/^data:image\/(png|jpe?g|svg\+xml|webp);base64,/.test(value)) {
      throw new Error("Formato de imagen no válido. Sube PNG, JPG, SVG o WebP.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("organizations")
      .update({ logo_url: value })
      .eq("id", data.organization_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function seedStandardAccounts(supabase: any, orgId: string) {
  const accounts = [
    { codigo: "100", nombre: "ACTIVO", codigo_agrupador: "100", naturaleza: "deudora", nivel: 1, acumulativa: true },
    { codigo: "101", nombre: "Caja", codigo_agrupador: "101.01", naturaleza: "deudora", nivel: 2 },
    { codigo: "102", nombre: "Bancos", codigo_agrupador: "102", naturaleza: "deudora", nivel: 2 },
    { codigo: "103", nombre: "Clientes", codigo_agrupador: "105.01", naturaleza: "deudora", nivel: 2 },
    { codigo: "118", nombre: "IVA acreditable", codigo_agrupador: "118.01", naturaleza: "deudora", nivel: 2 },
    { codigo: "200", nombre: "PASIVO", codigo_agrupador: "200", naturaleza: "acreedora", nivel: 1, acumulativa: true },
    { codigo: "201", nombre: "Proveedores", codigo_agrupador: "201.01", naturaleza: "acreedora", nivel: 2 },
    { codigo: "208", nombre: "Acreedores diversos", codigo_agrupador: "205.01", naturaleza: "acreedora", nivel: 2 },
    { codigo: "210", nombre: "ISR retenido por pagar", codigo_agrupador: "213.04", naturaleza: "acreedora", nivel: 2 },
    { codigo: "211", nombre: "IMSS por pagar", codigo_agrupador: "213.02", naturaleza: "acreedora", nivel: 2 },
    { codigo: "212", nombre: "IVA trasladado", codigo_agrupador: "208.01", naturaleza: "acreedora", nivel: 2 },
    { codigo: "300", nombre: "CAPITAL", codigo_agrupador: "300", naturaleza: "acreedora", nivel: 1, acumulativa: true },
    { codigo: "301", nombre: "Capital social", codigo_agrupador: "301.01", naturaleza: "acreedora", nivel: 2 },
    { codigo: "400", nombre: "INGRESOS", codigo_agrupador: "401", naturaleza: "acreedora", nivel: 1, acumulativa: true },
    { codigo: "401", nombre: "Ventas", codigo_agrupador: "401.01", naturaleza: "acreedora", nivel: 2 },
    { codigo: "500", nombre: "COSTOS", codigo_agrupador: "501", naturaleza: "deudora", nivel: 1, acumulativa: true },
    { codigo: "501", nombre: "Costo de ventas", codigo_agrupador: "501.01", naturaleza: "deudora", nivel: 2 },
    { codigo: "600", nombre: "GASTOS", codigo_agrupador: "601", naturaleza: "deudora", nivel: 1, acumulativa: true },
    { codigo: "601", nombre: "Sueldos y salarios", codigo_agrupador: "601.01", naturaleza: "deudora", nivel: 2 },
    { codigo: "602", nombre: "Cuotas IMSS patronal", codigo_agrupador: "601.02", naturaleza: "deudora", nivel: 2 },
    { codigo: "603", nombre: "Gastos de oficina", codigo_agrupador: "602.01", naturaleza: "deudora", nivel: 2 },
  ];
  await supabase.from("accounts").insert(
    accounts.map((a) => ({ ...a, organization_id: orgId })),
  );
}

async function seedPayrollConcepts(supabase: any, orgId: string) {
  const concepts = [
    { clave_sat: "001", descripcion: "Sueldos, Salarios Rayas y Jornales", tipo: "percepcion", gravado_isr: true, integra_sbc: true },
    { clave_sat: "002", descripcion: "Gratificación Anual (Aguinaldo)", tipo: "percepcion", gravado_isr: true, integra_sbc: false },
    { clave_sat: "021", descripcion: "Prima Vacacional", tipo: "percepcion", gravado_isr: true, integra_sbc: false },
    { clave_sat: "010", descripcion: "Premios por puntualidad", tipo: "percepcion", gravado_isr: false, integra_sbc: false },
    { clave_sat: "038", descripcion: "Otros ingresos por salarios", tipo: "percepcion", gravado_isr: true, integra_sbc: true },
    { clave_sat: "002", descripcion: "ISR", tipo: "deduccion", gravado_isr: false, integra_sbc: false },
    { clave_sat: "001", descripcion: "Seguridad Social (IMSS)", tipo: "deduccion", gravado_isr: false, integra_sbc: false },
    { clave_sat: "004", descripcion: "Otros préstamos", tipo: "deduccion", gravado_isr: false, integra_sbc: false },
  ];
  await supabase.from("payroll_concepts").insert(
    concepts.map((c) => ({ ...c, organization_id: orgId })),
  );
}
