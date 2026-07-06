import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ORG_ID = "7145db9f-18fd-4729-9050-3f5c8f2e533e";
const TARGET = 257702;

async function apiAll(table, select) {
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
  console.log(`=== BÚSQUEDA DE ${TARGET} (±$5) ===\n`);
  const TOL = 5;

  const { data: accts } = await supabase.from("accounts").select("id,codigo,nombre").eq("organization_id", ORG_ID);
  const acctMap = {}; (accts ?? []).forEach((a) => (acctMap[a.id] = a));

  // 1. Pólizas con total cercano
  const entries = await apiAll("journal_entries", "id,tipo,numero,fecha,concepto,total_cargo,total_abono,referencia");
  const matchE = entries.filter((e) => Math.abs(Number(e.total_cargo) - TARGET) < TOL || Math.abs(Number(e.total_abono) - TARGET) < TOL);
  console.log("--- Pólizas con total ≈ 257,702 ---");
  if (matchE.length) {
    for (const e of matchE) {
      console.log(`  ${e.tipo} #${e.numero} ${e.fecha}  cargo=${e.total_cargo}  abono=${e.total_abono}`);
      console.log(`  "${(e.concepto || "").slice(0, 70)}"`);
    }
  } else console.log("  Sin coincidencias\n");

  // 2. Líneas individuales cercanas
  const lines = await apiAll("journal_lines", "id,account_id,cargo,abono,concepto,entry:journal_entries!inner(fecha,tipo,numero,concepto,estatus)");
  const matchL = lines.filter((l) => {
    const c = Number(l.cargo || 0), a = Number(l.abono || 0);
    return (c >= TARGET - TOL && c <= TARGET + TOL) || (a >= TARGET - TOL && a <= TARGET + TOL);
  });
  console.log("\n--- Líneas individuales ≈ 257,702 ---");
  if (matchL.length) {
    matchL.forEach((l) => {
      const a = acctMap[l.account_id]; const e = l.entry;
      console.log(`  ${e?.fecha} ${e?.tipo} #${e?.numero}  ${a?.codigo}  ${(a?.nombre||"").slice(0,35)}  C=${l.cargo}  A=${l.abono}`);
    });
  } else console.log("  Sin coincidencias\n");

  // 3. Suma por cuenta+mes
  console.log("\n--- Suma de líneas por cuenta+mes ≈ 257,702 ---");
  const byAM = {};
  lines.forEach((l) => {
    const a = acctMap[l.account_id]; if (!a || !l.entry || l.entry.estatus === "cancelada") return;
    const am = String(l.entry.fecha).slice(0, 7);
    const key = `${a.codigo}|${am}`;
    if (!byAM[key]) byAM[key] = { codigo: a.codigo, nombre: a.nombre, mes: am, cargo: 0, abono: 0 };
    byAM[key].cargo += Number(l.cargo || 0);
    byAM[key].abono += Number(l.abono || 0);
  });
  let found = false;
  Object.values(byAM).forEach((v) => {
    if (Math.abs(v.cargo - TARGET) < TOL || Math.abs(v.abono - TARGET) < TOL) {
      console.log(`  ${v.codigo}  "${v.nombre.slice(0,35)}"  ${v.mes}  cargo=${v.cargo.toFixed(2)}  abono=${v.abono.toFixed(2)}`);
      found = true;
    }
  });
  if (!found) console.log("  Sin coincidencias\n");

  // 4. Deltas de saldo
  console.log("\n--- Deltas de saldo ≈ 257,702 ---");
  const bals = await apiAll("account_balances", "account_codigo,ejercicio,periodo,saldo_final");
  const byCode = {};
  bals.forEach((b) => { if (!byCode[b.account_codigo]) byCode[b.account_codigo] = []; byCode[b.account_codigo].push(b); });
  let found4 = false;
  for (const [codigo, arr] of Object.entries(byCode)) {
    arr.sort((a, b) => a.ejercicio - b.ejercicio || a.periodo - b.periodo);
    for (let i = 1; i < arr.length; i++) {
      const delta = Number(arr[i].saldo_final) - Number(arr[i - 1].saldo_final);
      if (Math.abs(delta - TARGET) < TOL) {
        const acct = accts?.find((a) => a.codigo === codigo);
        console.log(`  ${codigo}  "${(acct?.nombre||"").slice(0,35)}"  ${arr[i].ejercicio}-P${arr[i].periodo}  delta=${delta.toFixed(2)}`);
        found4 = true;
      }
    }
  }
  if (!found4) console.log("  Sin coincidencias\n");

  // 5. Saldos finales cercanos
  console.log("\n--- Saldos finales ≈ 257,702 ---");
  const matchB = bals.filter((b) => Math.abs(Number(b.saldo_final) - TARGET) < TOL);
  if (matchB.length) {
    matchB.forEach((b) => {
      const acct = accts?.find((a) => a.codigo === b.account_codigo);
      console.log(`  ${b.account_codigo}  "${(acct?.nombre||"").slice(0,35)}"  ${b.ejercicio}-P${b.periodo}  saldo=${b.saldo_final}`);
    });
  } else console.log("  Sin coincidencias\n");

  // 6. Suma de pólizas por tipo+mes
  console.log("\n--- Suma de pólizas por tipo+mes ≈ 257,702 ---");
  const byTM = {};
  entries.forEach((e) => { if (e.estatus === "cancelada") return; const am = String(e.fecha).slice(0,7); const k = `${e.tipo}|${am}`; if (!byTM[k]) byTM[k] = {tipo:e.tipo,mes:am,total:0,n:0}; byTM[k].total += Number(e.total_cargo||0); byTM[k].n++; });
  let found6 = false;
  Object.values(byTM).sort((a,b) => a.mes.localeCompare(b.mes)).forEach((v) => {
    if (Math.abs(v.total - TARGET) < TOL) { console.log(`  ${v.mes}  ${v.tipo}: ${v.total.toFixed(2)} (${v.n} pólizas)`); found6 = true; }
  });
  if (!found6) console.log("  Sin coincidencias\n");

  // 7. Combinaciones posibles
  console.log("\n--- Combinaciones posibles ---");
  console.log(`  257,702 / 22 = ${(257702/22).toFixed(2)}`);
  console.log(`  257,702 × 5/22 = ${(257702*5/22).toFixed(2)}`);
  console.log(`  257,702 × 17/22 = ${(257702*17/22).toFixed(2)}`);
  console.log(`  257,702 / 5 = ${(257702/5).toFixed(2)}`);
  console.log(`  Nómina(233,392) + Asimilados(12,769) + IMSS(31,517) - ISN(5,779) = ${(233392.07+12768.96+31517.23-5779).toFixed(2)}`);
  console.log(`  Nómina(233,392) + IMSS(31,517) - 7,207 = ${(233392.07+31517.23-7207).toFixed(2)}`);
  console.log(`  Nómina(233,392) + Asimilados(12,769) + IMSS(31,517) - Honorarios(20,976) = ${(233392.07+12768.96+31517.23-20976).toFixed(2)}`);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
