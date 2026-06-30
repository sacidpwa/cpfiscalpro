// Cálculos de nómina conforme a la legislación mexicana vigente.
// Las tarifas se obtienen de la tabla `tax_tables` y los parámetros de `fiscal_params`.

export type TaxBracket = {
  limite_inferior: number;
  limite_superior: number | null;
  cuota_fija: number;
  porcentaje: number; // expresado como porcentaje (ej. 6.40)
};

export type Periodicity = "semanal" | "catorcenal" | "quincenal" | "mensual";

export const DAYS_FACTOR: Record<Periodicity, number> = {
  semanal: 7,
  catorcenal: 14,
  quincenal: 15,
  mensual: 30.4,
};

/** Aplica una tarifa progresiva (tipo Art. 96 LISR) a una base gravada. */
export function applyBracket(base: number, brackets: TaxBracket[]): number {
  if (base <= 0 || !brackets.length) return 0;
  const sorted = [...brackets].sort((a, b) => a.limite_inferior - b.limite_inferior);
  const found = sorted.find(
    (b) => base >= Number(b.limite_inferior) && (b.limite_superior == null || base <= Number(b.limite_superior)),
  );
  if (!found) return 0;
  const excedente = base - Number(found.limite_inferior);
  return Number(found.cuota_fija) + excedente * (Number(found.porcentaje) / 100);
}

/** Devuelve el subsidio al empleo aplicable según base gravada. */
export function subsidio(base: number, table: TaxBracket[]): number {
  if (base <= 0 || !table.length) return 0;
  const sorted = [...table].sort((a, b) => a.limite_inferior - b.limite_inferior);
  const row = sorted.find(
    (b) => base >= Number(b.limite_inferior) && (b.limite_superior == null || base <= Number(b.limite_superior)),
  );
  return row ? Number(row.cuota_fija) : 0;
}

/** Convierte tarifa mensual a periodicidad solicitada (factor días/30.4). */
export function scaleBracket(brackets: TaxBracket[], days: number): TaxBracket[] {
  const factor = days / 30.4;
  return brackets.map((b) => ({
    limite_inferior: Number(b.limite_inferior) * factor,
    limite_superior: b.limite_superior == null ? null : Number(b.limite_superior) * factor,
    cuota_fija: Number(b.cuota_fija) * factor,
    porcentaje: Number(b.porcentaje),
  }));
}

/** SDI = salario diario * factor de integración por antigüedad y prestaciones de ley. */
export function factorIntegracion(antiguedadAnios: number): number {
  // Aguinaldo 15 días + prima vacacional 25% sobre vacaciones por LFT vigente.
  // 1er año: 12 días → vacaciones 12*0.25 = 3, aguinaldo 15. → (365+15+3)/365 = 1.0493
  // Tabla LFT 2023+: 12,14,16,18,20,22 y luego +2 por cada 5 años.
  const tabla = [12, 14, 16, 18, 20, 22, 22, 22, 22, 22, 24, 24, 24, 24, 24, 26];
  const idx = Math.min(Math.max(Math.floor(antiguedadAnios), 0), tabla.length - 1);
  const diasVac = tabla[idx];
  const primaVac = diasVac * 0.25;
  const aguinaldo = 15;
  return Number(((365 + aguinaldo + primaVac) / 365).toFixed(6));
}

export function calcSDI(salarioDiario: number, antiguedadAnios = 0): number {
  return Number((salarioDiario * factorIntegracion(antiguedadAnios)).toFixed(2));
}

/** Cuotas IMSS obrero (trabajador) sobre SBC, periodicidad en días. Tope: 25 UMA. */
export type ImssResult = {
  efm_dinero: number;
  efm_especie_adicional: number;
  invalidez_vida: number;
  cesantia_vejez: number;
  total: number;
};

export function calcImssObrero(sbcDiario: number, diasPeriodo: number, umaDiaria: number): ImssResult {
  const tope = umaDiaria * 25;
  const sbc = Math.min(sbcDiario, tope);
  // Excedente sobre 3 UMA aplica a EFM especie 0.40% obrero
  const excedente = Math.max(0, sbc - umaDiaria * 3);
  const efm_dinero = sbc * 0.0025 * diasPeriodo;
  const efm_especie_adicional = excedente * 0.004 * diasPeriodo;
  const invalidez_vida = sbc * 0.00625 * diasPeriodo;
  const cesantia_vejez = sbc * 0.01125 * diasPeriodo;
  const total = efm_dinero + efm_especie_adicional + invalidez_vida + cesantia_vejez;
  return {
    efm_dinero: round2(efm_dinero),
    efm_especie_adicional: round2(efm_especie_adicional),
    invalidez_vida: round2(invalidez_vida),
    cesantia_vejez: round2(cesantia_vejez),
    total: round2(total),
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type PayrollInput = {
  salarioDiario: number;
  sdi: number;
  diasPagados: number;
  periodicidad: Periodicity;
  percepcionesExtra?: { gravado: number; exento: number }[];
  deduccionesExtra?: { importe: number }[];
};

export type PayrollResult = {
  sueldo: number;
  total_percepciones: number;
  total_deducciones: number;
  total_gravado: number;
  total_exento: number;
  isr: number;
  subsidio: number;
  imss_obrero: number;
  neto: number;
};

export type PayrollContext = {
  isrMensual: TaxBracket[];
  subsidioMensual: TaxBracket[];
  umaDiaria: number;
  salarioMinimo?: number;
};

export function calcPayroll(input: PayrollInput, ctx: PayrollContext): PayrollResult {
  const sueldo = round2(input.salarioDiario * input.diasPagados);
  const percep = input.percepcionesExtra ?? [];
  const dedExtra = input.deduccionesExtra ?? [];
  const gravadoExtra = percep.reduce((s, p) => s + p.gravado, 0);
  const exentoExtra = percep.reduce((s, p) => s + p.exento, 0);

  const total_gravado = round2(sueldo + gravadoExtra);
  const total_exento = round2(exentoExtra);
  const total_percepciones = round2(total_gravado + total_exento);

  const days = input.diasPagados;
  const isrTable = scaleBracket(ctx.isrMensual, days);
  const subTable = scaleBracket(ctx.subsidioMensual, days);

  // Exención ISR salario mínimo (Art. 96 LISR último párrafo):
  // si el salario diario del trabajador es <= SMG no se retiene ISR ni se aplica subsidio.
  const esSalarioMinimo = !!ctx.salarioMinimo && input.salarioDiario <= ctx.salarioMinimo + 0.01;

  const isrBruto = esSalarioMinimo ? 0 : applyBracket(total_gravado, isrTable);
  const sub = esSalarioMinimo ? 0 : subsidio(total_gravado, subTable);
  const isr = round2(Math.max(0, isrBruto - sub));
  const subsidioPagado = round2(Math.max(0, sub - isrBruto));

  const imss = calcImssObrero(input.sdi, days, ctx.umaDiaria);

  const deduccionesTotal = round2(isr + imss.total + dedExtra.reduce((s, d) => s + d.importe, 0));


  return {
    sueldo,
    total_percepciones,
    total_deducciones: deduccionesTotal,
    total_gravado,
    total_exento,
    isr,
    subsidio: subsidioPagado,
    imss_obrero: imss.total,
    neto: round2(total_percepciones - deduccionesTotal + subsidioPagado),
  };
}
