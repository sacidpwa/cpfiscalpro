import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAttendanceGrid, listIncidentTypes, upsertAttendance, bulkFillAttendance } from "@/lib/attendance.functions";
import { useRequireOrg } from "@/lib/use-current-org";
import { PageHeader, EmptyState } from "@/components/app-ui";
import { Calendar, Users, ChevronLeft, ChevronRight, X, Check, Search, BarChart3 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getMexicoHolidays } from "@/lib/mx-holidays";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/app/asistencias")({
  component: AsistenciasPage,
});

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

type Entry = {
  employee_id: string;
  fecha: string;
  incident_code: string;
  extra_codes?: string[] | null;
  horas_extra_dobles?: number;
  horas_extra_triples?: number;
  minutos_retardo?: number;
  observaciones?: string | null;
};

function AsistenciasPage() {
  const org = useRequireOrg();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const gridFn = useServerFn(getAttendanceGrid);
  const typesFn = useServerFn(listIncidentTypes);
  const upsertFn = useServerFn(upsertAttendance);
  const bulkFn = useServerFn(bulkFillAttendance);
  const qc = useQueryClient();

  const { data: types } = useQuery({ queryKey: ["incident-types"], queryFn: () => typesFn() });
  const { data, isLoading } = useQuery({
    queryKey: ["attendance", org.id, year, month],
    queryFn: () => gridFn({ data: { organizationId: org.id, year, month } }),
  });

  const entryMap = useMemo(() => {
    const m = new Map<string, Entry>();
    (data?.entries ?? []).forEach((e: any) => m.set(`${e.employee_id}|${e.fecha}`, e));
    return m;
  }, [data]);

  const typeMap = useMemo(() => {
    const m = new Map<string, any>();
    (types ?? []).forEach((t: any) => m.set(t.codigo, t));
    return m;
  }, [types]);

  const upsertMut = useMutation({
    mutationFn: (v: any) => upsertFn({ data: v }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["attendance", org.id, year, month] });
      const prev = qc.getQueryData(["attendance", org.id, year, month]);
      qc.setQueryData(["attendance", org.id, year, month], (old: any) => {
        if (!old) return old;
        const key = `${v.employee_id}|${v.fecha}`;
        const others = old.entries.filter((e: any) => `${e.employee_id}|${e.fecha}` !== key);
        return { ...old, entries: [...others, { ...v, organization_id: org.id }] };
      });
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      qc.setQueryData(["attendance", org.id, year, month], ctx?.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["attendance", org.id, year, month] }),
  });

  const bulkMut = useMutation({
    mutationFn: (v: any) => bulkFn({ data: v }),
    onSuccess: (r) => {
      toast.success(`${r.inserted} asistencias registradas`);
      qc.invalidateQueries({ queryKey: ["attendance", org.id, year, month] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function changeMonth(delta: number) {
    let m = month + delta, y = year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setMonth(m); setYear(y);
  }

  const [picker, setPicker] = useState<{ empId: string; empName: string; fecha: string } | null>(null);
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState<string>("__all");

  const days = data?.daysInMonth ?? 0;
  const dayList = Array.from({ length: days }, (_, i) => i + 1);
  const holidayMap = useMemo(() => {
    const m = new Map<string, string>();
    getMexicoHolidays(year).forEach((h) => m.set(h.date, h.nombre));
    return m;
  }, [year]);

  const areas = useMemo(() => {
    const set = new Set<string>();
    (data?.employees ?? []).forEach((e: any) => { if (e.departamento) set.add(e.departamento); });
    return Array.from(set).sort();
  }, [data]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.employees ?? []).filter((e: any) => {
      if (areaFilter !== "__all" && (e.departamento ?? "") !== areaFilter) return false;
      if (!q) return true;
      const full = `${e.nombre} ${e.apellido_paterno ?? ""} ${e.apellido_materno ?? ""} ${e.numero ?? ""} ${e.puesto ?? ""}`.toLowerCase();
      return full.includes(q);
    });
  }, [data, search, areaFilter]);

  // Desempeño por área: % asistencia (A/Trabajados) excluyendo fines de semana y festivos.
  const perfByArea = useMemo(() => {
    if (!data?.employees?.length) return [] as Array<{ area: string; asistencia: number; total: number; pct: number }>;
    const acc = new Map<string, { area: string; asistencia: number; total: number }>();
    for (const emp of data.employees) {
      const area = emp.departamento || "Sin área";
      if (!acc.has(area)) acc.set(area, { area, asistencia: 0, total: 0 });
      const a = acc.get(area)!;
      for (const d of dayList) {
        const fecha = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
        const dow = new Date(year, month - 1, d).getDay();
        if (dow === 0 || dow === 6) continue;
        if (holidayMap.has(fecha)) continue;
        a.total++;
        const e = entryMap.get(`${emp.id}|${fecha}`);
        const code = e?.incident_code ?? "A";
        if (code === "A") a.asistencia++;
      }
    }
    return Array.from(acc.values()).map((x) => ({ ...x, pct: x.total ? Math.round((x.asistencia / x.total) * 100) : 0 }));
  }, [data, dayList, year, month, holidayMap, entryMap]);

  return (
    <div>
      <PageHeader
        title="Asistencias e incidencias"
        description="Día en blanco = asistencia (implícita). Click en una celda para registrar incidencias, horas extra o retardo."
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => changeMonth(-1)} className="rounded-md border p-2"><ChevronLeft className="h-4 w-4" /></button>
            <div className="rounded-md border bg-card px-3 py-2 text-sm font-medium tabular-nums">{MONTHS[month - 1]} {year}</div>
            <button onClick={() => changeMonth(1)} className="rounded-md border p-2"><ChevronRight className="h-4 w-4" /></button>
          </div>
        }
      />

      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        {/* Filtros + leyenda */}
        <div className="rounded-lg border bg-card p-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                placeholder="Buscar empleado, número o puesto…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border bg-background py-2 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="__all">Todas las áreas</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t pt-3 text-xs">
            <span className="font-semibold uppercase tracking-wide text-muted-foreground">Códigos:</span>
            <span className="flex items-center gap-1.5">
              <span className="grid h-5 w-5 place-items-center rounded border border-dashed text-[10px] text-muted-foreground">·</span>
              Asistencia (implícita)
            </span>
            {(types ?? []).filter((t: any) => t.codigo !== "A").map((t: any) => (
              <span key={t.codigo} className="flex items-center gap-1.5">
                <span className="grid h-5 w-5 place-items-center rounded text-[10px] font-bold text-white" style={{ background: t.color }}>{t.codigo}</span>
                {t.nombre}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-amber-400/60" />
              Día festivo (LFT Art. 74)
            </span>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : !data?.employees.length ? (
          <EmptyState icon={Users} title="Sin empleados activos" description="Da de alta empleados para poder registrar asistencias." />
        ) : !filteredEmployees.length ? (
          <EmptyState icon={Search} title="Sin coincidencias" description="Ajusta el filtro o limpia la búsqueda." />
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-card">
                <tr>
                  <th className="sticky left-0 z-10 bg-card border-b border-r px-3 py-2 text-left font-semibold min-w-[200px]">Empleado</th>
                  {dayList.map((d) => {
                    const dt = new Date(year, month - 1, d);
                    const dow = dt.getDay();
                    const weekend = dow === 0 || dow === 6;
                    const fecha = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                    const holiday = holidayMap.get(fecha);
                    return (
                      <th key={d}
                        title={holiday ?? undefined}
                        className={`border-b border-r px-1.5 py-2 text-center font-medium tabular-nums ${
                          holiday ? "bg-amber-200/50 text-amber-900 dark:bg-amber-400/20 dark:text-amber-300" :
                          weekend ? "bg-secondary/50 text-muted-foreground" : ""
                        }`}>
                        <div>{d}</div>
                        <div className="text-[9px] uppercase">{["D","L","M","X","J","V","S"][dow]}</div>
                      </th>
                    );
                  })}
                  <th className="border-b px-2 py-2 text-center font-semibold">Totales</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp: any) => {
                  const counts: Record<string, number> = {};
                  return (
                    <tr key={emp.id} className="border-b hover:bg-secondary/20">
                      <td className="sticky left-0 z-10 bg-card border-r px-3 py-2">
                        <div className="font-medium">{emp.nombre} {emp.apellido_paterno} {emp.apellido_materno ?? ""}</div>
                        <div className="text-[10px] text-muted-foreground">#{emp.numero} · {emp.departamento ?? emp.puesto ?? ""}</div>
                      </td>
                      {dayList.map((d) => {
                        const fecha = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                        const entry = entryMap.get(`${emp.id}|${fecha}`);
                        const holiday = holidayMap.get(fecha);
                        const code = entry?.incident_code ?? "A";
                        const extras = entry?.extra_codes ?? [];
                        counts[code] = (counts[code] ?? 0) + 1;
                        extras.forEach((c) => { counts[c] = (counts[c] ?? 0) + 1; });
                        const t = typeMap.get(code);
                        const hasHE = (entry?.horas_extra_dobles ?? 0) + (entry?.horas_extra_triples ?? 0) > 0;
                        const hasRet = (entry?.minutos_retardo ?? 0) > 0;
                        const isDefault = !entry;
                        // Si NO hay registro y el código resultante es "A", la celda se ve en blanco.
                        const renderEmpty = isDefault && code === "A";
                        return (
                          <td key={d} className={`border-r p-0 relative ${holiday ? "bg-amber-100/40 dark:bg-amber-400/10" : ""}`}>
                            <button
                              onClick={() => setPicker({ empId: emp.id, empName: `${emp.nombre} ${emp.apellido_paterno ?? ""}`.trim(), fecha })}
                              title={
                                renderEmpty
                                  ? `Asistencia (implícita)${holiday ? " — " + holiday : ""} · click para cambiar`
                                  : `${t?.nombre ?? code}${holiday ? " · " + holiday : ""} — click para editar`
                              }
                              className="h-9 w-9 text-[10px] font-bold hover:bg-secondary/40 transition-colors relative"
                              style={!renderEmpty ? {
                                background: t?.color ?? "transparent",
                                color: t ? "white" : "var(--color-muted-foreground)",
                              } : undefined}
                            >
                              {renderEmpty ? "" : code}
                              {(extras.length > 0 || hasHE || hasRet) && (
                                <span className="absolute right-0.5 top-0.5 grid h-3 w-3 place-items-center rounded-full bg-white text-[8px] font-bold text-foreground">
                                  {extras.length + (hasHE ? 1 : 0) + (hasRet ? 1 : 0)}
                                </span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-center">
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          {Object.entries(counts).map(([c, n]) => (
                            <span key={c} className="rounded px-1 py-0.5 text-[10px] font-semibold text-white tabular-nums" style={{ background: typeMap.get(c)?.color ?? "#94a3b8" }}>
                              {c}:{n}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Gráfico de desempeño por área */}
        {perfByArea.length > 0 && (
          <div className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Desempeño por área</h3>
              <span className="text-xs text-muted-foreground">% asistencia (días hábiles, excluye festivos)</span>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perfByArea}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="area" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" unit="%" />
                  <Tooltip
                    contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 12 }}
                    formatter={(v: any, _n, p: any) => [`${v}% (${p.payload.asistencia}/${p.payload.total})`, "Asistencia"]}
                  />
                  <Bar dataKey="pct" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5" />
          Horas extra LFT: las primeras 9 hrs/semana son dobles; el excedente es triple. Por cada 6 días trabajados, el 7° es de descanso pagado.
        </p>
      </div>

      {picker && (
        <CellPicker
          types={types ?? []}
          current={entryMap.get(`${picker.empId}|${picker.fecha}`) ?? null}
          empName={picker.empName}
          fecha={picker.fecha}
          onClose={() => setPicker(null)}
          onSave={(payload) => {
            upsertMut.mutate({ organizationId: org.id, employee_id: picker.empId, fecha: picker.fecha, ...payload });
            setPicker(null);
          }}
        />
      )}
    </div>
  );
}

// Códigos que describen el estado del día (mutuamente excluyentes).
// Solo "R" (Retardo) puede combinarse libremente con cualquier estado.
const COMBINABLE_CODES = new Set(["R"]);
const isExclusive = (code: string) => !COMBINABLE_CODES.has(code);

function CellPicker({ types, current, empName, fecha, onClose, onSave }: {
  types: any[];
  current: Entry | null;
  empName: string;
  fecha: string;
  onClose: () => void;
  onSave: (v: { incident_code: string; extra_codes: string[]; horas_extra_dobles: number; horas_extra_triples: number; minutos_retardo: number; observaciones?: string }) => void;
}) {
  const [primary, setPrimary] = useState<string>(current?.incident_code ?? types[0]?.codigo ?? "A");
  const [extras, setExtras] = useState<string[]>(current?.extra_codes ?? []);
  const [hed, setHed] = useState<number>(Number(current?.horas_extra_dobles ?? 0));
  const [het, setHet] = useState<number>(Number(current?.horas_extra_triples ?? 0));
  const [ret, setRet] = useState<number>(Number(current?.minutos_retardo ?? 0));
  const [obs, setObs] = useState<string>(current?.observaciones ?? "");
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);

  function selectPrimary(code: string) {
    setPrimary(code);
    // Al cambiar el principal: quita el duplicado y, si el nuevo principal es
    // exclusivo (estado del día), descarta cualquier extra también exclusivo
    // para evitar combinaciones incongruentes (p. ej. Asistencia + Falta).
    setExtras((xs) => xs.filter((c) => c !== code && !(isExclusive(code) && isExclusive(c))));
  }

  function canAddExtra(code: string): boolean {
    if (code === primary) return false;
    if (!isExclusive(code)) return true;
    // Un código exclusivo solo se admite si ni el principal ni otro extra lo son.
    return !isExclusive(primary) && !extras.some(isExclusive);
  }

  function toggleExtra(code: string) {
    if (extras.includes(code)) {
      setExtras((xs) => xs.filter((c) => c !== code));
      return;
    }
    if (!canAddExtra(code)) return;
    setExtras((xs) => [...xs, code]);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold">{empName}</h2>
            <p className="text-xs text-muted-foreground tabular-nums">{fecha}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>

        <div className="mb-3">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Código principal</div>
          <div className="flex flex-wrap gap-1.5">
            {types.map((t, i) => (
              <button
                key={t.codigo}
                ref={i === 0 ? firstRef : undefined}
                onClick={() => selectPrimary(t.codigo)}
                className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-medium transition ${primary === t.codigo ? "ring-2 ring-primary" : "hover:bg-secondary"}`}
                style={{ borderColor: primary === t.codigo ? t.color : undefined }}
              >
                <span className="grid h-4 w-4 place-items-center rounded text-[9px] font-bold text-white" style={{ background: t.color }}>{t.codigo}</span>
                {t.nombre}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <div className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Códigos adicionales (opcional)</span>
            <span className="text-[10px] font-normal normal-case text-muted-foreground/70">solo combinables con el principal</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {types.filter((t) => t.codigo !== primary).map((t) => {
              const on = extras.includes(t.codigo);
              const allowed = on || canAddExtra(t.codigo);
              return (
                <button
                  key={t.codigo}
                  onClick={() => toggleExtra(t.codigo)}
                  disabled={!allowed}
                  title={!allowed ? `"${t.nombre}" no es compatible con el código principal` : undefined}
                  className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition ${on ? "ring-1 ring-primary bg-secondary" : "hover:bg-secondary"} ${!allowed ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  {on ? <Check className="h-3 w-3" /> : <span className="h-3 w-3" />}
                  <span className="grid h-4 w-4 place-items-center rounded text-[9px] font-bold text-white" style={{ background: t.color }}>{t.codigo}</span>
                  {t.nombre}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-3">
          <Field label="HE dobles"><input type="number" min={0} max={24} step="0.5" value={hed} onChange={(e) => setHed(Number(e.target.value))} className="inp"/></Field>
          <Field label="HE triples"><input type="number" min={0} max={24} step="0.5" value={het} onChange={(e) => setHet(Number(e.target.value))} className="inp"/></Field>
          <Field label="Retardo (min)"><input type="number" min={0} max={720} value={ret} onChange={(e) => setRet(Number(e.target.value))} className="inp"/></Field>
        </div>

        <Field label="Observaciones">
          <input value={obs} onChange={(e) => setObs(e.target.value)} maxLength={500} className="inp"/>
        </Field>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-secondary">Cancelar</button>
          <button
            onClick={() => onSave({ incident_code: primary, extra_codes: extras, horas_extra_dobles: hed, horas_extra_triples: het, minutos_retardo: ret, observaciones: obs || undefined })}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >Guardar</button>
        </div>
        <style>{`.inp{width:100%;border:1px solid var(--color-border);background:var(--color-background);border-radius:6px;padding:.35rem .55rem;font-size:.8rem}`}</style>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>{children}</label>;
}
