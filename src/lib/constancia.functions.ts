import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const REGIMEN_MAP: Record<string, string> = {
  "601": "General de Ley Personas Morales",
  "603": "Personas Morales con Fines no Lucrativos",
  "605": "Sueldos y Salarios e Ingresos Asimilados a Salarios",
  "606": "Arrendamiento",
  "607": "Régimen de Enajenación o Adquisición de Bienes",
  "608": "Demás ingresos",
  "610": "Residentes en el Extranjero sin Establecimiento Permanente",
  "611": "Ingresos por Dividendos",
  "612": "Personas Físicas con Actividades Empresariales y Profesionales",
  "614": "Ingresos por intereses",
  "615": "Régimen de los ingresos por obtención de premios",
  "616": "Sin obligaciones fiscales",
  "620": "Sociedades Cooperativas de Producción",
  "621": "Incorporación Fiscal",
  "622": "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras",
  "623": "Opcional para Grupos de Sociedades",
  "624": "Coordinados",
  "625": "Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
  "626": "Régimen Simplificado de Confianza",
};

// Match description → SAT code (lowercased, normalized)
const REGIMEN_DESC_TO_CODE: Array<[RegExp, string]> = [
  [/general\s+de\s+ley\s+personas\s+morales/i, "601"],
  [/personas\s+morales\s+con\s+fines\s+no\s+lucrativos/i, "603"],
  [/sueldos\s+y\s+salarios/i, "605"],
  [/arrendamiento/i, "606"],
  [/enajenaci[oó]n\s+o\s+adquisici[oó]n/i, "607"],
  [/dem[aá]s\s+ingresos/i, "608"],
  [/residentes\s+en\s+el\s+extranjero/i, "610"],
  [/ingresos\s+por\s+dividendos/i, "611"],
  [/actividades\s+empresariales\s+y\s+profesionales/i, "612"],
  [/ingresos\s+por\s+intereses/i, "614"],
  [/obtenci[oó]n\s+de\s+premios/i, "615"],
  [/sin\s+obligaciones\s+fiscales/i, "616"],
  [/sociedades\s+cooperativas/i, "620"],
  [/incorporaci[oó]n\s+fiscal/i, "621"],
  [/agr[ií]colas.*ganaderas/i, "622"],
  [/grupos\s+de\s+sociedades/i, "623"],
  [/coordinados/i, "624"],
  [/plataformas\s+tecnol[oó]gicas/i, "625"],
  [/simplificado\s+de\s+confianza/i, "626"],
];

// Ordered labels we expect in the CSF. We match each, then read until the next.
const LABELS: Array<{ key: string; patterns: RegExp[] }> = [
  { key: "rfc", patterns: [/RFC\s*:/i] },
  {
    key: "razon_social",
    patterns: [
      /Denominaci[oó]n\s*\/\s*Raz[oó]n\s+Social\s*:/i,
      /Denominaci[oó]n\s+o\s+Raz[oó]n\s+Social\s*:/i,
    ],
  },
  { key: "nombre_pf", patterns: [/Nombre\s*\(s\)\s*:/i] },
  { key: "primer_apellido", patterns: [/Primer\s+Apellido\s*:/i] },
  { key: "segundo_apellido", patterns: [/Segundo\s+Apellido\s*:/i] },
  { key: "curp", patterns: [/CURP\s*:/i] },
  { key: "regimen_capital", patterns: [/R[eé]gimen\s+Capital\s*:/i] },
  { key: "nombre_comercial", patterns: [/Nombre\s+Comercial\s*:/i] },
  { key: "fecha_inicio", patterns: [/Fecha\s+inicio\s+de\s+operaciones\s*:/i] },
  { key: "estatus", patterns: [/Estatus\s+en\s+el\s+padr[oó]n\s*:/i] },
  { key: "fecha_cambio", patterns: [/Fecha\s+de\s+[uú]ltimo\s+cambio\s+de\s+estado\s*:/i] },
  { key: "codigo_postal", patterns: [/C[oó]digo\s+Postal\s*:/i] },
  { key: "tipo_vialidad", patterns: [/Tipo\s+de\s+Vialidad\s*:/i] },
  { key: "calle", patterns: [/Nombre\s+de\s+Vialidad\s*:/i] },
  { key: "num_ext", patterns: [/N[uú]mero\s+Exterior\s*:/i] },
  { key: "num_int", patterns: [/N[uú]mero\s+Interior\s*:/i] },
  { key: "colonia", patterns: [/Nombre\s+de\s+la\s+Colonia\s*:/i] },
  { key: "localidad", patterns: [/Nombre\s+de\s+la\s+Localidad\s*:/i] },
  { key: "municipio", patterns: [/Nombre\s+del\s+Municipio[^:]*:/i] },
  { key: "entidad", patterns: [/Nombre\s+de\s+la\s+Entidad\s+Federativa\s*:/i] },
  { key: "entre_calle", patterns: [/Entre\s+Calle\s*:/i] },
  { key: "y_calle", patterns: [/\bCalle\s*:/i] },
  { key: "actividades_header", patterns: [/Actividades\s+Econ[oó]micas\s*:/i] },
  { key: "regimenes_header", patterns: [/Reg[ií]menes\s*:/i] },
];

function clean(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/^[\s:.\-]+|[\s:.\-]+$/g, "")
    .trim();
}

function extractFields(text: string): Record<string, string> {
  type Hit = { key: string; start: number; end: number };
  const hits: Hit[] = [];
  for (const { key, patterns } of LABELS) {
    for (const re of patterns) {
      const m = text.match(re);
      if (m && m.index !== undefined) {
        hits.push({ key, start: m.index, end: m.index + m[0].length });
        break;
      }
    }
  }
  hits.sort((a, b) => a.start - b.start);
  const out: Record<string, string> = {};
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const nextStart = i + 1 < hits.length ? hits[i + 1].start : text.length;
    const value = clean(text.slice(h.end, nextStart));
    if (value && !(h.key in out)) out[h.key] = value;
  }
  return out;
}

export const parseConstancia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ fileBase64: z.string().min(10), fileName: z.string() }).parse(i),
  )
  .handler(async ({ data }) => {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const buf = Uint8Array.from(atob(data.fileBase64), (c) => c.charCodeAt(0));
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    const flat = (Array.isArray(text) ? text.join("\n") : text).replace(/\u00A0/g, " ");

    const f = extractFields(flat);

    // RFC: prefer pattern match as fallback
    let rfc = f.rfc ? f.rfc.toUpperCase().match(/[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}/)?.[0] ?? null : null;
    if (!rfc) {
      rfc = flat.match(/\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/)?.[1]?.toUpperCase() ?? null;
    }

    // Razón social: moral o física
    let razon = f.razon_social ?? null;
    if (!razon && (f.nombre_pf || f.primer_apellido || f.segundo_apellido)) {
      razon = [f.primer_apellido, f.segundo_apellido, f.nombre_pf].filter(Boolean).join(" ").trim();
    }
    if (razon) razon = razon.slice(0, 250);

    // Régimen fiscal: buscar en sección "Regímenes:" después del header
    let regimenCode: string | null = null;
    const regimenesIdx = flat.search(/Reg[ií]menes\s*:/i);
    if (regimenesIdx >= 0) {
      const slice = flat.slice(regimenesIdx);
      for (const [re, code] of REGIMEN_DESC_TO_CODE) {
        if (re.test(slice)) {
          regimenCode = code;
          break;
        }
      }
    }

    const cp = f.codigo_postal?.match(/\d{5}/)?.[0] ?? null;

    const direccion =
      [
        f.tipo_vialidad && f.calle ? `${f.tipo_vialidad} ${f.calle}` : f.calle,
        f.num_ext && `#${f.num_ext}`,
        f.num_int && `Int. ${f.num_int}`,
        f.colonia && `Col. ${f.colonia}`,
        f.localidad,
        f.municipio,
        f.entidad,
      ]
        .filter(Boolean)
        .join(", ")
        .slice(0, 500) || null;

    return {
      rfc,
      razon_social: razon,
      regimen_fiscal: regimenCode,
      regimen_descripcion: regimenCode ? REGIMEN_MAP[regimenCode] ?? null : null,
      codigo_postal: cp,
      direccion,
      raw_preview: flat.slice(0, 400),
    };
  });
