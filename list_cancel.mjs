import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { build } from 'esbuild';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

await build({
  entryPoints: ['src/lib/payroll.calc.ts'], outfile: '/tmp/opencode/pc.mjs',
  bundle: true, format: 'esm', platform: 'node', target: 'node20',
});
const { calcPayroll } = await import('/tmp/opencode/pc.mjs');

const factorFalta = { semanal: 7 / 6, catorcenal: 7 / 6, quincenal: 1, mensual: 1 };
const ORG = '7145db9f-18fd-4729-9050-3f5c8f2e533e';

const { data: tipos } = await sb.from('incident_types').select('codigo,paga,cuenta_falta');
const noPaga = (tipos ?? []).filter(t => !t.paga);
const faltaCodes = new Set(noPaga.filter(t => t.cuenta_falta).map(t => t.codigo));
const otherCodes = new Set(noPaga.filter(t => !t.cuenta_falta).map(t => t.codigo));

const tableCache = new Map();
async function loadTables(ej) {
  if (tableCache.has(ej)) return tableCache.get(ej);
  const [isr, sub, uma, smg] = await Promise.all([
    sb.from('tax_tables').select('*').eq('ejercicio', ej).eq('tipo', 'isr_mensual').order('orden'),
    sb.from('tax_tables').select('*').eq('ejercicio', ej).eq('tipo', 'subsidio_mensual').order('orden'),
    sb.from('fiscal_params').select('valor').eq('ejercicio', ej).eq('clave', 'uma_diaria').maybeSingle(),
    sb.from('fiscal_params').select('valor').eq('ejercicio', ej).eq('clave', 'salario_minimo_general').maybeSingle(),
  ]);
  const v = {
    isrMensual: isr.data ?? [], subsidioMensual: sub.data ?? [],
    umaDiaria: Number(uma.data?.valor ?? 113.14),
    salarioMinimo: Number(smg.data?.valor ?? 0) || undefined,
  };
  tableCache.set(ej, v); return v;
}

const { data: periods } = await sb.from('payroll_periods').select('*')
  .eq('organization_id', ORG).eq('estatus', 'calculado').order('fecha_inicio', { ascending: false });

const filas = [];
for (const p of periods ?? []) {
  const { data: asist } = await sb.from('attendance_entries')
    .select('employee_id, incident_code, extra_codes')
    .eq('organization_id', ORG).gte('fecha', p.fecha_inicio).lte('fecha', p.fecha_fin);
  const m = new Map();
  for (const a of (asist ?? [])) {
    const codes = [a.incident_code, ...(a.extra_codes ?? [])];
    const cur = m.get(a.employee_id) ?? { f: 0, o: 0 };
    if (codes.some(c => faltaCodes.has(c))) cur.f++;
    if (codes.some(c => otherCodes.has(c))) cur.o++;
    m.set(a.employee_id, cur);
  }
  const afecta = [...m.entries()].filter(([, v]) => v.f > 0 || v.o > 0);
  if (!afecta.length) continue;

  const { data: recs } = await sb.from('payroll_receipts')
    .select('id,employee_id,dias_pagados,sueldo_diario,sdi,neto_pagar,total_percepciones,isr,imss_obrero')
    .eq('payroll_period_id', p.id).in('employee_id', afecta.map(([e]) => e));
  if (!recs?.length) continue;

  const { data: l020 } = await sb.from('payroll_receipt_lines')
    .select('receipt_id,importe_gravado').in('receipt_id', recs.map(r => r.id)).eq('concepto_clave', '020');
  const { data: st } = await sb.from('cfdi_stamps')
    .select('id,reference_id,uuid_sat,folio,estatus,ambiente,fecha_timbrado,total')
    .eq('kind', 'nomina').eq('organization_id', ORG).in('reference_id', recs.map(r => r.id));
  const { data: emps } = await sb.from('employees')
    .select('id,numero,nombre,apellido_paterno,apellido_materno,salario_diario,sdi,infonavit_cuota_mensual')
    .in('id', afecta.map(([e]) => e));
  const tables = await loadTables(p.ejercicio);

  for (const [empId, v] of afecta) {
    const r = recs.find(x => x.employee_id === empId);
    if (!r) continue;
    const ded = (l020 ?? []).filter(l => l.receipt_id === r.id);
    if (!ded.length) continue;                       // solo los que tienen la deduccion 020
    if (Math.abs(Number(r.dias_pagados) - p.dias) > 0.0001) continue;  // solo dias completos
    const activo = (st ?? []).find(s => s.reference_id === r.id && s.estatus === 'timbrado');
    if (!activo) continue;                            // solo los timbrados vigentes
    const e = (emps ?? []).find(x => x.id === empId);
    const dd = Math.round((v.f * (factorFalta[p.periodicidad] ?? 1) + v.o) * 1e6) / 1e6;
    const dp = Math.max(0, Math.round((p.dias - dd) * 1e6) / 1e6);
    const div = { semanal: 4, catorcenal: 2, quincenal: 2, mensual: 1 }[p.periodicidad];
    const inf = Number(e?.infonavit_cuota_mensual ?? 0) > 0
      ? Math.round((Number(e.infonavit_cuota_mensual) / div) * 100) / 100 : 0;
    const nuevo = calcPayroll({
      salarioDiario: Number(e.salario_diario), sdi: Number(e.sdi),
      diasPagados: dp, periodicidad: p.periodicidad,
      deduccionesExtra: inf > 0 ? [{ importe: inf }] : undefined,
    }, tables);
    filas.push({
      periodo: `P${p.numero}/${p.ejercicio}`, rango: `${p.fecha_inicio}..${p.fecha_fin}`,
      empleado: `${e.numero} ${e.nombre} ${e.apellido_paterno}`,
      rfc: undefined, uuid: activo.uuid_sat, folio: activo.folio, ambiente: activo.ambiente,
      fechaTimbre: activo.fecha_timbrado, totalCFDI: Number(activo.total ?? 0),
      faltas: v.f, otros: v.o, diasActual: Number(r.dias_pagados), diasNuevo: dp,
      percepcionesActual: Number(r.total_percepciones), netoActual: Number(r.neto_pagar),
      percepcionesNuevo: nuevo.total_percepciones, netoNuevo: nuevo.neto,
      difNeto: Math.round((nuevo.neto - Number(r.neto_pagar)) * 100) / 100,
      dedOriginal: ded.reduce((s2, l) => s2 + Number(l.importe_gravado ?? 0), 0),
      dedActual: Math.round(Number(e.salario_diario) * dd * 100) / 100,
    });
  }
}

filas.sort((a, b) => a.periodo.localeCompare(b.periodo) || a.empleado.localeCompare(b.empleado));
const m = (n) => '$' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
console.log(`LISTA DE CFDI A CANCELAR Y RE-TIMBRAR  (${filas.length} recibos, factor 7/6)\n`);
console.log('#  periodo      empleado                UUID (parcial)                 folio      ambiente  timbre       CFDI        percepc.      -> percepc.   neto  -> neto   dif');
console.log('-'.repeat(165));
filas.forEach((f, i) => {
  console.log(
    String(i + 1).padStart(2) + ' ' +
    f.periodo.padEnd(12) + ' ' +
    f.empleado.slice(0, 23).padEnd(23) + ' ' +
    String(f.uuid ?? '').slice(0, 30).padEnd(30) + ' ' +
    String(f.folio ?? '-').padEnd(9) + ' ' +
    f.ambiente.padEnd(9) + ' ' +
    String(f.fechaTimbre ?? '').slice(0, 10).padEnd(12) + ' ' +
    m(f.totalCFDI).padStart(10) + ' ' +
    m(f.percepcionesActual).padStart(11) + ' -> ' + m(f.percepcionesNuevo).padStart(11) + ' ' +
    m(f.netoActual).padStart(9) + ' -> ' + m(f.netoNuevo).padStart(9) + ' ' +
    (f.difNeto >= 0 ? '+' : '') + f.difNeto.toFixed(2),
  );
});
console.log('-'.repeat(165));
console.log(`total ${filas.length} | suma percepciones actual ${m(filas.reduce((s, f) => s + f.percepcionesActual, 0))} -> nueva ${m(filas.reduce((s, f) => s + f.percepcionesNuevo, 0))}`);
console.log(`      | suma neto actual ${m(filas.reduce((s, f) => s + f.netoActual, 0))} -> nuevo ${m(filas.reduce((s, f) => s + f.netoNuevo, 0))}  (dif ${(filas.reduce((s, f) => s + f.difNeto, 0)).toFixed(2)})`);
const anomalias = filas.filter(f => Math.abs(f.difNeto) > 1);
console.log(`\n=== ANOMALIAS: ${anomalias.length} recibos con cambio > $1.00 (los otros ${filas.length - anomalias.length} solo cambian por redondeo) ===`);
for (const a of anomalias) {
  console.log(`\n  ${a.periodo}  ${a.empleado}  uuid=${a.uuid}`);
  console.log(`     faltas=${a.faltas} otros=${a.otros}  dias ${a.diasActual} -> ${a.diasNuevo}`);
  console.log(`     deducciion 020 original en CFDI = $${a.dedOriginal}`);
  console.log(`     deducciion que implica la asistencia ACTUAL = $${a.dedActual}`);
  console.log(`     neto $${a.netoActual} -> $${a.netoNuevo}   (dif ${a.difNeto >= 0 ? '+' : ''}${a.difNeto})`);
  console.log(a.dedOriginal < a.dedActual
    ? `     >> La asistencia cambio DESPUES de timbrar: ahora hay mas dias sin goce. Re-timbrar aplicaria la falta nueva.`
    : `     >> La asistencia cambio DESPUES de timbrar: ahora hay MENOS dias sin goce. Re-timbrar devolveria dinero al trabajador.`);
}
console.log(`\nambientes: ${JSON.stringify(filas.reduce((a, f) => (a[f.ambiente] = (a[f.ambiente] || 0) + 1, a), {}))}`);
console.log(`periodos:   ${JSON.stringify(filas.reduce((a, f) => (a[f.periodo] = (a[f.periodo] || 0) + 1, a), {}))}`);
fs.writeFileSync('/tmp/opencode/cancel_list.json', JSON.stringify(filas, null, 2));
console.log('\n(lista guardada en /tmp/opencode/cancel_list.json)');
