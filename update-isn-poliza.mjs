import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ORG_ID = "7145db9f-18fd-4729-9050-3f5c8f2e533e";

async function main() {
  console.log("=== ACTUALIZAR PÓLIZA ISN MAYO 2026 ===\n");

  // 1. Buscar la póliza de accrual (Pasivo 3% sobre nomina Mayo-2026)
  const { data: entries, error: eErr } = await supabase
    .from("journal_entries")
    .select("id, tipo, numero, fecha, concepto, total_cargo, total_abono, referencia")
    .eq("organization_id", ORG_ID)
    .eq("fecha", "2026-05-30")
    .ilike("concepto", "%Pasivo 3% sobre nomina%Mayo%")
    .order("numero");

  if (eErr) throw new Error(`entries: ${eErr.message}`);
  console.log(`Pólizas encontradas: ${entries.length}`);
  entries.forEach((e) => {
    console.log(`  ${e.tipo} #${e.numero} ${e.fecha}  cargo=${e.total_cargo}  abono=${e.total_abono}`);
    console.log(`  concepto: "${e.concepto}"`);
    console.log(`  id: ${e.id}\n`);
  });

  if (!entries.length) {
    const { data: entries2 } = await supabase
      .from("journal_entries")
      .select("id, tipo, numero, fecha, concepto, total_cargo, total_abono")
      .eq("organization_id", ORG_ID)
      .eq("fecha", "2026-05-30")
      .ilike("concepto", "%nomina%")
      .order("numero");
    console.log("Búsqueda ampliada (concepto contiene 'nomina'):");
    (entries2 ?? []).forEach((e) => {
      console.log(`  ${e.tipo} #${e.numero} ${e.fecha}  cargo=${e.total_cargo}  "${e.concepto.slice(0, 60)}"`);
    });
    return;
  }

  // 2. Mostrar líneas actuales
  const poliza = entries[0];
  console.log("--- Líneas actuales ---");
  const { data: lines } = await supabase
    .from("journal_lines")
    .select("id, account_id, concepto, cargo, abono, orden")
    .eq("entry_id", poliza.id)
    .order("orden");

  const { data: accts } = await supabase
    .from("accounts")
    .select("id, codigo, nombre")
    .eq("organization_id", ORG_ID);
  const acctMap = {};
  (accts ?? []).forEach((a) => (acctMap[a.id] = a));

  (lines ?? []).forEach((l) => {
    const a = acctMap[l.account_id];
    console.log(`  ${a?.codigo} "${(a?.nombre || "").slice(0, 35)}"  C=${l.cargo}  A=${l.abono}  "${(l.concepto || "").slice(0, 50)}"`);
  });

  // 3. Actualizar líneas: cambiar 7560 → 5779 y corregir "Marzo" → "Mayo"
  const NUEVO_MONTO = 5779.0;
  console.log(`\n--- Actualizando líneas a $${NUEVO_MONTO} ---`);

  for (const l of (lines ?? [])) {
    const nuevoConcepto = (l.concepto || "").replace(/Marzo/gi, "Mayo");
    const update = { concepto: nuevoConcepto };

    if (Number(l.cargo) > 0) update.cargo = NUEVO_MONTO;
    if (Number(l.abono) > 0) update.abono = NUEVO_MONTO;

    const { error: lErr } = await supabase
      .from("journal_lines")
      .update(update)
      .eq("id", l.id);

    if (lErr) console.error(`  ERROR línea ${l.id}: ${lErr.message}`);
    else console.log(`  ✓ Línea ${l.id}: C=${update.cargo ?? l.cargo}  A=${update.abono ?? l.abono}`);
  }

  // 4. Actualizar totales de la póliza
  const { error: eUpd } = await supabase
    .from("journal_entries")
    .update({
      total_cargo: NUEVO_MONTO,
      total_abono: NUEVO_MONTO,
      concepto: poliza.concepto.replace(/Marzo/gi, "Mayo"),
    })
    .eq("id", poliza.id);

  if (eUpd) console.error(`  ERROR póliza: ${eUpd.message}`);
  else console.log(`  ✓ Póliza actualizada: total_cargo=${NUEVO_MONTO} total_abono=${NUEVO_MONTO}`);

  // 5. Verificar
  console.log("\n--- Líneas después de actualizar ---");
  const { data: newLines } = await supabase
    .from("journal_lines")
    .select("account_id, concepto, cargo, abono")
    .eq("entry_id", poliza.id)
    .order("orden");
  (newLines ?? []).forEach((l) => {
    const a = acctMap[l.account_id];
    console.log(`  ${a?.codigo} "${(a?.nombre || "").slice(0, 35)}"  C=${l.cargo}  A=${l.abono}  "${(l.concepto || "").slice(0, 50)}"`);
  });

  // 6. Buscar póliza de PAGO del ISN
  console.log("\n=== BÚSQUEDA DE PÓLIZA DE PAGO DEL ISN ===");
  const isnAcct = (accts ?? []).find((a) => a.codigo === "214000400000000000002");
  if (isnAcct) {
    const { data: payLines } = await supabase
      .from("journal_lines")
      .select("cargo, abono, concepto, entry:journal_entries!inner(fecha, tipo, numero, concepto, estatus)")
      .eq("entry.organization_id", ORG_ID)
      .neq("entry.estatus", "cancelada")
      .eq("account_id", isnAcct.id)
      .gte("entry.fecha", "2026-05-01")
      .lte("entry.fecha", "2026-06-30")
      .order("entry.fecha");

    console.log(`Movimientos en cuenta 2140-004 (ISN pasivo) mayo-junio 2026:`);
    (payLines ?? []).forEach((l) => {
      const e = l.entry;
      console.log(`  ${e?.fecha} ${e?.tipo} #${e?.numero}  C=${l.cargo}  A=${l.abono}  "${(l.concepto || "").slice(0, 50)}"`);
      console.log(`    póliza: "${(e?.concepto || "").slice(0, 60)}"`);
    });

    const totalCargo = (payLines ?? []).reduce((s, l) => s + Number(l.cargo || 0), 0);
    const totalAbono = (payLines ?? []).reduce((s, l) => s + Number(l.abono || 0), 0);
    console.log(`\n  Total abonos (pasivo generado): ${totalAbono.toFixed(2)}`);
    console.log(`  Total cargos (pagos realizados): ${totalCargo.toFixed(2)}`);
    console.log(`  Saldo del pasivo ISN: ${(totalAbono - totalCargo).toFixed(2)}`);
  }
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
