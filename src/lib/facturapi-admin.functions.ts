import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BASE = "https://www.facturapi.io/v2";

async function assertPlatformAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_platform_admin", { _user: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Solo el super administrador puede gestionar FacturAPI.");
}

function userKey(): string {
  const k = process.env.FACTURAPI_USER_KEY;
  if (!k) throw new Error("Falta FACTURAPI_USER_KEY. Agrégalo en los secretos del backend.");
  return k;
}

async function fapi(path: string, init: RequestInit = {}, key?: string) {
  const k = key ?? userKey();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${k}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = typeof body === "string" ? body : (body?.message || JSON.stringify(body));
    throw new Error(`FacturAPI ${res.status}: ${msg?.slice(0, 400)}`);
  }
  return body;
}

// ---------- LIST ----------
export const fapiListOrgs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      q: z.string().trim().max(200).optional(),
      page: z.number().int().min(1).max(1000).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const p = new URLSearchParams();
    if (data.q) p.set("q", data.q);
    if (data.page) p.set("page", String(data.page));
    if (data.limit) p.set("limit", String(data.limit));
    const qs = p.toString();
    return await fapi(`/organizations${qs ? `?${qs}` : ""}`);
  });

// ---------- GET ----------
export const fapiGetOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().trim().min(1).max(64) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    return await fapi(`/organizations/${encodeURIComponent(data.id)}`);
  });

// ---------- CREATE ----------
export const fapiCreateOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ name: z.string().trim().min(2).max(200) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    return await fapi(`/organizations`, {
      method: "POST",
      body: JSON.stringify({ name: data.name }),
    });
  });

// ---------- UPDATE LEGAL ----------
const LegalSchema = z.object({
  id: z.string().min(1).max(64),
  legal: z.object({
    name: z.string().trim().min(1).max(254),
    legal_name: z.string().trim().min(1).max(254),
    tax_system: z.string().trim().min(2).max(10),
    tax_id: z.string().trim().regex(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/, "RFC inválido"),
    website: z.string().trim().max(254).optional(),
    phone: z.string().trim().max(40).optional(),
    address: z.object({
      street: z.string().trim().max(254).optional(),
      exterior: z.string().trim().max(40).optional(),
      interior: z.string().trim().max(40).optional(),
      neighborhood: z.string().trim().max(120).optional(),
      city: z.string().trim().max(120).optional(),
      municipality: z.string().trim().max(120).optional(),
      state: z.string().trim().max(120).optional(),
      
      zip: z.string().trim().regex(/^\d{5}$/),
    }),
  }),
});

export const fapiUpdateLegal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => LegalSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { address, tax_id: _omit, ...rest } = data.legal;
    const cleanAddress = Object.fromEntries(
      Object.entries(address).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== ""),
    );
    const payload: any = { ...rest, address: cleanAddress };
    for (const k of Object.keys(payload)) {
      if (typeof payload[k] === "string" && payload[k].trim() === "") delete payload[k];
    }
    return await fapi(`/organizations/${encodeURIComponent(data.id)}/legal`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  });

// ---------- DELETE ----------
export const fapiDeleteOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().min(1).max(64) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    await fapi(`/organizations/${encodeURIComponent(data.id)}`, { method: "DELETE" });
    return { ok: true };
  });

// ---------- RENEW / GET API KEYS ----------
// FacturAPI: live GET lists key references only; PUT generates and returns a new secret key.
// Test GET/PUT return the secret key directly.

const KeyParams = z.object({
  id: z.string().min(1).max(64),
  env: z.enum(["test", "live"]),
});

function extractKey(r: any): string {
  if (!r) return "";
  if (typeof r === "string") return r;
  if (Array.isArray(r)) {
    const first = r[0];
    if (!first) return "";
    if (typeof first === "string") return first;
    return first.key ?? first.value ?? first.secret_key ?? "";
  }
  return r.key ?? r.value ?? r.secret_key ?? "";
}

export const fapiGetApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => KeyParams.parse(i))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const r = await fapi(`/organizations/${encodeURIComponent(data.id)}/apikeys/${data.env}`);
    return { key: extractKey(r), raw: r };
  });

export const fapiRenewApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => KeyParams.parse(i))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const r = await fapi(`/organizations/${encodeURIComponent(data.id)}/apikeys/${data.env}`, {
      method: "PUT",
    });
    return { key: extractKey(r), raw: r };
  });


// ---------- SAVE KEY TO LOCAL ORG BILLING CONFIG ----------
export const fapiSaveKeyToOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      organization_id: z.string().uuid(),
      facturapi_org_id: z.string().min(1).max(64),
      env: z.enum(["test", "live"]),
      key: z.string().min(10).max(400),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, any> = {
      organization_id: data.organization_id,
      facturapi_org_id: data.facturapi_org_id,
      updated_by: context.userId,
    };
    if (data.env === "test") patch.facturapi_test_key = data.key;
    else patch.facturapi_live_key = data.key;
    const { error } = await supabaseAdmin
      .from("org_billing_config")
      .upsert(patch, { onConflict: "organization_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- LIST LOCAL ORGS (for linking) ----------
export const fapiListLocalOrgs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("organizations")
      .select("id, razon_social, rfc")
      .order("razon_social");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------- UPLOAD CSD (sellos digitales) ----------
export const fapiUploadCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().min(1).max(64),
      cer_b64: z.string().min(10),
      key_b64: z.string().min(10),
      password: z.string().min(1).max(200),
      cer_name: z.string().max(200).optional(),
      key_name: z.string().max(200).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const b64ToBytes = (b64: string) => {
      const clean = b64.replace(/^data:[^;]+;base64,/, "");
      const bin = atob(clean);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    };
    const fd = new FormData();
    fd.append("cer", new Blob([b64ToBytes(data.cer_b64)], { type: "application/x-x509-ca-cert" }), data.cer_name || "csd.cer");
    fd.append("key", new Blob([b64ToBytes(data.key_b64)], { type: "application/octet-stream" }), data.key_name || "csd.key");
    fd.append("password", data.password);
    const res = await fetch(`${BASE}/organizations/${encodeURIComponent(data.id)}/certificate`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${userKey()}` },
      body: fd,
    });
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok) {
      const msg = typeof body === "string" ? body : (body?.message || JSON.stringify(body));
      throw new Error(`FacturAPI ${res.status}: ${String(msg).slice(0, 400)}`);
    }
    return body ?? { ok: true };
  });

