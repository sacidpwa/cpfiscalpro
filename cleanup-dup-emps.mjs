import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ORG_ID = "7145db9f-18fd-4729-9050-3f5c8f2e533e";

async function main() {
  console.log("=== ELIMINAR DUPLICADOS DE EMPLEADOS ===\n");

  // IDs de los registros duplicados a eliminar (los que tienen numero tipo NSS)
  const duplicadosIds = [
    "7c18ab5e-859e-490f-8129-5108aa23a8c7", // EDNA en HELIX-LAROSS (debe ser solo HELIX)
    "0c5d676a-70ea-4cb7-b085-c67a24fcbdef", // CESAR duplicado
    "d94efaa4-1946-4809-b5e3-ad037cd41084", // CRISTIAN duplicado
    "c5f95db4-762e-4dd6-a1b9-e41014088be4", // DAMIAN duplicado
    "0773008d-e585-4b84-b483-de1c0c99c97f", // PATRICIA SERVANDA duplicada
    "5538302d-e45a-4cc0-98aa-dbe06fa96807", // RAFAEL JESUS duplicado
  ];

  // Verificar antes de eliminar
  console.log("Registros a eliminar:");
  for (const id of duplicadosIds) {
    const { data: emp } = await supabase
      .from("employees")
      .select("numero, nombre, apellido_paterno, rfc, empresa, estatus")
      .eq("id", id)
      .single();
    if (emp) {
      const full = [emp.nombre, emp.apellido_paterno].filter(Boolean).join(" ");
      console.log(`  ${id}  #${emp.numero}  "${full}"  RFC=${emp.rfc}  empresa=${emp.empresa}  ${emp.estatus}`);
    }
  }

  // Eliminar
  console.log("\nEliminando...");
  const { error, count } = await supabase
    .from("employees")
    .delete({ count: "exact" })
    .in("id", duplicadosIds);

  if (error) {
    console.error("ERROR:", error.message);
    return;
  }
  console.log(`✓ ${count} registros eliminados\n`);

  // Verificar resultado
  const { data: emps } = await supabase
    .from("employees")
    .select("empresa, estatus")
    .eq("organization_id", ORG_ID);

  const byEmpresa = {};
  (emps ?? []).forEach((e) => {
    const emp = (e.empresa || "?").trim();
    if (!byEmpresa[emp]) byEmpresa[emp] = { activo: 0, baja: 0 };
    byEmpresa[emp][e.estatus]++;
  });

  console.log("=== RESULTADO DESPUÉS DE LIMPIEZA ===");
  Object.entries(byEmpresa).forEach(([emp, v]) => {
    console.log(`  ${emp}: ${v.activo} activos, ${v.baja} bajas, ${v.activo + v.baja} total`);
  });
  const totalActivos = Object.values(byEmpresa).reduce((s, v) => s + v.activo, 0);
  console.log(`  Total activos: ${totalActivos}`);

  // Verificar RFCs únicos
  const { data: all } = await supabase
    .from("employees")
    .select("rfc")
    .eq("organization_id", ORG_ID);
  const rfcs = (all ?? []).map((e) => e.rfc);
  const uniqueRfcs = new Set(rfcs);
  console.log(`  RFCs únicos: ${uniqueRfcs.size} de ${rfcs.length} registros`);

  if (uniqueRfcs.size === rfcs.length) {
    console.log("  ✓ Sin duplicados");
  } else {
    console.log("  ⚠ Aún hay duplicados");
  }
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
