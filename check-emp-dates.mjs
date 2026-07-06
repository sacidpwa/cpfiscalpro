import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ORG_ID = "7145db9f-18fd-4729-9050-3f5c8f2e533e";

async function main() {
  // Ver qué columnas tiene la tabla employees
  const { data: sample } = await supabase
    .from("employees")
    .select("*")
    .eq("organization_id", ORG_ID)
    .limit(3);

  if (sample?.length) {
    console.log("Columnas disponibles en employees:");
    console.log(Object.keys(sample[0]).join(", "));

    console.log("\nMuestras:");
    sample.forEach((e) => {
      console.log(`\n  ${e.nombre} (${e.empresa}, ${e.estatus})`);
      // Mostrar todas las fechas que tenga
      Object.entries(e).forEach(([k, v]) => {
        if (v && (k.includes("fecha") || k.includes("date") || k.includes("alta") || k.includes("baja") || k.includes("ingreso"))) {
          console.log(`    ${k}: ${v}`);
        }
      });
    });
  }

  // Contar activos por empresa (sin filtro de fecha)
  const { data: all } = await supabase
    .from("employees")
    .select("empresa, estatus")
    .eq("organization_id", ORG_ID);

  const byStatus = {};
  (all ?? []).forEach((e) => {
    const emp = (e.empresa || "?").trim();
    if (!byStatus[emp]) byStatus[emp] = { activo: 0, baja: 0, suspendido: 0, otro: 0 };
    if (byStatus[emp][e.estatus] !== undefined) byStatus[emp][e.estatus]++;
    else byStatus[emp].otro++;
  });

  console.log("\n=== Resumen por empresa y estatus ===");
  Object.entries(byStatus).forEach(([emp, v]) => {
    console.log(`  ${emp}: activo=${v.activo}, baja=${v.baja}, suspendido=${v.suspendido}, otro=${v.otro}`);
  });

  console.log("\n⚠ El código actual usa el headcount ACTUAL (todos los activos hoy)");
  console.log("  No filtra por mes/año. Si hubieron altas/bajas durante el año,");
  console.log("  el split proporcional puede no ser exacto para meses anteriores.");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
