import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listIncidentTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("incident_types")
      .select("*")
      .order("orden", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getAttendanceGrid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        year: z.number().int().min(2020).max(2100),
        month: z.number().int().min(1).max(12),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const first = `${data.year}-${String(data.month).padStart(2, "0")}-01`;
    const lastDay = new Date(data.year, data.month, 0).getDate();
    const last = `${data.year}-${String(data.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const [emps, entries] = await Promise.all([
      supabase
        .from("employees")
        .select("id, numero, nombre, apellido_paterno, apellido_materno, departamento, puesto, estatus")
        .eq("organization_id", data.organizationId)
        .eq("estatus", "activo")
        .order("numero", { ascending: true }),
      supabase
        .from("attendance_entries")
        .select("employee_id, fecha, incident_code, extra_codes, horas_extra_dobles, horas_extra_triples, minutos_retardo, observaciones")
        .eq("organization_id", data.organizationId)
        .gte("fecha", first)
        .lte("fecha", last),
    ]);

    if (emps.error) throw new Error(emps.error.message);
    if (entries.error) throw new Error(entries.error.message);

    return { employees: emps.data ?? [], entries: entries.data ?? [], daysInMonth: lastDay };
  });

export const upsertAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        employee_id: z.string().uuid(),
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        incident_code: z.string().min(1).max(8),
        extra_codes: z.array(z.string().min(1).max(8)).max(10).default([]),
        horas_extra_dobles: z.number().min(0).max(24).default(0),
        horas_extra_triples: z.number().min(0).max(24).default(0),
        minutos_retardo: z.number().int().min(0).max(720).default(0),
        observaciones: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("attendance_entries").upsert(
      {
        organization_id: data.organizationId,
        employee_id: data.employee_id,
        fecha: data.fecha,
        incident_code: data.incident_code,
        extra_codes: data.extra_codes,
        horas_extra_dobles: data.horas_extra_dobles,
        horas_extra_triples: data.horas_extra_triples,
        minutos_retardo: data.minutos_retardo,
        observaciones: data.observaciones ?? null,
        created_by: userId,
      },
      { onConflict: "employee_id,fecha" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkFillAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        employee_ids: z.array(z.string().uuid()).min(1).max(500),
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
        incident_code: z.string().min(1).max(8),
        skip_weekends: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const lastDay = new Date(data.year, data.month, 0).getDate();
    const rows: any[] = [];
    for (const emp of data.employee_ids) {
      for (let d = 1; d <= lastDay; d++) {
        const dt = new Date(data.year, data.month - 1, d);
        const dow = dt.getDay();
        if (data.skip_weekends && (dow === 0 || dow === 6)) continue;
        rows.push({
          organization_id: data.organizationId,
          employee_id: emp,
          fecha: `${data.year}-${String(data.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
          incident_code: data.incident_code,
          created_by: userId,
        });
      }
    }
    const { error } = await supabase
      .from("attendance_entries")
      .upsert(rows, { onConflict: "employee_id,fecha" });
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });
