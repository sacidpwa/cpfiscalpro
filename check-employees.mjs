import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ORG_ID = "7145db9f-18fd-4729-9050-3f5c8f2e533e";

async function main() {
  const { data: emps, count } = await supabase
    .from("employees")
    .select("id, nombre, empresa, estatus", { count: "exact" })
    .eq("organization_id", ORG_ID);

  console.log(`Total empleados en BD: ${count}\n`);

  const byEmpresa = {};
  (emps ?? []).forEach((e) => {
    const emp = (e.empresa || "(sin empresa)").trim();
    if (!byEmpresa[emp]) byEmpresa[emp] = { total: 0, activos: 0, inactivos: 0, lista: [] };
    byEmpresa[emp].total++;
    if (e.estatus === "activo") byEmpresa[emp].activos++;
    else byEmpresa[emp].inactivos++;
    byEmpresa[emp].lista.push(`${e.nombre} (${e.estatus})`);
  });

  Object.entries(byEmpresa).forEach(([emp, v]) => {
    console.log(`=== ${emp}: ${v.total} total (${v.activos} activos, ${v.inactivos} inactivos) ===`);
    v.lista.forEach((n) => console.log(`  ${n}`));
    console.log();
  });
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
