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
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Colores sobrios (grises)
const GRIS_OSC = [90, 90, 100] as [number, number, number];
const GRIS_MED = [120, 120, 130] as [number, number, number];
const GRIS_CLARO = [200, 200, 205] as [number, number, number];
const GRIS_BG = [235, 235, 240] as [number, number, number];
const TEXTO = [50, 50, 60] as [number, number, number];
const TEXTO_CLARO = [100, 100, 110] as [number, number, number];

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
  doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(TEXTO[0], TEXTO[1], TEXTO[2]);
  doc.text(org.razon_social || "-", margin, 40);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(TEXTO_CLARO[0], TEXTO_CLARO[1], TEXTO_CLARO[2]);
  doc.text(`RFC: ${org.rfc || "-"}`, margin, 56);
  if (org.regimen_fiscal) doc.text(`Régimen: ${org.regimen_fiscal}`, margin, 68);
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(TEXTO[0], TEXTO[1], TEXTO[2]);
  doc.text("Balance General", margin, 84);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(TEXTO_CLARO[0], TEXTO_CLARO[1], TEXTO_CLARO[2]);
  doc.text(`Al ${meses[mes - 1]} de ${ejercicio}`, margin, 98);
  doc.text(`Generado: ${new Date().toLocaleString("es-MX")}`, margin, 110);

  function itemRow(c: Item, startY: number) {
    autoTable(doc, {
      startY,
      body: [[
        { content: c.codigo ? c.codigo.replace(/^0+/, "") : "", styles: { fontSize: 7.5, cellPadding: [2, 4, 2, 8], textColor: TEXTO_CLARO } },
        { content: c.nombre, styles: { fontSize: 7.5, cellPadding: [2, 4, 2, 4], textColor: TEXTO } },
        { content: fm(c.saldo), styles: { halign: "right", fontSize: 7.5, cellPadding: [2, 4, 2, 4], textColor: TEXTO } },
      ]],
      margin: { left: margin, right: margin },
      tableLineWidth: 0,
      styles: { lineColor: GRIS_CLARO, lineWidth: 0.3 },
      columnStyles: { 0: { cellWidth: col1 }, 1: { cellWidth: col2 }, 2: { cellWidth: col3, halign: "right" } },
    });
    return (doc as any).lastAutoTable.finalY;
  }

  function sectionHead(label: string, startY: number) {
    autoTable(doc, {
      startY,
      body: [[
        { content: label, styles: { fillColor: GRIS_OSC, textColor: 255, fontStyle: "bold", fontSize: 9.5, cellPadding: 5 } },
        { content: "", styles: { fillColor: GRIS_OSC, cellPadding: 0 } },
        { content: "", styles: { fillColor: GRIS_OSC, cellPadding: 0 } },
      ]],
      margin: { left: margin, right: margin },
      tableLineWidth: 0,
      columnStyles: { 0: { cellWidth: col1 }, 1: { cellWidth: col2 }, 2: { cellWidth: col3 } },
    });
    return (doc as any).lastAutoTable.finalY;
  }

  function subHead(label: string, startY: number) {
    autoTable(doc, {
      startY,
      body: [[
        { content: label, styles: { fillColor: GRIS_BG, textColor: GRIS_OSC, fontStyle: "bold", fontSize: 8.5, cellPadding: [4, 4, 4, 8] } },
        { content: "", styles: { fillColor: GRIS_BG, cellPadding: 0 } },
        { content: "", styles: { fillColor: GRIS_BG, cellPadding: 0 } },
      ]],
      margin: { left: margin, right: margin },
      tableLineWidth: 0,
      columnStyles: { 0: { cellWidth: col1 }, 1: { cellWidth: col2 }, 2: { cellWidth: col3 } },
    });
    return (doc as any).lastAutoTable.finalY;
  }

  function subSectionTotal(label: string, total: number, startY: number) {
    autoTable(doc, {
      startY,
      body: [[
        { content: "", styles: { fontSize: 8 } },
        { content: label, styles: { fontStyle: "bold", fontSize: 8.5, cellPadding: [4, 4, 4, 4], textColor: GRIS_OSC } },
        { content: fm(total), styles: { halign: "right", fontStyle: "bold", fontSize: 8.5, cellPadding: [4, 4, 4, 4], textColor: GRIS_OSC } },
      ]],
      margin: { left: margin, right: margin },
      tableLineWidth: 0.3,
      styles: { lineColor: GRIS_CLARO, lineWidth: 0.5 },
      columnStyles: { 0: { cellWidth: col1 }, 1: { cellWidth: col2 }, 2: { cellWidth: col3, halign: "right" } },
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
    startY: number,
  ): number {
    const key = `${sectionTitle}_${g.prefix}`;
    const isCollapsed = collapsed[key];
    const hasMultiple = g.items.length > 1;
    const body: any[][] = [];
    body.push([
      { content: g.prefix, styles: { fontSize: 7.5, cellPadding: [2, 4, 2, 8], textColor: GRIS_OSC, fontStyle: "bold" } },
      { content: (hasMultiple ? (isCollapsed ? "+ " : "- ") : "") + g.label, styles: { fontSize: 7.5, cellPadding: [2, 4, 2, 4], textColor: GRIS_OSC, fontStyle: "bold" } },
      { content: fm(g.total), styles: { halign: "right", fontSize: 7.5, cellPadding: [2, 4, 2, 4], textColor: GRIS_OSC, fontStyle: "bold" } },
    ]);
    if (hasMultiple && !isCollapsed) {
      for (const c of g.items) {
        body.push([
          { content: c.codigo ? c.codigo.replace(/^0+/, "") : "", styles: { fontSize: 7.5, cellPadding: [2, 4, 2, 16], textColor: TEXTO_CLARO } },
          { content: c.nombre, styles: { fontSize: 7.5, cellPadding: [2, 4, 2, 4], textColor: TEXTO } },
          { content: fm(c.saldo), styles: { halign: "right", fontSize: 7.5, cellPadding: [2, 4, 2, 4], textColor: TEXTO } },
        ]);
      }
    }
    autoTable(doc, {
      startY, body,
      margin: { left: margin, right: margin },
      tableLineWidth: 0,
      styles: { lineColor: GRIS_CLARO, lineWidth: 0.2 },
      columnStyles: { 0: { cellWidth: col1 }, 1: { cellWidth: col2 }, 2: { cellWidth: col3, halign: "right" } },
    });
    return (doc as any).lastAutoTable.finalY;
  }

  function totalRow(label: string, total: number, startY: number, fontSize = 10) {
    autoTable(doc, {
      startY,
      body: [[
        { content: "", styles: { fillColor: GRIS_OSC, cellPadding: [6, 0, 6, 0] } },
        { content: label, styles: { fontStyle: "bold", fontSize, fillColor: GRIS_OSC, textColor: 255, cellPadding: [6, 4, 6, 4] } },
        { content: fm(total), styles: { halign: "right", fontStyle: "bold", fontSize, fillColor: GRIS_OSC, textColor: 255, cellPadding: [6, 4, 6, 4] } },
      ]],
      margin: { left: margin, right: margin },
      tableLineWidth: 0,
      columnStyles: { 0: { cellWidth: col1 }, 1: { cellWidth: col2 }, 2: { cellWidth: col3, halign: "right" } },
    });
    return (doc as any).lastAutoTable.finalY;
  }

  let y = startY;

  // ===== ACTIVO =====
  y = sectionHead("ACTIVO", y);
  y = subHead("Activo Circulante", y);
  const gruposActCirc = groupByPrefix(bg.activoCirculante || []);
  for (const g of gruposActCirc) y = groupRow("Activo Circulante", g, y);
  const totalActivoCirc = (bg.activoCirculante || []).reduce((s, i) => s + i.saldo, 0);
  y = subSectionTotal("Total Activo Circulante", totalActivoCirc, y);

  y = subHead("Activo No Circulante", y);
  const gruposActNoCirc = groupByPrefix(bg.activoNoCirculante || []);
  for (const g of gruposActNoCirc) y = groupRow("Activo No Circulante", g, y);
  const totalActivoNoCirc = (bg.activoNoCirculante || []).reduce((s, i) => s + i.saldo, 0);
  y = subSectionTotal("Total Activo No Circulante", totalActivoNoCirc, y);
  y = totalRow("TOTAL ACTIVO", bg.totalActivo, y);
  y += 12;

  // PASIVO
  y = sectionHead("PASIVO", y);
  y = subHead("Pasivo Circulante", y);
  const gruposPasCirc = groupByPrefix(bg.pasivoCirculante || []);
  for (const g of gruposPasCirc) y = groupRow("Pasivo Circulante", g, y);
  const totalPasivoCirc = (bg.pasivoCirculante || []).reduce((s, i) => s + i.saldo, 0);
  y = subSectionTotal("Total Pasivo Circulante", totalPasivoCirc, y);

  y = subHead("Pasivo No Circulante", y);
  const gruposPasNoCirc = groupByPrefix(bg.pasivoNoCirculante || []);
  for (const g of gruposPasNoCirc) y = groupRow("Pasivo No Circulante", g, y);
  const totalPasivoNoCirc = (bg.pasivoNoCirculante || []).reduce((s, i) => s + i.saldo, 0);
  y = subSectionTotal("Total Pasivo No Circulante", totalPasivoNoCirc, y);
  y = totalRow("TOTAL PASIVO", bg.totalPasivo, y);
  y += 12;

  // CAPITAL CONTABLE
  y = sectionHead("CAPITAL CONTABLE", y);
  for (const c of bg.capital || []) y = itemRow(c, y);
  y = totalRow("TOTAL CAPITAL CONTABLE", bg.totalCapital, y);
  y += 8;

  // Total Pasivo y Capital (cuadre) - fontSize 9 para que quepa
  y = totalRow("TOTAL PASIVO Y CAPITAL", bg.totalPasivoCapital, y, 9);

  // Diferencia (cuadre)
  const diferencia = bg.totalActivo - bg.totalPasivoCapital;
  autoTable(doc, {
    startY: y + 6,
    body: [[
      { content: Math.abs(diferencia) < 0.01
          ? "Cuadre correcto (Activo = Pasivo y Capital)"
          : `Diferencia: ${fm(diferencia)}`,
        styles: { fontStyle: "bold", fontSize: 9, textColor: Math.abs(diferencia) < 0.01 ? GRIS_OSC : [140, 60, 60], cellPadding: [4, 4, 4, 8] } },
      { content: "", styles: { cellPadding: 0 } },
      { content: "", styles: { cellPadding: 0 } },
    ]],
    margin: { left: margin, right: margin },
    tableLineWidth: 0,
    styles: { lineColor: GRIS_CLARO, lineWidth: 0.3 },
    columnStyles: { 0: { cellWidth: col1 }, 1: { cellWidth: col2 }, 2: { cellWidth: col3 } },
  });

  // Footer
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7).setTextColor(130);
    doc.text(`Página ${i} de ${pages}`, margin, doc.internal.pageSize.getHeight() - 20);
    doc.text(org.razon_social, pageW - margin, doc.internal.pageSize.getHeight() - 20, { align: "right" });
  }

  doc.save(`Balance_General_${ejercicio}_${meses[mes - 1].replace(/ /g, "_")}.pdf`);
}