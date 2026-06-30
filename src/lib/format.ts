export const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
});

export const NUM = new Intl.NumberFormat("es-MX", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const INT = new Intl.NumberFormat("es-MX");

export function fmtMoney(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return "—";
  return MXN.format(v);
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  // Para strings tipo "YYYY-MM-DD" evitamos el parseo UTC que recorre un día en zonas negativas.
  if (typeof d === "string") {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("es-MX", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function fmtDateLong(d: string | Date | null | undefined): string {
  if (!d) return "—";
  if (typeof d === "string") {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const y = Number(m[1]), mo = Number(m[2]) - 1, day = Number(m[3]);
      const date = new Date(y, mo, day);
      return date.toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
    }
  }
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
}


export const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
