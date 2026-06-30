// Parsers para los archivos exportados por el SUA / IDSE — ancho fijo, CRLF.
//   Aseg.TXT   167 chars  — emisión de asegurados (datos laborales)
//   Afil.TXT   ~79 chars  — datos de afiliación (nacimiento, sexo, ocupación)
//   Movt.TXT   49 chars   — movimientos (alta 08, baja 02, modif 07, ausent 11, incap 12)
//   Incap.TXT  57 chars   — incapacidades detalladas
//   Cred.TXT   52 chars   — créditos INFONAVIT

export type Asegurado = {
  registro_patronal: string;
  nss: string;
  rfc: string;
  curp: string;
  apellido_paterno: string;
  apellido_materno: string;
  nombre: string;
  nombre_completo: string;
  tipo_trabajador: string;
  jornada_semana: string;
  fecha_alta: string; // ISO yyyy-mm-dd
  sdi: number;
};

export type Afiliacion = {
  registro_patronal: string;
  nss: string;
  entidad_nacimiento: string;
  fecha_nacimiento: string | null;
  ocupacion: string;
  sexo: "M" | "F" | null;
};

export type MovimientoFile = {
  registro_patronal: string;
  nss: string;
  tipo: string; // "02" baja, "07" modif, "08" alta, "11" ausent, "12" incap
  fecha: string;
  folio: string | null;
  dias: number | null;
  sdi: number | null;
};

export type Incapacidad = {
  registro_patronal: string;
  nss: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  folio: string;
  dias: number;
  tipo: string; // 1=EG, 2=RT, 3=ML
};

export type CreditoInfonavit = {
  registro_patronal: string;
  nss: string;
  credito: string;
  tipo_descuento: string;
  factor: number | null;
  fecha_inicio: string | null;
};

function ddmmyyyyToISO(s: string): string | null {
  if (!/^\d{8}$/.test(s)) return null;
  let dd = s.slice(0, 2);
  let mm = s.slice(2, 4);
  let yyyy = s.slice(4, 8);
  // Some SUA files (notably Cred.TXT) store dates as YYYYMMDD instead of DDMMYYYY.
  // Detect by an implausible "year" and fall back to YYYYMMDD parsing.
  const yNum = parseInt(yyyy, 10);
  const mNum = parseInt(mm, 10);
  const dNum = parseInt(dd, 10);
  if (yNum < 1900 || yNum > 2100 || mNum > 12 || dNum > 31) {
    const altY = s.slice(0, 4);
    const altM = s.slice(4, 6);
    const altD = s.slice(6, 8);
    const ay = parseInt(altY, 10), am = parseInt(altM, 10), ad = parseInt(altD, 10);
    if (ay >= 1900 && ay <= 2100 && am >= 1 && am <= 12 && ad >= 1 && ad <= 31) {
      yyyy = altY; mm = altM; dd = altD;
    } else {
      return null;
    }
  }
  if (yyyy === "0000" || mm === "00" || dd === "00") return null;
  return `${yyyy}-${mm}-${dd}`;
}

function nameParts(raw: string) {
  const trimmed = raw.replace(/\s+$/, "");
  const parts = trimmed.split("$");
  const fix = (s: string) => (s ?? "").trim().replace(/\//g, "Ñ");
  return { ap: fix(parts[0] ?? ""), am: fix(parts[1] ?? ""), nom: fix(parts.slice(2).join(" ")) };
}

function lines(text: string): string[] {
  return text.split(/\r?\n/).map(l => l.replace(/\r$/, "")).filter(l => l.length > 0);
}

export function parseAsegurados(text: string): Asegurado[] {
  const out: Asegurado[] = [];
  for (const line of lines(text)) {
    if (line.length < 120) continue;
    const p = line.padEnd(170, " ");
    const registro_patronal = p.slice(0, 11).trim();
    const nss = p.slice(11, 22).trim();
    const rfc = p.slice(22, 35).trim();
    const curp = p.slice(35, 53).trim();
    const { ap, am, nom } = nameParts(p.slice(53, 103));
    const tipo_trabajador = p.slice(103, 104);
    const jornada_semana = p.slice(104, 105);
    const fecha_alta = ddmmyyyyToISO(p.slice(105, 113)) ?? "1900-01-01";
    const sdi = parseInt(p.slice(113, 120), 10) / 100;
    out.push({
      registro_patronal, nss, rfc, curp,
      apellido_paterno: ap, apellido_materno: am, nombre: nom,
      nombre_completo: `${ap} ${am} ${nom}`.replace(/\s+/g, " ").trim(),
      tipo_trabajador, jornada_semana, fecha_alta, sdi,
    });
  }
  return out;
}

export function parseAfiliacion(text: string): Afiliacion[] {
  // Layout 79 chars:
  // 0-10 registro (11), 11-21 NSS (11), 22-26 codigo ocup/clave (5),
  // 27-34 fecha nac (8), 35-59 entidad nac (25), 60-64 clave entidad (5),
  // 65-78 ocupación texto (14), 79 sexo (M/F)
  const out: Afiliacion[] = [];
  for (const line of lines(text)) {
    if (line.length < 60) continue;
    const p = line.padEnd(85, " ");
    const registro_patronal = p.slice(0, 11).trim();
    const nss = p.slice(11, 22).trim();
    // fecha nac comienza tras 5 chars de prefijo de afiliación
    const fecha_nacimiento = ddmmyyyyToISO(p.slice(27, 35));
    const entidad_nacimiento = p.slice(35, 60).trim();
    const ocupacion = p.slice(65, 79).trim();
    const sexoRaw = p.slice(79, 80).trim().toUpperCase();
    const sexo = sexoRaw === "M" || sexoRaw === "F" ? sexoRaw : null;
    out.push({ registro_patronal, nss, entidad_nacimiento, fecha_nacimiento, ocupacion, sexo });
  }
  return out;
}

export function parseMovimientos(text: string): MovimientoFile[] {
  // Layout 49 chars:
  // 0-10 registro (11), 11-21 NSS (11), 22-23 tipo (2), 24-31 fecha (8),
  // 32-39 folio incap (8 o spaces), 40-42 días (3), 43-48 SBC*100 (6 con leading 0s padded a 9)
  const out: MovimientoFile[] = [];
  for (const line of lines(text)) {
    if (line.length < 40) continue;
    const p = line.padEnd(50, " ");
    const registro_patronal = p.slice(0, 11).trim();
    const nss = p.slice(11, 22).trim();
    const tipo = p.slice(22, 24).trim();
    const fecha = ddmmyyyyToISO(p.slice(24, 32));
    if (!fecha) continue;
    const folioRaw = p.slice(32, 40).trim();
    const folio = folioRaw && !/^0+$/.test(folioRaw) ? folioRaw : null;
    const trailing = p.slice(40, 49); // 9 chars
    let dias: number | null = null;
    let sdi: number | null = null;
    if (tipo === "11" || tipo === "12") {
      dias = parseInt(trailing.slice(0, 3), 10) || 0;
    } else if (tipo === "07" || tipo === "08") {
      const v = parseInt(trailing, 10);
      if (v > 0) sdi = v / 100;
    }
    out.push({ registro_patronal, nss, tipo, fecha, folio, dias, sdi });
  }
  return out;
}

export function parseIncapacidades(text: string): Incapacidad[] {
  // Layout 57 chars:
  // 0-10 registro, 11-21 NSS, 22 prefijo (1), 23-30 fecha_ini (8),
  // 31-38 folio (8), 39-41 días subsidiados (3), 42-44 reserva (3),
  // 45 tipo incap (1), 46-48 ramo (3), 49-56 fecha_fin (8)
  const out: Incapacidad[] = [];
  for (const line of lines(text)) {
    if (line.length < 50) continue;
    const p = line.padEnd(60, " ");
    const registro_patronal = p.slice(0, 11).trim();
    const nss = p.slice(11, 22).trim();
    const fecha_inicio = ddmmyyyyToISO(p.slice(23, 31));
    const folio = p.slice(31, 39).trim();
    const dias = parseInt(p.slice(39, 42), 10) || 0;
    const tipo = p.slice(45, 46).trim() || "1";
    const fecha_fin = ddmmyyyyToISO(p.slice(49, 57));
    if (!fecha_inicio) continue;
    out.push({ registro_patronal, nss, fecha_inicio, fecha_fin, folio, dias, tipo });
  }
  return out;
}

export function parseCreditos(text: string): CreditoInfonavit[] {
  // Layout 52 chars:
  // 0-10 registro, 11-21 NSS, 22-31 crédito (10), 32 tipo descuento (1),
  // 33-40 fecha inicio (8), 41-42 factor entero (2), 43-49 factor decimal o cuota (7),
  // 50-51 flags
  const out: CreditoInfonavit[] = [];
  for (const line of lines(text)) {
    if (line.length < 40) continue;
    const p = line.padEnd(55, " ");
    const registro_patronal = p.slice(0, 11).trim();
    const nss = p.slice(11, 22).trim();
    const credito = p.slice(22, 32).trim();
    const tipo_descuento = p.slice(32, 33).trim();
    const fecha_inicio = ddmmyyyyToISO(p.slice(33, 41));
    // El campo de valor varía: VSM o cuota fija. Tomamos los siguientes 9 dígitos crudos /100.
    const valRaw = p.slice(41, 50);
    const factor = /^\d+$/.test(valRaw) ? parseInt(valRaw, 10) / 100 : null;
    out.push({ registro_patronal, nss, credito, tipo_descuento, factor, fecha_inicio });
  }
  return out;
}

export const TIPO_MOV_LABEL: Record<string, string> = {
  "02": "Baja",
  "07": "Modificación salarial",
  "08": "Alta / Reingreso",
  "11": "Ausentismo",
  "12": "Incapacidad",
};

export const TIPO_MOV_TO_INTERNAL: Record<string, "alta" | "baja" | "modificacion" | "ausentismo" | "incapacidad"> = {
  "02": "baja",
  "07": "modificacion",
  "08": "alta",
  "11": "ausentismo",
  "12": "incapacidad",
};

export const TIPO_INCAP_LABEL: Record<string, string> = {
  "1": "Enfermedad general",
  "2": "Riesgo de trabajo",
  "3": "Maternidad",
};
