import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import "dotenv/config";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const ORG_ID = "7145db9f-18fd-4729-9050-3f5c8f2e533e";

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function upsert(table, rows, conflict) {
  if (!rows.length) return 0;
  let count = 0;
  for (const batch of chunk(rows, 100)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict: conflict, ignoreDuplicates: false });
    if (error) throw new Error(`${table}: ${error.message}`);
    count += batch.length;
  }
  return count;
}

async function main() {
  const raw = readFileSync("public/contalero-export.json", "utf-8");
  const parsed = JSON.parse(raw);
  const { cuentas, polizas, detalles, saldos } = parsed;

  console.log(`Cuentas: ${cuentas.length}, Pólizas: ${polizas.length}, Detalles: ${detalles.length}, Saldos: ${saldos.length}`);

  // 1. Insert accounts, map codigo → uuid
  const accountRows = cuentas.map((c) => ({
    organization_id: ORG_ID,
    codigo: String(c.codigo),
    nombre: String(c.nombre ?? c.codigo),
    codigo_agrupador: c.tipo_sat ? String(c.tipo_sat) : null,
    naturaleza: String(c.naturaleza).toUpperCase() === "A" ? "acreedora" : "deudora",
    nivel: Number(c.nivel ?? 1),
    acumulativa: Number(c.acepta_movimientos ?? 1) === 0,
    activa: c.activo === undefined ? true : !!Number(c.activo),
  }));

  console.log("\n--- Cuentas ---");
  const accountIdByCodigo = new Map();
  for (const batch of chunk(accountRows, 100)) {
    const { data, error } = await supabase.from("accounts").upsert(batch, { onConflict: "organization_id,codigo" }).select("id, codigo");
    if (error) throw new Error(`accounts: ${error.message}`);
    (data ?? []).forEach((r) => accountIdByCodigo.set(r.codigo, r.id));
  }
  console.log(`${accountIdByCodigo.size} cuentas insertadas/mapeadas`);

  // Map legacy id → uuid per codigo
  const accountIdByLegacy = new Map();
  cuentas.forEach((c) => {
    const uuid = accountIdByCodigo.get(String(c.codigo));
    if (uuid && c.id != null) accountIdByLegacy.set(String(c.id), uuid);
  });

  // 2. Insert journal entries, map legacy poliza_id → uuid
  const tipoMap = { I: "ingreso", E: "egreso", D: "diario" };
  // Handle tipo "O" (otros/operaciones) to avoid collision with "diario"
  let oCounter = 10000;
  const entryRows = polizas.map((p) => ({
    organization_id: ORG_ID,
    tipo: tipoMap[String(p.tipo).toUpperCase()] ?? "diario",
    numero: String(p.tipo).toUpperCase() === "O" ? (oCounter++) : Number(p.numero ?? 0),
    fecha: String(p.fecha),
    concepto: String(p.concepto ?? ""),
    estatus: "confirmada",
    total_cargo: 0,
    total_abono: 0,
    referencia: p.mes != null && p.ejercicio != null ? `${p.ejercicio}-${p.mes}` : null,
    created_by: "f4c6c044-c130-41de-9924-f7fa9b55c945",
  }));

  // Deduplicate by (tipo, numero, fecha)
  const seen = new Set();
  const deduped = [];
  const dedupMap = []; // index in polizas -> index in deduped
  for (let i = 0; i < entryRows.length; i++) {
    const r = entryRows[i];
    const key = `${r.tipo}|${r.numero}|${r.fecha}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
    dedupMap.push(i);
  }
  const skipped = entryRows.length - deduped.length;
  if (skipped) console.log(`${skipped} polizas duplicadas saltadas`);

  console.log("\n--- Pólizas ---");
  const entryIdByLegacy = new Map();
  let polizasInsertadas = 0;
  for (const batch of chunk(deduped, 100)) {
    const { data, error } = await supabase.from("journal_entries").insert(batch).select("id,tipo,numero,fecha");
    if (error) throw new Error(`journal_entries: ${error.message}`);
    (data ?? []).forEach((r, idx) => {
      const globalIdx = dedupMap[polizasInsertadas + idx];
      const legacyId = polizas[globalIdx]?.id;
      if (legacyId != null) entryIdByLegacy.set(String(legacyId), r.id);
    });
    polizasInsertadas += data?.length ?? 0;
  }
  console.log(`${polizasInsertadas} pólizas insertadas`);

  // 3. Insert journal lines (detalles)
  console.log("\n--- Detalles ---");
  const totalsByEntry = {};
  const ordenByEntry = {};
  const lineRows = [];
  let skippedDetalles = 0;

  for (const d of detalles) {
    const entryId = entryIdByLegacy.get(String(d.poliza_id));
    if (!entryId) { skippedDetalles++; continue; }

    let acctId = accountIdByLegacy.get(String(d.cuenta_id)) ?? accountIdByCodigo.get(String(d.cuenta_id));
    if (!acctId) { skippedDetalles++; continue; }

    let cargo = Number(d.debe ?? 0);
    let abono = Number(d.haber ?? 0);
    // Swap negative values to the opposite side so both are >= 0
    if (cargo < 0) { abono -= cargo; cargo = 0; }
    if (abono < 0) { cargo -= abono; abono = 0; }
    const orden = ordenByEntry[entryId] ?? 0;
    ordenByEntry[entryId] = orden + 1;

    if (!totalsByEntry[entryId]) totalsByEntry[entryId] = { c: 0, a: 0 };
    totalsByEntry[entryId].c += cargo;
    totalsByEntry[entryId].a += abono;

    lineRows.push({
      entry_id: entryId,
      organization_id: ORG_ID,
      account_id: acctId,
      concepto: d.concepto ? String(d.concepto) : null,
      cargo,
      abono,
      orden,
    });
  }

  if (skippedDetalles) console.log(`${skippedDetalles} detalles saltados (sin mapping)`);
  const lineCount = await upsert("journal_lines", lineRows, undefined);
  console.log(`${lineCount} detalles insertados`);

  // Update journal entry totals
  console.log("\n--- Actualizando totales de pólizas ---");
  let totalizados = 0;
  for (const [entryId, t] of Object.entries(totalsByEntry)) {
    await supabase.from("journal_entries").update({ total_cargo: t.c, total_abono: t.a }).eq("id", entryId);
    totalizados++;
  }
  console.log(`${totalizados} pólizas totalizadas`);

  // 4. Insert account_balances
  console.log("\n--- Saldos ---");
  const balanceRows = [];
  for (const s of saldos) {
    const key = String(s.clave ?? "");
    const parts = key.split("_");
    if (parts.length < 4 || parts[0] !== "saldo") continue;
    const ejercicio = Number(parts[1]);
    const periodo = Number(parts[2]);
    const codigo = parts.slice(3).join("_");
    if (!ejercicio || !periodo || !codigo) continue;
    const saldoFinal = Number(s.valor ?? 0);
    if (!Number.isFinite(saldoFinal)) continue;
    balanceRows.push({
      organization_id: ORG_ID,
      account_codigo: codigo,
      ejercicio,
      periodo,
      saldo_inicial: 0,
      cargos: 0,
      abonos: 0,
      saldo_final: saldoFinal,
    });
  }
  const balanceCount = await upsert("account_balances", balanceRows, "organization_id,account_codigo,ejercicio,periodo");
  console.log(`${balanceCount} saldos insertados`);

  console.log("\n=== Importación completada ===");
}

main().catch(console.error);
