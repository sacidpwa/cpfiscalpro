// Extractor local FDB -> CSV (sin Docker)
// Uso:
//   node extract.js <ruta-al-archivo.fdb> [carpeta-salida] [tabla1,tabla2,...]
//
// Ejemplos:
//   node extract.js "C:\Aspel\NOI11\Datos\NOI11EMPRE22.FDB"
//   node extract.js NOI11EMPRE22.FDB salida EMPLEADO,CONCEPTO,MOVIMIEN
//
// Requisitos:
//   1) Node.js 18+   ->  https://nodejs.org
//   2) Firebird 3.0  ->  https://firebirdsql.org/en/firebird-3-0/  (instala server, deja todo por defecto)
//   3) En esta carpeta:  npm install
//
// Credenciales por defecto Aspel: SYSDBA / masterkey
// Si cambiaron, edita FB_USER / FB_PASSWORD abajo o expórtalos como variables de entorno.

const Firebird = require("node-firebird");
const fs = require("fs");
const path = require("path");

const SRC = process.argv[2];
const OUT = process.argv[3] || "salida";
const ONLY = (process.argv[4] || "").split(",").map(s => s.trim()).filter(Boolean);

if (!SRC) {
  console.error("Falta ruta al .FDB.  Uso: node extract.js <archivo.fdb> [carpeta] [tabla1,tabla2,...]");
  process.exit(1);
}
if (!fs.existsSync(SRC)) {
  console.error("No existe el archivo:", SRC);
  process.exit(1);
}

const ABS = path.resolve(SRC);
const OUTDIR = path.resolve(OUT);
fs.mkdirSync(OUTDIR, { recursive: true });

const options = {
  host: "127.0.0.1",
  port: 3050,
  database: ABS,
  user: process.env.FB_USER || "SYSDBA",
  password: process.env.FB_PASSWORD || "masterkey",
  lowercase_keys: false,
  role: null,
  pageSize: 4096,
};

function attach() {
  return new Promise((resolve, reject) => {
    Firebird.attach(options, (err, db) => (err ? reject(err) : resolve(db)));
  });
}
function query(db, sql) {
  return new Promise((resolve, reject) => {
    db.query(sql, [], (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}
function csvEscape(v) {
  if (v == null) return "";
  if (Buffer.isBuffer(v)) v = v.toString("latin1");
  if (v instanceof Date) return v.toISOString();
  let s = String(v);
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

(async () => {
  console.log("Conectando a Firebird con:", ABS);
  let db;
  try {
    db = await attach();
  } catch (e) {
    console.error("\nERROR al conectar:", e.message);
    console.error("\nVerifica que:");
    console.error("  - Firebird 3.0 está instalado y el servicio corre (Servicios de Windows -> 'Firebird Server - DefaultInstance').");
    console.error("  - Las credenciales son correctas (default Aspel: SYSDBA / masterkey).");
    console.error("  - El archivo .FDB no está abierto por NOI/COI al mismo tiempo.");
    process.exit(2);
  }

  try {
    const tablesRows = await query(
      db,
      `SELECT TRIM(RDB$RELATION_NAME) AS NAME
         FROM RDB$RELATIONS
         WHERE RDB$SYSTEM_FLAG = 0 AND RDB$VIEW_BLR IS NULL
         ORDER BY RDB$RELATION_NAME`,
    );
    let tables = tablesRows.map(r => r.NAME);
    console.log(`Tablas encontradas: ${tables.length}`);

    if (ONLY.length) {
      tables = tables.filter(t => ONLY.includes(t));
      console.log(`Exportando solo: ${tables.join(", ")}`);
    }

    const summary = [];
    for (const t of tables) {
      try {
        const rows = await query(db, `SELECT * FROM "${t}"`);
        const file = path.join(OUTDIR, `${t}.csv`);
        if (!rows.length) {
          fs.writeFileSync(file, "");
          summary.push({ table: t, rows: 0 });
          console.log(`  - ${t}: 0 filas`);
          continue;
        }
        const cols = Object.keys(rows[0]);
        const out = fs.createWriteStream(file);
        out.write(cols.join(",") + "\n");
        for (const r of rows) out.write(cols.map(c => csvEscape(r[c])).join(",") + "\n");
        await new Promise(res => out.end(res));
        summary.push({ table: t, rows: rows.length });
        console.log(`  - ${t}: ${rows.length} filas -> ${file}`);
      } catch (e) {
        summary.push({ table: t, error: e.message });
        console.log(`  - ${t}: ERROR ${e.message}`);
      }
    }
    fs.writeFileSync(path.join(OUTDIR, "_summary.json"), JSON.stringify(summary, null, 2));
    console.log(`\nListo. CSVs en: ${OUTDIR}`);
    console.log("Sube los archivos relevantes (EMPLEADO.csv, CONCEPTO.csv, MOVIMIEN.csv...) al wizard de Importar en ContaMX.");
  } finally {
    db.detach();
  }
})().catch(e => { console.error(e); process.exit(3); });
