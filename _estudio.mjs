import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(URL, KEY);

async function main() {
  // 1) Catálogo de cuentas
  const { data: accts, error: e1 } = await supabase
    .from("accounts")
    .select("codigo, nombre, naturaleza, nivel, acumulativa, codigo_agrupador, activa")
    .order("codigo");
  if (e1) throw e1;
  console.log(`=== CATÁLOGO DE CUENTAS (${accts?.length}) ===`);
  const out: string[] = [];
  out.push("codigo\tnombre\tnaturaleza\tnivel\tacumulativa\tagrupador\tactiva");
  for (const a of accts ?? []) {
    out.push(
      [a.codigo, a.nombre, a.naturaleza, a.nivel, a.acumulativa, a.codigo_agrupador ?? "", a.activa].join("\t"),
    );
  }
  fs.writeFileSync(path.join(__dirname, "_catalogo.tsv"), out.join("\n"), "utf8");
  console.log("Catálogo -> _catalogo.tsv");

  // 2) Pólizas de 2026 (encabezado)
  const { data: entries, error: e2 } = await supabase
    .from("journal_entries")
    .select("id, tipo, numero, fecha, concepto, referencia, total_cargo, total_abono, estatus")
    .eq("organization_id", "00000000-0000-0000-0000-000000000000")
    .order("fecha", { ascending: true });
  if (e2) throw e2;
  // Necesitamos el organization_id real. Veamos primero todas las pólizas de 2026 sin filtro de org.
  const { data: entriesAll, error: e2b } = await supabase
    .from("journal_entries")
    .select("id, organization_id, tipo, numero, fecha, concepto, referencia, total_cargo, total_abono, estatus")
    .gte("fecha", "2026-01-01")
    .lte("fecha", "2026-12-31")
    .order("fecha", { ascending: true });
  if (e2b) throw e2b;
  console.log(`\n=== PÓLIZAS 2026 (${entriesAll?.length}) ===`);
  const outE: string[] = [];
  outE.push("fecha\ttipo\tnumero\tconcepto\ttotal_cargo\testatus\torganization_id\tid");
  for (const e of entriesAll ?? []) {
    outE.push(
      [e.fecha, e.tipo, e.numero, (e.concepto ?? "").replace(/\t/g, " "), e.total_cargo, e.estatus, e.organization_id, e.id].join("\t"),
    );
  }
  fs.writeFileSync(path.join(__dirname, "_polizas2026.tsv"), outE.join("\n"), "utf8");
  console.log("Pólizas 2026 -> _polizas2026.tsv");

  // 3) Líneas de esas pólizas
  const entryIds = (entriesAll ?? []).map((e) => e.id);
  if (entryIds.length > 0) {
    const { data: lines, error: e3 } = await supabase
      .from("journal_lines")
      .select("entry_id, account_id, codigo:accounts!inner(codigo,nombre,naturaleza), concepto, cargo, abono, orden")
      .in("entry_id", entryIds)
      .order("entry_id", { ascending: true })
      .order("orden", { ascending: true });
    if (e3) throw e3;
    console.log(`\n=== LÍNEAS DE PÓLIZAS 2026 (${lines?.length}) ===`);
    const outL: string[] = [];
    outL.push("entry_id\taccount_codigo\taccount_nombre\tnaturaleza\tconcepto\tcargo\tabono\torden");
    for (const l of lines ?? []) {
      const acc: any = (l as any).codigo ?? (l as any).accounts;
      outL.push(
        [l.entry_id, acc?.codigo ?? "", (acc?.nombre ?? "").replace(/\t/g, " "), acc?.naturaleza ?? "", (l.concepto ?? "").replace(/\t/g, " "), l.cargo, l.abono, l.orden].join("\t"),
      );
    }
    fs.writeFileSync(path.join(__dirname, "_lineas2026.tsv"), outL.join("\n"), "utf8");
    console.log("Líneas 2026 -> _lineas2026.tsv");
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});