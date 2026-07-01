import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { MXN } from "@/lib/format";

type Item = { codigo: string; nombre: string; saldo: number };

type BgData = {
  activoCirculante: Item[];
  activoNoCirculante: Item[];
  pasivoCirculante: Item[];
  pasivoNoCirculante: Item[];
  capital: Item[];
  totalActivo: number;
  totalPasivo: number;
  totalCapital: number;
  totalPasivoCapital: number;
};

function fm(n: number) {
  return MXN.format(n);
}

const meses = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export function generateBalanceGeneralPDF(
  org: { razon_social: string; rfc: string; regimen_fiscal?: string | null },
  bg: BgData,
  mes: number,
  ejercicio: number,
  collapsed: Record<string, boolean> = {},
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const colW = pageW - margin * 2;
  const col1 = colW * 0.18;
  const col2 = colW * 0.57;
  const col3 = colW * 0.25;
  const startY = 118;

  // Encabezado
  doc.setFont("helvetica", "bold").setFontSize(14);
  doc.text(org.razon_social || "—", margin, 40);
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(`RFC: ${org.rfc || "—"}`, margin, 56);
  if (org.regimen_fiscal) doc.text(`Régimen: ${org.regimen_fiscal}`, margin, 68);
  doc.setFont("helvetica", "bold").setFontSize(12);
  doc.text("Balance General", margin, 84);
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(`Al ${meses[mes - 1]} de ${ejercicio}`, margin, 98);
  doc.text(`Generado: ${new Date().toLocaleString("es-MX")}`, margin, 110);

  function itemRow(c: Item, startY: number) {
    autoTable(doc, {
      startY,
      body: [
        [
          {
            content: c.codigo ? c.codigo.replace(/^0+/, "") : "",
            styles: { fontSize: 7.5, cellPadding: [2, 4, 2, 8], textColor: 90 },
          },
          { content: c.nombre, styles: { fontSize: 7.5, cellPadding: [2, 4, 2, 4] } },
          {
            content: fm(c.saldo),
            styles: { halign: "right", fontSize: 7.5, cellPadding: [2, 4, 2, 4] },
          },
        ],
      ],
      margin: { left: margin, right: margin },
      tableLineWidth: 0,
      styles: { lineColor: 235, lineWidth: 0.3 },
      columnStyles: {
        0: { cellWidth: col1 },
        1: { cellWidth: col2 },
        2: { cellWidth: col3, halign: "right" },
      },
    });
    return (doc as any).lastAutoTable.finalY;
  }

  function sectionHead(label: string, color: [number, number, number], startY: number) {
    autoTable(doc, {
      startY,
      body: [
        [
          {
            content: label,
            colSpan: 3,
            styles: {
              fillColor: color,
              textColor: 255,
              fontStyle: "bold",
              fontSize: 10,
              cellPadding: 5,
            },
          },
        ],
      ],
      margin: { left: margin, right: margin },
      tableLineWidth: 0,
    });
    return (doc as any).lastAutoTable.finalY;
  }

  function subSectionTotal(
    label: string,
    total: number,
    color: [number, number, number],
    startY: number,
  ) {
    autoTable(doc, {
      startY,
      body: [
        [
          { content: "", styles: { fontSize: 8 } },
          {
            content: label,
            styles: {
              fontStyle: "bold",
              fontSize: 8.5,
              cellPadding: [4, 4, 4, 4],
              textColor: color,
            },
          },
          {
            content: fm(total),
            styles: {
              halign: "right",
              fontStyle: "bold",
              fontSize: 8.5,
              cellPadding: [4, 4, 4, 4],
              textColor: color,
            },
          },
        ],
      ],
      margin: { left: margin, right: margin },
      tableLineWidth: 0.3,
      styles: { lineColor: 220, lineWidth: 0.5 },
      columnStyles: {
        0: { cellWidth: col1 },
        1: { cellWidth: col2 },
        2: { cellWidth: col3, halign: "right" },
      },
    });
    return (doc as any).lastAutoTable.finalY;
  }

  function groupByPrefix(items: Item[]): { prefix: string; label: string; items: Item[]; total: number }[] {
    const groups: Record<string, Item[]> = {};
    for (const item of items) {
      const p4 = (item.codigo || "").replace(/^0+/, "").substring(0, 4);
      if (!groups[p4]) groups[p4] = [];
      groups[p4].push(item);
    }
    return Object.entries(groups).map(([prefix, items]) => ({
      prefix,
      label: items.length === 1 ? items[0]?.nombre : (items[0]?.nombre?.split(" ")[0] || prefix),
      items,
      total: items.reduce((s, i) => s + i.saldo, 0),
    }));
  }

  function groupRow(
    sectionTitle: string,
    g: { prefix: string; label: string; items: Item[]; total: number },
    color: [number, number, number],
    startY: number,
  ): number {
    const key = `${sectionTitle}_${g.prefix}`;
    const isCollapsed = collapsed[key];
    const hasMultiple = g.items.length > 1;
    const body: any[][] = [];
    // Fila del grupo (siempre visible)
    body.push([
      { content: g.prefix, styles: { fontSize: 7.5, cellPadding: [2, 4, 2, 8], textColor: color, fontStyle: "bold" } },
      { content: (hasMultiple ? (isCollapsed ? "▶ " : "▼ ") : "") + g.label, styles: { fontSize: 7.5, cellPadding: [2, 4, 2, 4], textColor: color, fontStyle: "bold" } },
      { content: fm(g.total), styles: { halign: "right", fontSize: 7.5, cellPadding: [2, 4, 2, 4], textColor: color, fontStyle: "bold" } },
    ]);
    // Si no está colapsado y tiene múltiples items, añadir items individuales
    if (hasMultiple && !isCollapsed) {
      for (const c of g.items) {
        body.push([
          { content: c.codigo ? c.codigo.replace(/^0+/, "") : "", styles: { fontSize: 7.5, cellPadding: [2, 4, 2, 16], textColor: 100 } },
          { content: c.nombre, styles: { fontSize: 7.5, cellPadding: [2, 4, 2, 4], textColor: 90 } },
          { content: fm(c.saldo), styles: { halign: "right", fontSize: 7.5, cellPadding: [2, 4, 2, 4] } },
        ]);
      }
    }
    autoTable(doc, {
      startY,
      body,
      margin: { left: margin, right: margin },
      tableLineWidth: 0,
      styles: { lineColor: 235, lineWidth: 0.2 },
      columnStyles: {
        0: { cellWidth: col1 },
        1: { cellWidth: col2 },
        2: { cellWidth: col3, halign: "right" },
      },
    });
    return (doc as any).lastAutoTable.finalY;
  }

  let y = startY;

  // ===== ACTIVO =====
  y = sectionHead("ACTIVO", [37, 99, 235], y);
  y = sectionHead("Activo Circulante", [96, 165, 250], y);
  const gruposActCirc = groupByPrefix(bg.activoCirculante || []);
  for (const g of gruposActCirc) y = groupRow("Activo Circulante", g, [37, 99, 235], y);
  const totalActivoCirc = (bg.activoCirculante || []).reduce((s, i) => s + i.saldo, 0);
  y = subSectionTotal("Total Activo Circulante", totalActivoCirc, [37, 99, 235], y);

  y = sectionHead("Activo No Circulante", [96, 165, 250], y);
  const gruposActNoCirc = groupByPrefix(bg.activoNoCirculante || []);
  for (const g of gruposActNoCirc) y = groupRow("Activo No Circulante", g, [37, 99, 235], y);
  const totalActivoNoCirc = (bg.activoNoCirculante || []).reduce((s, i) => s + i.saldo, 0);
  y = subSectionTotal("Total Activo No Circulante", totalActivoNoCirc, [37, 99, 235], y);

  // Total Activo
  autoTable(doc, {
    startY: y,
    body: [
      [
        {
          content: "TOTAL ACTIVO",
          colSpan: 2,
          styles: {
            fontStyle: "bold",
            fontSize: 11,
            fillColor: [37, 99, 235],
            textColor: 255,
            cellPadding: [6, 4, 6, 4],
          },
        },
        {
          content: fm(bg.totalActivo),
          styles: {
            halign: "right",
            fontStyle: "bold",
            fontSize: 11,
            fillColor: [37, 99, 235],
            textColor: 255,
            cellPadding: [6, 4, 6, 4],
          },
        },
      ],
    ],
    margin: { left: margin, right: margin },
    tableLineWidth: 0,
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  // PASIVO
  y = sectionHead("PASIVO", [234, 88, 12], y);
  y = sectionHead("Pasivo Circulante", [251, 146, 60], y);
  const gruposPasCirc = groupByPrefix(bg.pasivoCirculante || []);
  for (const g of gruposPasCirc) y = groupRow("Pasivo Circulante", g, [234, 88, 12], y);
  const totalPasivoCirc = (bg.pasivoCirculante || []).reduce((s, i) => s + i.saldo, 0);
  y = subSectionTotal("Total Pasivo Circulante", totalPasivoCirc, [234, 88, 12], y);

  y = sectionHead("Pasivo No Circulante", [251, 146, 60], y);
  const gruposPasNoCirc = groupByPrefix(bg.pasivoNoCirculante || []);
  for (const g of gruposPasNoCirc) y = groupRow("Pasivo No Circulante", g, [234, 88, 12], y);
  const totalPasivoNoCirc = (bg.pasivoNoCirculante || []).reduce((s, i) => s + i.saldo, 0);
  y = subSectionTotal("Total Pasivo No Circulante", totalPasivoNoCirc, [234, 88, 12], y);

  // Total Pasivo
  autoTable(doc, {
    startY: y,
    body: [
      [
        {
          content: "TOTAL PASIVO",
          colSpan: 2,
          styles: {
            fontStyle: "bold",
            fontSize: 11,
            fillColor: [234, 88, 12],
            textColor: 255,
            cellPadding: [6, 4, 6, 4],
          },
        },
        {
          content: fm(bg.totalPasivo),
          styles: {
            halign: "right",
            fontStyle: "bold",
            fontSize: 11,
            fillColor: [234, 88, 12],
            textColor: 255,
            cellPadding: [6, 4, 6, 4],
          },
        },
      ],
    ],
    margin: { left: margin, right: margin },
    tableLineWidth: 0,
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  // CAPITAL CONTABLE
  y = sectionHead("CAPITAL CONTABLE", [22, 163, 74], y);
  for (const c of bg.capital || []) y = itemRow(c, y);

  // Total Capital
  autoTable(doc, {
    startY: y,
    body: [
      [
        {
          content: "TOTAL CAPITAL CONTABLE",
          colSpan: 2,
          styles: {
            fontStyle: "bold",
            fontSize: 11,
            fillColor: [22, 163, 74],
            textColor: 255,
            cellPadding: [6, 4, 6, 4],
          },
        },
        {
          content: fm(bg.totalCapital),
          styles: {
            halign: "right",
            fontStyle: "bold",
            fontSize: 11,
            fillColor: [22, 163, 74],
            textColor: 255,
            cellPadding: [6, 4, 6, 4],
          },
        },
      ],
    ],
    margin: { left: margin, right: margin },
    tableLineWidth: 0,
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Total Pasivo + Capital (cuadre)
  autoTable(doc, {
    startY: y,
    body: [
      [
        {
          content: "TOTAL PASIVO + CAPITAL",
          colSpan: 2,
          styles: {
            fontStyle: "bold",
            fontSize: 12,
            fillColor: [30, 30, 40],
            textColor: 255,
            cellPadding: [7, 4, 7, 4],
          },
        },
        {
          content: fm(bg.totalPasivoCapital),
          styles: {
            halign: "right",
            fontStyle: "bold",
            fontSize: 12,
            fillColor: [30, 30, 40],
            textColor: 255,
            cellPadding: [7, 4, 7, 4],
          },
        },
      ],
    ],
    margin: { left: margin, right: margin },
    tableLineWidth: 0,
  });

  // Diferencia (cuadre)
  const diferencia = bg.totalActivo - bg.totalPasivoCapital;
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    body: [
      [
        {
          content:
            Math.abs(diferencia) < 0.01
              ? "✓ Cuadre correcto (Activo = Pasivo + Capital)"
              : `Diferencia: ${fm(diferencia)}`,
          colSpan: 3,
          styles: {
            fontStyle: "bold",
            fontSize: 9,
            textColor: Math.abs(diferencia) < 0.01 ? [22, 163, 74] : [190, 80, 60],
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

  doc.save(`Balance_General_${ejercicio}_${meses[mes - 1].replace(/ /g, "_")}.pdf`);
}