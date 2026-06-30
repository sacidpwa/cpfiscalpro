import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import "dotenv/config";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const CSV_DIR = "C:\\Users\\Falcor\\Downloads\\Exportacion proyecto";

function loadCSV(filename) {
  const fullPath = `${CSV_DIR}\\${filename}`;
  let raw = readFileSync(fullPath, "utf-8");
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  const rows = parse(raw, { columns: true, skip_empty_lines: true, relax_column_count: true });
  return rows.map(r => {
    const out = {};
    for (const [k, v] of Object.entries(r)) {
      if (v === "") { out[k] = null; continue; }
      // Convert JSON-style arrays "[]" to PostgreSQL-style "{}" for text[] columns
      if (k === "extra_codes" && v === "[]") { out[k] = "{}"; continue; }
      out[k] = v;
    }
    return out;
  });
}

async function upsertRows(table, rows, conflictCol = "id") {
  if (!rows.length) return 0;
  const batches = [];
  for (let i = 0; i < rows.length; i += 100) batches.push(rows.slice(i, i + 100));
  let count = 0;
  for (const batch of batches) {
    const { error } = await supabase
      .from(table)
      .upsert(batch, { onConflict: conflictCol, ignoreDuplicates: false });
    if (error) throw new Error(`Error en ${table}: ${error.message}`);
    count += batch.length;
  }
  return count;
}

async function main() {
  // 1. Detect org_id and user IDs from CSVs
  const sampleEmployees = loadCSV("employees_2026-06-29.csv");
  const sampleAttendance = loadCSV("attendance_entries_2026-06-29.csv");
  const sampleStamps = loadCSV("cfdi_stamps_2026-06-29.csv");
  const sampleReceipts = loadCSV("payroll_receipts_2026-06-29.csv");

  const orgId = sampleEmployees[0]?.organization_id;
  if (!orgId) throw new Error("No se pudo detectar organization_id");

  // Collect all unique user IDs referenced in CSVs
  const userIds = new Set([
    ...sampleAttendance.map(r => r.created_by).filter(Boolean),
    ...sampleStamps.map(r => r.timbrado_por).filter(Boolean),
    ...sampleReceipts.map(r => r.created_at ? "00000000-0000-0000-0000-000000000001" : []).flat(),
  ]);
  // Add a default admin user
  userIds.add("00000000-0000-0000-0000-000000000001");

  if (userIds.size === 0) {
    throw new Error("No se detectaron usuarios en los CSVs");
  }

  console.log(`Organización: ${orgId}`);
  console.log(`Usuarios a crear: ${userIds.size}`);

  // 2. Create auth users + profiles for each detected user
  const uuidMap = new Map();
  let i = 0;
  for (const oldUid of userIds) {
    i++;
    const email = `user${i}_${Date.now()}@importado.local`;
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password: "Temp1234!",
      email_confirm: true,
      user_metadata: { full_name: `Usuario ${i}` },
    });
    if (authErr) throw new Error(`Error creating auth user ${oldUid}: ${authErr.message}`);

    const newUid = authUser.user.id;
    uuidMap.set(oldUid, newUid);

    // Ensure profile exists
    await supabase.from("profiles").upsert({
      id: newUid,
      email,
      full_name: `Usuario ${i}`,
    }, { onConflict: "id" });

    console.log(`  Usuario ${oldUid.slice(0,8)}... -> ${newUid}`);
  }

  // 3. Insert organization
  console.log("\n--- Organización ---");
  const firstNewUid = uuidMap.values().next().value;
  await upsertRows("organizations", [
    { id: orgId, rfc: "XXX000000XXX", razon_social: "Importada desde Lovable", created_by: firstNewUid },
  ]);
  console.log("OK");

  // 4. Insert org members (map old -> new UUID)
  console.log("\n--- Miembros ---");
  const memberRows = [...userIds].map(oldUid => ({
    organization_id: orgId,
    user_id: uuidMap.get(oldUid),
    role: "admin",
  }));
  await upsertRows("organization_members", memberRows);
  console.log(`${memberRows.length} OK`);

  // Helper to map user UUIDs in a data array
  function mapUserIds(rows, ...fields) {
    return rows.map(r => {
      const out = { ...r };
      for (const f of fields) {
        if (out[f] && uuidMap.has(out[f])) out[f] = uuidMap.get(out[f]);
      }
      return out;
    });
  }

  // Tables to import (ordered by FK dependencies)
  const tables = [
    { file: "imss_patrones_2026-06-29.csv", table: "imss_patrones", transform: (r) => r },
    {
      file: "employees_2026-06-29.csv", table: "employees",
      transform: (r) => r,
    },
    { file: "imss_movimientos_2026-06-29.csv", table: "imss_movimientos", transform: (r) => r },
    { file: "payroll_periods_2026-06-29.csv", table: "payroll_periods", transform: (r) => r },
    {
      file: "attendance_entries_2026-06-29.csv", table: "attendance_entries",
      transform: (r) => mapUserIds(r, "created_by"),
    },
    {
      file: "payroll_receipts_2026-06-29.csv", table: "payroll_receipts",
      transform: (r) => r,
    },
    { file: "payroll_receipt_lines_2026-06-29.csv", table: "payroll_receipt_lines", transform: (r) => r },
    {
      file: "cfdi_stamps_2026-06-29.csv", table: "cfdi_stamps",
      transform: (r) => mapUserIds(r, "timbrado_por"),
    },
  ];

  for (const { file, table, transform } of tables) {
    console.log(`\n--- ${table} ---`);
    const rows = loadCSV(file);
    const transformed = transform(rows);
    console.log(`  ${transformed.length} filas`);
    const count = await upsertRows(table, transformed);
    console.log(`  ${count} insertadas`);
  }

  console.log("\n=== Importación completada ===");
}

main().catch(console.error);
