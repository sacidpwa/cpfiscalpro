import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BASE = "https://www.facturapi.io/v2";

async function getApiKey(orgId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("org_billing_config")
    .select("environment, facturapi_test_key, facturapi_live_key")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Configura FacturAPI para usar el buscador SAT.");
  const env = data.environment as "test" | "live";
  const key = env === "test" ? data.facturapi_test_key : data.facturapi_live_key;
  if (!key) throw new Error(`Falta llave FacturAPI (${env}).`);
  return key;
}

export const searchSatProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string; q: string }) =>
    z.object({
      organizationId: z.string().uuid(),
      q: z.string().trim().min(2).max(100),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    const key = await getApiKey(data.organizationId);
    const url = `${BASE}/catalogs/products?q=${encodeURIComponent(data.q)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`FacturAPI ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const items = Array.isArray(json) ? json : (json.data ?? []);
    return items.slice(0, 25).map((x: any) => ({
      key: String(x.key ?? x.value ?? ""),
      description: String(x.description ?? x.name ?? ""),
    }));
  });

export const searchSatUnits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string; q: string }) =>
    z.object({
      organizationId: z.string().uuid(),
      q: z.string().trim().min(1).max(100),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    const key = await getApiKey(data.organizationId);
    const url = `${BASE}/catalogs/units?q=${encodeURIComponent(data.q)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`FacturAPI ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const items = Array.isArray(json) ? json : (json.data ?? []);
    return items.slice(0, 25).map((x: any) => ({
      key: String(x.key ?? x.value ?? ""),
      name: String(x.name ?? x.description ?? ""),
      symbol: String(x.symbol ?? ""),
    }));
  });
