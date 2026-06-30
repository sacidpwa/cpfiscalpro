import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RFC_RE = /^([A-ZÑ&]{3,4})\d{6}([A-Z\d]{3})$/;

const baseSchema = z.object({
  id: z.string().uuid().optional(),
  organizationId: z.string().uuid(),
  rfc: z.string().min(12).max(13),
  razon_social: z.string().min(1).max(255),
  nombre_comercial: z.string().max(255).optional().nullable(),
  regimen_fiscal: z.string().min(3).max(4).default("616"),
  uso_cfdi_default: z.string().min(2).max(4).default("G03"),
  codigo_postal: z.string().regex(/^\d{5}$/),
  email: z.string().email().max(255).optional().nullable().or(z.literal("")),
  telefono: z.string().max(30).optional().nullable(),
  calle: z.string().max(200).optional().nullable(),
  num_exterior: z.string().max(20).optional().nullable(),
  num_interior: z.string().max(20).optional().nullable(),
  colonia: z.string().max(120).optional().nullable(),
  municipio: z.string().max(120).optional().nullable(),
  estado: z.string().max(80).optional().nullable(),
  pais: z.string().max(3).default("MEX"),
  moneda: z.string().max(3).default("MXN"),
  dias_credito: z.coerce.number().int().min(0).max(365).default(0),
  forma_pago_default: z.string().max(3).optional().nullable(),
  metodo_pago_default: z.enum(["PUE", "PPD"]).default("PUE"),
  notas: z.string().max(1000).optional().nullable(),
  activo: z.boolean().default(true),
});

export const listCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("customers")
      .select("*")
      .eq("organization_id", data.organizationId)
      .order("razon_social");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => baseSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { id, organizationId, email, ...rest } = data;
    const rfc = rest.rfc.toUpperCase().trim();
    if (!RFC_RE.test(rfc) && rfc !== "XAXX010101000" && rfc !== "XEXX010101000") {
      throw new Error("RFC inválido");
    }
    const payload = {
      ...rest,
      rfc,
      email: email || null,
      organization_id: organizationId,
      created_by: context.userId,
    };
    if (id) {
      const { error } = await context.supabase.from("customers").update(payload).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: created, error } = await context.supabase
      .from("customers").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const deleteCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("customers").delete().eq("id", data.id);
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

export const importCustomers = createServerFn({ method: "POST" })
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
        const rfc = String(pick(r, "rfc") ?? "").toUpperCase().trim();
        const razon = String(pick(r, "razon_social", "razon", "nombre") ?? "").trim();
        const cp = String(pick(r, "codigo_postal", "cp", "zip") ?? "").trim().padStart(5, "0");
        if (!rfc) { errors++; log.push({ row: r, error: "Falta RFC" }); continue; }
        if (!razon) { errors++; log.push({ row: r, error: "Falta razón social" }); continue; }
        if (!/^\d{5}$/.test(cp)) { errors++; log.push({ row: r, error: "CP inválido" }); continue; }

        const payload: any = {
          organization_id: data.organizationId,
          rfc,
          razon_social: razon,
          nombre_comercial: pick(r, "nombre_comercial", "comercial") ?? null,
          regimen_fiscal: String(pick(r, "regimen_fiscal", "regimen") ?? "616").trim(),
          uso_cfdi_default: String(pick(r, "uso_cfdi", "usocfdi", "uso") ?? "G03").trim(),
          codigo_postal: cp,
          email: pick(r, "email", "correo") ?? null,
          telefono: pick(r, "telefono", "tel") ?? null,
          calle: pick(r, "calle") ?? null,
          num_exterior: pick(r, "num_exterior", "numero_exterior", "noext") ?? null,
          num_interior: pick(r, "num_interior", "numero_interior", "noint") ?? null,
          colonia: pick(r, "colonia") ?? null,
          municipio: pick(r, "municipio", "delegacion") ?? null,
          estado: pick(r, "estado") ?? null,
          pais: String(pick(r, "pais") ?? "MEX").toUpperCase(),
          moneda: String(pick(r, "moneda") ?? "MXN").toUpperCase(),
          dias_credito: Number(pick(r, "dias_credito", "credito") ?? 0) || 0,
          metodo_pago_default: String(pick(r, "metodo_pago", "metodopago") ?? "PUE").toUpperCase(),
          forma_pago_default: pick(r, "forma_pago") ?? null,
          notas: pick(r, "notas", "observaciones") ?? null,
          created_by: context.userId,
        };

        const { error } = await context.supabase
          .from("customers")
          .upsert(payload, { onConflict: "organization_id,rfc" });
        if (error) throw new Error(error.message);
        ok++;
      } catch (e: any) {
        errors++;
        log.push({ row: r, error: e.message });
      }
    }

    return { ok, errors, total: rows.length, log: log.slice(0, 30) };
  });

// ==================== IMPORT CUSTOMERS FROM CFDI XML ====================
function getAttr(xml: string, tagRegex: RegExp, attr: string): string | null {
  const m = xml.match(tagRegex);
  if (!m) return null;
  const a = new RegExp(`(?:^|\\s)${attr}="([^"]*)"`, "i").exec(m[0]);
  return a ? a[1] : null;
}

function getAttrFromTag(tag: string, attr: string): string | null {
  const a = new RegExp(`(?:^|\\s)${attr}="([^"]*)"`, "i").exec(tag);
  return a ? a[1] : null;
}

function parseConceptos(xml: string): Array<{
  clave_prod_serv: string;
  no_identificacion: string | null;
  descripcion: string;
  clave_unidad: string;
  unidad: string | null;
  precio_unitario: number;
  objeto_imp: string;
}> {
  const out: Array<any> = [];
  // Captura cada tag <Concepto ...> (auto-cerrado o con cuerpo)
  const re = /<(?:\w+:)?Concepto\b[^>]*?(?:\/>|>)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const tag = m[0];
    const claveProd = getAttrFromTag(tag, "ClaveProdServ") || "";
    const desc = getAttrFromTag(tag, "Descripcion") || "";
    const claveUnidad = getAttrFromTag(tag, "ClaveUnidad") || "H87";
    if (!claveProd || !desc) continue;
    out.push({
      clave_prod_serv: claveProd,
      no_identificacion: getAttrFromTag(tag, "NoIdentificacion"),
      descripcion: desc.trim().slice(0, 1000),
      clave_unidad: claveUnidad,
      unidad: getAttrFromTag(tag, "Unidad"),
      precio_unitario: Number(getAttrFromTag(tag, "ValorUnitario") || 0) || 0,
      objeto_imp: getAttrFromTag(tag, "ObjetoImp") || "02",
    });
  }
  return out;
}

export const importCustomersFromCfdiXml = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      files: z.array(z.object({
        name: z.string(),
        content: z.string().min(20).max(2_000_000),
      })).min(1).max(100),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    let created = 0, updated = 0, skipped = 0, itemsSaved = 0;
    const errors: string[] = [];
    const customerIdByRfc = new Map<string, string>();

    for (const f of data.files) {
      try {
        const xml = f.content;
        const recTag = /<(?:\w+:)?Receptor\b[^>]*\/?>/i;
        const emiTag = /<(?:\w+:)?Emisor\b[^>]*\/?>/i;

        const rfc = (getAttr(xml, recTag, "Rfc") || "").toUpperCase().trim();
        const razon = (getAttr(xml, recTag, "Nombre") || "").trim();
        const cp = (getAttr(xml, recTag, "DomicilioFiscalReceptor") || "").trim();
        const regimen = (getAttr(xml, recTag, "RegimenFiscalReceptor") || "616").trim();
        const uso = (getAttr(xml, recTag, "UsoCFDI") || "G03").trim();

        if (!rfc) { errors.push(`${f.name}: sin RFC del receptor`); continue; }
        if (!razon) { errors.push(`${f.name}: sin razón social`); continue; }
        if (!/^\d{5}$/.test(cp)) { errors.push(`${f.name}: CP inválido (${cp})`); continue; }

        // RFC del emisor coincide con el del receptor → factura emitida a la propia organización, no es cliente
        const emisorRfc = (getAttr(xml, emiTag, "Rfc") || "").toUpperCase().trim();
        if (emisorRfc && emisorRfc === rfc) { skipped++; continue; }

        // Encuentra o crea el cliente (solo una vez por RFC en esta corrida)
        let customerId = customerIdByRfc.get(rfc);
        if (!customerId) {
          const { data: existing } = await context.supabase
            .from("customers").select("id")
            .eq("organization_id", data.organizationId).eq("rfc", rfc).maybeSingle();

          if (existing?.id) {
            const { error } = await context.supabase
              .from("customers")
              .update({ razon_social: razon, regimen_fiscal: regimen, uso_cfdi_default: uso, codigo_postal: cp })
              .eq("id", existing.id);
            if (error) throw new Error(error.message);
            customerId = existing.id;
            updated++;
          } else {
            const { data: ins, error } = await context.supabase.from("customers").insert({
              organization_id: data.organizationId,
              rfc, razon_social: razon, regimen_fiscal: regimen,
              uso_cfdi_default: uso, codigo_postal: cp,
              pais: "MEX", moneda: "MXN", metodo_pago_default: "PUE", dias_credito: 0,
              created_by: context.userId,
            }).select("id").single();
            if (error) throw new Error(error.message);
            customerId = ins.id;
            created++;
          }
          customerIdByRfc.set(rfc, customerId);
        }

        // Guarda los conceptos de este XML como items del cliente
        const conceptos = parseConceptos(xml);
        for (const c of conceptos) {
          // ¿Existe ya un item idéntico?
          const { data: existingItem } = await context.supabase
            .from("customer_items")
            .select("id, times_used")
            .eq("customer_id", customerId)
            .eq("clave_prod_serv", c.clave_prod_serv)
            .eq("descripcion", c.descripcion)
            .eq("precio_unitario", c.precio_unitario)
            .maybeSingle();

          if (existingItem?.id) {
            await context.supabase
              .from("customer_items")
              .update({
                times_used: (existingItem.times_used ?? 0) + 1,
                last_used_at: new Date().toISOString(),
                clave_unidad: c.clave_unidad,
                unidad: c.unidad,
                objeto_imp: c.objeto_imp,
                no_identificacion: c.no_identificacion,
              })
              .eq("id", existingItem.id);
          } else {
            const { error: iErr } = await context.supabase.from("customer_items").insert({
              organization_id: data.organizationId,
              customer_id: customerId,
              clave_prod_serv: c.clave_prod_serv,
              no_identificacion: c.no_identificacion,
              descripcion: c.descripcion,
              clave_unidad: c.clave_unidad,
              unidad: c.unidad,
              precio_unitario: c.precio_unitario,
              objeto_imp: c.objeto_imp,
              times_used: 1,
              last_used_at: new Date().toISOString(),
            });
            if (!iErr) itemsSaved++;
          }
        }
      } catch (e: any) {
        errors.push(`${f.name}: ${e.message ?? e}`);
      }
    }

    return { created, updated, skipped, itemsSaved, errors: errors.slice(0, 20) };
  });

export const listCustomerItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ customerId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("customer_items")
      .select("*")
      .eq("customer_id", data.customerId)
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

