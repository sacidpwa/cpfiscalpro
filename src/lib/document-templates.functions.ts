import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ─── Placeholders disponibles ───
// ORG:  {{RAZON_SOCIAL}}, {{NOMBRE_COMERCIAL}}, {{RFC}}, {{CURP_ORG}},
//       {{DOMICILIO}}, {{CIUDAD}}, {{ESTADO}}, {{CP}}, {{REPRESENTANTE_LEGAL}}, {{NUM_IMSS}}
// EMP:  {{NOMBRE_EMP}}, {{APELLIDO_PAT}}, {{APELLIDO_MAT}}, {{NOMBRE_COMPLETO}},
//       {{RFC_EMP}}, {{CURP_EMP}}, {{NSS}}, {{NUM_EMP}}, {{PUESTO}},
//       {{SALARIO_LETRA}}, {{SALARIO_NUM}}, {{FECHA_ALTA}}, {{DEPARTAMENTO}},
//       {{FECHA_BAJA}}, {{MOTIVO_BAJA}}, {{CIUDAD_ORG}}, {{FECHA_ACTUAL}}

const DOC_TYPES = ["contrato_trabajo", "renuncia", "rit"] as const;
const GIROS = ["salud", "comercio", "industrial", "servicios"] as const;

// ─── Listar plantillas de una org ───
export const listDocTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ organizationId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("org_document_templates" as any)
      .select("*")
      .eq("organization_id", data.organizationId)
      .order("tipo");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ─── Guardar plantilla ───
export const upsertDocTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid().optional().nullable(),
      organizationId: z.string().uuid(),
      tipo: z.enum(DOC_TYPES),
      giro: z.enum(GIROS).nullable().optional(),
      nombre: z.string().min(1).max(200),
      contenido_html: z.string().min(1),
      activo: z.boolean().default(true),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const payload: any = {
      organization_id: data.organizationId,
      tipo: data.tipo,
      giro: data.giro ?? null,
      nombre: data.nombre,
      contenido_html: data.contenido_html,
      activo: data.activo,
    };
    if (data.id) {
      const { error } = await supabase.from("org_document_templates" as any).update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("org_document_templates" as any)
        .upsert(payload, { onConflict: "organization_id,tipo,giro" } as any);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ─── Eliminar plantilla ───
export const deleteDocTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("org_document_templates" as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Obtener datos de la org y empleado para rellenar placeholders ───
async function getDocData(supabase: any, organizationId: string, employeeId: string) {
  const { data: org } = await supabase
    .from("organizations")
    .select("razon_social, nombre_comercial, rfc, direccion, codigo_postal")
    .eq("id", organizationId).single();

  const { data: emp } = await supabase
    .from("employees")
    .select("*")
    .eq("id", employeeId).single();

  if (!org) throw new Error("Organización no encontrada");
  if (!emp) throw new Error("Empleado no encontrado");

  const nombreCompleto = [emp.nombre, emp.apellido_paterno, emp.apellido_materno].filter(Boolean).join(" ");
  const razonSocial = org.razon_social || "";
  const nombreComercial = org.nombre_comercial || razonSocial;
  const domicilio = org.direccion || "";
  const cp = org.codigo_postal || "";

  // Extraer ciudad y estado del domicilio (simplificado)
  const domicilioParts = domicilio.split(",").map((s: string) => s.trim());
  const ciudad = domicilioParts.length >= 2 ? domicilioParts[domicilioParts.length - 2] : "";
  const estado = domicilioParts.length >= 1 ? domicilioParts[domicilioParts.length - 1] : "";

  const salarioNum = emp.salario_diario || 0;
  const salarioLetra = numberToMoney(salarioNum);

  const now = new Date();
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const fechaActual = `${now.getDate()} de ${meses[now.getMonth()]} del año ${now.getFullYear()}`;

  return {
    // Org
    "{{RAZON_SOCIAL}}": razonSocial,
    "{{NOMBRE_COMERCIAL}}": nombreComercial,
    "{{RFC}}": org.rfc || "",
    "{{DOMICILIO}}": domicilio,
    "{{CIUDAD}}": ciudad,
    "{{ESTADO}}": estado,
    "{{CP}}": cp,
    "{{NUM_IMSS}}": "",
    // Employee
    "{{NOMBRE_EMP}}": emp.nombre || "",
    "{{APELLIDO_PAT}}": emp.apellido_paterno || "",
    "{{APELLIDO_MAT}}": emp.apellido_materno || "",
    "{{NOMBRE_COMPLETO}}": nombreCompleto,
    "{{RFC_EMP}}": emp.rfc || "",
    "{{CURP_EMP}}": emp.curp || "",
    "{{NSS}}": emp.nss || "",
    "{{NUM_EMP}}": emp.numero || "",
    "{{PUESTO}}": emp.puesto || "",
    "{{SALARIO_LETRA}}": salarioLetra,
    "{{SALARIO_NUM}}": `$${salarioNum.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`,
    "{{FECHA_ALTA}}": emp.fecha_alta || "",
    "{{DEPARTAMENTO}}": emp.departamento || "",
    "{{FECHA_BAJA}}": emp.fecha_baja || "",
    "{{MOTIVO_BAJA}}": "",
    // Common
    "{{CIUDAD_ORG}}": ciudad || "Toluca",
    "{{FECHA_ACTUAL}}": fechaActual,
  };
}

// ─── Generar contrato de trabajo ───
export const generateContratoTrabajo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      employeeId: z.string().uuid(),
      templateId: z.string().uuid().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Buscar plantilla activa de contrato
    let template: any = null;
    if (data.templateId) {
      const { data: t } = await supabaseAdmin.from("org_document_templates" as any)
        .select("*").eq("id", data.templateId).single();
      template = t;
    } else {
      const { data: t } = await supabaseAdmin.from("org_document_templates" as any)
        .select("*").eq("organization_id", data.organizationId).eq("tipo", "contrato_trabajo").eq("activo", true).limit(1).maybeSingle();
      template = t;
    }

    if (!template) {
      // Usar plantilla estándar como fallback
      template = { contenido_html: DEFAULT_CONTRATO_TRABAJO, nombre: "Contrato de Trabajo (estándar)" };
    }

    const placeholders = await getDocData(supabaseAdmin, data.organizationId, data.employeeId);
    let html = template.contenido_html;
    for (const [key, value] of Object.entries(placeholders)) {
      html = html.replaceAll(key, String(value));
    }

    // Guardar documento generado
    const { data: emp } = await supabaseAdmin.from("employees")
      .select("nombre, apellido_paterno, apellido_materno")
      .eq("id", data.employeeId).single();
    const nombreEmp = [emp?.nombre, emp?.apellido_paterno, emp?.apellido_materno].filter(Boolean).join(" ");

    const { error } = await supabaseAdmin.from("employee_documents" as any).insert({
      organization_id: data.organizationId,
      employee_id: data.employeeId,
      tipo: "contrato_trabajo",
      titulo: `Contrato de trabajo - ${nombreEmp}`,
      contenido_html: html,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);

    return { html, nombreEmp };
  });

// ─── Generar carta de renuncia ───
export const generateRenuncia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      employeeId: z.string().uuid(),
      motivoBaja: z.string().max(500).optional(),
      templateId: z.string().uuid().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let template: any = null;
    if (data.templateId) {
      const { data: t } = await supabaseAdmin.from("org_document_templates" as any)
        .select("*").eq("id", data.templateId).single();
      template = t;
    } else {
      const { data: t } = await supabaseAdmin.from("org_document_templates" as any)
        .select("*").eq("organization_id", data.organizationId).eq("tipo", "renuncia").eq("activo", true).limit(1).maybeSingle();
      template = t;
    }

    if (!template) {
      // Usar plantilla estándar como fallback
      template = { contenido_html: DEFAULT_RENUNCIA, nombre: "Carta de Renuncia (estándar)" };
    }

    const placeholders = await getDocData(supabaseAdmin, data.organizationId, data.employeeId);
    if (data.motivoBaja) {
      placeholders["{{MOTIVO_BAJA}}"] = data.motivoBaja;
    }
    let html = template.contenido_html;
    for (const [key, value] of Object.entries(placeholders)) {
      html = html.replaceAll(key, String(value));
    }

    const { data: emp } = await supabaseAdmin.from("employees")
      .select("nombre, apellido_paterno, apellido_materno")
      .eq("id", data.employeeId).single();
    const nombreEmp = [emp?.nombre, emp?.apellido_paterno, emp?.apellido_materno].filter(Boolean).join(" ");

    const { error } = await supabaseAdmin.from("employee_documents" as any).insert({
      organization_id: data.organizationId,
      employee_id: data.employeeId,
      tipo: "renuncia",
      titulo: `Carta de renuncia - ${nombreEmp}`,
      contenido_html: html,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);

    return { html, nombreEmp };
  });

// ─── Generar RIT ───
export const generateRIT = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      giro: z.enum(GIROS),
      templateId: z.string().uuid().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let template: any = null;
    if (data.templateId) {
      const { data: t } = await supabaseAdmin.from("org_document_templates" as any)
        .select("*").eq("id", data.templateId).single();
      template = t;
    } else {
      const { data: t } = await supabaseAdmin.from("org_document_templates" as any)
        .select("*").eq("organization_id", data.organizationId).eq("tipo", "rit").eq("giro", data.giro).eq("activo", true).limit(1).maybeSingle();
      template = t;
    }

    if (!template) {
      // Usar plantilla estándar del giro como fallback
      const defaultHtml = RIT_DEFAULTS[data.giro] || RIT_DEFAULTS.servicios;
      template = { contenido_html: defaultHtml, nombre: `RIT estándar - ${data.giro}` };
    }

    const { data: org } = await supabaseAdmin.from("organizations")
      .select("razon_social, nombre_comercial, rfc, direccion")
      .eq("id", data.organizationId).single();

    const razonSocial = org?.razon_social || "";
    const nombreComercial = org?.nombre_comercial || razonSocial;
    const domicilio = org?.direccion || "";

    const now = new Date();
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const fechaActual = `${now.getDate()} de ${meses[now.getMonth()]} del año ${now.getFullYear()}`;

    let html = template.contenido_html;
    const replacements: Record<string, string> = {
      "{{RAZON_SOCIAL}}": razonSocial,
      "{{NOMBRE_COMERCIAL}}": nombreComercial,
      "{{RFC}}": org?.rfc || "",
      "{{DOMICILIO}}": domicilio,
      "{{FECHA_ACTUAL}}": fechaActual,
    };
    for (const [key, value] of Object.entries(replacements)) {
      html = html.replaceAll(key, value);
    }

    const { error } = await supabaseAdmin.from("employee_documents" as any).insert({
      organization_id: data.organizationId,
      employee_id: "00000000-0000-0000-0000-000000000000", // RIT es de la org, no de un empleado
      tipo: "rit",
      titulo: `Reglamento Interior de Trabajo - ${nombreComercial}`,
      contenido_html: html,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);

    return { html };
  });

// ─── Listar documentos generados ───
export const listEmployeeDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ organizationId: z.string().uuid(), employeeId: z.string().uuid().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("employee_documents" as any)
      .select("*")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false });
    if (data.employeeId) q = q.eq("employee_id", data.employeeId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

import { DEFAULT_CONTRATO_TRABAJO, DEFAULT_RENUNCIA, RIT_DEFAULTS } from "./document-templates.defaults";
function numberToMoney(n: number): string {
  if (n <= 0) return "CERO PESOS 00/100 M.N.";
  const unidades = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
  const especiales = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"];
  const decenas = ["", "DIEZ", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
  const centenas = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

  const intPart = Math.floor(n);
  const decPart = Math.round((n - intPart) * 100);

  if (intPart === 100) return "CIEN PESOS 00/100 M.N.";

  let result = "";
  const num = intPart.toString();

  if (intPart < 20) {
    result = intPart <= 9 ? unidades[intPart] : especiales[intPart - 10];
  } else if (intPart < 100) {
    const d = Math.floor(intPart / 10);
    const u = intPart % 10;
    result = decenas[d];
    if (u > 0) result += ` Y ${unidades[u]}`;
  } else {
    result = centenas[Math.floor(intPart / 100)];
    const resto = intPart % 100;
    if (resto > 0) {
      if (resto < 20) result += ` ${resto <= 9 ? unidades[resto] : especiales[resto - 10]}`;
      else {
        const d = Math.floor(resto / 10);
        const u = resto % 10;
        result += ` ${decenas[d]}`;
        if (u > 0) result += ` Y ${unidades[u]}`;
      }
    }
  }

  return `${result} PESOS ${String(decPart).padStart(2, "0")}/100 M.N.`;
}
