import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtMoney, fmtDate } from "@/lib/format";

type Receipt = {
  id: string;
  total_percepciones: number;
  total_deducciones: number;
  isr: number;
  imss_obrero: number;
  subsidio: number;
  neto_pagar: number;
  dias_pagados: number;
  sueldo_diario: number;
  sdi: number;
  employee?: {
    numero?: string;
    nombre?: string;
    apellido_paterno?: string | null;
    apellido_materno?: string | null;
    rfc?: string | null;
    nss?: string | null;
    empresa?: string | null;
    puesto?: string | null;
  };
};

type Period = { numero: number; ejercicio: number; fecha_inicio: string; fecha_fin: string; fecha_pago: string; periodicidad: string };
type Org = { razon_social: string; rfc: string };

const SUMS = ["total_percepciones", "isr", "imss_obrero", "subsidio", "total_deducciones", "neto_pagar"] as const;

function fullName(e?: Receipt["employee"]) {
  return [e?.nombre, e?.apellido_paterno, e?.apellido_materno].filter(Boolean).join(" ");
}
function totals(rows: Receipt[]) {
  const t: Record<string, number> = {};
  for (const k of SUMS) t[k] = rows.reduce((s, r) => s + Number((r as any)[k] ?? 0), 0);
  return t;
}

export function generateNominaPDF(opts: { org: Org; period: Period; receipts: Receipt[]; output?: "save" | "blob" | "base64" }) {
  const { org, period, receipts, output = "save" } = opts;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });

  // Header
  doc.setFont("helvetica", "bold").setFontSize(14);
  doc.text(org.razon_social || "—", 40, 40);
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(`RFC: ${org.rfc || "—"}`, 40, 56);
  doc.setFont("helvetica", "bold").setFontSize(11);
  doc.text(`Reporte de Nómina · Periodo #${period.numero}/${period.ejercicio} (${period.periodicidad})`, 40, 78);
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(`Del ${fmtDate(period.fecha_inicio)} al ${fmtDate(period.fecha_fin)} · Pago: ${fmtDate(period.fecha_pago)}`, 40, 92);

  // Group by empresa
  const groups = new Map<string, Receipt[]>();
  for (const r of receipts) {
    const key = (r.employee?.empresa || "Sin empresa").trim() || "Sin empresa";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const sorted = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  let startY = 110;
  const head = [["#", "Empleado", "RFC", "Días", "S. Diario", "Percep.", "ISR", "IMSS", "Subs.", "Deduc.", "Neto"]];

  for (const [empresa, rows] of sorted) {
    const t = totals(rows);
    autoTable(doc, {
      startY,
      head,
      body: [
        [{ content: `Empresa: ${empresa} (${rows.length} empleados)`, colSpan: 11, styles: { fillColor: [230, 230, 240], fontStyle: "bold", textColor: 20 } }] as any,
        ...rows.map((r) => [
          r.employee?.numero ?? "",
          fullName(r.employee),
          r.employee?.rfc ?? "",
          String(r.dias_pagados ?? ""),
          fmtMoney(r.sueldo_diario),
          fmtMoney(r.total_percepciones),
          fmtMoney(r.isr),
          fmtMoney(r.imss_obrero),
          fmtMoney(r.subsidio),
          fmtMoney(r.total_deducciones),
          fmtMoney(r.neto_pagar),
        ]),
        [
          { content: `Subtotal ${empresa}`, colSpan: 5, styles: { halign: "right", fontStyle: "bold", fillColor: [245, 245, 250] } } as any,
          { content: fmtMoney(t.total_percepciones), styles: { halign: "right", fontStyle: "bold", fillColor: [245, 245, 250] } } as any,
          { content: fmtMoney(t.isr), styles: { halign: "right", fontStyle: "bold", fillColor: [245, 245, 250] } } as any,
          { content: fmtMoney(t.imss_obrero), styles: { halign: "right", fontStyle: "bold", fillColor: [245, 245, 250] } } as any,
          { content: fmtMoney(t.subsidio), styles: { halign: "right", fontStyle: "bold", fillColor: [245, 245, 250] } } as any,
          { content: fmtMoney(t.total_deducciones), styles: { halign: "right", fontStyle: "bold", fillColor: [245, 245, 250] } } as any,
          { content: fmtMoney(t.neto_pagar), styles: { halign: "right", fontStyle: "bold", fillColor: [245, 245, 250] } } as any,
        ],
      ],
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [40, 40, 60], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 38 },
        1: { cellWidth: 170 },
        2: { cellWidth: 80 },
        3: { halign: "right", cellWidth: 32 },
        4: { halign: "right", cellWidth: 55 },
        5: { halign: "right", cellWidth: 60 },
        6: { halign: "right", cellWidth: 55 },
        7: { halign: "right", cellWidth: 55 },
        8: { halign: "right", cellWidth: 50 },
        9: { halign: "right", cellWidth: 55 },
        10: { halign: "right", cellWidth: 65 },
      },
      margin: { left: 40, right: 40 },
    });
    startY = (doc as any).lastAutoTable.finalY + 14;
  }

  // Grand totals
  const g = totals(receipts);
  autoTable(doc, {
    startY: startY + 4,
    body: [[
      { content: `TOTAL GENERAL (${receipts.length} empleados)`, colSpan: 5, styles: { halign: "right", fontStyle: "bold", fillColor: [40, 40, 60], textColor: 255 } } as any,
      { content: fmtMoney(g.total_percepciones), styles: { halign: "right", fontStyle: "bold", fillColor: [40, 40, 60], textColor: 255 } } as any,
      { content: fmtMoney(g.isr), styles: { halign: "right", fontStyle: "bold", fillColor: [40, 40, 60], textColor: 255 } } as any,
      { content: fmtMoney(g.imss_obrero), styles: { halign: "right", fontStyle: "bold", fillColor: [40, 40, 60], textColor: 255 } } as any,
      { content: fmtMoney(g.subsidio), styles: { halign: "right", fontStyle: "bold", fillColor: [40, 40, 60], textColor: 255 } } as any,
      { content: fmtMoney(g.total_deducciones), styles: { halign: "right", fontStyle: "bold", fillColor: [40, 40, 60], textColor: 255 } } as any,
      { content: fmtMoney(g.neto_pagar), styles: { halign: "right", fontStyle: "bold", fillColor: [40, 40, 60], textColor: 255 } } as any,
    ]],
    styles: { fontSize: 8, cellPadding: 3, overflow: "hidden", minCellHeight: 18 },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 167 },
      2: { cellWidth: 80 },
      3: { cellWidth: 32 },
      4: { cellWidth: 55 },
      5: { halign: "right", cellWidth: 60 },
      6: { halign: "right", cellWidth: 55 },
      7: { halign: "right", cellWidth: 55 },
      8: { halign: "right", cellWidth: 50 },
      9: { halign: "right", cellWidth: 55 },
      10: { halign: "right", cellWidth: 65 },
    },
    margin: { left: 40, right: 40 },
  });

  // Footer page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8).setTextColor(120);
    doc.text(`Página ${i} de ${pages} · Generado ${new Date().toLocaleString("es-MX")}`, 40, doc.internal.pageSize.getHeight() - 20);
  }

  const filename = `Nomina_${period.ejercicio}_P${period.numero}.pdf`;
  if (output === "blob") return doc.output("blob");
  if (output === "base64") return { filename, base64: doc.output("datauristring").split(",")[1] };
  doc.save(filename);
}
