import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ORG = '7145db9f-18fd-4729-9050-3f5c8f2e533e';
const EJERCICIO = 2026;

async function paginate(table, select, filters) {
  const all = []; let offset = 0;
  while (true) {
    let q = supabase.from(table).select(select);
    for (const f of filters) q = q[f.op](f.col, f.val);
    q = q.range(offset, offset + 999);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  return all;
}

async function main() {
  console.log('1. Loading accounts...');
  const accts = await paginate('accounts', 'id, codigo, naturaleza', [{ op: 'eq', col: 'organization_id', val: ORG }, { op: 'eq', col: 'activa', val: true }]);
  const acctIdToCodigo = {};
  for (const a of accts) acctIdToCodigo[a.id] = a.codigo;
  const acctNat = {};
  for (const a of accts) acctNat[a.codigo] = a.naturaleza;
  console.log('  Accounts:', accts.length);

  console.log('2. Getting saldo inicial...');
  const saldoInicialMap = {};
  for (const a of accts) {
    const d = a.codigo.replace(/^0+/, '')[0];
    if (['4', '5', '6', '7', '8', '9'].includes(d)) { saldoInicialMap[a.codigo] = 0; continue; }
    let sAnt = 0;
    for (const perAnt of [13, 12]) {
      const { data: b } = await supabase.from('account_balances').select('saldo_final')
        .eq('organization_id', ORG).eq('account_codigo', a.codigo).eq('ejercicio', EJERCICIO - 1).eq('periodo', perAnt).maybeSingle();
      if (b) { sAnt = Number(b.saldo_final ?? 0); break; }
    }
    saldoInicialMap[a.codigo] = sAnt;
  }

  console.log('3. Loading ALL entries for 2026...');
  const allEntries = await paginate('journal_entries', 'id, fecha', [
    { op: 'eq', col: 'organization_id', val: ORG },
    { op: 'gte', col: 'fecha', val: `${EJERCICIO}-01-01` },
    { op: 'lte', col: 'fecha', val: `${EJERCICIO}-12-31` },
    { op: 'neq', col: 'estatus', val: 'cancelada' },
  ]);
  const idToFecha = {};
  for (const e of allEntries) idToFecha[e.id] = e.fecha;
  console.log('  Entries:', allEntries.length);

  console.log('4. Loading ALL lines (paginated by entry chunk, with high limit)...');
  const entryIds = allEntries.map(e => e.id);
  const linesByAccountPeriod = {};
  let totalLines = 0;

  for (let i = 0; i < entryIds.length; i += 100) {
    const chunk = entryIds.slice(i, i + 100);
    let offset = 0;
    while (true) {
      const { data: lines, error } = await supabase
        .from('journal_lines')
        .select('account_id, cargo, abono, entry_id')
        .in('entry_id', chunk)
        .range(offset, offset + 9999);
      if (error) throw new Error(`Lines: ${error.message}`);
      if (!lines?.length) break;
      for (const l of lines) {
        const codigo = acctIdToCodigo[l.account_id];
        if (!codigo) continue;
        const fecha = idToFecha[l.entry_id];
        if (!fecha) continue;
        const mes = Number(fecha.slice(5, 7));
        if (!linesByAccountPeriod[codigo]) linesByAccountPeriod[codigo] = {};
        if (!linesByAccountPeriod[codigo][mes]) linesByAccountPeriod[codigo][mes] = { cargo: 0, abono: 0 };
        linesByAccountPeriod[codigo][mes].cargo += Number(l.cargo ?? 0);
        linesByAccountPeriod[codigo][mes].abono += Number(l.abono ?? 0);
        totalLines++;
      }
      if (lines.length < 10000) break;
      offset += 10000;
    }
    if ((i / 100) % 5 === 0) console.log(`  ${Math.min(i + 100, entryIds.length)}/${entryIds.length} entries...`);
  }
  console.log('  Total lines processed:', totalLines);

  console.log('5. Calculating balances...');
  const upserts = [];
  for (const a of accts) {
    const nat = acctNat[a.codigo];
    const periodMovs = linesByAccountPeriod[a.codigo] || {};
    let saldoAcum = saldoInicialMap[a.codigo] ?? 0;
    for (let p = 1; p <= 13; p++) {
      const mov = periodMovs[p] || { cargo: 0, abono: 0 };
      if (p !== 13) {
        const signedDelta = nat === 'deudora' ? mov.cargo - mov.abono : mov.abono - mov.cargo;
        saldoAcum += signedDelta;
      }
      upserts.push({
        organization_id: ORG, account_codigo: a.codigo, ejercicio: EJERCICIO, periodo: p,
        saldo_inicial: p === 1 ? (saldoInicialMap[a.codigo] ?? 0) : 0,
        cargos: mov.cargo, abonos: mov.abono, saldo_final: saldoAcum, moneda: null,
      });
    }
  }

  console.log('6. Upserting...');
  let upserted = 0;
  for (let i = 0; i < upserts.length; i += 500) {
    const chunk = upserts.slice(i, i + 500);
    const { error } = await supabase.from('account_balances').upsert(chunk, { onConflict: 'organization_id,account_codigo,ejercicio,periodo' });
    if (error) throw new Error(`Upsert: ${error.message}`);
    upserted += chunk.length;
  }
  console.log(`Done: ${upserted} rows`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
