import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { config } from 'dotenv';
config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ORG = '7145db9f-18fd-4729-9050-3f5c8f2e533e';
const TIPO_MAP = { 'Ing': 'ingreso', 'Ig': 'ingreso', 'Eg': 'egreso', 'Di': 'diario', 'Dr': 'diario', 'Ch': 'cheque', 'Tr': 'transferencia' };

function parse(str) { return str.split('\n').filter(Boolean).map(l => l.split('|').map(s => s.trim())); }

async function paginate(table, select, eqCol, eqVal) {
  const all = []; let offset = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select(select).eq(eqCol, eqVal).range(offset, offset + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  return all;
}

async function main() {
  const accts = await paginate('accounts', 'id, codigo', 'organization_id', ORG);
  const codeToId = {};
  const idToCode = {};
  for (const a of accts) { codeToId[a.codigo] = a.id; idToCode[a.id] = a.codigo; }
  console.log('Accounts:', Object.keys(codeToId).length);

  const entries = await paginate('journal_entries', 'id, tipo, numero, fecha', 'organization_id', ORG);
  const entryMap = {}; // tipo|numero|fecha -> [entryIds]
  for (const e of entries) {
    const key = `${e.tipo}|${e.numero}|${e.fecha}`;
    if (!entryMap[key]) entryMap[key] = [];
    entryMap[key].push(e.id);
  }
  console.log('Entries:', entries.length);

  const lines = await paginate('journal_lines', 'id, account_id, cargo, abono, entry_id', 'organization_id', ORG);
  const linesByEntry = {};
  for (const l of lines) {
    if (!linesByEntry[l.entry_id]) linesByEntry[l.entry_id] = [];
    linesByEntry[l.entry_id].push(l);
  }
  console.log('Lines:', lines.length);

  // Parse auxiliar ordered
  const auxRaw = readFileSync('/tmp/firebird/aux_ordered.csv', 'utf-8');
  const auxRows = parse(auxRaw).map(parts => ({
    tipo: TIPO_MAP[parts[0]] || parts[0],
    numero: parseInt(parts[1]),
    numPart: parseInt(parts[2]) - 1,
    cuenta: parts[3],
    dh: parts[4],
    monto: parseFloat(parts[5]) || 0,
    fechaReal: parts[6],
  }));
  console.log('Auxiliar rows:', auxRows.length);

  // Group aux by tipo|numero
  const auxByTN = {};
  for (const a of auxRows) {
    const key = `${a.tipo}|${a.numero}`;
    if (!auxByTN[key]) auxByTN[key] = [];
    auxByTN[key].push(a);
  }

  // For each aux group, find the matching entry by line count
  // Each tipo|numero has multiple entries (one per month). The aux lines span multiple months.
  // We need to figure out which entry each aux line goes to.
  // Strategy: the aux lines are ordered by numPart within each tipo|numero.
  // The entries are for different months. We'll match by sorting both by account code.

  let matched = 0, unmatched = 0;
  const updates = [];

  for (const [tnKey, auxGroup] of Object.entries(auxByTN)) {
    // Find all entries with this tipo|numero
    const entryDates = Object.keys(entryMap).filter(k => k.startsWith(tnKey + '|')).sort();
    if (entryDates.length === 0) { unmatched += auxGroup.length; continue; }

    // Group aux lines by fechaReal (the actual transaction date)
    // Each unique fechaReal maps to one entry
    const auxByDate = {};
    for (const a of auxGroup) {
      if (!auxByDate[a.fechaReal]) auxByDate[a.fechaReal] = [];
      auxByDate[a.fechaReal].push(a);
    }

    for (const [fechaReal, dateGroup] of Object.entries(auxByDate)) {
      // Find the entry with matching line count
      let bestEntryId = null;
      let bestEntryLines = null;

      for (const ek of entryDates) {
        const eids = entryMap[ek];
        for (const eid of eids) {
          const el = linesByEntry[eid];
          if (el && el.length === dateGroup.length) {
            bestEntryId = eid;
            bestEntryLines = el;
            break;
          }
        }
        if (bestEntryId) break;
      }

      if (!bestEntryId) {
        // Fallback: try entry with most lines
        let maxLines = 0;
        for (const ek of entryDates) {
          const eids = entryMap[ek];
          for (const eid of eids) {
            const el = linesByEntry[eid];
            if (el && el.length > maxLines) {
              maxLines = el.length;
              bestEntryId = eid;
              bestEntryLines = el;
            }
          }
        }
      }

      if (!bestEntryId || !bestEntryLines) { unmatched += dateGroup.length; continue; }

      // Sort both by account code and match
      const sortedAux = [...dateGroup].sort((a, b) => a.cuenta.localeCompare(b.cuenta));
      const sortedLines = [...bestEntryLines].sort((a, b) => {
        const ca = idToCode[a.account_id] || '';
        const cb = idToCode[b.account_id] || '';
        return ca.localeCompare(cb);
      });

      if (sortedAux.length === sortedLines.length) {
        for (let i = 0; i < sortedAux.length; i++) {
          updates.push({ id: sortedLines[i].id, fecha: sortedAux[i].fechaReal });
          matched++;
        }
      } else {
        // Try to match by account where possible
        for (const aux of sortedAux) {
          const acctId = codeToId[aux.cuenta];
          if (!acctId) { unmatched++; continue; }
          const line = sortedLines.find(l => l.account_id === acctId && !updates.some(u => u.id === l.id));
          if (line) {
            updates.push({ id: line.id, fecha: aux.fechaReal });
            matched++;
          } else {
            unmatched++;
          }
        }
      }
    }
  }

  console.log('Matched:', matched, 'Unmatched:', unmatched);

  // Dedupe by line id (keep last)
  const deduped = {};
  for (const u of updates) deduped[u.id] = u;
  const finalUpdates = Object.values(deduped);
  console.log('Deduped updates:', finalUpdates.length);

  const BATCH = 200;
  let updated = 0;
  for (let i = 0; i < finalUpdates.length; i += BATCH) {
    const batch = finalUpdates.slice(i, i + BATCH);
    const promises = batch.map(u =>
      supabase.from('journal_lines').update({ fecha: u.fecha }).eq('id', u.id)
    );
    const results = await Promise.all(promises);
    const errors = results.filter(r => r.error);
    if (errors.length) console.log('Batch error:', errors[0].error?.message);
    updated += batch.length - errors.length;
    if ((i / BATCH) % 10 === 0) console.log(`  ${Math.min(i + BATCH, finalUpdates.length)}/${finalUpdates.length}`);
  }
  console.log('Updated:', updated);

  const { count } = await supabase.from('journal_lines')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', ORG)
    .not('fecha', 'is', null);
  console.log(`Verification: ${count}/${lines.length} lines have fecha`);
}

main().catch(console.error);
