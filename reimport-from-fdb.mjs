import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import "dotenv/config";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const ORG_ID = "7145db9f-18fd-4729-9050-3f5c8f2e533e";
const CREATED_BY = "f4c6c044-c130-41de-9924-f7fa9b55c945";
const CSV_DIR = "D:\\Aplicaciones Web\\convertidor fdb\\exportacion\\csv";

// ---------- CSV parser ----------
function parseCSVLine(line) {
  const out = []; let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === ",") { out.push(cur); cur = ""; }
      else if (c === '"') inQ = true;
      else cur += c;
    }
  }
  out.push(cur); return out;
}
function readCsv(file) {
  // El convertir.js escribió los CSV con BOM UTF-8 pero los datos vienen de Firebird
  // en latin1 (ISO8859_1), por lo que los caracteres acentuados están como bytes latin1
  // marcados como UTF-8. Leemos el archivo como buffer, quitamos el BOM UTF-8 (EF BB BF)
  // y luego interpretamos los bytes restantes como latin1.
  const buf = readFileSync(file);
  let bytes = buf;
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    bytes = bytes.subarray(3);
  }
  const raw = bytes.toString("latin1");
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return { header: [], rows: [] };
  const header = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) rows.push(parseCSVLine(lines[i]));
  return { header, rows };
}
function rowToObj(header, row) {
  const o = {};
  for (let i = 0; i < header.length; i++) o[header[i]] = row[i];
  return o;
}

// ---------- Helpers ----------
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
async function insertBatch(table, rows, selectCols = "id") {
  let count = 0;
  for (const batch of chunk(rows, 200)) {
    const { data, error } = await supabase.from(table).insert(batch).select(selectCols);
    if (error) throw new Error(`${table}: ${error.message}`);
    count += data?.length ?? 0;
  }
  return count;
}

// ---------- Load accounts (codigo -> uuid) ----------
async function loadAccounts() {
  const { data, error } = await supabase
    .from("accounts").select("id, codigo").eq("organization_id", ORG_ID);
  if (error) throw new Error(`accounts: ${error.message}`);
  const map = new Map();
  for (const a of data ?? []) map.set(a.codigo, a.id);
  return map;
}

// ---------- Load CSV polizas ----------
function loadPolizas() {
  const out = [];
  for (const y of [23, 24, 25, 26]) {
    const file = `${CSV_DIR}\\POLIZAS${y}.csv`;
    if (!existsSync(file)) continue;
    const { header, rows } = readCsv(file);
    for (const r of rows) {
      const o = rowToObj(header, r);
      out.push({
        tipo: o.TIPO_POLI,
        numero: Number(o.NUM_POLIZ),
        periodo: Number(o.PERIODO),
        ejercicio: Number(o.EJERCICIO),
        fecha: (o.FECHA_POL || "").slice(0, 10),
        concepto: (o.CONCEP_PO || "").trim(),
      });
    }
  }
  return out;
}

// ---------- Load CSV auxiliar ----------
function loadAuxiliar() {
  const out = [];
  for (const y of [23, 24, 25, 26]) {
    const file = `${CSV_DIR}\\AUXILIAR${y}.csv`;
    if (!existsSync(file)) continue;
    const { header, rows } = readCsv(file);
    for (const r of rows) {
      const o = rowToObj(header, r);
      const monto = Number(o.MONTOMOV || 0);
      const dh = (o.DEBE_HABER || "").toUpperCase();
      out.push({
        tipo: o.TIPO_POLI,
        numero: Number(o.NUM_POLIZ),
        periodo: Number(o.PERIODO),
        ejercicio: Number(o.EJERCICIO),
        numCta: o.NUM_CTA,
        concepto: (o.CONCEP_PO || "").trim(),
        // Conservamos el signo: un cargo/abono negativo se swap-ea después
        cargo: dh === "D" ? monto : 0,
        abono: dh === "H" ? monto : 0,
        orden: Number(o.ORDEN || 0),
      });
    }
  }
  return out;
}

// ---------- MAIN ----------
async function main() {
  console.log("=== RE-IMPORTACIÓN DESDE CSV DEL FDB ===\n");

  // 1. Cargar datos fuente
  console.log("Cargando cuentas de Supabase...");
  const acctMap = await loadAccounts();
  console.log(`  ${acctMap.size} cuentas mapeadas`);

  console.log("Cargando pólizas desde CSV...");
  const polizas = loadPolizas();
  console.log(`  ${polizas.length} pólizas en CSV`);

  console.log("Cargando auxiliar desde CSV...");
  const aux = loadAuxiliar();
  console.log(`  ${aux.length} líneas en CSV\n`);

  // 2. Borrar journal_entries y journal_lines existentes
  console.log("Borrando journal_lines existentes...");
  let deletedLines = 0;
  while (true) {
    const { data, error } = await supabase
      .from("journal_lines").delete({ count: "exact" })
      .eq("organization_id", ORG_ID).limit(5000).select("id");
    if (error) throw new Error(`delete lines: ${error.message}`);
    const n = data?.length ?? 0;
    deletedLines += n;
    if (n < 5000) break;
  }
  console.log(`  ${deletedLines} líneas borradas`);

  console.log("Borrando journal_entries existentes...");
  let deletedEntries = 0;
  while (true) {
    const { data, error } = await supabase
      .from("journal_entries").delete({ count: "exact" })
      .eq("organization_id", ORG_ID).limit(5000).select("id");
    if (error) throw new Error(`delete entries: ${error.message}`);
    const n = data?.length ?? 0;
    deletedEntries += n;
    if (n < 5000) break;
  }
  console.log(`  ${deletedEntries} pólizas borradas\n`);

  // 3. Insertar pólizas y mapearlas a un uuid por clave (tipo,numero,periodo,ejercicio)
  console.log("Insertando pólizas...");
  // Tipos en el FDB: Ig=Ingreso, Eg=Egreso, Ch=Cheque, Dr=Diario, Tr=Transferencia
  // Con 5 tipos en el enum, cada tipo tiene su propio espacio de numeración,
  // por lo que NO se necesitan offsets para evitar colisiones.
  const tipoMap = {
    Ig: "ingreso", Eg: "egreso", Ch: "cheque", Dr: "diario", Tr: "transferencia",
    I: "ingreso", E: "egreso", D: "diario", O: "diario",
  };
  const keyOf = (p) => `${p.tipo}|${p.numero}|${p.periodo}|${p.ejercicio}`;
  const idByKey = new Map();
  let polizasOk = 0;
  const entriesToInsert = polizas.map((p) => {
    const tipo = tipoMap[p.tipo] ?? "diario";
    return {
      organization_id: ORG_ID,
      tipo,
      numero: p.numero,
      fecha: p.fecha,
      concepto: p.concepto,
      estatus: "confirmada",
      total_cargo: 0,
      total_abono: 0,
      referencia: `${p.ejercicio}-${String(p.periodo).padStart(2, "0")}`,
      periodo: p.periodo,
      created_by: CREATED_BY,
    };
  });
  // Dedup por (tipo, numero, fecha) — constraint único en Supabase
  const seen = new Set();
  const dedupedEntries = [];
  const dedupedIdx = [];
  let dupCount = 0;
  for (let i = 0; i < entriesToInsert.length; i++) {
    const e = entriesToInsert[i];
    const k = `${e.tipo}|${e.numero}|${e.fecha}`;
    if (seen.has(k)) { dupCount++; continue; }
    seen.add(k);
    dedupedEntries.push(e);
    dedupedIdx.push(i);
  }
  if (dupCount) console.log(`  ${dupCount} pólizas duplicadas (mismo tipo/numero/fecha) saltadas`);

  // Insertar en lotes y mapear por orden
  for (const batch of chunk(dedupedEntries, 200)) {
    const { data, error } = await supabase.from("journal_entries").insert(batch).select("id,tipo,numero,fecha");
    if (error) throw new Error(`insert entries: ${error.message}`);
    (data ?? []).forEach((r, idx) => {
      const origIdx = dedupedIdx[polizasOk + idx];
      const origKey = keyOf(polizas[origIdx]);
      idByKey.set(origKey, r.id);
    });
    polizasOk += data?.length ?? 0;
    if (polizasOk % 1000 === 0 || polizasOk === dedupedEntries.length) {
      console.log(`  ${polizasOk}/${dedupedEntries.length}`);
    }
  }
  console.log(`  ${polizasOk} pólizas insertadas\n`);

  // 4. Insertar journal_lines
  console.log("Insertando líneas (auxiliar)...");
  const lineRows = [];
  let sinPoliza = 0, sinCuenta = 0;
  const totalsByEntry = {};
  const ordenByEntry = {};
  for (const a of aux) {
    const key = keyOf(a);
    const entryId = idByKey.get(key);
    if (!entryId) { sinPoliza++; continue; }
    const acctId = acctMap.get(a.numCta);
    if (!acctId) { sinCuenta++; continue; }

    let cargo = a.cargo;
    let abono = a.abono;
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
      concepto: a.concepto || null,
      cargo,
      abono,
      orden,
    });
  }
  console.log(`  ${lineRows.length} líneas preparadas (sin póliza: ${sinPoliza}, sin cuenta: ${sinCuenta})`);

  let linesOk = 0;
  for (const batch of chunk(lineRows, 500)) {
    const { error } = await supabase.from("journal_lines").insert(batch);
    if (error) throw new Error(`insert lines: ${error.message}`);
    linesOk += batch.length;
    if (linesOk % 5000 === 0 || linesOk === lineRows.length) {
      console.log(`  ${linesOk}/${lineRows.length}`);
    }
  }
  console.log(`  ${linesOk} líneas insertadas\n`);

  // 5. Actualizar totales
  console.log("Actualizando totales de pólizas...");
  let totalizados = 0;
  for (const [entryId, t] of Object.entries(totalsByEntry)) {
    const { error } = await supabase
      .from("journal_entries").update({ total_cargo: t.c, total_abono: t.a }).eq("id", entryId);
    if (error) console.warn(`  WARN total ${entryId}: ${error.message}`);
    totalizados++;
    if (totalizados % 1000 === 0) console.log(`  ${totalizados}/${Object.keys(totalsByEntry).length}`);
  }
  console.log(`  ${totalizados} pólizas totalizadas\n`);

  // 6. Resumen final
  console.log("=== RE-IMPORTACIÓN COMPLETADA ===");
  console.log(`  Pólizas insertadas: ${polizasOk}`);
  console.log(`  Líneas insertadas:  ${linesOk}`);
  console.log(`  Líneas sin póliza:  ${sinPoliza}`);
  console.log(`  Líneas sin cuenta:  ${sinCuenta}`);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
