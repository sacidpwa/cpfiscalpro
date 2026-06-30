// Motor de cálculo bimestral IMSS + RCV + Infonavit (cuotas obrero-patronales 2026)
// Basado en LSS arts. 25, 106, 107, 147, 168 y Ley del Infonavit.
// Bases:
//   - SBC topado a 25 UMA diarias.
//   - EFM cuota fija: 20.40% de UMA diaria por día cotizado (sólo patrón).
//   - EFM excedente: sobre SBC - 3 UMA (si > 0) por día cotizado.
//   - EFM en dinero, GMP, IV, Guarderías, RT: sobre SBC por día cotizado.
//   - Retiro y Cesantía/Vejez: sobre SBC por días del BIMESTRE.
//   - Infonavit: cuota fija mensual por empleado (registrada en employees.infonavit_cuota_mensual).

export type Params = {
  uma_diaria: number;
  tope_sbc_imss: number;
  imss_efm_cf_patron: number;
  imss_efm_exc_patron: number;
  imss_efm_exc_obrero: number;
  imss_efm_din_patron: number;
  imss_efm_din_obrero: number;
  imss_gmp_patron: number;
  imss_gmp_obrero: number;
  imss_iv_patron: number;
  imss_iv_obrero: number;
  imss_guard_patron: number;
  imss_retiro_patron: number;
  imss_cv_patron: number;
  imss_cv_obrero: number;
};

export type CalcInput = {
  sdi: number; // SBC del empleado
  dias_mes1: number;
  dias_mes2: number;
  ausencias_mes1: number;
  ausencias_mes2: number;
  incap_mes1: number;
  incap_mes2: number;
  prima_rt: number; // % anual del patrón
  infonavit_cuota_mensual: number;
};

export type CalcOutput = {
  sbc: number;
  dias_cot_mes1: number;
  dias_cot_mes2: number;
  // mensuales
  efm_cf_mes1: number; efm_cf_mes2: number;
  efm_exc_mes1: number; efm_exc_mes2: number;
  efm_din_mes1: number; efm_din_mes2: number;
  gmp_mes1: number; gmp_mes2: number;
  iv_mes1: number; iv_mes2: number;
  guard_mes1: number; guard_mes2: number;
  rt_mes1: number; rt_mes2: number;
  total_imss_mes1: number;
  total_imss_mes2: number;
  // bimestrales
  retiro: number;
  cv: number;
  infonavit: number;
  total_rcv: number;
  total: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number) => n / 100;

export function calcEmpleado(p: Params, i: CalcInput): CalcOutput {
  const sbc = Math.min(i.sdi, p.tope_sbc_imss);
  // Días cotizados: días del mes - ausencias - incapacidades (incap no genera cuotas patrón en EFM/IV/etc.)
  const dc1 = Math.max(0, i.dias_mes1 - i.ausencias_mes1 - i.incap_mes1);
  const dc2 = Math.max(0, i.dias_mes2 - i.ausencias_mes2 - i.incap_mes2);
  const diasBim = dc1 + dc2;

  // Cuota fija EFM: % UMA por día cotizado (patrón)
  const efmCfDia = p.uma_diaria * pct(p.imss_efm_cf_patron);
  // Excedente EFM (patrón + obrero) sobre (SBC - 3 UMA)
  const exc = Math.max(0, sbc - 3 * p.uma_diaria);
  const efmExcDia = exc * pct(p.imss_efm_exc_patron + p.imss_efm_exc_obrero);
  // Prestaciones en dinero (patrón + obrero) sobre SBC
  const efmDinDia = sbc * pct(p.imss_efm_din_patron + p.imss_efm_din_obrero);
  // GMP (patrón + obrero) sobre SBC
  const gmpDia = sbc * pct(p.imss_gmp_patron + p.imss_gmp_obrero);
  // IV (patrón + obrero) sobre SBC
  const ivDia = sbc * pct(p.imss_iv_patron + p.imss_iv_obrero);
  // Guarderías (sólo patrón) sobre SBC
  const guardDia = sbc * pct(p.imss_guard_patron);
  // RT (sólo patrón) sobre SBC, prima del registro patronal
  const rtDia = sbc * pct(i.prima_rt);

  const c = (d: number, perDia: number) => round2(d * perDia);

  const efm_cf_mes1 = c(dc1, efmCfDia), efm_cf_mes2 = c(dc2, efmCfDia);
  const efm_exc_mes1 = c(dc1, efmExcDia), efm_exc_mes2 = c(dc2, efmExcDia);
  const efm_din_mes1 = c(dc1, efmDinDia), efm_din_mes2 = c(dc2, efmDinDia);
  const gmp_mes1 = c(dc1, gmpDia), gmp_mes2 = c(dc2, gmpDia);
  const iv_mes1 = c(dc1, ivDia), iv_mes2 = c(dc2, ivDia);
  const guard_mes1 = c(dc1, guardDia), guard_mes2 = c(dc2, guardDia);
  const rt_mes1 = c(dc1, rtDia), rt_mes2 = c(dc2, rtDia);

  const total_imss_mes1 = round2(efm_cf_mes1 + efm_exc_mes1 + efm_din_mes1 + gmp_mes1 + iv_mes1 + guard_mes1 + rt_mes1);
  const total_imss_mes2 = round2(efm_cf_mes2 + efm_exc_mes2 + efm_din_mes2 + gmp_mes2 + iv_mes2 + guard_mes2 + rt_mes2);

  // Bimestrales (sobre SBC * días del bimestre)
  const retiro = round2(sbc * pct(p.imss_retiro_patron) * diasBim);
  const cv = round2(sbc * pct(p.imss_cv_patron + p.imss_cv_obrero) * diasBim);
  const infonavit = round2((i.infonavit_cuota_mensual || 0) * 2);

  const total_rcv = round2(retiro + cv);
  const total = round2(total_imss_mes1 + total_imss_mes2 + total_rcv + infonavit);

  return {
    sbc, dias_cot_mes1: dc1, dias_cot_mes2: dc2,
    efm_cf_mes1, efm_cf_mes2,
    efm_exc_mes1, efm_exc_mes2,
    efm_din_mes1, efm_din_mes2,
    gmp_mes1, gmp_mes2,
    iv_mes1, iv_mes2,
    guard_mes1, guard_mes2,
    rt_mes1, rt_mes2,
    total_imss_mes1, total_imss_mes2,
    retiro, cv, infonavit, total_rcv, total,
  };
}

// Bimestre 1 = Ene-Feb, 2 = Mar-Abr, 3 = May-Jun, 4 = Jul-Ago, 5 = Sep-Oct, 6 = Nov-Dic
export function bimestreToMonths(bimestre: number, ejercicio: number) {
  const m1 = (bimestre - 1) * 2; // 0..10
  const m2 = m1 + 1;
  return {
    mes1: { year: ejercicio, month: m1, dias: new Date(ejercicio, m1 + 1, 0).getDate() },
    mes2: { year: ejercicio, month: m2, dias: new Date(ejercicio, m2 + 1, 0).getDate() },
  };
}

export const NOMBRE_BIMESTRE = ["", "Ene-Feb", "Mar-Abr", "May-Jun", "Jul-Ago", "Sep-Oct", "Nov-Dic"];
