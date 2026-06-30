import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const baseSchema = z.object({
  id: z.string().uuid().optional(),
  organizationId: z.string().uuid(),
  clave: z.string().min(1).max(50),
  descripcion: z.string().min(1).max(500),
  tipo: z.enum(["producto", "servicio"]).default("producto"),
  clave_prod_serv: z.string().min(6).max(10),
  clave_unidad: z.string().min(2).max(5),
  unidad: z.string().max(50).optional().nullable(),
  precio_unitario: z.coerce.number().min(0),
  moneda: z.string().max(3).default("MXN"),
  iva_tasa: z.coerce.number().min(0).max(1).default(0.16),
  iva_tipo: z.enum(["tasa", "exento", "no_aplica"]).default("tasa"),
  ieps_tasa: z.coerce.number().min(0).max(1).default(0),
  ret_iva_tasa: z.coerce.number().min(0).max(1).default(0),
  ret_isr_tasa: z.coerce.number().min(0).max(1).default(0),
  objeto_imp: z.string().max(2).default("02"),
  sku: z.string().max(80).optional().nullable(),
  activo: z.boolean().default(true),
});

export const listProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("products")
      .select("*")
      .eq("organization_id", data.organizationId)
      .order("clave");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => baseSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { id, organizationId, ...rest } = data;
    const payload = {
      ...rest,
      organization_id: organizationId,
      created_by: context.userId,
    };
    if (id) {
      const { error } = await context.supabase.from("products").update(payload).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: created, error } = await context.supabase
      .from("products").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const norm = (s: any) => String(s ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "");

function pick(r: any, ...aliases: string[]) {
  const keys = Object.keys(r);
  const map = new Map(keys.map((k) => [norm(k), k]));
  for (const a of aliases) {
    const hit = map.get(norm(a));
    if (hit != null) {
      const v = r[hit];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
  }
  return undefined;
}

function parsePct(v: any): number {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace("%", "").replace(",", "."));
  if (!isFinite(n)) return 0;
  return n > 1 ? n / 100 : n;
}

export const importProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      fileBase64: z.string(),
      fileName: z.string().max(255),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const XLSX = await import("xlsx");
    const buf = Buffer.from(data.fileBase64, "base64");
    const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });

    let ok = 0, errors = 0;
    const log: any[] = [];

    for (const r of rows) {
      try {
        const clave = String(pick(r, "clave", "codigo", "sku") ?? "").trim();
        const descripcion = String(pick(r, "descripcion", "nombre", "descripción") ?? "").trim();
        const claveProdServ = String(pick(r, "clave_prod_serv", "claveprodserv", "clavesat") ?? "01010101").trim();
        const claveUnidad = String(pick(r, "clave_unidad", "claveunidad", "unidadsat") ?? "H87").trim();
        const precio = Number(pick(r, "precio_unitario", "precio", "preciounitario") ?? 0) || 0;

        if (!clave) { errors++; log.push({ row: r, error: "Falta clave" }); continue; }
        if (!descripcion) { errors++; log.push({ row: r, error: "Falta descripción" }); continue; }

        const ivaTipoRaw = String(pick(r, "iva_tipo", "ivatipo") ?? "").toLowerCase();
        const ivaTasa = parsePct(pick(r, "iva_tasa", "iva", "ivatasa"));
        let ivaTipo: "tasa" | "exento" | "no_aplica" = "tasa";
        if (ivaTipoRaw === "exento") ivaTipo = "exento";
        else if (ivaTipoRaw === "no_aplica" || ivaTipoRaw === "noaplica") ivaTipo = "no_aplica";

        const payload: any = {
          organization_id: data.organizationId,
          clave,
          descripcion,
          tipo: String(pick(r, "tipo") ?? "producto").toLowerCase() === "servicio" ? "servicio" : "producto",
          clave_prod_serv: claveProdServ,
          clave_unidad: claveUnidad,
          unidad: pick(r, "unidad") ?? null,
          precio_unitario: precio,
          moneda: String(pick(r, "moneda") ?? "MXN").toUpperCase(),
          iva_tasa: ivaTipo === "tasa" ? (ivaTasa || 0.16) : 0,
          iva_tipo: ivaTipo,
          ieps_tasa: parsePct(pick(r, "ieps_tasa", "ieps")),
          ret_iva_tasa: parsePct(pick(r, "ret_iva_tasa", "retencion_iva", "retiva")),
          ret_isr_tasa: parsePct(pick(r, "ret_isr_tasa", "retencion_isr", "retisr")),
          objeto_imp: String(pick(r, "objeto_imp", "objetoimp") ?? "02").trim(),
          sku: pick(r, "sku") ?? null,
          created_by: context.userId,
        };

        const { error } = await context.supabase
          .from("products")
          .upsert(payload, { onConflict: "organization_id,clave" });
        if (error) throw new Error(error.message);
        ok++;
      } catch (e: any) {
        errors++;
        log.push({ row: r, error: e.message });
      }
    }

    return { ok, errors, total: rows.length, log: log.slice(0, 30) };
  });
