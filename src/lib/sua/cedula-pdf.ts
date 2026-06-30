import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { NOMBRE_BIMESTRE } from "./calc";

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Header = {
  ejercicio: number;
  bimestre: number;
  patron: { razon_social: string; registro_patronal: string; rfc_patron?: string | null };
  total_imss_mes1: number;
  total_imss_mes2: number;
  total_rcv: number;
  total_infonavit: number;
  total_bimestre: number;
};
type Det = {
  employee: { numero?: string | null; nombre: string; apellido_paterno: string; apellido_materno?: string | null; nss?: string | null; rfc?: string | null };
  sbc: number;
  dias_mes1: number; dias_mes2: number;
  total_imss_mes1: number; total_imss_mes2: number;
  total_rcv: number; infonavit: number; total: number;
};

export function generarCedulaPDF(header: Header, det: Det[]): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  doc.setFontSize(14);
  doc.text("Cédula de Determinación IMSS / RCV / Infonavit", 40, 40);
  doc.setFontSize(10);
  const meses = NOMBRE_BIMESTRE[header.bimestre];
  doc.text(`Bimestre ${header.bimestre} (${meses}) ${header.ejercicio}`, 40, 58);
  doc.text(`Patrón: ${header.patron.razon_social}`, 40, 72);
  doc.text(`Registro patronal: ${header.patron.registro_patronal}    RFC: ${header.patron.rfc_patron ?? ""}`, 40, 86);

  autoTable(doc, {
    startY: 110,
    head: [["#", "NSS", "Trabajador", "SBC", "Días M1", "Días M2", "IMSS M1", "IMSS M2", "RCV", "Infonavit", "Total"]],
    body: det.map((d, i) => [
      d.employee.numero ?? String(i + 1),
      d.employee.nss ?? "",
      `${d.employee.apellido_paterno} ${d.employee.apellido_materno ?? ""} ${d.employee.nombre}`.trim(),
      fmt(d.sbc),
      d.dias_mes1,
      d.dias_mes2,
      fmt(d.total_imss_mes1),
      fmt(d.total_imss_mes2),
      fmt(d.total_rcv),
      fmt(d.infonavit),
      fmt(d.total),
    ]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    columnStyles: {
      3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" },
      6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" },
      9: { halign: "right" }, 10: { halign: "right" },
    },
    foot: [[
      "", "", "TOTALES", "", "", "",
      fmt(header.total_imss_mes1),
      fmt(header.total_imss_mes2),
      fmt(header.total_rcv),
      fmt(header.total_infonavit),
      fmt(header.total_bimestre),
    ]],
    footStyles: { fillColor: [241, 245, 249], textColor: 0, fontStyle: "bold" },
  });

  const y = (doc as any).lastAutoTable.finalY + 20;
  doc.setFontSize(9);
  doc.text("Resumen mensual:", 40, y);
  doc.text(`Mes 1 IMSS: $${fmt(header.total_imss_mes1)}`, 40, y + 14);
  doc.text(`Mes 2 IMSS: $${fmt(header.total_imss_mes2)}`, 200, y + 14);
  doc.text(`RCV (Retiro + CV): $${fmt(header.total_rcv)}`, 360, y + 14);
  doc.text(`Infonavit: $${fmt(header.total_infonavit)}`, 520, y + 14);
  doc.setFontSize(11);
  doc.text(`TOTAL BIMESTRE: $${fmt(header.total_bimestre)}`, 40, y + 36);

  return doc;
}
