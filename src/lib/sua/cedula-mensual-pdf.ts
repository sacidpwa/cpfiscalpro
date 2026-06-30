import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { NOMBRE_MES } from "./calc-mensual";

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Header = {
  ejercicio: number;
  mes: number;
  patron: { razon_social: string; registro_patronal: string; rfc_patron?: string | null };
  total_efm: number;
  total_gmp: number;
  total_iv: number;
  total_guarderias: number;
  total_rt: number;
  total_mes: number;
};
type Det = {
  employee: { numero?: string | null; nombre: string; apellido_paterno: string; apellido_materno?: string | null; nss?: string | null; rfc?: string | null };
  sbc: number;
  dias_cot: number;
  efm_cf: number; efm_exc: number; efm_din: number;
  gmp: number; iv: number; guarderias: number; rt: number;
  total: number;
};

export function generarCedulaMensualPDF(header: Header, det: Det[]): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  doc.setFontSize(14);
  doc.text("Cédula Mensual IMSS", 40, 40);
  doc.setFontSize(10);
  doc.text(`${NOMBRE_MES[header.mes]} ${header.ejercicio}`, 40, 58);
  doc.text(`Patrón: ${header.patron.razon_social}`, 40, 72);
  doc.text(`Registro patronal: ${header.patron.registro_patronal}    RFC: ${header.patron.rfc_patron ?? ""}`, 40, 86);

  autoTable(doc, {
    startY: 110,
    head: [["#", "NSS", "Trabajador", "SBC", "Días", "EFM CF", "EFM Exc", "EFM Din", "GMP", "IV", "Guard", "RT", "Total"]],
    body: det.map((d, i) => [
      d.employee.numero ?? String(i + 1),
      d.employee.nss ?? "",
      `${d.employee.apellido_paterno} ${d.employee.apellido_materno ?? ""} ${d.employee.nombre}`.trim(),
      fmt(d.sbc),
      d.dias_cot,
      fmt(d.efm_cf), fmt(d.efm_exc), fmt(d.efm_din),
      fmt(d.gmp), fmt(d.iv), fmt(d.guarderias), fmt(d.rt),
      fmt(d.total),
    ]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    columnStyles: Object.fromEntries(
      [3,4,5,6,7,8,9,10,11,12].map((c) => [c, { halign: "right" }])
    ) as any,
    foot: [[
      "", "", "TOTALES", "", "",
      "", "", fmt(header.total_efm),
      fmt(header.total_gmp), fmt(header.total_iv),
      fmt(header.total_guarderias), fmt(header.total_rt),
      fmt(header.total_mes),
    ]],
    footStyles: { fillColor: [241, 245, 249], textColor: 0, fontStyle: "bold" },
  });

  const y = (doc as any).lastAutoTable.finalY + 20;
  doc.setFontSize(11);
  doc.text(`TOTAL DEL MES: $${fmt(header.total_mes)}`, 40, y + 16);

  return doc;
}
