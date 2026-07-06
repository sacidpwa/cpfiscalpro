import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ORG_ID = "7145db9f-18fd-4729-9050-3f5c8f2e533e";

async function main() {
  const { data: emps } = await supabase
    .from("employees")
    .select("id, numero, nombre, apellido_paterno, apellido_materno, rfc, nss, empresa, estatus, fecha_alta, fecha_baja")
    .eq("organization_id", ORG_ID)
    .order("empresa, nombre");

  console.log("=== ANÁLISIS DE DUPLICADOS EN EMPLEADOS ===\n");
  console.log(`Total registros: ${emps?.length ?? 0}\n`);

  // Buscar duplicados por RFC
  const byRfc = {};
  (emps ?? []).forEach((e) => {
    const rfc = (e.rfc || "").trim().toUpperCase();
    if (!rfc) return;
    if (!byRfc[rfc]) byRfc[rfc] = [];
    byRfc[rfc].push(e);
  });

  console.log("=== DUPLICADOS POR RFC ===\n");
  let dupCount = 0;
  Object.entries(byRfc).forEach(([rfc, arr]) => {
    if (arr.length > 1) {
      dupCount++;
      console.log(`RFC: ${rfc} (${arr.length} registros)`);
      arr.forEach((e) => {
        const full = [e.nombre, e.apellido_paterno, e.apellido_materno].filter(Boolean).join(" ");
        console.log(`  id=${e.id}  #${e.numero}  "${full}"  empresa=${e.empresa}  estatus=${e.estatus}  alta=${e.fecha_alta}`);
      });
      console.log();
    }
  });
  if (!dupCount) console.log("Sin duplicados por RFC\n");

  // Buscar por NSS también
  const byNss = {};
  (emps ?? []).forEach((e) => {
    const nss = (e.nss || "").trim();
    if (!nss) return;
    if (!byNss[nss]) byNss[nss] = [];
    byNss[nss].push(e);
  });

  console.log("=== DUPLICADOS POR NSS ===\n");
  let nssDup = 0;
  Object.entries(byNss).forEach(([nss, arr]) => {
    if (arr.length > 1) {
      nssDup++;
      const full = [arr[0].nombre, arr[0].apellido_paterno].join(" ");
      console.log(`NSS: ${nss} (${arr.length} registros) - ${full}`);
      arr.forEach((e) => {
        console.log(`  id=${e.id}  #${e.numero}  empresa=${e.empresa}  estatus=${e.estatus}`);
      });
    }
  });
  if (!nssDup) console.log("Sin duplicados por NSS\n");

  // Buscar nombres duplicados (mismo nombre + apellido)
  const byName = {};
  (emps ?? []).forEach((e) => {
    const full = [e.nombre, e.apellido_paterno, e.apellido_materno].filter(Boolean).join(" ").toLowerCase().trim();
    if (!byName[full]) byName[full] = [];
    byName[full].push(e);
  });

  console.log("=== DUPLICADOS POR NOMBRE COMPLETO ===\n");
  let nameDup = 0;
  Object.entries(byName).forEach(([name, arr]) => {
    if (arr.length > 1) {
      nameDup++;
      console.log(`"${name}" (${arr.length} registros)`);
      arr.forEach((e) => {
        console.log(`  id=${e.id}  #${e.numero}  rfc=${e.rfc}  empresa=${e.empresa}  estatus=${e.estatus}  alta=${e.fecha_alta}`);
      });
      console.log();
    }
  });

  // Resumen
  console.log("\n=== RESUMEN ===");
  console.log(`Total registros: ${emps?.length ?? 0}`);
  console.log(`RFCs únicos: ${Object.keys(byRfc).length}`);
  console.log(`NSS únicos: ${Object.keys(byNss).length}`);
  console.log(`Nombres únicos: ${Object.keys(byName).length}`);
  console.log(`Duplicados por RFC: ${dupCount}`);
  console.log(`Duplicados por NSS: ${nssDup}`);
  console.log(`Duplicados por nombre: ${nameDup}`);

  // Empleados que aparecen en ambas empresas
  console.log("\n=== EMPLEADOS EN AMBAS EMPRESAS ===");
  const empSet = {};
  Object.entries(byRfc).forEach(([rfc, arr]) => {
    const empresas = [...new Set(arr.map((e) => e.empresa))];
    if (empresas.length > 1) {
      const full = [arr[0].nombre, arr[0].apellido_paterno].join(" ");
      console.log(`  ${full} (RFC: ${rfc}) está en: ${empresas.join(", ")}`);
      arr.forEach((e) => console.log(`    id=${e.id}  empresa=${e.empresa}  estatus=${e.estatus}`));
    }
  });
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
