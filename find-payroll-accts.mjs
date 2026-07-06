import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ORG_ID = "7145db9f-18fd-4729-9050-3f5c8f2e533e";

async function main() {
  // Buscar cuentas relacionadas con ISR, IMSS, Nómina, Honorarios
  const { data: accts } = await supabase
    .from("accounts")
    .select("codigo, nombre, naturaleza, acumulativa")
    .eq("organization_id", ORG_ID)
    .order("codigo");

  console.log("=== CUENTAS DE NÓMINA, ISR, IMSS, ISN, HONORARIOS ===\n");

  // Buscar por nombre
  const keywords = ["nomina", "nómina", "sueldo", "salario", "isr", "imss", "isn", "impuesto sobre nomina", "honorario", "cuota", "patronal", "obrero"];
  const found = (accts ?? []).filter((a) => {
    const n = (a.nombre || "").toLowerCase();
    return keywords.some((k) => n.includes(k)) && !a.acumulativa;
  });

  // Agrupar por tipo
  const groups = {
    nomina: [],
    isr: [],
    imss: [],
    isn: [],
    honorarios: [],
    otros: [],
  };

  found.forEach((a) => {
    const n = (a.nombre || "").toLowerCase();
    const cod = a.codigo;
    if (/sueldo|salario|nomina|nómina/.test(n) && cod.startsWith("61")) groups.nomina.push(a);
    else if (/isr/.test(n)) groups.isr.push(a);
    else if (/imss|cuota.*patron|patronal|obrero/.test(n)) groups.imss.push(a);
    else if (/impuesto.*nomina|isn/.test(n)) groups.isn.push(a);
    else if (/honorario/.test(n)) groups.honorarios.push(a);
    else groups.otros.push(a);
  });

  Object.entries(groups).forEach(([k, arr]) => {
    if (arr.length) {
      console.log(`--- ${k.toUpperCase()} ---`);
      arr.forEach((a) => console.log(`  ${a.codigo}  "${a.nombre}"  ${a.naturaleza}`));
      console.log();
    }
  });

  // Para cada cuenta, mostrar el saldo de mayo 2026 (delta abril→mayo)
  console.log("\n=== SALDOS MAYO 2026 (delta Abr→May) ===\n");
  for (const a of found) {
    const { data: balsMay } = await supabase
      .from("account_balances")
      .select("saldo_final")
      .eq("organization_id", ORG_ID)
      .eq("account_codigo", a.codigo)
      .eq("ejercicio", 2026)
      .eq("periodo", 5);
    const { data: balsAbr } = await supabase
      .from("account_balances")
      .select("saldo_final")
      .eq("organization_id", ORG_ID)
      .eq("account_codigo", a.codigo)
      .eq("ejercicio", 2026)
      .eq("periodo", 4);
    const may = balsMay?.[0] ? Number(balsMay[0].saldo_final) : 0;
    const abr = balsAbr?.[0] ? Number(balsAbr[0].saldo_final) : 0;
    const delta = may - abr;
    if (Math.abs(delta) > 0.01) {
      console.log(`  ${a.codigo}  "${(a.nombre || "").slice(0, 35)}"  Abr=${abr.toFixed(2)}  May=${may.toFixed(2)}  Δ=${delta.toFixed(2)}`);
    }
  }
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
