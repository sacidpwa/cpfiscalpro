// Microservicio FDB → JSON/CSV/ZIP para Aspel NOI/COI
//
// Endpoints:
//   GET  /health                            → ok
//   POST /tables       (multipart: file)    → { tables: [...] }
//   POST /columns      (multipart: file, body: table) → { columns: [...] }
//   POST /extract-json (multipart: file, body: table, limit?) → { table, rows: [...] }
//   POST /extract      (multipart: file, body: tables=csv,opt) → ZIP con CSV por tabla
//
// Autenticación opcional: si la variable de entorno EXTRACTOR_TOKEN está definida,
// se exige el header  Authorization: Bearer <EXTRACTOR_TOKEN>  en todos los POST.

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const archiver = require("archiver");
const Firebird = require("node-firebird");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const PORT = process.env.PORT || 8787;
const TOKEN = process.env.EXTRACTOR_TOKEN || "";

const app = express();
app.use(cors());

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB
});

function requireToken(req, res, next) {
  if (!TOKEN) return next();
  const h = req.headers.authorization || "";
  if (h === `Bearer ${TOKEN}`) return next();
  res.status(401).json({ error: "Unauthorized" });
}

function fbOptions(database) {
  return {
    host: "127.0.0.1",
    port: 3050,
    database,
    user: process.env.FB_USER || "SYSDBA",
    password: process.env.FB_PASSWORD || "masterkey",
    lowercase_keys: false,
    role: null,
    pageSize: 4096,
  };
}

function attach(database) {
  return new Promise((resolve, reject) => {
    Firebird.attach(fbOptions(database), (err, db) => (err ? reject(err) : resolve(db)));
  });
}
function query(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function listTables(database) {
  const db = await attach(database);
  try {
    const rows = await query(
      db,
      `SELECT TRIM(RDB$RELATION_NAME) AS NAME
       FROM RDB$RELATIONS
       WHERE RDB$SYSTEM_FLAG = 0 AND RDB$VIEW_BLR IS NULL
       ORDER BY RDB$RELATION_NAME`,
    );
    return rows.map((r) => r.NAME);
  } finally {
    db.detach();
  }
}

async function listColumns(database, table) {
  const db = await attach(database);
  try {
    const rows = await query(
      db,
      `SELECT TRIM(RDB$FIELD_NAME) AS NAME
       FROM RDB$RELATION_FIELDS
       WHERE RDB$RELATION_NAME = ?
       ORDER BY RDB$FIELD_POSITION`,
      [table],
    );
    return rows.map((r) => r.NAME);
  } finally {
    db.detach();
  }
}

function normalizeValue(v) {
  if (v == null) return null;
  if (Buffer.isBuffer(v)) return v.toString("latin1").trim();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v.trim();
  return v;
}

async function fetchRows(database, table, limit) {
  const db = await attach(database);
  try {
    const sql = limit
      ? `SELECT FIRST ${Number(limit)} * FROM "${table}"`
      : `SELECT * FROM "${table}"`;
    const rows = await query(db, sql);
    return rows.map((r) => {
      const out = {};
      for (const k of Object.keys(r)) out[k] = normalizeValue(r[k]);
      return out;
    });
  } finally {
    db.detach();
  }
}

function csvEscape(v) {
  if (v == null) return "";
  if (Buffer.isBuffer(v)) v = v.toString("latin1");
  if (v instanceof Date) return v.toISOString();
  let s = String(v);
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function tableToCsv(database, table, writeStream) {
  const db = await attach(database);
  try {
    const rows = await query(db, `SELECT * FROM "${table}"`);
    if (!rows.length) {
      writeStream.write("");
      return 0;
    }
    const cols = Object.keys(rows[0]);
    writeStream.write(cols.join(",") + "\n");
    for (const r of rows) {
      writeStream.write(cols.map((c) => csvEscape(r[c])).join(",") + "\n");
    }
    return rows.length;
  } finally {
    db.detach();
  }
}

function stagedFile(req) {
  if (!req.file) return null;
  const dest = path.join(os.tmpdir(), `${crypto.randomUUID()}.fdb`);
  fs.copyFileSync(req.file.path, dest);
  fs.unlinkSync(req.file.path);
  return dest;
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "fdb-extractor" }));

app.post("/tables", requireToken, upload.single("file"), async (req, res) => {
  const dest = stagedFile(req);
  if (!dest) return res.status(400).json({ error: "Falta archivo .fdb" });
  try {
    const tables = await listTables(dest);
    res.json({ tables, count: tables.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    fs.unlink(dest, () => {});
  }
});

app.post("/columns", requireToken, upload.single("file"), async (req, res) => {
  const dest = stagedFile(req);
  if (!dest) return res.status(400).json({ error: "Falta archivo .fdb" });
  const table = String(req.body.table || "").trim();
  if (!table) {
    fs.unlink(dest, () => {});
    return res.status(400).json({ error: "Falta parámetro 'table'" });
  }
  try {
    const columns = await listColumns(dest, table);
    res.json({ table, columns });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    fs.unlink(dest, () => {});
  }
});

app.post("/extract-json", requireToken, upload.single("file"), async (req, res) => {
  const dest = stagedFile(req);
  if (!dest) return res.status(400).json({ error: "Falta archivo .fdb" });
  const table = String(req.body.table || "").trim();
  const limit = req.body.limit ? Number(req.body.limit) : null;
  if (!table) {
    fs.unlink(dest, () => {});
    return res.status(400).json({ error: "Falta parámetro 'table'" });
  }
  try {
    const rows = await fetchRows(dest, table, limit);
    res.json({ table, total: rows.length, rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    fs.unlink(dest, () => {});
  }
});

app.post("/extract", requireToken, upload.single("file"), async (req, res) => {
  const dest = stagedFile(req);
  if (!dest) return res.status(400).json({ error: "Falta archivo .fdb" });

  try {
    let tables;
    if (req.body.tables && String(req.body.tables).trim()) {
      tables = String(req.body.tables).split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      tables = await listTables(dest);
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="fdb-export.zip"`);

    const zip = archiver("zip", { zlib: { level: 9 } });
    zip.on("error", (err) => {
      console.error(err);
      try { res.status(500).end(); } catch (_) {}
    });
    zip.pipe(res);

    const summary = [];
    for (const t of tables) {
      try {
        const chunks = [];
        const sink = { write: (s) => chunks.push(Buffer.from(s, "utf8")) };
        const n = await tableToCsv(dest, t, sink);
        zip.append(Buffer.concat(chunks), { name: `${t}.csv` });
        summary.push({ table: t, rows: n });
      } catch (e) {
        summary.push({ table: t, error: e.message });
      }
    }
    zip.append(JSON.stringify(summary, null, 2), { name: "_summary.json" });
    await zip.finalize();
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    fs.unlink(dest, () => {});
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`fdb-extractor escuchando en 0.0.0.0:${PORT}`);
});
