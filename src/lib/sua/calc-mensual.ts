// Cálculo MENSUAL de cuotas IMSS (EFM, GMP, IV, Guarderías, RT).
// No incluye Retiro/CV/Infonavit (esos son bimestrales y viven en calc.ts).
import type { Params } from "./calc";

export type CalcMensualInput = {
  sdi: number;
  dias_mes: number;
  ausencias: number;
  incapacidades: number;
  prima_rt: number;
};

export type CalcMensualOutput = {
  sbc: number;
  dias_cot: number;
  efm_cf: number;
  efm_exc: number;
  efm_din: number;
  gmp: number;
  iv: number;
  guarderias: number;
  rt: number;
  total: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number) => n / 100;

export function calcEmpleadoMensual(p: Params, i: CalcMensualInput): CalcMensualOutput {
  const sbc = Math.min(i.sdi, p.tope_sbc_imss);
  const dc = Math.max(0, i.dias_mes - i.ausencias - i.incapacidades);

  const efmCfDia = p.uma_diaria * pct(p.imss_efm_cf_patron);
  const exc = Math.max(0, sbc - 3 * p.uma_diaria);
  const efmExcDia = exc * pct(p.imss_efm_exc_patron + p.imss_efm_exc_obrero);
  const efmDinDia = sbc * pct(p.imss_efm_din_patron + p.imss_efm_din_obrero);
  const gmpDia = sbc * pct(p.imss_gmp_patron + p.imss_gmp_obrero);
  const ivDia = sbc * pct(p.imss_iv_patron + p.imss_iv_obrero);
  const guardDia = sbc * pct(p.imss_guard_patron);
  const rtDia = sbc * pct(i.prima_rt);

  const efm_cf = round2(dc * efmCfDia);
  const efm_exc = round2(dc * efmExcDia);
  const efm_din = round2(dc * efmDinDia);
  const gmp = round2(dc * gmpDia);
  const iv = round2(dc * ivDia);
  const guarderias = round2(dc * guardDia);
  const rt = round2(dc * rtDia);
  const total = round2(efm_cf + efm_exc + efm_din + gmp + iv + guarderias + rt);

  return { sbc, dias_cot: dc, efm_cf, efm_exc, efm_din, gmp, iv, guarderias, rt, total };
}

export const NOMBRE_MES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
