import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calcSDI } from "@/lib/payroll.calc";

const previewSchema = z.object({
  organizationId: z.string().uuid(),
  kind: z.enum(["coi_cuentas", "noi_empleados"]),
  fileBase64: z.string(),
  fileName: z.string(),
  fdbTable: z.string().optional(),
});

function isCsv(name: string) {
  return /\.csv$/i.test(name);
}
function isXlsx(name: string) {
  return /\.(xlsx|xls|xlsm|xlsb)$/i.test(name);
}
function isFdb(name: string) {
  return /\.fdb$/i.test(name);
}

async function callExtractor(
  path: string,
  buf: Buffer,
  fileName: string,
  extraFields: Record<string, string> = {},
): Promise<any> {
  const base = process.env.FDB_EXTRACTOR_URL;
  if (!base) {
    throw new Error(
      "Importación FDB no configurada. Despliega el microservicio (tools/fdb-extractor) y agrega los secrets FDB_EXTRACTOR_URL y FDB_EXTRACTOR_TOKEN.",
    );
  }
  const token = process.env.FDB_EXTRACTOR_TOKEN || "";
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(buf)], { type: "application/octet-stream" }),
    fileName,
  );
  for (const [k, v] of Object.entries(extraFields)) form.append(k, v);
  const res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      msg = JSON.parse(text).error || text;
    } catch {}
    throw new Error(`Extractor FDB (${res.status}): ${msg}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function parseFdb(
  buf: Buffer,
  fileName: string,
  table: string,
): Promise<{ fields: string[]; rows: any[] }> {
  const data = await callExtractor("/extract-json", buf, fileName, { table });
  const rows: any[] = Array.isArray(data?.rows) ? data.rows : [];
  const fields = rows.length ? Object.keys(rows[0]) : [];
  return { fields, rows };
}

function dedupeDbfFieldNames(buf: Buffer): Buffer {
  // DBF header: bytes 0-31. Field descriptors start at 32, each 32 bytes,
  // terminated by 0x0D. The DBF format reserves 11 bytes for the name, but
  // dbffile decodes only the first 10 bytes, so uniqueness must be guaranteed
  // inside those first 10 visible characters.
  const out = Buffer.from(buf);
  const seen = new Set<string>();
  let off = 32;
  while (off < out.length && out[off] !== 0x0d) {
    let end = 0;
    while (end < 10 && out[off + end] !== 0) end++;
    const name = out.slice(off, off + end).toString("ascii");
    if (seen.has(name)) {
      // Find a unique replacement that fits in the 10 bytes read by dbffile.
      for (let i = 2; i < 100; i++) {
        const suf = String(i);
        const base = name.slice(0, 10 - suf.length);
        const candidate = base + suf;
        if (!seen.has(candidate)) {
          out.fill(0, off, off + 11);
          out.write(candidate, off, "ascii");
          seen.add(candidate);
          break;
        }
      }
    } else {
      seen.add(name);
    }
    off += 32;
  }
  return out;
}

async function parseDbf(buf: Buffer): Promise<{ fields: string[]; rows: any[] }> {
  const { DBFFile } = await import("dbffile");
  const fs = await import("fs/promises");
  const path = `/tmp/${crypto.randomUUID()}.dbf`;
  await fs.writeFile(path, dedupeDbfFieldNames(buf));
  try {
    const dbf = await DBFFile.open(path, { encoding: "latin1" });

    const fields = dbf.fields.map((f: any) => f.name);
    const rows: any[] = [];
    let batch = await dbf.readRecords(10000);
    while (batch.length) {
      rows.push(...batch);
      if (batch.length < 10000) break;
      batch = await dbf.readRecords(10000);
    }
    return { fields, rows };
  } finally {
    await fs.unlink(path).catch(() => {});
  }
}

async function parseXlsx(buf: Buffer): Promise<{ fields: string[]; rows: any[] }> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { fields: [], rows: [] };
  const sheet = wb.Sheets[sheetName];
  const arr: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: "",
    blankrows: false,
  });
  if (!arr.length) return { fields: [], rows: [] };
  const normalizeHeader = (s: any) =>
    String(s ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  const knownHeaders = new Set([
    "nombre",
    "nombres",
    "nombreempleado",
    "nombrecompleto",
    "apellidopaterno",
    "apellidomaterno",
    "clave",
    "numero",
    "numtra",
    "cve",
    "rfc",
    "curp",
    "imss",
    "nss",
    "salario",
    "sueldodiario",
    "cuenta",
    "descrip",
    "descripcion",
    "natur",
    "naturaleza",
  ]);
  const headerIndex = arr.slice(0, 10).reduce((best, row, index) => {
    const score = row.reduce((n, cell) => n + (knownHeaders.has(normalizeHeader(cell)) ? 1 : 0), 0);
    const nonEmpty = row.filter((cell) => String(cell ?? "").trim()).length;
    const bestScore =
      arr[best]?.reduce((n, cell) => n + (knownHeaders.has(normalizeHeader(cell)) ? 1 : 0), 0) ?? 0;
    return score > bestScore || (score === bestScore && score > 0 && nonEmpty > 1) ? index : best;
  }, 0);
  const fields = arr[headerIndex].map(
    (s: any, i: number) => String(s ?? `COL${i + 1}`).trim() || `COL${i + 1}`,
  );
  const rows = arr
    .slice(headerIndex + 1)
    .filter((r) => r && r.some((v) => v !== "" && v != null))
    .map((r) => Object.fromEntries(fields.map((f, i) => [f, r[i] ?? ""])));
  return { fields, rows };
}

// Minimal RFC 4180 CSV parser (handles quoted fields, embedded commas/newlines/escaped quotes)
function parseCsv(text: string): { fields: string[]; rows: any[] } {
  // strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(cur);
        cur = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else cur += c;
    }
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  if (!rows.length) return { fields: [], rows: [] };
  const fields = rows[0].map((s) => s.trim());
  const out = rows
    .slice(1)
    .filter((r) => r.length && r.some((v) => v !== ""))
    .map((r) => Object.fromEntries(fields.map((f, i) => [f, r[i] ?? ""])));
  return { fields, rows: out };
}

async function parseAny(buf: Buffer, name: string, fdbTable?: string) {
  if (isXlsx(name)) return parseXlsx(buf);
  if (isCsv(name)) return parseCsv(buf.toString("utf8"));
  if (isFdb(name)) {
    if (!fdbTable) {
      throw new Error("Selecciona la tabla del .FDB antes de importar.");
    }
    return parseFdb(buf, name, fdbTable);
  }
  return parseDbf(buf);
}

export const listFdbTables = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ fileBase64: z.string(), fileName: z.string() }).parse(i),
  )
  .handler(async ({ data }) => {
    const buf = Buffer.from(data.fileBase64, "base64");
    const res = await callExtractor("/tables", buf, data.fileName);
    return { tables: (res?.tables ?? []) as string[] };
  });

export const previewDbf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => previewSchema.parse(i))
  .handler(async ({ data }) => {
    const buf = Buffer.from(data.fileBase64, "base64");
    const { fields, rows } = await parseAny(buf, data.fileName, data.fdbTable);
    return {
      fields,
      total: rows.length,
      sample: rows
        .slice(0, 5)
        .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, normalize(v)]))),
    };
  });

function normalize(v: any) {
  if (v == null) return null;
  if (typeof v === "string") return v.trim();
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
}

function naturalezaByCode(codigo: string): "deudora" | "acreedora" {
  const first = codigo.trim().charAt(0);
  if (first === "2" || first === "3" || first === "4") return "acreedora";
  return "deudora";
}

export const importDbf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        kind: z.enum(["coi_cuentas", "noi_empleados"]),
        fileBase64: z.string(),
        fileName: z.string(),
        fdbTable: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const buf = Buffer.from(data.fileBase64, "base64");
    const { rows } = await parseAny(buf, data.fileName, data.fdbTable);

    const { data: job, error: je } = await supabase
      .from("import_jobs")
      .insert({
        organization_id: data.organizationId,
        kind: data.kind,
        file_name: data.fileName,
        status: "procesando",
        rows_total: rows.length,
        created_by: userId,
      })
      .select("id")
      .single();
    if (je) throw new Error(je.message);

    let ok = 0;
    let errors = 0;
    const log: any[] = [];
    const importedKeys: string[] = [];

    const norm = (s: string) =>
      String(s ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
    const pick = (r: any, ...aliases: string[]) => {
      const keys = Object.keys(r);
      const map = new Map(keys.map((k) => [norm(k), k]));
      for (const a of aliases) {
        const hit = map.get(norm(a));
        if (hit != null) {
          const v = r[hit];
          if (v !== undefined && v !== null && String(v).trim() !== "") return v;
        }
      }
      return undefined;
    };

    if (data.kind === "coi_cuentas") {
      for (const r of rows) {
        try {
          const codigo = String(
            pick(r, "CUENTA", "NUM_CTA", "CTA", "CODIGO", "CLAVE", "NUMERO") ?? "",
          ).trim();
          const nombre = String(
            pick(r, "DESCRIP", "DESCRIPCION", "NOMBRE", "NOMBRE_CUENTA", "DESC") ?? "",
          ).trim();
          if (!codigo || !nombre) {
            errors++;
            log.push({ row: r, error: "Falta CUENTA o DESCRIPCION" });
            continue;
          }
          const natur = String(pick(r, "NATUR", "NATURALEZA") ?? "")
            .trim()
            .toUpperCase();
          const naturaleza = natur
            ? natur.startsWith("A") || natur === "C"
              ? "acreedora"
              : "deudora"
            : naturalezaByCode(codigo);
          const { error } = await supabase.from("accounts").upsert(
            {
              organization_id: data.organizationId,
              codigo,
              nombre,
              naturaleza,
              nivel: Number(pick(r, "NIVEL") ?? codigo.split(/[-.]/).length),
              acumulativa: Boolean(
                pick(r, "ACUM", "ACUMULATIVA") === "S" || pick(r, "ACUM", "ACUMULATIVA") === true,
              ),
              codigo_agrupador:
                pick(r, "AGRUPADOR", "AGRUPADOR_SAT", "CTA_SAT", "CODIGO_AGRUPADOR") ?? null,
            },
            { onConflict: "organization_id,codigo" },
          );
          if (error) throw new Error(error.message);
          importedKeys.push(codigo);
          ok++;
        } catch (e: any) {
          errors++;
          log.push({ row: r, error: e.message });
        }
      }
    } else if (data.kind === "noi_empleados") {
      for (const r of rows) {
        try {
          let numero = String(
            pick(
              r,
              "CLAVE",
              "NUMERO",
              "NUM_TRA",
              "CVE",
              "NO",
              "NUM",
              "NUMERO_EMPLEADO",
              "NUM_EMPLEADO",
              "IDEMPLEADO",
              "ID_EMPLEADO",
              "ID",
            ) ?? "",
          ).trim();

          const apRaw = pick(
            r,
            "AP_PAT_",
            "APPAT",
            "AP_PATERNO",
            "APELLIDO_PATERNO",
            "APELLIDOPATERNO",
            "PATERNO",
          );
          const amRaw = pick(
            r,
            "AP_MAT_",
            "APMAT",
            "AP_MATERNO",
            "APELLIDO_MATERNO",
            "APELLIDOMATERNO",
            "MATERNO",
          );
          const nombreRaw = pick(
            r,
            "NOMBRE",
            "NOMBRES",
            "NOMBRE_EMPLEADO",
            "NOMBRECOMPLETO",
            "NOMBRE_COMPLETO",
          );

          let nombre = "",
            ap = "",
            am = "";
          if (apRaw !== undefined || amRaw !== undefined) {
            nombre = String(nombreRaw ?? "").trim();
            ap = String(apRaw ?? "").trim();
            am = String(amRaw ?? "").trim();
          } else {
            const full = String(nombreRaw ?? "").trim();
            const parts = full.split(/\s+/).filter(Boolean);
            if (parts.length >= 3) {
              am = parts.pop()!;
              ap = parts.pop()!;
              nombre = parts.join(" ");
            } else if (parts.length === 2) {
              nombre = parts[0];
              ap = parts[1];
            } else {
              nombre = full;
            }
          }
          if (!nombre && !ap && !am) {
            errors++;
            log.push({
              row: r,
              error: "Sin nombre",
              row_preview: Object.fromEntries(Object.entries(r).slice(0, 8)),
            });
            continue;
          }
          if (!nombre) nombre = ap || am || "SIN NOMBRE";

          if (!numero) {
            const seed = String(pick(r, "RFC", "R_F_C_") ?? `${nombre}${ap}${am}`)
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, "");
            numero = seed.slice(0, 16) || `EMP${Date.now()}`;
          }

          const salario =
            Number(
              pick(
                r,
                "SAL_DIARIO",
                "SDIARIO",
                "S_DIARIO",
                "SALARIO",
                "SALARIO_DIARIO",
                "SUELDO",
                "SUELDO_DIARIO",
              ) ?? 0,
            ) || 0;
          const sdi =
            Number(pick(r, "SDI", "SALARIO_INTEGRADO", "SALARIODIARIOINTEGRADO") ?? 0) ||
            calcSDI(salario);
          const status = String(pick(r, "STATUS", "ESTATUS", "ESTADO") ?? "A").toUpperCase();
          const fechaAlta = pick(
            r,
            "FECH_ALTA",
            "F_INGRESO",
            "FECHA_ALTA",
            "FECHAALTA",
            "FECHA_INGRESO",
            "FECHAINGRESO",
            "ALTA",
            "INGRESO",
          );
          const fechaBaja = pick(r, "FECH_BAJA", "FECHA_BAJA", "FECHABAJA", "BAJA");
          const fechaNac = pick(
            r,
            "FECH_NACIM",
            "FECHA_NACIMIENTO",
            "FECHANACIMIENTO",
            "NACIMIENTO",
            "FECHA_NAC",
          );

          const { error } = await supabase.from("employees").upsert(
            {
              organization_id: data.organizationId,
              numero,
              nombre,
              apellido_paterno: ap || null,
              apellido_materno: am || null,
              rfc:
                String(pick(r, "R_F_C_", "RFC") ?? "")
                  .toUpperCase()
                  .trim() || null,
              curp:
                String(pick(r, "CURP") ?? "")
                  .toUpperCase()
                  .trim() || null,
              nss:
                String(
                  pick(r, "IMSS", "NSS", "SEGURO_SOCIAL", "NUMERO_SEGURO_SOCIAL") ?? "",
                ).trim() || null,
              fecha_alta: normalizeDate(fechaAlta ?? new Date()),
              fecha_baja: fechaBaja ? normalizeDate(fechaBaja) : null,
              fecha_nacimiento: fechaNac ? normalizeDate(fechaNac) : null,
              puesto:
                pick(r, "PUESTO", "CARGO") != null ? String(pick(r, "PUESTO", "CARGO")) : null,
              departamento:
                pick(r, "DEPTO", "DEPARTAMENTO", "AREA") != null
                  ? String(pick(r, "DEPTO", "DEPARTAMENTO", "AREA"))
                  : null,
              salario_diario: salario,
              sdi,
              periodicidad: mapPeriodicidad(
                pick(r, "PERIODO", "PERIODICIDAD", "TIP_SAL", "TIPO_SALARIO", "FRECUENCIA"),
              ),
              email: pick(r, "EMAIL", "CORREO", "CORREO_ELECTRONICO") ?? null,
              telefono: pick(r, "TELEFONO", "TEL", "CELULAR") ?? null,
              clabe: pick(r, "CTACHEQNOM", "CLABE", "CUENTA_CLABE", "CUENTA") ?? null,
              forma_pago: mapFormaPago(pick(r, "FORM_PAGO", "FORMA_PAGO", "PAGO")),
              estatus: status === "B" || status === "BAJA" || pick(r, "BAJA") ? "baja" : "activo",
              empresa:
                (pick(r, "EMPRESA", "RAZON_SOCIAL", "COMPANIA", "COMPANY") != null
                  ? String(pick(r, "EMPRESA", "RAZON_SOCIAL", "COMPANIA", "COMPANY")).trim()
                  : null) || null,
            },
            { onConflict: "organization_id,numero" },
          );
          if (error) throw new Error(error.message);
          importedKeys.push(numero);
          ok++;
        } catch (e: any) {
          errors++;
          log.push({
            row: r,
            error: e.message,
            row_preview: Object.fromEntries(Object.entries(r).slice(0, 8)),
          });
        }
      }
    }

    await supabase
      .from("import_jobs")
      .update({
        status: "completado",
        rows_ok: ok,
        rows_error: errors,
        log: { errors: log.slice(0, 50), imported_keys: importedKeys },
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return { jobId: job.id, ok, errors };
  });

function normalizeDate(v: any): string {
  if (!v) return new Date().toISOString().slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s) return new Date().toISOString().slice(0, 10);
  // ISO o YYYY-MM-DD: tomar primeros 10
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD/MM/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return s.slice(0, 10);
}
function mapPeriodicidad(v: any): "semanal" | "catorcenal" | "quincenal" | "mensual" {
  const s = String(v ?? "").toUpperCase();
  if (s.startsWith("S") || s === "7") return "semanal";
  if (s.startsWith("C") || s.startsWith("14")) return "catorcenal";
  if (s.startsWith("M") || s.startsWith("30")) return "mensual";
  return "quincenal";
}
function mapFormaPago(v: any): string {
  const s = String(v ?? "")
    .toUpperCase()
    .trim();
  if (s === "E" || s.startsWith("EF")) return "efectivo";
  if (s === "C" || s.startsWith("CH")) return "cheque";
  return "transferencia";
}

export const listImportJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("import_jobs")
      .select("*")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const deleteImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ jobId: z.string().uuid(), deleteRecords: z.boolean().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: job, error: jerr } = await supabase
      .from("import_jobs")
      .select("id, organization_id, kind, log")
      .eq("id", data.jobId)
      .maybeSingle();
    if (jerr) throw new Error(jerr.message);
    if (!job) throw new Error("Importación no encontrada");

    const deleteRecords = data.deleteRecords ?? true;
    let deleted = 0;
    if (deleteRecords) {
      const keys: string[] = Array.isArray((job.log as any)?.imported_keys)
        ? (job.log as any).imported_keys
        : [];
      if (keys.length) {
        if (job.kind === "noi_empleados") {
          const { error, count } = await supabase
            .from("employees")
            .delete({ count: "exact" })
            .eq("organization_id", job.organization_id)
            .in("numero", keys);
          if (error) throw new Error(error.message);
          deleted = count ?? 0;
        } else if (job.kind === "coi_cuentas") {
          const { error, count } = await supabase
            .from("accounts")
            .delete({ count: "exact" })
            .eq("organization_id", job.organization_id)
            .in("codigo", keys);
          if (error) throw new Error(error.message);
          deleted = count ?? 0;
        }
      }
    }

    const { error } = await supabase.from("import_jobs").delete().eq("id", data.jobId);
    if (error) throw new Error(error.message);
    return { ok: true, deleted };
  });

// ============================================================
// AUTO-DETECT IMPORTER (handles all COI/NOI DBF tables)
// ============================================================

type DetectedKind =
  | "coi_cuentas"
  | "coi_polizas"
  | "coi_movimientos"
  | "coi_saldos"
  | "coi_departamentos"
  | "coi_diarios"
  | "coi_monedas"
  | "coi_asocsat"
  | "coi_ejercicios"
  | "noi_empleados"
  | "coi_raw"
  | "noi_raw";

function detectKindFromName(fileName: string): { kind: DetectedKind; label: string } {
  const base = fileName.replace(/\.[^.]+$/, "").toUpperCase();
  if (/^CUENTAS/.test(base)) return { kind: "coi_cuentas", label: "Catálogo de cuentas" };
  if (/^(POLIZA|POL\d)/.test(base)) return { kind: "coi_polizas", label: "Encabezados de pólizas" };
  if (/^(MOVPOL|MOV\d|MOVIM)/.test(base))
    return { kind: "coi_movimientos", label: "Partidas de pólizas" };
  if (/^(SALDOS?|SAO)/.test(base))
    return { kind: "coi_saldos", label: "Saldos por cuenta/periodo" };
  if (/^(DEPTOS?|CCOSTOS?)/.test(base))
    return { kind: "coi_departamentos", label: "Departamentos / centros de costo" };
  if (/^DIARIOS?/.test(base)) return { kind: "coi_diarios", label: "Tipos de diario" };
  if (/^MONEDAS?/.test(base)) return { kind: "coi_monedas", label: "Monedas" };
  if (/^(ASOCSAT|EXTSAT|CTASAT)/.test(base))
    return { kind: "coi_asocsat", label: "Asociación SAT" };
  if (/^EJERCIC/.test(base)) return { kind: "coi_ejercicios", label: "Ejercicios contables" };
  if (/^(EMPLEAD|TRABAJ)/.test(base)) return { kind: "noi_empleados", label: "Empleados NOI" };
  if (/^(NOI|HISNOM|MOVNOM|CONCEPT|DEPNOI)/.test(base))
    return { kind: "noi_raw", label: "Tabla NOI (respaldo)" };
  return { kind: "coi_raw", label: "Tabla COI (respaldo)" };
}

const normKey = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

function makePicker(row: any) {
  const map = new Map<string, string>();
  for (const k of Object.keys(row)) map.set(normKey(k), k);
  return (...aliases: string[]) => {
    for (const a of aliases) {
      const k = map.get(normKey(a));
      if (k != null) {
        const v = row[k];
        if (v !== undefined && v !== null && String(v).trim() !== "") return v;
      }
    }
    return undefined;
  };
}

function jsonSafeRow(r: any) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(r)) {
    if (v instanceof Date) out[k] = v.toISOString().slice(0, 10);
    else if (typeof v === "string") out[k] = v.trim();
    else out[k] = v ?? null;
  }
  return out;
}

async function storeRaw(
  supabase: any,
  orgId: string,
  jobId: string,
  fileName: string,
  kind: DetectedKind,
  fields: string[],
  rows: any[],
) {
  const tableName = fileName.replace(/\.[^.]+$/, "").toUpperCase();
  const { data: imp, error: ie } = await supabase
    .from("aspel_raw_imports")
    .insert({
      organization_id: orgId,
      import_job_id: jobId,
      sistema: kind.startsWith("noi") ? "NOI" : "COI",
      file_name: fileName,
      table_detected: tableName,
      rows_total: rows.length,
      fields,
    })
    .select("id")
    .single();
  if (ie) throw new Error(ie.message);

  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const slice = rows.slice(i, i + batchSize).map((r, idx) => ({
      raw_import_id: imp.id,
      organization_id: orgId,
      table_name: tableName,
      row_index: i + idx,
      data: jsonSafeRow(r),
    }));
    const { error } = await supabase.from("aspel_raw_rows").insert(slice);
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

function mapJournalType(v: any): "ingreso" | "egreso" | "diario" | "cheque" | "transferencia" {
  const s = String(v ?? "")
    .trim()
    .toUpperCase();
  if (s.startsWith("IG") || s === "I" || s === "1") return "ingreso";
  if (s.startsWith("EG") || s === "E" || s === "2") return "egreso";
  if (s.startsWith("CH")) return "cheque";
  if (s.startsWith("TR")) return "transferencia";
  return "diario";
}

async function importCuentas(supabase: any, orgId: string, rows: any[]) {
  let ok = 0,
    errors = 0;
  const log: any[] = [];
  for (const r of rows) {
    try {
      const pick = makePicker(r);
      const codigo = String(
        pick("CUENTA", "NUM_CTA", "CTA", "CODIGO", "CLAVE", "NUMERO") ?? "",
      ).trim();
      const nombre = String(
        pick("DESCRIP", "DESCRIPCION", "NOMBRE", "NOM_CTA", "DESC") ?? "",
      ).trim();
      if (!codigo || !nombre) {
        errors++;
        log.push({ error: "Falta CUENTA o NOMBRE" });
        continue;
      }
      const natur = String(pick("NATUR", "NATURALEZA") ?? "")
        .trim()
        .toUpperCase();
      const naturaleza = natur
        ? natur.startsWith("A") || natur === "C"
          ? "acreedora"
          : "deudora"
        : naturalezaByCode(codigo);
      const { error } = await supabase.from("accounts").upsert(
        {
          organization_id: orgId,
          codigo,
          nombre,
          naturaleza,
          nivel: Number(pick("NIVEL") ?? codigo.split(/[-.]/).length),
          acumulativa: pick("ACUM", "ACUMULATIVA") === "S" || pick("ACUM") === true,
          codigo_agrupador: pick("AGRUPADOR", "CTA_SAT", "CODIGO_AGRUPADOR") ?? null,
        },
        { onConflict: "organization_id,codigo" },
      );
      if (error) throw new Error(error.message);
      ok++;
    } catch (e: any) {
      errors++;
      log.push({ error: e.message });
    }
  }
  return { ok, errors, log };
}

async function importPolizas(supabase: any, orgId: string, rows: any[]) {
  let ok = 0,
    errors = 0;
  const log: any[] = [];
  for (const r of rows) {
    try {
      const pick = makePicker(r);
      const numero = Number(pick("NUM_POL", "NUMPOL", "NUMERO", "POLIZA") ?? 0);
      const tipo = mapJournalType(pick("TIPO_POL", "TIPOPOL", "TIPO"));
      const fecha = normalizeDate(pick("FECHA", "FEC_POL"));
      if (!numero || !fecha) {
        errors++;
        log.push({ error: "Falta NUM_POL o FECHA" });
        continue;
      }
      const { error } = await supabase.from("journal_entries").upsert(
        {
          organization_id: orgId,
          tipo,
          numero,
          fecha,
          concepto: String(pick("CONCEPTO", "DESCRIP") ?? "").trim() || `Póliza ${tipo} ${numero}`,
          estatus: "confirmada",
          total_cargo: Number(pick("CARGOS", "TOT_CARGOS", "TCARGOS") ?? 0) || 0,
          total_abono: Number(pick("ABONOS", "TOT_ABONOS", "TABONOS") ?? 0) || 0,
          referencia: pick("REFER", "REFERENCIA") ?? null,
        },
        { onConflict: "organization_id,tipo,numero,fecha" },
      );
      if (error) throw new Error(error.message);
      ok++;
    } catch (e: any) {
      errors++;
      log.push({ error: e.message });
    }
  }
  return { ok, errors, log };
}

async function importMovimientos(supabase: any, orgId: string, rows: any[]) {
  let ok = 0,
    errors = 0;
  const log: any[] = [];
  // Cache accounts and entries to minimize round-trips
  const { data: accs } = await supabase
    .from("accounts")
    .select("id,codigo")
    .eq("organization_id", orgId);
  const accMap = new Map<string, string>((accs ?? []).map((a: any) => [a.codigo, a.id]));
  const { data: ents } = await supabase
    .from("journal_entries")
    .select("id,tipo,numero,fecha")
    .eq("organization_id", orgId);
  const entMap = new Map<string, string>(
    (ents ?? []).map((e: any) => [`${e.tipo}|${e.numero}|${e.fecha}`, e.id]),
  );
  // Track orden per entry
  const ordenByEntry = new Map<string, number>();

  for (const r of rows) {
    try {
      const pick = makePicker(r);
      const codigo = String(pick("NUM_CTA", "CUENTA", "CTA") ?? "").trim();
      const accountId = accMap.get(codigo);
      if (!accountId) {
        errors++;
        log.push({ error: `Cuenta no encontrada: ${codigo}` });
        continue;
      }

      const numero = Number(pick("NUM_POL", "NUMPOL", "POLIZA") ?? 0);
      const tipo = mapJournalType(pick("TIPO_POL", "TIPOPOL", "TIPO"));
      const fecha = normalizeDate(pick("FECHA"));
      const key = `${tipo}|${numero}|${fecha}`;
      let entryId: string | undefined = entMap.get(key);
      if (!entryId) {
        // Create stub entry on the fly
        const { data: ne, error: ee } = await supabase
          .from("journal_entries")
          .upsert(
            {
              organization_id: orgId,
              tipo,
              numero,
              fecha,
              concepto: `Póliza ${tipo} ${numero}`,
              estatus: "confirmada",
              total_cargo: 0,
              total_abono: 0,
            },
            { onConflict: "organization_id,tipo,numero,fecha" },
          )
          .select("id")
          .single();
        if (ee) throw new Error(ee.message);
        entryId = ne.id as string;
        entMap.set(key, entryId);
      }
      const orden = (ordenByEntry.get(entryId!) ?? 0) + 1;
      ordenByEntry.set(entryId!, orden);

      const { error } = await supabase.from("journal_lines").upsert(
        {
          entry_id: entryId,
          organization_id: orgId,
          account_id: accountId,
          concepto: String(pick("CONCEPTO", "DESCRIP") ?? "").trim() || null,
          cargo: Number(pick("CARGO", "DEBE") ?? 0) || 0,
          abono: Number(pick("ABONO", "HABER") ?? 0) || 0,
          orden,
        },
        { onConflict: "entry_id,orden" },
      );
      if (error) throw new Error(error.message);
      ok++;
    } catch (e: any) {
      errors++;
      log.push({ error: e.message });
    }
  }
  return { ok, errors, log };
}

async function importSaldos(supabase: any, orgId: string, rows: any[]) {
  let ok = 0,
    errors = 0;
  const log: any[] = [];
  for (const r of rows) {
    try {
      const pick = makePicker(r);
      const account_codigo = String(pick("NUM_CTA", "CUENTA", "CTA") ?? "").trim();
      const ejercicio = Number(pick("ANIO", "EJERCICIO", "ANO", "YEAR") ?? 0);
      const periodo = Number(pick("MES", "PERIODO", "PER", "MONTH") ?? 0);
      if (!account_codigo || !ejercicio || !periodo) {
        errors++;
        log.push({ error: "Falta CTA/AÑO/MES" });
        continue;
      }
      const saldo_inicial = Number(pick("SALDO_INI", "SAL_INI", "INICIAL") ?? 0) || 0;
      const cargos = Number(pick("CARGOS", "DEBE", "CARGO") ?? 0) || 0;
      const abonos = Number(pick("ABONOS", "HABER", "ABONO") ?? 0) || 0;
      const saldo_final =
        Number(pick("SALDO_FIN", "SAL_FIN", "FINAL") ?? saldo_inicial + cargos - abonos) || 0;
      const { error } = await supabase.from("account_balances").upsert(
        {
          organization_id: orgId,
          account_codigo,
          ejercicio,
          periodo,
          saldo_inicial,
          cargos,
          abonos,
          saldo_final,
          moneda: pick("MONEDA", "NUM_MON") ?? null,
        },
        { onConflict: "organization_id,account_codigo,ejercicio,periodo" },
      );
      if (error) throw new Error(error.message);
      ok++;
    } catch (e: any) {
      errors++;
      log.push({ error: e.message });
    }
  }
  return { ok, errors, log };
}

async function importSimpleCatalog(
  supabase: any,
  orgId: string,
  rows: any[],
  table: string,
  mapper: (pick: ReturnType<typeof makePicker>) => Record<string, any> | null,
  conflict: string,
) {
  let ok = 0,
    errors = 0;
  const log: any[] = [];
  for (const r of rows) {
    try {
      const pick = makePicker(r);
      const payload = mapper(pick);
      if (!payload) {
        errors++;
        log.push({ error: "Fila sin clave" });
        continue;
      }
      const { error } = await supabase
        .from(table)
        .upsert({ organization_id: orgId, ...payload }, { onConflict: conflict });
      if (error) throw new Error(error.message);
      ok++;
    } catch (e: any) {
      errors++;
      log.push({ error: e.message });
    }
  }
  return { ok, errors, log };
}

export const detectAspelFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ fileName: z.string() }).parse(i))
  .handler(async ({ data }) => detectKindFromName(data.fileName));

const autoSchema = z.object({
  organizationId: z.string().uuid(),
  fileBase64: z.string(),
  fileName: z.string(),
});

export const importAspelAuto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => autoSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const buf = Buffer.from(data.fileBase64, "base64");
    const { fields, rows } = await parseAny(buf, data.fileName);
    const det = detectKindFromName(data.fileName);

    const { data: job, error: je } = await supabase
      .from("import_jobs")
      .insert({
        organization_id: data.organizationId,
        kind: det.kind,
        file_name: data.fileName,
        status: "procesando",
        rows_total: rows.length,
        created_by: userId,
      })
      .select("id")
      .single();
    if (je) throw new Error(je.message);

    let ok = 0,
      errors = 0;
    let log: any[] = [];
    let storedAs = "typed";
    try {
      if (det.kind === "coi_cuentas")
        ({ ok, errors, log } = await importCuentas(supabase, data.organizationId, rows));
      else if (det.kind === "coi_polizas")
        ({ ok, errors, log } = await importPolizas(supabase, data.organizationId, rows));
      else if (det.kind === "coi_movimientos")
        ({ ok, errors, log } = await importMovimientos(supabase, data.organizationId, rows));
      else if (det.kind === "coi_saldos")
        ({ ok, errors, log } = await importSaldos(supabase, data.organizationId, rows));
      else if (det.kind === "coi_departamentos") {
        ({ ok, errors, log } = await importSimpleCatalog(
          supabase,
          data.organizationId,
          rows,
          "cost_centers",
          (p) => {
            const codigo = String(p("NUM_DEP", "DEPTO", "CODIGO", "CLAVE", "NUM") ?? "").trim();
            const nombre = String(p("NOMBRE", "DESCRIP", "DESCRIPCION") ?? "").trim();
            if (!codigo) return null;
            return {
              codigo,
              nombre: nombre || codigo,
              responsable: p("RESPONS", "RESPONSABLE") ?? null,
            };
          },
          "organization_id,codigo",
        ));
      } else if (det.kind === "coi_diarios") {
        ({ ok, errors, log } = await importSimpleCatalog(
          supabase,
          data.organizationId,
          rows,
          "journal_types_catalog",
          (p) => {
            const codigo = String(p("NUM_DIA", "CODIGO", "CLAVE") ?? "").trim();
            const nombre = String(p("NOMBRE", "DESCRIP") ?? "").trim();
            if (!codigo) return null;
            return {
              codigo,
              nombre: nombre || codigo,
              naturaleza: p("NATUR", "NATURALEZA") ?? null,
            };
          },
          "organization_id,codigo",
        ));
      } else if (det.kind === "coi_monedas") {
        ({ ok, errors, log } = await importSimpleCatalog(
          supabase,
          data.organizationId,
          rows,
          "currencies",
          (p) => {
            const codigo = String(p("NUM_MON", "CODIGO", "CLAVE", "MONEDA") ?? "").trim();
            const nombre = String(p("NOMBRE", "DESCRIP") ?? "").trim();
            if (!codigo) return null;
            return {
              codigo,
              nombre: nombre || codigo,
              simbolo: p("SIMBOLO") ?? null,
              tipo_cambio: Number(p("TIPO_CAMBIO", "TC") ?? 1) || 1,
            };
          },
          "organization_id,codigo",
        ));
      } else if (det.kind === "coi_asocsat") {
        ({ ok, errors, log } = await importSimpleCatalog(
          supabase,
          data.organizationId,
          rows,
          "sat_account_map",
          (p) => {
            const account_codigo = String(p("NUM_CTA", "CUENTA", "CTA") ?? "").trim();
            const codigo_agrupador = String(
              p("CTA_SAT", "AGRUPADOR", "CODIGO_AGRUPADOR") ?? "",
            ).trim();
            if (!account_codigo || !codigo_agrupador) return null;
            return {
              account_codigo,
              codigo_agrupador,
              nombre_sat: p("NOMBRE_SAT", "DESC_SAT") ?? null,
            };
          },
          "organization_id,account_codigo",
        ));
      } else if (det.kind === "coi_ejercicios") {
        ({ ok, errors, log } = await importSimpleCatalog(
          supabase,
          data.organizationId,
          rows,
          "fiscal_years",
          (p) => {
            const ejercicio = Number(p("EJERCICIO", "ANIO", "ANO") ?? 0);
            const periodo = Number(p("NUM_PER", "PERIODO", "PER", "MES") ?? 0);
            if (!ejercicio || !periodo) return null;
            return {
              ejercicio,
              periodo,
              estatus: String(p("STATUS", "ESTATUS") ?? "abierto").toLowerCase(),
              fecha_apertura: p("FEC_APE", "FECHA_APERTURA")
                ? normalizeDate(p("FEC_APE", "FECHA_APERTURA"))
                : null,
              fecha_cierre: p("FEC_CIE", "FECHA_CIERRE")
                ? normalizeDate(p("FEC_CIE", "FECHA_CIERRE"))
                : null,
            };
          },
          "organization_id,ejercicio,periodo",
        ));
      } else {
        // Unknown table → store raw
        storedAs = "raw";
        ok = await storeRaw(
          supabase,
          data.organizationId,
          job.id,
          data.fileName,
          det.kind,
          fields,
          rows,
        );
      }
    } catch (e: any) {
      // If typed handler completely fails, fall back to raw so nothing is lost
      try {
        storedAs = "raw_fallback";
        ok = await storeRaw(
          supabase,
          data.organizationId,
          job.id,
          data.fileName,
          det.kind,
          fields,
          rows,
        );
        errors = 0;
        log = [{ error: `Handler tipado falló: ${e.message}. Guardado en respaldo crudo.` }];
      } catch (e2: any) {
        await supabase
          .from("import_jobs")
          .update({
            status: "error",
            rows_ok: 0,
            rows_error: rows.length,
            log: { errors: [{ error: e.message }, { error: e2.message }] },
            completed_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        throw new Error(e.message);
      }
    }

    await supabase
      .from("import_jobs")
      .update({
        status: "completado",
        rows_ok: ok,
        rows_error: errors,
        log: { detected: det, stored_as: storedAs, errors: log.slice(0, 50) },
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return { jobId: job.id, ok, errors, detected: det, storedAs, total: rows.length };
  });
