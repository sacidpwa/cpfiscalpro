import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ORG_ID = "7145db9f-18fd-4729-9050-3f5c8f2e533e";
const TARGET = 61979.90;
const TOL = 0.05;

async function apiAll(table, select, qs) {
  const PAGE = 1000; let all = []; let offset = 0;
  while (true) {
    const { data } = await supabase.from(table).select(select).range(offset, offset + PAGE - 1);
    all = all.concat(data ?? []);
    if ((data ?? []).length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function main() {
  console.log(`=== BÚSQUEDA DE ${TARGET.toFixed(2)} ===\n`);

  // 1. Buscar en journal_entries (total_cargo o total_abono)
  const entries = await apiAll("journal_entries", "id,tipo,numero,fecha,concepto,total_cargo,total_abono,referencia", `organization_id=eq.${ORG_ID}`);
  const matchEntries = entries.filter((e) =>
    Math.abs(Number(e.total_cargo) - TARGET) < TOL ||
    Math.abs(Number(e.total_abono) - TARGET) < TOL
  );
  console.log(`--- Pólizas con total_cargo/abono ≈ ${TARGET} ---`);
  if (matchEntries.length) {
    const { data: accts } = await supabase.from("accounts").select("id,codigo,nombre").eq("organization_id", ORG_ID);
    const acctMap = {}; (accts ?? []).forEach((a) => (acctMap[a.id] = a));
    for (const e of matchEntries) {
      console.log(`\n  ${e.tipo} #${e.numero} ${e.fecha}  cargo=${e.total_cargo}  abono=${e.total_abono}  ref=${e.referencia}`);
      console.log(`  concepto: "${e.concepto?.slice(0, 70)}"`);
      const { data: lines } = await supabase.from("journal_lines").select("account_id,cargo,abono,concepto").eq("entry_id", e.id).order("orden");
      (lines ?? []).forEach((l) => {
        const a = acctMap[l.account_id];
        console.log(`    ${a?.codigo}  ${(a?.nombre || "").slice(0, 30)}  C=${l.cargo}  A=${l.abono}`);
      });
    }
  } else {
    console.log("  Sin coincidencias en pólizas\n");
  }

  // 2. Buscar en journal_lines (cargo o abono individual)
  const lines = await apiAll("journal_lines", "id,account_id,cargo,abono,concepto,entry:journal_entries!inner(fecha,tipo,numero,concepto)", `organization_id=eq.${ORG_ID}`);
  const matchLines = lines.filter((l) =>
    Math.abs(Number(l.cargo) - TARGET) < TOL ||
    Math.abs(Number(l.abono) - TARGET) < TOL
  );
  console.log(`\n--- Líneas individuales con cargo/abono ≈ ${TARGET} ---`);
  if (matchLines.length) {
    const { data: accts } = await supabase.from("accounts").select("id,codigo,nombre").eq("organization_id", ORG_ID);
    const acctMap = {}; (accts ?? []).forEach((a) => (acctMap[a.id] = a));
    matchLines.forEach((l) => {
      const a = acctMap[l.account_id];
      const e = l.entry;
      console.log(`  ${e?.fecha} ${e?.tipo} #${e?.numero}  ${a?.codigo}  ${(a?.nombre || "").slice(0, 35)}  C=${l.cargo}  A=${l.abono}`);
      console.log(`    línea: "${(l.concepto || "").slice(0, 50)}"  póliza: "${(e?.concepto || "").slice(0, 50)}"`);
    });
  } else {
    console.log("  Sin coincidencias en líneas\n");
  }

  // 3. Buscar en account_balances (saldo_final o delta)
  const bals = await apiAll("account_balances", "account_codigo,ejercicio,periodo,saldo_final", `organization_id=eq.${ORG_ID}`);
  // Saldos que coinciden
  const matchBals = bals.filter((b) => Math.abs(Number(b.saldo_final) - TARGET) < TOL);
  console.log(`\n--- Saldos finales ≈ ${TARGET} ---`);
  if (matchBals.length) {
    const { data: accts } = await supabase.from("accounts").select("codigo,nombre").eq("organization_id", ORG_ID);
    const acctName = {}; (accts ?? []).forEach((a) => (acctName[a.codigo] = a.nombre));
    matchBals.forEach((b) => {
      console.log(`  ${b.account_codigo}  ${(acctName[b.account_codigo] || "").slice(0, 35)}  ${b.ejercicio}-P${b.periodo}  saldo=${b.saldo_final}`);
    });
  } else {
    console.log("  Sin coincidencias en saldos\n");
  }

  // Deltas que coinciden
  const byCode = {};
  bals.forEach((b) => {
    if (!byCode[b.account_codigo]) byCode[b.account_codigo] = [];
    byCode[b.account_codigo].push(b);
  });
  console.log(`\n--- Deltas de saldo ≈ ${TARGET} ---`);
  let deltaFound = false;
  for (const [codigo, arr] of Object.entries(byCode)) {
    arr.sort((a, b) => a.ejercicio - b.ejercicio || a.periodo - b.periodo);
    for (let i = 1; i < arr.length; i++) {
      const delta = Number(arr[i].saldo_final) - Number(arr[i - 1].saldo_final);
      if (Math.abs(delta - TARGET) < TOL) {
        const { data: a } = await supabase.from("accounts").select("nombre").eq("organization_id", ORG_ID).eq("codigo", codigo).maybeSingle();
        console.log(`  ${codigo}  ${(a?.nombre || "").slice(0, 35)}  ${arr[i].ejercicio}-P${arr[i].periodo}  delta=${delta.toFixed(2)}`);
        deltaFound = true;
      }
    }
  }
  if (!deltaFound) console.log("  Sin coincidencias en deltas\n");

  // 4. Buscar sumas de pólizas por mes que coincidan
  console.log(`\n--- Suma de pólizas por mes ≈ ${TARGET} ---`);
  const byMonth = {};
  entries.forEach((e) => {
    const am = String(e.fecha).slice(0, 7);
    if (!byMonth[am]) byMonth[am] = { cargo: 0, abono: 0, n: 0, tipos: {} };
    byMonth[am].cargo += Number(e.total_cargo || 0);
    byMonth[am].abono += Number(e.total_abono || 0);
    byMonth[am].n++;
    byMonth[am].tipos[e.tipo] = (byMonth[am].tipos[e.tipo] || 0) + Number(e.total_cargo || 0);
  });
  Object.entries(byMonth).sort().forEach(([am, v]) => {
    Object.entries(v.tipos).forEach(([tipo, monto]) => {
      if (Math.abs(monto - TARGET) < TOL) {
        console.log(`  ${am}  ${tipo}: ${monto.toFixed(2)}`);
      }
    });
  });
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
