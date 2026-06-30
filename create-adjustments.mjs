import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import "dotenv/config";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const ORG_ID = "7145db9f-18fd-4729-9050-3f5c8f2e533e";
const CREATED_BY = "f4c6c044-c130-41de-9924-f7fa9b55c945";

const OBS = "PÓLIZA DE AJUSTE GENERADA PARA CUBRIR OMISIÓN DETECTADA EN LA CONTABILIDAD ANTERIOR (ASPEL COI). DIFERENCIA EN CONCILIACIÓN SALDOS VS PÓLIZAS.";

// IDs de cuentas
const ACCT = {
  BANORTE: "bd425238-0878-479a-addf-69f53146164d",
  CAPITAL: "b487e784-639a-42bf-a329-e6f9c26dfd13",
  SOCIOS: "5e4ae47c-1773-43c8-9d14-17b7ae6ac839",
  CUCA: "6427cb57-46a3-49af-8780-31bc30318845",
  CONTRA_CUCA: "83df9e60-2363-4f86-883e-90226f906d5e",
  DEP_ACUM: "dc928ab4-8dbc-4c96-83ee-4f0924e07b6b",
  OTROS_PROD: "", // se busca abajo
  DEP_GASTO: "",  // se busca abajo
  ROSSANO: "",    // se busca abajo
};

async function main() {
  console.log("=== CORRECCIONES Y PÓLIZAS DE AJUSTE ===\n");

  // Buscar IDs faltantes
  const { data: accts } = await supabase.from("accounts").select("id,codigo,nombre").eq("organization_id", ORG_ID);
  const byCode = {};
  (accts ?? []).forEach(a => byCode[a.codigo] = a);
  ACCT.OTROS_PROD = byCode["730000200000000000002"]?.id;
  ACCT.DEP_GASTO = byCode["630000200000000000002"]?.id;
  ACCT.ROSSANO = byCode["212000100100000000003"]?.id;
  console.log("Cuentas mapeadas:", { OTROS_PROD: ACCT.OTROS_PROD, DEP_GASTO: ACCT.DEP_GASTO, ROSSANO: ACCT.ROSSANO });

  // ====== 1. CORREGIR NOMBRE "ROSAANO" → "ROSSANO" ======
  console.log("\n--- 1. Corrección de nombre ---");
  const { error: errName } = await supabase
    .from("accounts")
    .update({ nombre: "JOSE JUAN LABRA ROSSANO" })
    .eq("organization_id", ORG_ID)
    .eq("codigo", "212000100100000000003");
  if (errName) console.error("  ERROR:", errName.message);
  else console.log('  Cuenta 212000100100000000003 corregida: "ROSAANO" → "ROSSANO" ✓');

  // ====== 2. PÓLIZAS DE AJUSTE BANCARIO (BANORTE) ======
  console.log("\n--- 2. Pólizas de ajuste bancario ---");
  const ajustesBanc = [
    { fecha: "2023-08-31", per: "2023-08", monto: 28698.00, mes: "agosto 2023" },
    { fecha: "2023-10-31", per: "2023-10", monto: 108812.66, mes: "octubre 2023" },
    { fecha: "2023-11-30", per: "2023-11", monto: 119066.68, mes: "noviembre 2023" },
    { fecha: "2024-02-29", per: "2024-02", monto: 25766.20, mes: "febrero 2024" },
    { fecha: "2024-03-31", per: "2024-03", monto: 44740.48, mes: "marzo 2024" },
  ];

  let numAdj = 90001;
  for (const ab of ajustesBanc) {
    const concepto = `${OBS} AJUSTE BANCARIO ${ab.mes.toUpperCase()}. CUENTA BANORTE 1226811847.`;
    const { data: entry, error: eErr } = await supabase.from("journal_entries").insert({
      organization_id: ORG_ID,
      tipo: "diario",
      numero: numAdj,
      fecha: ab.fecha,
      concepto,
      estatus: "confirmada",
      total_cargo: ab.monto,
      total_abono: ab.monto,
      referencia: ab.per,
      created_by: CREATED_BY,
    }).select("id").single();
    if (eErr) { console.error(`  ERROR ${ab.per}: ${eErr.message}`); numAdj++; continue; }

    const { error: lErr } = await supabase.from("journal_lines").insert([
      { entry_id: entry.id, organization_id: ORG_ID, account_id: ACCT.BANORTE, concepto: `Ajuste bancario ${ab.mes}`, cargo: ab.monto, abono: 0, orden: 0 },
      { entry_id: entry.id, organization_id: ORG_ID, account_id: ACCT.OTROS_PROD, concepto: `Contraajuste bancario ${ab.mes}`, cargo: 0, abono: ab.monto, orden: 1 },
    ]);
    if (lErr) console.error(`  ERROR líneas ${ab.per}: ${lErr.message}`);
    else console.log(`  ${ab.per}: Póliza diario #${numAdj} — Cargo BANORTE ${ab.monto.toFixed(2)} / Abono OTROS PRODUCTOS ${ab.monto.toFixed(2)} ✓`);
    numAdj++;
  }

  // ====== 3. PÓLIZA DE CAPITAL SOCIAL ======
  console.log("\n--- 3. Póliza de capital social ---");
  // Diciembre 2022: Capital social + Socios
  const conceptoCap = `${OBS} REGISTRO DE APORTACIÓN DE CAPITAL SOCIAL NO CONTABILIZADO MEDIANTE PÓLIZA EN SU MOMENTO.`;
  const { data: entryCap, error: eCapErr } = await supabase.from("journal_entries").insert({
    organization_id: ORG_ID, tipo: "diario", numero: 90010, fecha: "2022-12-31",
    concepto: conceptoCap, estatus: "confirmada", total_cargo: 100000, total_abono: 100000,
    referencia: "2022-12", created_by: CREATED_BY,
  }).select("id").single();
  if (eCapErr) console.error("  ERROR:", eCapErr.message);
  else {
    const { error: lCapErr } = await supabase.from("journal_lines").insert([
      { entry_id: entryCap.id, organization_id: ORG_ID, account_id: ACCT.SOCIOS, concepto: "Aportación de socios", cargo: 100000, abono: 0, orden: 0 },
      { entry_id: entryCap.id, organization_id: ORG_ID, account_id: ACCT.CAPITAL, concepto: "Capital social fijo", cargo: 0, abono: 100000, orden: 1 },
    ]);
    if (lCapErr) console.error("  ERROR líneas:", lCapErr.message);
    else console.log("  2022-12: Póliza #90010 — Cargo SOCIOS 100,000 / Abono CAPITAL SOCIAL 100,000 ✓");
  }

  // Enero 2023: CUCA + Contra CUCA
  const conceptoCuca = `${OBS} ACTUALIZACIÓN DE CUCA POR AUMENTO DE CAPITAL SOCIAL REGISTRADO EN DICIEMBRE 2022.`;
  const { data: entryCuca, error: eCucaErr } = await supabase.from("journal_entries").insert({
    organization_id: ORG_ID, tipo: "diario", numero: 90011, fecha: "2023-01-31",
    concepto: conceptoCuca, estatus: "confirmada", total_cargo: 100000, total_abono: 100000,
    referencia: "2023-01", created_by: CREATED_BY,
  }).select("id").single();
  if (eCucaErr) console.error("  ERROR:", eCucaErr.message);
  else {
    const { error: lCucaErr } = await supabase.from("journal_lines").insert([
      { entry_id: entryCuca.id, organization_id: ORG_ID, account_id: ACCT.CUCA, concepto: "CUCA por capitalización", cargo: 100000, abono: 0, orden: 0 },
      { entry_id: entryCuca.id, organization_id: ORG_ID, account_id: ACCT.CONTRA_CUCA, concepto: "Contra-cuenta CUCA", cargo: 0, abono: 100000, orden: 1 },
    ]);
    if (lCucaErr) console.error("  ERROR líneas:", lCucaErr.message);
    else console.log("  2023-01: Póliza #90011 — Cargo CUCA 100,000 / Abono CONTRA CUCA 100,000 ✓");
  }

  // ====== 4. PÓLIZAS DE DEPRECIACIÓN ======
  console.log("\n--- 4. Pólizas de depreciación ---");
  const FUNDAMENTO = `PÓLIZA DE AJUSTE POR DEPRECIACIÓN CALCULADA AUTOMATICAMENTE POR ASPEL COI SIN GENERACIÓN DE PÓLIZA. El sistema Aspel COI calculó la depreciación del equipo de transporte mediante su módulo de activos fijos y la registró directamente en los saldos mensuales de la cuenta 136000200000000000002 (Depreciación Acumulada). Sin embargo, en los meses de octubre y noviembre 2023 el contador realizó ajustes correctivos sobre los saldos —posiblemente por corrección de tasas, ajuste de valor residual, o baja de vehículos— sin generar la póliza contable correspondiente. La diferencia mensual de $7,672.08 representa el ajuste correctivo que se registra mediante cargo a la cuenta de depreciación acumulada y abono a la cuenta de gasto por depreciación del ejercicio, reflejando la corrección de la depreciación previamente calculada en exceso.`;

  const ajustesDep = [
    { fecha: "2023-10-31", per: "2023-10", mes: "octubre 2023" },
    { fecha: "2023-11-30", per: "2023-11", mes: "noviembre 2023" },
  ];
  let numDep = 90020;
  for (const ad of ajustesDep) {
    const concepto = `${FUNDAMENTO} AJUSTE CORRESPONDIENTE A ${ad.mes.toUpperCase()}.`;
    const { data: entryDep, error: eDepErr } = await supabase.from("journal_entries").insert({
      organization_id: ORG_ID, tipo: "diario", numero: numDep, fecha: ad.fecha,
      concepto, estatus: "confirmada", total_cargo: 7672.08, total_abono: 7672.08,
      referencia: ad.per, created_by: CREATED_BY,
    }).select("id").single();
    if (eDepErr) { console.error(`  ERROR ${ad.per}: ${eDepErr.message}`); numDep++; continue; }

    const { error: lDepErr } = await supabase.from("journal_lines").insert([
      { entry_id: entryDep.id, organization_id: ORG_ID, account_id: ACCT.DEP_ACUM, concepto: `Corrección depreciación acumulada ${ad.mes}`, cargo: 7672.08, abono: 0, orden: 0 },
      { entry_id: entryDep.id, organization_id: ORG_ID, account_id: ACCT.DEP_GASTO, concepto: `Corrección gasto depreciación ${ad.mes}`, cargo: 0, abono: 7672.08, orden: 1 },
    ]);
    if (lDepErr) console.error(`  ERROR líneas ${ad.per}: ${lDepErr.message}`);
    else console.log(`  ${ad.per}: Póliza #${numDep} — Cargo DEP. ACUM. 7,672.08 / Abono DEP. GASTO 7,672.08 ✓`);
    numDep++;
  }

  console.log("\n=== CORRECCIONES Y PÓLIZAS COMPLETADAS ===");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
