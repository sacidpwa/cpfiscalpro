import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ORG_ID = "7145db9f-18fd-4729-9050-3f5c8f2e533e";

async function main() {
  console.log("=== BUSCAR PAGOS ANTERIORES DEL ISN ===\n");

  // Buscar la cuenta de pasivo ISN
  const { data: accts } = await supabase
    .from("accounts")
    .select("id, codigo, nombre")
    .eq("organization_id", ORG_ID);
  const acctMap = {};
  (accts ?? []).forEach((a) => (acctMap[a.id] = a));
  const isnAcct = (accts ?? []).find((a) => a.codigo === "214000400000000000002");

  if (!isnAcct) { console.log("No se encontró la cuenta 2140-004"); return; }

  // Buscar todos los movimientos en la cuenta ISN (cargos = pagos)
  const { data: allLines } = await supabase
    .from("journal_lines")
    .select("cargo, abono, concepto, account_id, entry:journal_entries!inner(fecha, tipo, numero, concepto, estatus)")
    .eq("entry.organization_id", ORG_ID)
    .neq("entry.estatus", "cancelada")
    .eq("account_id", isnAcct.id)
    .order("entry.fecha", { ascending: false })
    .limit(20);

  console.log("Movimientos en 2140-004 (ISN pasivo) — más recientes:");
  (allLines ?? []).forEach((l) => {
    const e = l.entry;
    const tipo = Number(l.cargo) > 0 ? "CARGO (pago)" : "ABONO (pasivo)";
    console.log(`  ${e?.fecha} ${e?.tipo} #${e?.numero}  ${tipo}  C=${l.cargo}  A=${l.abono}`);
    console.log(`    línea: "${(l.concepto || "").slice(0, 60)}"`);
    console.log(`    póliza: "${(e?.concepto || "").slice(0, 60)}"`);
  });

  // Buscar la póliza de pago más reciente para ver qué cuenta bancaria usó
  console.log("\n=== BUSCAR CUENTA BANCARIA USADA EN PAGOS DE ISN ===");

  // Buscar pólizas que mencionen "nomina" o "ISN" en conceptos de pago
  const { data: payEntries } = await supabase
    .from("journal_entries")
    .select("id, tipo, numero, fecha, concepto")
    .eq("organization_id", ORG_ID)
    .or("concepto.ilike.%pago%nomina%,concepto.ilike.%impuesto%sobre%nomina%,concepto.ilike.%isn%,concepto.ilike.%3%sobre%nomina%")
    .order("fecha", { ascending: false })
    .limit(10);

  console.log("\nPólizas que mencionan ISN/nómina (pago):");
  for (const e of (payEntries ?? [])) {
    const { data: eLines } = await supabase
      .from("journal_lines")
      .select("account_id, cargo, abono, concepto")
      .eq("entry_id", e.id)
      .order("orden");
    console.log(`\n  ${e.fecha} ${e.tipo} #${e.numero}  "${(e.concepto || "").slice(0, 60)}"`);
    (eLines ?? []).forEach((l) => {
      const a = acctMap[l.account_id];
      const cod = a?.codigo || "?";
      // Marcar cuentas bancarias (1xxx que sean bancos)
      const isBank = /^1[12]/.test(cod);
      console.log(`    ${cod}  "${(a?.nombre || "").slice(0, 30)}"  C=${l.cargo}  A=${l.abono}${isBank ? "  ← BANCO" : ""}`);
    });
  }

  // Listar cuentas bancarias disponibles
  console.log("\n=== CUENTAS BANCARIAS DISPONIBLES ===");
  const bancos = (accts ?? []).filter((a) => /^1[12]/.test(a.codigo) && !a.acumulativa);
  bancos.forEach((a) => console.log(`  ${a.codigo}  "${a.nombre}"`));
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
