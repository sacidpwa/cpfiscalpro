import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import { build } from "esbuild";

const REPO = "/home/dranur/Documentos/CPFiscalPro";
process.chdir(REPO);
const RUN = process.argv.includes("--run");
const lArg = process.argv.find((a) => a.startsWith("--limit"));
const LIMIT = lArg ? Number(lArg.split("=")[1]) : Infinity;

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  if (!line.includes("=") || line.trim().startsWith("#")) continue;
  const i = line.indexOf("=");
  process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const STUB = {
  "@tanstack/react-start": `export function createServerFn(){const o={method:()=>o,middleware:()=>o,inputValidator:()=>o,handler:()=>o,options:()=>o};return o;}`,
  "@/integrations/supabase/auth-middleware": `export const requireSupabaseAuth = async () => {};`,
  "@/integrations/supabase/client.server": `export const supabaseAdmin = {};`,
};
const stubPlugin = {
  name: "stub",
  setup(b) {
    const map = { "@tanstack/react-start": "rt", "@/integrations/supabase/auth-middleware": "am", "@/integrations/supabase/client.server": "cs" };
    b.onResolve({ filter: /^(?:@tanstack\/react-start|@\/integrations\/supabase\/auth-middleware|@\/integrations\/supabase\/client\.server)$/ }, (a) => ({ path: map[a.path], namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: STUB[Object.keys(map).find((k) => map[k] === a.path)], loader: "js" }));
  },
};
await build({ entryPoints: ["src/lib/cfdi.functions.ts"], outfile: "/tmp/opencode/cfdi.bundle.mjs", bundle: true, format: "esm", platform: "node", target: "node20", tsconfig: "tsconfig.json", plugins: [stubPlugin], logLevel: "error" });
await build({ entryPoints: ["src/lib/payroll.calc.ts"], outfile: "/tmp/opencode/calc.bundle.mjs", bundle: true, format: "esm", platform: "node", target: "node20", tsconfig: "tsconfig.json", logLevel: "error" });
const { stampPayrollReceiptInternal } = await import("/tmp/opencode/cfdi.bundle.mjs");
const { calcPayroll } = await import("/tmp/opencode/calc.bundle.mjs");

const ORG = "7145db9f-18fd-4729-9050-3f5c8f2e533e";
const FACTURAPI = "https://www.facturapi.io/v2";
const factorFalta = { semanal: 7 / 6, catorcenal: 7 / 6, quincenal: 1, mensual: 1 };

const { data: bc } = await sb.from("org_billing_config").select("environment, facturapi_live_key, facturapi_test_key").eq("organization_id", ORG).single();
const key = bc.environment === "test" ? bc.facturapi_test_key : bc.facturapi_live_key;
const { data: anyStamp } = await sb.from("cfdi_stamps").select("timbrado_por").eq("organization_id", ORG).limit(1);
const USER = anyStamp?.[0]?.timbrado_por;
console.log(`Ambiente=${bc.environment} user=${USER}`);

const { data: allStamps } = await sb.from("cfdi_stamps").select("folio").eq("organization_id", ORG);
const usedFolios = new Set((allStamps ?? []).map((s) => String(s.folio ?? "")));
let folioCounter = 900001;
function nextFolio(periodNum, empNum) {
  const p = String(periodNum).replace(/\D/g, "").slice(-4).padStart(4, "0");
  const e = String(empNum).replace(/\D/g, "").slice(-4).padStart(4, "0");
  for (;;) { const f = `${p}${e}${String(folioCounter++).padStart(6, "0")}`; if (!usedFolios.has(f)) { usedFolios.add(f); return Number(f); } }
}

async function loadTables(ej) {
  const [isr, sub, uma, smg] = await Promise.all([
    sb.from("tax_tables").select("*").eq("ejercicio", ej).eq("tipo", "isr_mensual").order("orden"),
    sb.from("tax_tables").select("*").eq("ejercicio", ej).eq("tipo", "subsidio_mensual").order("orden"),
    sb.from("fiscal_params").select("valor").eq("ejercicio", ej).eq("clave", "uma_diaria").maybeSingle(),
    sb.from("fiscal_params").select("valor").eq("ejercicio", ej).eq("clave", "salario_minimo_general").maybeSingle(),
  ]);
  const smgVal = Number(smg.data?.valor ?? 0);
  return { isrMensual: isr.data, subsidioMensual: sub.data ?? [], umaDiaria: Number(uma.data?.valor ?? 113.14), salarioMinimo: smgVal || undefined };
}
async function computeNeto(emp, period) {
  const tables = await loadTables(period.ejercicio);
  const { data: tipos } = await sb.from("incident_types").select("codigo,paga,cuenta_falta");
  const faltaCodes = new Set((tipos ?? []).filter((t) => !t.paga && t.cuenta_falta).map((t) => t.codigo));
  const otherCodes = new Set((tipos ?? []).filter((t) => !t.paga && !t.cuenta_falta).map((t) => t.codigo));
  const { data: asist } = await sb.from("attendance_entries").select("incident_code, extra_codes").eq("organization_id", ORG).eq("employee_id", emp.id).gte("fecha", period.fecha_inicio).lte("fecha", period.fecha_fin);
  let faltas = 0, otros = 0;
  (asist ?? []).forEach((a) => { const codes = [a.incident_code, ...(a.extra_codes ?? [])]; if (codes.some((c) => faltaCodes.has(c))) faltas++; if (codes.some((c) => otherCodes.has(c))) otros++; });
  const fFalta = factorFalta[period.periodicidad] ?? 1;
  const dd = Math.round((faltas * fFalta + otros) * 1e6) / 1e6;
  const dp = Math.max(0, Math.round((period.dias - dd) * 1e6) / 1e6);
  const div = { semanal: 4, catorcenal: 2, quincenal: 2, mensual: 1 }[period.periodicidad];
  const inf = Number(emp.infonavit_cuota_mensual ?? 0) > 0 ? Math.round((Number(emp.infonavit_cuota_mensual) / div) * 100) / 100 : 0;
  const res = calcPayroll({ salarioDiario: Number(emp.salario_diario), sdi: Number(emp.sdi), diasPagados: dp, periodicidad: period.periodicidad, deduccionesExtra: inf > 0 ? [{ importe: inf }] : undefined }, tables);
  return { res, dp, dd, faltas, otros, inf, tables };
}
async function recalcDb(receipt, emp, period, c) {
  const { res, dp, dd, faltas, otros, inf } = c;
  await sb.from("payroll_receipt_lines").delete().eq("receipt_id", receipt.id);
  const { error: uErr } = await sb.from("payroll_receipts").update({
    dias_pagados: dp, sueldo_diario: emp.salario_diario, sdi: emp.sdi,
    total_percepciones: res.total_percepciones, total_deducciones: res.total_deducciones, total_gravado: res.total_gravado, total_exento: res.total_exento,
    isr: res.isr, subsidio: res.subsidio, imss_obrero: res.imss_obrero, neto_pagar: res.neto,
    observaciones: (faltas > 0 || otros > 0) ? [faltas > 0 && `${faltas} falta(s)`, otros > 0 && `${otros} día(s) sin goce`].filter(Boolean).join(" · ") + ` · ${dd} día(s) descontado(s)` : null,
  }).eq("id", receipt.id);
  if (uErr) throw new Error(uErr.message);
  const desc = dp < period.dias ? `Sueldo (${dp} días devengados de ${period.dias})` : `Sueldo (${period.dias} días)`;
  const lines = [
    { concepto_clave: "001", descripcion: desc, tipo: "percepcion", importe_gravado: res.total_gravado, importe_exento: 0 },
    { concepto_clave: "002", descripcion: "ISR", tipo: "deduccion", importe_gravado: res.isr, importe_exento: 0 },
  ];
  if (res.imss_obrero > 0) lines.push({ concepto_clave: "001", descripcion: "IMSS Obrero", tipo: "deduccion", importe_gravado: res.imss_obrero, importe_exento: 0 });
  if (inf > 0) lines.push({ concepto_clave: "010", descripcion: "Crédito INFONAVIT", tipo: "deduccion", importe_gravado: inf, importe_exento: 0 });
  await sb.from("payroll_receipt_lines").insert(lines.map((l) => ({ ...l, receipt_id: receipt.id, organization_id: ORG })));
  return res.neto;
}

// ===== SELECCIÓN basada en el timbre activo (idempotente) =====
const { data: active } = await sb.from("cfdi_stamps")
  .select("id,reference_id,uuid_sat,folio,ambiente,facturapi_id,total,payload")
  .eq("kind", "nomina").eq("organization_id", ORG).eq("estatus", "timbrado");
const buggy = (active ?? []).filter((s) => ((s.payload?.complements?.[0]?.data?.deducciones) ?? []).some((d) => (d.clave ?? d.concepto) === "020"));
console.log(`Timbres activos con deducción 020 (buggy): ${buggy.length}`);

const batch = []; const anomalies = [];
if (buggy.length) {
  const { data: receipts } = await sb.from("payroll_receipts").select("id,employee_id,neto_pagar,employee:employees(*),period:payroll_periods(*)").in("id", buggy.map((s) => s.reference_id));
  for (const s of buggy) {
    const r = (receipts ?? []).find((x) => x.id === s.reference_id);
    if (!r?.employee || !r?.period) { console.log(`  aviso: sin recibo para stamp ${s.id}`); continue; }
    const emp = r.employee, period = r.period;
    const c = await computeNeto(emp, period);
    const dif = Math.round((c.res.neto - Number(s.total)) * 100) / 100;
    const label = `${emp.numero} ${emp.nombre} ${emp.apellido_paterno}`;
    if (Math.abs(dif) > 1) { anomalies.push({ s, r, emp, period, label, dif, c }); continue; }
    batch.push({ s, r, emp, period, label, dif, c });
  }
}
const M = (n) => "$" + Number(n).toFixed(2);
console.log(`\n== SELECCIÓN ==  a reemitir=${batch.length}  anomalías(excluidas)=${anomalies.length}`);
if (anomalies.length) { console.log(`\nANOMALÍAS (asistencia cambió post-timbre, NO se tocan):`); anomalies.forEach((a) => console.log(`  P${a.period.numero} ${a.label.padEnd(28)} dif ${a.dif}`)); }
console.log(`\n== LOTE (${batch.length}) ==`);
batch.forEach((b, i) => console.log(`  ${String(i + 1).padStart(2)} P${b.period.numero} ${b.label.padEnd(28)} uuidViejo=${b.s.uuid_sat.slice(0, 8)}… totalViejo ${M(b.s.total)} -> netoNuevo ${M(b.c.res.neto)} (dif ${b.dif})`));

if (!RUN) { console.log("\n[DRY RUN] sin cambios. --run para aplicar."); process.exit(0); }

// ===== APLICAR =====
const toProcess = batch.slice(0, LIMIT);
console.log(`\n== APLICANDO ${toProcess.length} de ${batch.length} ==`);
const log = [];
for (const [i, b] of toProcess.entries()) {
  const { s, r, emp, period, c } = b;
  const tag = `P${period.numero} ${b.label}`;
  try {
    await recalcDb(r, emp, period, c);
    const folioNuevo = nextFolio(period.numero, emp.numero);
    const res = await stampPayrollReceiptInternal({
      receiptId: r.id, supabase: sb, supabaseAdmin: sb, userId: USER,
      apiKeyInfo: { key, environment: bc.environment }, skipPermissionCheck: true, forceStamp: true,
      relatedDocuments: [{ relationship: "04", documents: [s.uuid_sat] }], folioOverride: folioNuevo,
      deferStampInsert: true,
    });
    const vi = await (await fetch(`${FACTURAPI}/invoices/${res.facturapi_id}`, { headers: { Authorization: `Bearer ${key}` } })).json();
    const rel = JSON.stringify(vi.related_documents ?? null);
    // Orden crítico de sustitución: crear nuevo -> cancelar viejo en SAT ->
    // liberar índice único (viejo a cancelado) -> insertar nuevo como timbrado.
    const params = new URLSearchParams({ motive: "01", substitution: res.uuid });
    const cres = await fetch(`${FACTURAPI}/invoices/${s.facturapi_id}?${params}`, { method: "DELETE", headers: { Authorization: `Bearer ${key}` } });
    const ctext = await cres.text();
    if (!cres.ok) { let m = ctext; try { m = JSON.parse(ctext).message ?? ctext; } catch {} throw new Error(`cancel ${cres.status}: ${m}`); }
    let cj = {}; try { cj = ctext ? JSON.parse(ctext) : {}; } catch {}
    const cancelStatus = cj?.status ?? "canceled";
    await sb.from("cfdi_stamps").update({ estatus: "cancelado", error_message: `Cancelado · motivo 01 · ${cancelStatus}` }).eq("id", s.id);
    const { error: insErr } = await sb.from("cfdi_stamps").insert({
      organization_id: ORG, kind: "nomina", reference_id: r.id,
      facturapi_id: res.facturapi_id, uuid_sat: res.uuid, serie: vi.series ?? null,
      folio: String(vi.folio_number ?? folioNuevo), fecha_timbrado: vi.date ?? null,
      ambiente: bc.environment, estatus: "timbrado", total: vi.total ?? null, timbrado_por: USER,
    });
    if (insErr) throw new Error(`nuevo timbre en FacturAPI ok (${res.uuid}) pero insert cancelado: ${insErr.message}`);
    log.push({ tag, folioNuevo, uuidNuevo: res.uuid, related: rel, cancelStatus });
    console.log(`[${i + 1}/${toProcess.length}] OK ${tag} · folio ${folioNuevo} · rel=${rel} · viejo cancelado (${cancelStatus}) · nuevo timbrado`);
  } catch (e) {
    log.push({ tag, error: String(e.message ?? e) });
    console.log(`[${i + 1}/${toProcess.length}] ERROR ${tag}: ${e.message ?? e}`);
  }
}
fs.writeFileSync("/tmp/opencode/migrate_log.json", JSON.stringify(log, null, 2));
console.log(`\n== RESUMEN ==  ok=${log.filter((x) => x.uuidNuevo).length}  errores=${log.filter((x) => x.error).length}`);
