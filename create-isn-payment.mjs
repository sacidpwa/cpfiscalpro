import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ORG_ID = "7145db9f-18fd-4729-9050-3f5c8f2e533e";
const CREATED_BY = "f4c6c044-c130-41de-9924-f7fa9b55c945";

async function main() {
  console.log("=== CREAR PÓLIZA DE PAGO ISN MAYO 2026 ===\n");

  // Buscar IDs de cuentas
  const { data: accts } = await supabase
    .from("accounts")
    .select("id, codigo, nombre")
    .eq("organization_id", ORG_ID);
  const isnPasivo = (accts ?? []).find((a) => a.codigo === "214000400000000000002");
  const banorte = (accts ?? []).find((a) => a.codigo === "112000100100000000003");

  if (!isnPasivo) { console.log("ERROR: No se encontró 2140-004"); return; }
  if (!banorte) { console.log("ERROR: No se encontró BANORTE"); return; }
  console.log(`Cuenta ISN:  ${isnPasivo.codigo} "${isnPasivo.nombre}" id=${isnPasivo.id}`);
  console.log(`Cuenta Banco: ${banorte.codigo} "${banorte.nombre}" id=${banorte.id}`);

  // Buscar el siguiente número de transferencia disponible
  const { data: maxEntry } = await supabase
    .from("journal_entries")
    .select("numero")
    .eq("organization_id", ORG_ID)
    .eq("tipo", "transferencia")
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextNum = (maxEntry?.numero ?? 0) + 1;
  console.log(`Próximo número de transferencia: ${nextNum}`);

  // Crear la póliza
  const MONTO = 5779.0;
  const FECHA = "2026-06-17"; // fecha límite de pago mensual
  const CONCEPTO = "Pago del impuesto sobre nominas del mes de Mayo 2026. Forma de pago TEF.";

  const { data: entry, error: eErr } = await supabase
    .from("journal_entries")
    .insert({
      organization_id: ORG_ID,
      tipo: "transferencia",
      numero: nextNum,
      fecha: FECHA,
      concepto: CONCEPTO,
      estatus: "confirmada",
      total_cargo: MONTO,
      total_abono: MONTO,
      referencia: "2026-06",
      periodo: 6,
      created_by: CREATED_BY,
    })
    .select("id")
    .single();

  if (eErr) { console.error("ERROR al crear póliza:", eErr.message); return; }
  console.log(`\n✓ Póliza creada: transferencia #${nextNum} ${FECHA} id=${entry.id}`);

  // Crear las líneas
  const { error: lErr } = await supabase.from("journal_lines").insert([
    {
      entry_id: entry.id,
      organization_id: ORG_ID,
      account_id: isnPasivo.id,
      concepto: "Pago ISN Mayo 2026",
      cargo: MONTO,
      abono: 0,
      orden: 0,
    },
    {
      entry_id: entry.id,
      organization_id: ORG_ID,
      account_id: banorte.id,
      concepto: "Pago ISN Mayo 2026",
      cargo: 0,
      abono: MONTO,
      orden: 1,
    },
  ]);

  if (lErr) { console.error("ERROR al crear líneas:", lErr.message); return; }
  console.log(`✓ Líneas creadas:`);
  console.log(`  Cargo  ${isnPasivo.codigo} (ISN pasivo)    $${MONTO.toFixed(2)}`);
  console.log(`  Abono  ${banorte.codigo} (BANORTE)         $${MONTO.toFixed(2)}`);

  // Verificar el estado del pasivo ISN
  console.log("\n=== ESTADO DEL PASIVO ISN (cuenta 2140-004) ===");
  const { data: allMovs } = await supabase
    .from("journal_lines")
    .select("cargo, abono, concepto, entry:journal_entries!inner(fecha, tipo, numero, estatus)")
    .eq("entry.organization_id", ORG_ID)
    .neq("entry.estatus", "cancelada")
    .eq("account_id", isnPasivo.id)
    .order("entry.fecha");

  let totalCargo = 0, totalAbono = 0;
  console.log("Movimientos:");
  (allMovs ?? []).forEach((l) => {
    const e = l.entry;
    totalCargo += Number(l.cargo || 0);
    totalAbono += Number(l.abono || 0);
    console.log(`  ${e?.fecha} ${e?.tipo} #${e?.numero}  C=${l.cargo}  A=${l.abono}  "${(l.concepto || "").slice(0, 45)}"`);
  });
  console.log(`\n  Total abonos (pasivo generado): $${totalAbono.toFixed(2)}`);
  console.log(`  Total cargos (pagos):            $${totalCargo.toFixed(2)}`);
  console.log(`  Saldo del pasivo:                $${(totalAbono - totalCargo).toFixed(2)}`);
  console.log(totalAbono - totalCargo === 0 ? "  ✓ PASIVO LIQUIDADO" : "  ⚠ Pasivo pendiente");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
