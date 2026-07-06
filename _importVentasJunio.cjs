const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
require("dotenv").config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ORG = "7145db9f-18fd-4729-9050-3f5c8f2e533e";
const CREATED_BY = "f4c6c044-c130-41de-9924-f7fa9b55c945";
const VENTAS_0 = "410000200000000000002"; // VENTAS AL 0%
const IVA_NO_COBRADO = "218100100000000000002"; // para ventas con IVA (raras)

// Client account map by RFC/name pattern from SPEI description
const CLIENT_MAP = {
  "DANIEL PONS RUENES": "115000100700000000003",
  "MARIA ELISA FLORES GOMEZ": "115000101100000000003",
  "GRUPO RESTAURANTERO  MI GUSTO ES": "115000103000000000003",
  "PARAISO LUDICO": "115000100600000000003",
  "IRENE ARZATE NARCISO": "115000104500000000003",
  "MARIA EVA PEREZ GARCIA": "115000100500000000003",
  "JACANURO": "115000102300000000003",
  "ANA IVONNE CASTRO PICHARDO": "115000103600000000003",
  "ERNESTO ADOLFO DIAZ CORREA": "115000102400000000003",
  "MAINLAR": "115000100900000000003",
  "PEDRO JONATHAN MONTELLANO GARCIA": "115000104900000000003",
  "CESAR": "115000100900000000003", // Garduño/Estrada → cobrado como Mainlar en junio
  "ALEJANDRA ABIGAIL TAVIRA MORALES": null, // no client account → skip
};
const CLIENTE_MOSTRADOR = "115000100100000000003";

function parseCsvLine(line) {
  const out = []; let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"') { inQ = !inQ; continue; } if (c === "," && !inQ) { out.push(cur); cur = ""; continue; } cur += c; }
  out.push(cur); return out;
}
function toNum(v) { if (!v) return 0; v = v.replace(/[$,]/g, "").replace(/-/g, "").trim(); return v ? parseFloat(v) : 0; }
function parseFecha(s) { const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : s; }

function identifyClient(descDet) {
  const upper = (descDet || "").toUpperCase();
  for (const [key, cod] of Object.entries(CLIENT_MAP)) {
    if (upper.includes(key.toUpperCase())) return cod;
  }
  return null;
}

const SKIP_FACTURAS = ["PRESTAMO", "NOMINA", "TDC", "CREDITO", "IMSS", "SAT", "CFE",
  "FERLU", "JL", "GRUPO DI", "HSM", "ACETAM", "MAKA", "CHENTE", "POLLO",
  "TOSTADA", "ALICO", "LYNCOTT", "ANDAMAR"];

const acctIdCache = {};
async function getAcctId(codigo) {
  if (acctIdCache[codigo]) return acctIdCache[codigo];
  const { data } = await s.from("accounts").select("id").eq("organization_id", ORG).eq("codigo", codigo).maybeSingle();
  if (!data) throw new Error("Cuenta no encontrada: " + codigo);
  acctIdCache[codigo] = data.id;
  return data.id;
}

async function nextNumero(tipo, year) {
  const { data: max } = await s.from("journal_entries").select("numero")
    .eq("organization_id", ORG).eq("tipo", tipo)
    .gte("fecha", `${year}-01-01`).lte("fecha", `${year}-12-31`)
    .order("numero", { ascending: false }).limit(1).maybeSingle();
  return (max?.numero ?? 0) + 1;
}

async function alreadyExists(fecha, factura, monto) {
  const { data } = await s.from("journal_entries").select("id, total_cargo")
    .eq("organization_id", ORG).eq("fecha", fecha)
    .or(`referencia.eq.${factura},concepto.ilike.%${factura}%`).limit(3);
  for (const d of data || []) if (Math.abs(d.total_cargo - monto) < 0.01) return true;
  return false;
}

async function crearIngreso(fecha, conceptoLineas) {
  // conceptoLineas = [{ clienteCod, clienteNombre, monto, folio }]
  if (conceptoLineas.length === 0) return null;
  const year = new Date(fecha).getFullYear();
  const numero = await nextNumero("ingreso", year);
  const total = conceptoLineas.reduce((s, l) => s + l.monto, 0);
  const concepto = `Ingresos del ${fecha}, Forma de Cobro "Cheque, TEF, Efectivo"`;
  const { data: entry, error } = await s.from("journal_entries").insert({
    organization_id: ORG, tipo: "ingreso", numero, fecha, concepto,
    referencia: `${year}-${String(new Date(fecha).getMonth() + 1).padStart(2, "0")}`,
    total_cargo: total, total_abono: total, estatus: "confirmada", created_by: CREATED_BY,
  }).select("id").single();
  if (error) throw new Error("insert entry: " + error.message);
  const entryId = entry.id;
  const linesInsert = [];
  let orden = 0;
  for (const l of conceptoLineas) {
    linesInsert.push({
      entry_id: entryId, organization_id: ORG,
      account_id: await getAcctId(l.clienteCod),
      concepto: `VENTA F- ${l.folio} / ${l.clienteNombre}`,
      cargo: l.monto, abono: 0, orden: orden++,
    });
    linesInsert.push({
      entry_id: entryId, organization_id: ORG,
      account_id: await getAcctId(VENTAS_0),
      concepto: `VENTA F- ${l.folio} / ${l.clienteNombre}`,
      cargo: 0, abono: l.monto, orden: orden++,
    });
  }
  const { error: lErr } = await s.from("journal_lines").insert(linesInsert);
  if (lErr) { await s.from("journal_entries").delete().eq("id", entryId); throw new Error("insert lines: " + lErr.message); }
  return { id: entryId, numero, total, numLineas: conceptoLineas.length };
}

async function main() {
  const txt = fs.readFileSync("JUNIO 2026.csv", "utf8");
  const lines = txt.split(/\r?\n/).filter((l) => l.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseCsvLine(lines[i]);
    if (c.length < 10) continue;
    rows.push({
      fechaOp: c[0], fecha: parseFecha(c[1] || c[0]),
      desc: c[3], deposito: toNum(c[4]), retiro: toNum(c[5]),
      descDet: c[8] || "", factura: (c[9] || "").trim(),
    });
  }
  console.log(`CSV filas: ${rows.length}`);

  // Filtrar solo depósitos que son ventas (SPEI con cliente, o DEP DE TERCEROS con HSA folio que no son prestamos/traspasos)
  const ventas = [];
  for (const r of rows) {
    if (r.deposito <= 0) continue;
    if (SKIP_FACTURAS.includes(r.factura)) continue;
    if (!r.factura || r.factura === "-") continue;
    // Saltar TRASPASO puro (no es venta)
    if (r.desc === "TRASPASO") continue;
    // El HSA5809 es "PAGO PRESTAMO" - skip
    if (r.descDet.includes("PAGO PRESTAMO")) continue;

    const clienteCod = identifyClient(r.descDet);
    if (clienteCod === null) {
      // No se pudo identificar cliente → usar CLIENTE_DE_MOSTRADOR si es un depósito de factura HSA
      if (r.factura.startsWith("HSA")) {
        ventas.push({ fecha: r.fecha, factura: r.factura, monto: r.deposito, clienteCod: CLIENTE_MOSTRADOR, clienteNombre: "CLIENTE DE MOSTRADOR" });
      }
      continue;
    }
    if (clienteCod) {
      // Extraer nombre del cliente de la descripción
      const upper = (r.descDet || "").toUpperCase();
      let nombre = "CLIENTE";
      for (const key of Object.keys(CLIENT_MAP)) {
        if (upper.includes(key.toUpperCase())) { nombre = key; break; }
      }
      ventas.push({ fecha: r.fecha, factura: r.factura, monto: r.deposito, clienteCod, clienteNombre: nombre });
    }
  }
  console.log(`Ventas identificadas: ${ventas.length}`);

  // Agrupar por fecha
  const byFecha = {};
  for (const v of ventas) {
    if (!byFecha[v.fecha]) byFecha[v.fecha] = [];
    byFecha[v.fecha].push(v);
  }

  let ok = 0, skip = 0, err = 0;
  const fechasOrden = Object.keys(byFecha).sort();
  for (const fecha of fechasOrden) {
    const lineas = byFecha[fecha];
    const totalDia = lineas.reduce((s, l) => s + l.monto, 0);
    // Verificar si ya existe una póliza de ingreso para esta fecha con este total
    if (await alreadyExists(fecha, "ingreso", totalDia)) { skip += lineas.length; continue; }
    try {
      const res = await crearIngreso(fecha, lineas);
      if (res) {
        ok += lineas.length;
        console.log(`OK ${fecha} ingreso #${res.numero} ${res.numLineas} facturas total=$${res.total.toFixed(2)}`);
      }
    } catch (e) {
      err += lineas.length;
      console.error(`ERR ${fecha}: ${e.message}`);
    }
  }
  console.log(`\n=== FIN: ${ok} ventas importadas, ${skip} ya existentes, ${err} errores ===`);

  // Mostrar resumen por cliente
  const byCliente = {};
  for (const v of ventas) {
    if (!byCliente[v.clienteNombre]) byCliente[v.clienteNombre] = 0;
    byCliente[v.clienteNombre] += v.monto;
  }
  console.log("\nVentas por cliente:");
  for (const [c, m] of Object.entries(byCliente).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c.padEnd(40)} $${m.toFixed(2)}`);
  }
  console.log(`  ${"TOTAL".padEnd(40)} $${ventas.reduce((s, v) => s + v.monto, 0).toFixed(2)}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });