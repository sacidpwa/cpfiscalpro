// Días festivos oficiales según LFT Art. 74 y observancias comunes en México.
// Devuelve YYYY-MM-DD para un año dado.

export type Holiday = { date: string; nombre: string; oficial: boolean };

function nthWeekdayOfMonth(year: number, month0: number, weekday: number, n: number): Date {
  // weekday: 0=dom..6=sab. month0: 0..11
  const first = new Date(year, month0, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month0, 1 + offset + (n - 1) * 7);
}

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getMexicoHolidays(year: number): Holiday[] {
  const list: Holiday[] = [
    { date: `${year}-01-01`, nombre: "Año Nuevo", oficial: true },
    // Primer lunes de febrero — Día de la Constitución
    { date: iso(nthWeekdayOfMonth(year, 1, 1, 1)), nombre: "Día de la Constitución", oficial: true },
    // Tercer lunes de marzo — Natalicio Benito Juárez
    { date: iso(nthWeekdayOfMonth(year, 2, 1, 3)), nombre: "Natalicio de Benito Juárez", oficial: true },
    { date: `${year}-05-01`, nombre: "Día del Trabajo", oficial: true },
    { date: `${year}-09-16`, nombre: "Día de la Independencia", oficial: true },
    // Tercer lunes de noviembre — Revolución Mexicana
    { date: iso(nthWeekdayOfMonth(year, 10, 1, 3)), nombre: "Día de la Revolución", oficial: true },
    { date: `${year}-12-25`, nombre: "Navidad", oficial: true },
  ];
  // Transmisión Poder Ejecutivo Federal cada 6 años (2024, 2030...).
  if ((year - 2024) % 6 === 0) {
    list.push({ date: `${year}-10-01`, nombre: "Transmisión Poder Ejecutivo", oficial: true });
  }
  return list;
}

export function isHoliday(dateIso: string, year: number): Holiday | null {
  return getMexicoHolidays(year).find((h) => h.date === dateIso) ?? null;
}

/**
 * Calcula los días de descanso (1 por cada 6 días trabajados) para una serie cronológica
 * de días donde "true" = trabajado. Devuelve set de índices de días marcados como descanso.
 * Aplica LFT Art. 69: "por cada seis días de trabajo disfrutará el trabajador de un día de descanso".
 */
export function computeRestDayIndexes(workedFlags: boolean[]): Set<number> {
  const result = new Set<number>();
  let consec = 0;
  for (let i = 0; i < workedFlags.length; i++) {
    if (workedFlags[i]) {
      consec++;
      if (consec >= 6) {
        // marca el siguiente día como descanso (si existe)
        if (i + 1 < workedFlags.length) result.add(i + 1);
        consec = 0;
      }
    } else {
      consec = 0;
    }
  }
  return result;
}

/**
 * Valida horas extra según LFT Art. 66-68: las primeras 9 horas extra semanales son dobles;
 * el excedente es triple. Devuelve la distribución correcta.
 */
export function distributeOvertime(weeklyExtraHours: number): { dobles: number; triples: number } {
  const dobles = Math.min(9, Math.max(0, weeklyExtraHours));
  const triples = Math.max(0, weeklyExtraHours - 9);
  return { dobles, triples };
}
