import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ORG_ID = "7145db9f-18fd-4729-9050-3f5c8f2e533e";

async function main() {
  // Empleados activos al cierre de Mayo 2026 (fecha_alta <= 2026-05-31)
  const { data: mayEmps } = await supabase
    .from("employees")
    .select("nombre, empresa, fecha_alta, fecha_baja, estatus")
    .eq("organization_id", ORG_ID)
    .eq("estatus", "activo")
    .lte("fecha_alta", "2026-05-31")
    .order("empresa");

  const byEmpresa = {};
  (mayEmps ?? []).forEach((e) => {
    const emp = (e.empresa || "?").trim();
    if (!byEmpresa[emp]) byEmpresa[emp] = [];
    byEmpresa[emp].push(e);
  });

  console.log("=== EMPLEADOS ACTIVOS AL CIERRE DE MAYO 2026 ===\n");
  Object.entries(byEmpresa).forEach(([emp, arr]) => {
    console.log(`${emp}: ${arr.length} empleados`);
    arr.forEach((e) => console.log(`  ${e.nombre}  alta=${e.fecha_alta}`));
  });
  console.log(`\nTotal: ${mayEmps?.length ?? 0}`);
  console.log(`Proporción HELIX: ${byEmpresa["HELIX"]?.length ?? 0}/${mayEmps?.length ?? 1}`);
  console.log(`Proporción HELIX-LAROSS: ${byEmpresa["HELIX-LAROSS"]?.length ?? 0}/${mayEmps?.length ?? 1}`);

  // También Junio 2026
  const { data: junEmps } = await supabase
    .from("employees")
    .select("nombre, empresa")
    .eq("organization_id", ORG_ID)
    .eq("estatus", "activo")
    .lte("fecha_alta", "2026-06-30");

  const junByEmpresa = {};
  (junEmps ?? []).forEach((e) => {
    const emp = (e.empresa || "?").trim();
    junByEmpresa[emp] = (junByEmpresa[emp] || 0) + 1;
  });
  console.log("\n=== EMPLEADOS ACTIVOS AL CIERRE DE JUNIO 2026 ===");
  Object.entries(junByEmpresa).forEach(([emp, n]) => console.log(`  ${emp}: ${n}`));
  console.log(`  Total: ${junEmps?.length ?? 0}`);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
