// Generador del archivo de Movimientos Afiliatorios para IDSE (Emisión Batch).
// Layout fijo de 197 caracteres por registro basado en la especificación
// publicada por el IMSS para el envío de movimientos vía IDSE Batch / SUA.
//
// IMPORTANTE: El IMSS actualiza ocasionalmente las posiciones del layout.
// Antes de subir cientos de movimientos al portal, valida UN registro
// de prueba en IDSE — si el portal lo acepta, el resto pasará igual.

export type MovimientoIDSE = {
  registro_patronal: string;      // 11 chars
  nss: string;                    // 11 chars
  rfc: string;                    // 13 chars (con homoclave)
  curp: string;                   // 18 chars
  nombre: string;                 // 50 chars - APELLIDO_P APELLIDO_M NOMBRE
  tipo_trabajador: "1" | "2";     // 1 permanente, 2 eventual
  tipo_salario: "0" | "1" | "2";  // 0 fijo, 1 variable, 2 mixto
  jornada: "0" | "1" | "2" | "3" | "4" | "5";
  fecha_movimiento: string;       // ddmmaaaa
  tipo_movimiento: "08" | "02" | "07" | "11" | "12"; // alta, baja, mod sal, ausentismo, incapacidad
  sdi: number;                    // SDI en pesos con 2 decimales (sin punto)
  motivo_baja?: string;           // 1 char (sólo bajas)
  dias?: number;                  // ausentismo/incapacidad
  tipo_incapacidad?: string;      // 01/02/03
  folio_incapacidad?: string;     // 8 chars
  ubicacion?: string;             // ubicación / clave municipio (opcional)
};

const pad = (v: string | number, len: number, char = " ", left = false) => {
  const s = String(v ?? "");
  if (s.length >= len) return s.slice(0, len);
  return left ? char.repeat(len - s.length) + s : s + char.repeat(len - s.length);
};
const padN = (n: number | undefined, len: number) =>
  pad(Math.round((n ?? 0) * 100), len, "0", true);
const padL = (s: string | undefined, len: number) => pad((s ?? "").toUpperCase(), len);
const padR = (s: string | undefined, len: number) => pad((s ?? "").toUpperCase(), len, " ", true);

/** Formatea SDI a 7 enteros + 2 decimales sin punto (ej 1234.56 → "000123456") */
function sdiField(sdi: number): string {
  const cents = Math.round((sdi || 0) * 100);
  return cents.toString().padStart(9, "0");
}

/** Convierte yyyy-mm-dd a ddmmaaaa */
export function dateIDSE(iso: string): string {
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}${m}${y}`;
}

/** Construye un registro IDSE de 197 caracteres. */
export function buildIDSERecord(m: MovimientoIDSE): string {
  const partes: string[] = [];
  partes.push(padL(m.registro_patronal, 11));      // 1-11  Registro patronal
  partes.push(padL(m.nss, 11));                     // 12-22 NSS
  partes.push(padL(m.rfc, 13));                     // 23-35 RFC
  partes.push(padL(m.curp, 18));                    // 36-53 CURP
  partes.push(padL(m.nombre, 50));                  // 54-103 Nombre
  partes.push(padL(m.tipo_trabajador, 1));          // 104    Tipo trabajador
  partes.push(padL(m.tipo_salario, 1));             // 105    Tipo salario
  partes.push(padL(m.jornada, 1));                  // 106    Jornada/Semana reducida
  partes.push(padL(m.fecha_movimiento, 8));         // 107-114 ddmmaaaa
  partes.push(padL(m.tipo_movimiento, 2));          // 115-116 Tipo movimiento
  partes.push(sdiField(m.sdi));                     // 117-125 SDI (9)
  partes.push(padL(m.motivo_baja ?? " ", 1));       // 126    Motivo baja
  partes.push(padN(m.dias, 2));                     // 127-128 Días incap/ausen
  partes.push(padL(m.tipo_incapacidad ?? "  ", 2)); // 129-130
  partes.push(padR(m.folio_incapacidad, 8));        // 131-138 (numérico der.)
  partes.push(padL(m.ubicacion, 9));                // 139-147 Ubicación / municipio
  partes.push(" ".repeat(50));                      // 148-197 Filler reservado IMSS
  return partes.join("").slice(0, 197);
}

export function buildIDSEFile(movimientos: MovimientoIDSE[]): string {
  return movimientos.map(buildIDSERecord).join("\r\n") + "\r\n";
}

export const MOTIVO_BAJA = {
  "1": "Término de contrato",
  "2": "Separación voluntaria",
  "3": "Abandono de empleo",
  "4": "Defunción",
  "5": "Cierre del centro de trabajo",
  "6": "Otras",
  "9": "Pensión",
} as const;

export const TIPO_INCAPACIDAD = {
  "01": "Enfermedad general",
  "02": "Riesgo de trabajo",
  "03": "Maternidad",
} as const;
