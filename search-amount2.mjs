import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ORG_ID = "7145db9f-18fd-4729-9050-3f5c8f2e533e";
const TARGET = 61979.90;

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
  console.log(`=== BÚSQUEDA AMPLIA DE ${TARGET.toFixed(2)} (tolerancia ±$5) ===\n`);

  const { data: accts } = await supabase.from("accounts").select("id,codigo,nombre").eq("organization_id", ORG_ID);
  const acctMap = {}; (accts ?? []).forEach((a) => (acctMap[a.id] = a));

  // 1. Líneas individuales cercanas
  const lines = await apiAll("journal_lines", "id,account_id,cargo,abono,concepto,entry:journal_entries!inner(fecha,tipo,numero,concepto)", `organization_id=eq.${ORG_ID}`);
  console.log("--- Líneas con cargo/abono entre 61,974 y 61,985 ---");
  const closeLines = lines.filter((l) => {
    const c = Number(l.cargo || 0), a = Number(l.abono || 0);
    return (c >= 61974 && c <= 61985) || (a >= 61974 && a <= 61985);
  });
  closeLines.forEach((l) => {
    const a = acctMap[l.account_id];
    const e = l.entry;
    console.log(`  ${e?.fecha} ${e?.tipo} #${e?.numero}  ${a?.codigo}  ${(a?.nombre || "").slice(0, 35)}  C=${l.cargo}  A=${l.abono}`);
    console.log(`    "${(l.concepto || "").slice(0, 55)}"`);
  });
  if (!closeLines.length) console.log("  Sin coincidencias\n");

  // 2. Suma de líneas por cuenta+mes
  console.log("\n--- Suma de líneas por cuenta+mes ≈ 61,979.90 ---");
  const byAcctMonth = {};
  lines.forEach((l) => {
    const a = acctMap[l.account_id]; if (!a) return;
    const e = l.entry; if (!e) return;
    const am = String(e.fecha).slice(0, 7);
    if (e.estatus === "cancelada") return;
    const key = `${a.codigo}|${am}`;
    if (!byAcctMonth[key]) byAcctMonth[key] = { codigo: a.codigo, nombre: a.nombre, mes: am, cargo: 0, abono: 0, polizas: [] };
    byAcctMonth[key].cargo += Number(l.cargo || 0);
    byAcctMonth[key].abono += Number(l.abono || 0);
    byAcctMonth[key].polizas.push(`${e.tipo}#${e.numero}`);
  });
  let found2 = false;
  Object.values(byAcctMonth).forEach((v) => {
    if (Math.abs(v.cargo - TARGET) < 5 || Math.abs(v.abono - TARGET) < 5) {
      console.log(`  ${v.codigo}  "${v.nombre.slice(0, 35)}"  ${v.mes}  cargo=${v.cargo.toFixed(2)}  abono=${v.abono.toFixed(2)}  [${v.polizas.join(", ")}]`);
      found2 = true;
    }
  });
  if (!found2) console.log("  Sin coincidencias\n");

  // 3. Suma de pólizas por tipo+mes
  console.log("\n--- Suma de pólizas por tipo+mes ≈ 61,979.90 ---");
  const entries = await apiAll("journal_entries", "id,tipo,numero,fecha,concepto,total_cargo,total_abono", `organization_id=eq.${ORG_ID}`);
  const byTipoMonth = {};
  entries.forEach((e) => {
    if (e.estatus === "cancelada") return;
    const am = String(e.fecha).slice(0, 7);
    const key = `${e.tipo}|${am}`;
    if (!byTipoMonth[key]) byTipoMonth[key] = { tipo: e.tipo, mes: am, total: 0, n: 0 };
    byTipoMonth[key].total += Number(e.total_cargo || 0);
    byTipoMonth[key].n++;
  });
  let found3 = false;
  Object.values(byTipoMonth).sort((a, b) => a.mes.localeCompare(b.mes)).forEach((v) => {
    if (Math.abs(v.total - TARGET) < 5) {
      console.log(`  ${v.mes}  ${v.tipo}: ${v.total.toFixed(2)}  (${v.n} pólizas)`);
      found3 = true;
    }
  });
  if (!found3) console.log("  Sin coincidencias\n");

  // 4. Deltas de saldo cercanos
  console.log("\n--- Deltas de saldo ≈ 61,979.90 (±$5) ---");
  const bals = await apiAll("account_balances", "account_codigo,ejercicio,periodo,saldo_final", `organization_id=eq.${ORG_ID}`);
  const byCode = {};
  bals.forEach((b) => {
    if (!byCode[b.account_codigo]) byCode[b.account_codigo] = [];
    byCode[b.account_codigo].push(b);
  });
  let found4 = false;
  for (const [codigo, arr] of Object.entries(byCode)) {
    arr.sort((a, b) => a.ejercicio - b.ejercicio || a.periodo - b.periodo);
    for (let i = 1; i < arr.length; i++) {
      const delta = Number(arr[i].saldo_final) - Number(arr[i - 1].saldo_final);
      if (Math.abs(delta - TARGET) < 5) {
        const acct = accts?.find((a) => a.codigo === codigo);
        console.log(`  ${codigo}  "${(acct?.nombre || "").slice(0, 35)}"  ${arr[i].ejercicio}-P${arr[i].periodo}  delta=${delta.toFixed(2)}`);
        found4 = true;
      }
    }
  }
  if (!found4) console.log("  Sin coincidencias\n");

  // 5. ¿Es una combinación? Por ejemplo nómina + asimilados
  console.log("\n--- Posibles combinaciones ---");
  // Nómina mayo 2026 = 233,392.07, asimilados = 12,768.96
  // 233,392.07 / 4 = 58,348.02 (nómina semanal promedio)
  // 61,979.90 - 12,768.96 = 49,210.94
  // 61,979.90 / 5 = 12,395.98
  // 61,979.90 * 22/28 = 48,700.07 (si fuera split)
  // 61,979.90 * 5/22 = 14,086.34
  console.log(`  ${TARGET.toFixed(2)} / 22 = ${(TARGET / 22).toFixed(2)}`);
  console.log(`  ${TARGET.toFixed(2)} / 28 = ${(TARGET / 28).toFixed(2)}`);
  console.log(`  ${TARGET.toFixed(2)} × 5/22 = ${(TARGET * 5 / 22).toFixed(2)}`);
  console.log(`  ${TARGET.toFixed(2)} × 17/22 = ${(TARGET * 17 / 22).toFixed(2)}`);
  console.log(`  ${TARGET.toFixed(2)} × 5/28 = ${(TARGET * 5 / 28).toFixed(2)}`);
  console.log(`  ${TARGET.toFixed(2)} × 23/28 = ${(TARGET * 23 / 28).toFixed(2)}`);
  console.log(`  ${TARGET.toFixed(2)} - 12,768.96 (asimilados) = ${(TARGET - 12768.96).toFixed(2)}`);
  console.log(`  ${TARGET.toFixed(2)} + 12,768.96 = ${(TARGET + 12768.96).toFixed(2)}`);
  console.log(`  ${TARGET.toFixed(2)} × 28/22 = ${(TARGET * 28 / 22).toFixed(2)}`);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
