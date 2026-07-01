import jsPDF from "jspdf";
import autoTable, { type RowInput } from "jspdf-autotable";
import { MXN } from "@/lib/format";

type Row = {
  codigo: string;
  nombre: string;
  cargo: number;
  abono: number;
  saldo: number;
  naturaleza: string;
};

function fm(n: number) {
  return MXN.format(n);
}

function fmtFecha(d: string) {
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function generateBalanzaPDF(
  org: { razon_social: string; rfc: string; regimen_fiscal?: string | null },
  data: Row[],
  desde: string,
  hasta: string,
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 36;
  const colW = pageW - margin * 2;
  const col1 = colW * 0.13; // código
  const col2 = colW * 0.37; // nombre
  const col3 = colW * 0.16; // cargo
  const col4 = colW * 0.16; // abono
  const col5 = colW * 0.18; // saldo
  const startY = 116;

  // Encabezado
  doc.setFont("helvetica", "bold").setFontSize(14);
  doc.text(org.razon_social || "—", margin, 40);
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(`RFC: ${org.rfc || "—"}`, margin, 56);
  if (org.regimen_fiscal) doc.text(`Régimen: ${org.regimen_fiscal}`, margin, 68);
  doc.setFont("helvetica", "bold").setFontSize(12);
  doc.text("Balanza de Comprobación", margin, 84);
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(
    `Periodo: ${fmtFecha(desde)} a ${fmtFecha(hasta)}`,
    margin,
    98,
  );
  doc.text(`Generado: ${new Date().toLocaleString("es-MX")}`, margin, 110);

  // Encabezado de columnas
  autoTable(doc, {
    startY,
    head: [
      [
        { content: "Código", styles: { halign: "left", fontStyle: "bold", fontSize: 8, fillColor: [240, 240, 245], textColor: 60 } },
        { content: "Cuenta", styles: { halign: "left", fontStyle: "bold", fontSize: 8, fillColor: [240, 240, 245], textColor: 60 } },
        { content: "Cargos", styles: { halign: "right", fontStyle: "bold", fontSize: 8, fillColor: [240, 240, 245], textColor: 60 } },
        { content: "Abonos", styles: { halign: "right", fontStyle: "bold", fontSize: 8, fillColor: [240, 240, 245], textColor: 60 } },
        { content: "Saldo", styles: { halign: "right", fontStyle: "bold", fontSize: 8, fillColor: [240, 240, 245], textColor: 60 } },
      ],
    ],
    margin: { left: margin, right: margin },
    tableLineWidth: 0,
    styles: { fontSize: 7.5, cellPadding: 3, lineColor: 220, lineWidth: 0.3 },
    headStyles: { fillColor: [240, 240, 245], textColor: 60, lineWidth: 0 },
    columnStyles: {
      0: { cellWidth: col1 },
      1: { cellWidth: col2 },
      2: { cellWidth: col3, halign: "right" },
      3: { cellWidth: col4, halign: "right" },
      4: { cellWidth: col5, halign: "right" },
    },
  });

  // Cuerpo: todas las filas
  const bodyRows: RowInput[] = data.map((r) => [
    { content: r.codigo, styles: { fontSize: 7.5, textColor: 90 } },
    { content: r.nombre, styles: { fontSize: 7.5 } },
    { content: fm(r.cargo), styles: { halign: "right" as const, fontSize: 7.5 } },
    { content: fm(r.abono), styles: { halign: "right" as const, fontSize: 7.5 } },
    {
      content: fm(r.saldo),
      styles: { halign: "right" as const, fontSize: 7.5, fontStyle: "bold" as const },
    },
  ]);

  const totC = data.reduce((s, r) => s + r.cargo, 0);
  const totA = data.reduce((s, r) => s + r.abono, 0);
  const totS = data.reduce((s, r) => s + r.saldo, 0);

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY,
    body: bodyRows,
    margin: { left: margin, right: margin },
    tableLineWidth: 0,
    styles: { fontSize: 7.5, cellPadding: [2, 3, 2, 3], lineColor: 235, lineWidth: 0.2 },
    columnStyles: {
      0: { cellWidth: col1 },
      1: { cellWidth: col2 },
      2: { cellWidth: col3, halign: "right" },
      3: { cellWidth: col4, halign: "right" },
      4: { cellWidth: col5, halign: "right" },
    },
  });

  // Totales
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY,
    body: [
      [
        {
          content: "TOTALES",
          colSpan: 2,
          styles: { fontStyle: "bold", fontSize: 9, fillColor: [30, 30, 40], textColor: 255, cellPadding: [5, 3, 5, 3] },
        },
        {
          content: fm(totC),
          styles: { halign: "right", fontStyle: "bold", fontSize: 9, fillColor: [30, 30, 40], textColor: 255, cellPadding: [5, 3, 5, 3] },
        },
        {
          content: fm(totA),
          styles: { halign: "right", fontStyle: "bold", fontSize: 9, fillColor: [30, 30, 40], textColor: 255, cellPadding: [5, 3, 5, 3] },
        },
        {
          content: fm(totS),
          styles: { halign: "right", fontStyle: "bold", fontSize: 9, fillColor: [30, 30, 40], textColor: 255, cellPadding: [5, 3, 5, 3] },
        },
      ],
    ],
    margin: { left: margin, right: margin },
    tableLineWidth: 0,
    columnStyles: {
      0: { cellWidth: col1 },
      1: { cellWidth: col2 },
      2: { cellWidth: col3, halign: "right" },
      3: { cellWidth: col4, halign: "right" },
      4: { cellWidth: col5, halign: "right" },
    },
  });

  // Cuadre
  const cuadreOk = Math.abs(totC - totA) < 0.01;
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    body: [
      [
        {
          content: cuadreOk
            ? "✓ Cuadre correcto (Σ Cargos = Σ Abonos)"
            : `Diferencia: ${fm(totC - totA)}`,
          colSpan: 5,
          styles: {
            fontStyle: "bold",
            fontSize: 9,
            textColor: cuadreOk ? [22, 163, 74] : [190, 80, 60],
            cellPadding: [4, 4, 4, 4],
          },
        },
      ],
    ],
    margin: { left: margin, right: margin },
    tableLineWidth: 0,
    styles: { lineColor: 220, lineWidth: 0.3 },
  });

  // Footer
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7).setTextColor(130);
    doc.text(`Página ${i} de ${pages}`, margin, doc.internal.pageSize.getHeight() - 20);
    doc.text(
      org.razon_social,
      pageW - margin,
      doc.internal.pageSize.getHeight() - 20,
      { align: "right" },
    );
  }

  doc.save(`Balanza_${desde}_a_${hasta}.pdf`);
}