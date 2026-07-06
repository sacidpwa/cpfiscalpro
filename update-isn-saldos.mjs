import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ORG_ID = "7145db9f-18fd-4729-9050-3f5c8f2e533e";

async function main() {
  console.log("=== ACTUALIZAR SALDOS ISN (7,560 → 5,779) ===\n");

  // 1. Cuenta de GASTO ISN (610002000000000000002) — deudora, acumula gastos
  // Abril saldo = 23,778.00, Mayo saldo = 31,338.00 (delta = 7,560)
  // Nuevo Mayo = 23,778 + 5,779 = 29,557.00
  // Períodos 6-12 arrastran el valor de Mayo (no procesados) → también 29,557

  console.log("--- Cuenta 6100-002 (GASTO ISN) ---");
  const { data: balMayGasto } = await supabase
    .from("account_balances")
    .select("id, saldo_final")
    .eq("organization_id", ORG_ID)
    .eq("account_codigo", "610002000000000000002")
    .eq("ejercicio", 2026)
    .eq("periodo", 5)
    .maybeSingle();
  console.log(`  Mayo actual: ${balMayGasto?.saldo_final} → nuevo: 29557.00`);

  const { error: errGasto } = await supabase
    .from("account_balances")
    .update({ saldo_final: 29557.00 })
    .eq("id", balMayGasto.id);
  if (errGasto) console.error("  ERROR:", errGasto.message);
  else console.log("  ✓ Mayo actualizado");

  // Períodos 6-12 (arrastrados, no procesados)
  for (let p = 6; p <= 12; p++) {
    const { data: bal } = await supabase
      .from("account_balances")
      .select("id, saldo_final")
      .eq("organization_id", ORG_ID)
      .eq("account_codigo", "610002000000000000002")
      .eq("ejercicio", 2026)
      .eq("periodo", p)
      .maybeSingle();
    if (bal) {
      const { error } = await supabase
        .from("account_balances")
        .update({ saldo_final: 29557.00 })
        .eq("id", bal.id);
      if (!error) console.log(`  ✓ Periodo ${p}: ${bal.saldo_final} → 29557.00`);
    }
  }

  // 2. Cuenta de PASIVO ISN (214000400000000000002) — acreedora
  // Mayo saldo = 7,560 (ISN de Mayo sin pagar)
  // Nuevo Mayo = 5,779 (ISN corregido sin pagar)

  console.log("\n--- Cuenta 2140-004 (PASIVO ISN) ---");
  const { data: balMayPas } = await supabase
    .from("account_balances")
    .select("id, saldo_final")
    .eq("organization_id", ORG_ID)
    .eq("account_codigo", "214000400000000000002")
    .eq("ejercicio", 2026)
    .eq("periodo", 5)
    .maybeSingle();
  console.log(`  Mayo actual: ${balMayPas?.saldo_final} → nuevo: 5779.00`);

  const { error: errPas } = await supabase
    .from("account_balances")
    .update({ saldo_final: 5779.00 })
    .eq("id", balMayPas.id);
  if (errPas) console.error("  ERROR:", errPas.message);
  else console.log("  ✓ Mayo actualizado");

  // Períodos 6-12 del pasivo (arrastran Mayo hasta que se pague en Junio)
  for (let p = 6; p <= 12; p++) {
    const { data: bal } = await supabase
      .from("account_balances")
      .select("id, saldo_final")
      .eq("organization_id", ORG_ID)
      .eq("account_codigo", "214000400000000000002")
      .eq("ejercicio", 2026)
      .eq("periodo", p)
      .maybeSingle();
    if (bal) {
      const { error } = await supabase
        .from("account_balances")
        .update({ saldo_final: 5779.00 })
        .eq("id", bal.id);
      if (!error) console.log(`  ✓ Periodo ${p}: ${bal.saldo_final} → 5779.00`);
    }
  }

  // 3. Verificar
  console.log("\n=== VERIFICACIÓN ===");
  for (const [codigo, nombre] of [
    ["610002000000000000002", "GASTO ISN"],
    ["214000400000000000002", "PASIVO ISN"],
  ]) {
    const { data: bals } = await supabase
      .from("account_balances")
      .select("periodo, saldo_final")
      .eq("organization_id", ORG_ID)
      .eq("account_codigo", codigo)
      .eq("ejercicio", 2026)
      .order("periodo");
    console.log(`\n  ${codigo} (${nombre}):`);
    (bals ?? []).forEach((b) => {
      const delta = b.periodo > 1 ? "" : "";
      console.log(`    P${b.periodo}: ${Number(b.saldo_final).toFixed(2)}`);
    });
  }

  // Calcular el delta Mayo (lo que verá el HELIX-LAROSS split)
  const { data: gastoMay } = await supabase
    .from("account_balances")
    .select("saldo_final")
    .eq("organization_id", ORG_ID)
    .eq("account_codigo", "610002000000000000002")
    .eq("ejercicio", 2026)
    .eq("periodo", 5)
    .maybeSingle();
  const { data: gastoAbr } = await supabase
    .from("account_balances")
    .select("saldo_final")
    .eq("organization_id", ORG_ID)
    .eq("account_codigo", "610002000000000000002")
    .eq("ejercicio", 2026)
    .eq("periodo", 4)
    .maybeSingle();
  const delta = Number(gastoMay?.saldo_final ?? 0) - Number(gastoAbr?.saldo_final ?? 0);
  console.log(`\n  Delta ISN Mayo (lo que ve el split): ${delta.toFixed(2)}`);
  console.log(`  HELIX (5/22): ${(delta * 5 / 22).toFixed(2)}`);
  console.log(`  HELIX-LAROSS (17/22): ${(delta * 17 / 22).toFixed(2)}`);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
