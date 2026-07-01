import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { MXN } from "@/lib/format";

type Item = {
  codigo: string;
  nombre: string;
  perVal: number;
  ytdVal: number;
  perPct: number;
  ytdPct: number;
};

type ErData = {
  ingresos: Item[];
  costos: Item[];
  gastosOp: Record<string, Item[]>;
  gastosOpTotals: Record<string, { perVal: number; ytdVal: number }>;
  gastosOpDef: Record<string, { label: string; prefix: string }>;
  otrosGrupos: Record<string, Item[]>;
  otrosGrupoTotals: Record<string, { perVal: number; ytdVal: number }>;
  otrosDef: Record<string, { label: string; prefix: string }>;
  ventasPer: number;
  ventasYTD: number;
  totalIngresosPer: number;
  totalIngresosYTD: number;
  totalCostosPer: number;
  totalCostosYTD: number;
  totalGastosPer: number;
  totalGastosYTD: number;
  totalOtrosIngresosPer: number;
  totalOtrosIngresosYTD: number;
  totalOtrosGastosPer: number;
  totalOtrosGastosYTD: number;
  utilidadBrutaPer: number;
  utilidadBrutaYTD: number;
  utilidadOperacionPer: number;
  utilidadOperacionYTD: number;
  utilidadNetaPer: number;
  utilidadNetaYTD: number;
};

type SplitData = {
  helix: { nomina: number; imss: number; isn: number; honorarios: number };
  laross: { nomina: number; imss: number; isn: number; honorarios: number };
};

function fm(n: number) {
  return MXN.format(n);
}
function pct(v: number, base: number) {
  return base !== 0 ? (v / base) * 100 : 0;
}

export function generateResultadosPDF(
  org: { razon_social: string; rfc: string; regimen?: string },
  er: ErData,
  desde: number,
  hasta: number,
  ejercicio: number,
  detalle = true,
  split?: SplitData | null,
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const colW = pageW - margin * 2;
  const col1 = colW * 0.4;
  const col2 = colW * 0.15;
  const col3 = colW * 0.1;
  const col4 = colW * 0.2;
  const col5 = colW * 0.15;

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
  const periodoLabel = `${desde === 1 ? "Enero" : meses[desde - 1]} - ${meses[hasta - 1]}`;

  function header() {
    doc.setFont("helvetica", "bold").setFontSize(14);
    doc.text(org.razon_social || "—", margin, 40);
    doc.setFont("helvetica", "normal").setFontSize(9);
    doc.text(`RFC: ${org.rfc || "—"}`, margin, 56);
    doc.setFont("helvetica", "bold").setFontSize(12);
    doc.text("Estado de Resultados", margin, 78);
    doc.setFont("helvetica", "normal").setFontSize(9);
    doc.text(`Periodo: ${periodoLabel} · Ejercicio ${ejercicio}`, margin, 92);
    doc.text(`Generado: ${new Date().toLocaleString("es-MX")}`, margin, 104);
  }

  const periodLabelH = `${desde === 1 ? "Enero" : meses[desde - 1]} - ${meses[hasta - 1]}`;

  function sectionHead(label: string, color: [number, number, number]) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable?.finalY ?? 118,
      body: [
        [
          {
            content: label,
            colSpan: 5,
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
  }

  function colRow() {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable?.finalY ?? 118,
      head: [
        [
          {
            content: "Cuenta",
            rowSpan: 2,
            styles: {
              halign: "left",
              fontStyle: "bold",
              fontSize: 7.5,
              fillColor: [240, 240, 245],
              textColor: 60,
            },
          },
          {
            content: periodLabelH,
            colSpan: 2,
            styles: {
              halign: "center",
              fontStyle: "bold",
              fontSize: 7.5,
              fillColor: [240, 240, 245],
              textColor: 60,
            },
          },
          {
            content: `Acumulado ${ejercicio}`,
            colSpan: 2,
            styles: {
              halign: "center",
              fontStyle: "bold",
              fontSize: 7.5,
              fillColor: [240, 240, 245],
              textColor: 60,
            },
          },
        ],
        [
          {
            content: "Importe",
            styles: {
              halign: "right",
              fontStyle: "bold",
              fontSize: 7.5,
              fillColor: [240, 240, 245],
              textColor: 60,
            },
          },
          {
            content: "%",
            styles: {
              halign: "right",
              fontStyle: "bold",
              fontSize: 7.5,
              fillColor: [240, 240, 245],
              textColor: 60,
            },
          },
          {
            content: "Importe",
            styles: {
              halign: "right",
              fontStyle: "bold",
              fontSize: 7.5,
              fillColor: [240, 240, 245],
              textColor: 60,
            },
          },
          {
            content: "%",
            styles: {
              halign: "right",
              fontStyle: "bold",
              fontSize: 7.5,
              fillColor: [240, 240, 245],
              textColor: 60,
            },
          },
        ],
      ],
      margin: { left: margin, right: margin },
      tableLineWidth: 0,
      styles: { fontSize: 7.5, cellPadding: 3, lineColor: 200, lineWidth: 0.3 },
      headStyles: { fillColor: [240, 240, 245], textColor: 60, lineWidth: 0 },
      columnStyles: {
        0: { cellWidth: col1 },
        1: { cellWidth: col2, halign: "right" },
        2: { cellWidth: col3, halign: "right" },
        3: { cellWidth: col4, halign: "right" },
        4: { cellWidth: col5, halign: "right" },
      },
    });
  }

  function subSection(label: string, items: Item[], isOp: boolean) {
    const hasMov = items.some((c: any) => Math.abs(c.perVal) > 0.01 || Math.abs(c.ytdVal) > 0.01);
    if (!hasMov) return;

    autoTable(doc, {
      startY: (doc as any).lastAutoTable?.finalY ?? 118,
      head: [
        [
          {
            content: label,
            colSpan: 5,
            styles: {
              halign: "left",
              fontStyle: "bold",
              fontSize: 8,
              textColor: isOp ? [146, 64, 14] : [6, 95, 70],
              cellPadding: [4, 4, 2, 12],
            },
          },
        ],
      ],
      body: detalle
        ? items
            .filter((c: any) => Math.abs(c.perVal) > 0.01 || Math.abs(c.ytdVal) > 0.01)
            .map((c) => [
              {
                content: `${c.codigo.replace(/^0+/, "")} — ${c.nombre}`,
                styles: { fontSize: 7.5, cellPadding: [2, 4, 2, 20] },
              },
              { content: fm(c.perVal), styles: { halign: "right", fontSize: 7.5 } },
              {
                content: `${c.perPct.toFixed(2)}%`,
                styles: { halign: "right", fontSize: 7.5, textColor: 100 },
              },
              { content: fm(c.ytdVal), styles: { halign: "right", fontSize: 7.5 } },
              {
                content: `${c.ytdPct.toFixed(2)}%`,
                styles: { halign: "right", fontSize: 7.5, textColor: 100 },
              },
            ])
        : [],
      margin: { left: margin, right: margin },
      tableLineWidth: 0,
      styles: { fontSize: 8, cellPadding: 3, lineColor: 230, lineWidth: 0.3 },
      headStyles: { fillColor: [255, 255, 255], lineWidth: 0 },
      columnStyles: {
        0: { cellWidth: col1 },
        1: { cellWidth: col2, halign: "right" },
        2: { cellWidth: col3, halign: "right" },
        3: { cellWidth: col4, halign: "right" },
        4: { cellWidth: col5, halign: "right" },
      },
    });
  }

  function totalRow(
    label: string,
    perVal: number,
    ytdVal: number,
    opts?: {
      color?: [number, number, number];
      topBorder?: boolean;
      big?: boolean;
      percentage?: boolean;
    },
  ) {
    const c: [number, number, number] = opts?.color ?? (perVal >= 0 ? [20, 20, 30] : [190, 80, 60]);
    const pctVal = opts?.percentage !== false ? pct(perVal, er.ventasPer) : 0;
    const ytdPctVal = opts?.percentage !== false ? pct(ytdVal, er.ventasYTD) : 0;
    autoTable(doc, {
      startY: (doc as any).lastAutoTable?.finalY ?? 118,
      body: [
        [
          {
            content: label,
            styles: {
              fontStyle: "bold",
              fontSize: opts?.big ? 10 : 8.5,
              cellPadding: opts?.big ? [6, 4, 6, 4] : [4, 4, 4, 4],
            },
          },
          {
            content: fm(perVal),
            styles: {
              halign: "right",
              fontStyle: "bold",
              fontSize: opts?.big ? 10 : 8.5,
              textColor: c,
              cellPadding: opts?.big ? [6, 4, 6, 4] : [4, 4, 4, 4],
            },
          },
          {
            content: opts?.percentage !== false ? `${pctVal.toFixed(2)}%` : "",
            styles: {
              halign: "right",
              fontSize: opts?.big ? 9 : 7.5,
              textColor: 100,
              cellPadding: opts?.big ? [6, 4, 6, 4] : [4, 4, 4, 4],
            },
          },
          {
            content: fm(ytdVal),
            styles: {
              halign: "right",
              fontStyle: "bold",
              fontSize: opts?.big ? 10 : 8.5,
              textColor: c,
              cellPadding: opts?.big ? [6, 4, 6, 4] : [4, 4, 4, 4],
            },
          },
          {
            content: opts?.percentage !== false ? `${ytdPctVal.toFixed(2)}%` : "",
            styles: {
              halign: "right",
              fontSize: opts?.big ? 9 : 7.5,
              textColor: 100,
              cellPadding: opts?.big ? [6, 4, 6, 4] : [4, 4, 4, 4],
            },
          },
        ],
      ],
      margin: { left: margin, right: margin },
      tableLineWidth: 0,
      styles: { fontSize: 8, cellPadding: 3, lineColor: c, lineWidth: opts?.topBorder ? 0.8 : 0.3 },
      columnStyles: {
        0: { cellWidth: col1 },
        1: { cellWidth: col2, halign: "right" },
        2: { cellWidth: col3, halign: "right" },
        3: { cellWidth: col4, halign: "right" },
        4: { cellWidth: col5, halign: "right" },
      },
    });
  }

  function spacer(h = 6) {
    const y = (doc as any).lastAutoTable?.finalY ?? 118;
    autoTable(doc, {
      startY: y,
      body: [[{ content: "", colSpan: 5, styles: { cellPadding: h / 2, fontSize: 1 } }]],
      margin: { left: margin, right: margin },
      tableLineWidth: 0,
      styles: { lineWidth: 0, fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: col1 },
        1: { cellWidth: col2 },
        2: { cellWidth: col3 },
        3: { cellWidth: col4 },
        4: { cellWidth: col5 },
      },
    });
  }

  header();
  colRow();

  function itemRow(c: Item, pl = 16) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable?.finalY ?? 118,
      body: [
        [
          {
            content: `${c.codigo.replace(/^0+/, "")} — ${c.nombre}`,
            styles: { fontSize: 7.5, cellPadding: [2, 4, 2, pl] },
          },
          { content: fm(c.perVal), styles: { halign: "right", fontSize: 7.5 } },
          {
            content: `${c.perPct.toFixed(2)}%`,
            styles: { halign: "right", fontSize: 7.5, textColor: 100 },
          },
          { content: fm(c.ytdVal), styles: { halign: "right", fontSize: 7.5 } },
          {
            content: `${c.ytdPct.toFixed(2)}%`,
            styles: { halign: "right", fontSize: 7.5, textColor: 100 },
          },
        ],
      ],
      margin: { left: margin, right: margin },
      tableLineWidth: 0,
      styles: { fontSize: 8, cellPadding: 3, lineColor: 235, lineWidth: 0.3 },
      columnStyles: {
        0: { cellWidth: col1 },
        1: { cellWidth: col2, halign: "right" },
        2: { cellWidth: col3, halign: "right" },
        3: { cellWidth: col4, halign: "right" },
        4: { cellWidth: col5, halign: "right" },
      },
    });
  }

  // --- INGRESOS ---
  sectionHead("INGRESOS", [37, 99, 235]);
  for (const c of er.ingresos) itemRow(c);
  totalRow("Total Ingresos", er.totalIngresosPer, er.totalIngresosYTD, {
    color: [22, 163, 74],
    topBorder: true,
  });

  // --- COSTOS ---
  sectionHead("COSTOS", [190, 80, 60]);
  for (const c of er.costos) itemRow(c);
  totalRow("Total Costos", -er.totalCostosPer, -er.totalCostosYTD, {
    color: [190, 80, 60],
    topBorder: true,
  });

  // --- UTILIDAD BRUTA ---
  spacer();
  totalRow("Utilidad Bruta", er.utilidadBrutaPer, er.utilidadBrutaYTD, {
    big: true,
    topBorder: true,
    color: er.utilidadBrutaPer >= 0 ? [20, 20, 30] : [190, 80, 60],
  });

  // --- GASTOS DE OPERACIÓN ---
  sectionHead("GASTOS DE OPERACIÓN", [217, 119, 6]);
  for (const [key, def] of Object.entries(er.gastosOpDef)) {
    const items = er.gastosOp[key] || [];
    const hasMov = items.some((c: any) => Math.abs(c.perVal) > 0.01 || Math.abs(c.ytdVal) > 0.01);
    if (!hasMov && key === "otros") continue;
    if (key === "venta") {
      subSection("Gastos de Operación", items, true);
    } else {
      subSection(def.label, items, true);
    }
    const tot = er.gastosOpTotals[key];
    if (tot && (Math.abs(tot.perVal) > 0.01 || Math.abs(tot.ytdVal) > 0.01)) {
      totalRow(`Total ${def.label}`, tot.perVal, tot.ytdVal, { color: [217, 119, 6] });
    }
  }
  spacer(4);
  totalRow("Total Gastos de Operación", er.totalGastosPer, er.totalGastosYTD, {
    color: [217, 119, 6],
    topBorder: true,
  });

  // --- HELIX-LAROSS SPLIT (informativo) ---
  if (split) {
    sectionHead("HELIX-LAROSS (solo informativo)", [124, 58, 237]);
    autoTable(doc, {
      startY: (doc as any).lastAutoTable?.finalY ?? 118,
      head: [
        [
          {
            content: "Concepto",
            styles: {
              halign: "left",
              fontStyle: "bold",
              fontSize: 7.5,
              fillColor: [245, 243, 255],
              textColor: [107, 33, 168],
            },
          },
          {
            content: "HELIX",
            styles: {
              halign: "right",
              fontStyle: "bold",
              fontSize: 7.5,
              fillColor: [245, 243, 255],
              textColor: [107, 33, 168],
            },
          },
          { content: "", styles: { fillColor: [245, 243, 255] } },
          {
            content: "HELIX-LAROSS",
            styles: {
              halign: "right",
              fontStyle: "bold",
              fontSize: 7.5,
              fillColor: [245, 243, 255],
              textColor: [107, 33, 168],
            },
          },
          { content: "", styles: { fillColor: [245, 243, 255] } },
        ],
      ],
      body: [
        ["Nómina", fm(split.helix.nomina), "", fm(split.laross.nomina), ""],
        ["IMSS", fm(split.helix.imss), "", fm(split.laross.imss), ""],
        ["ISN 3%", fm(split.helix.isn), "", fm(split.laross.isn), ""],
        ["Honorarios", fm(split.helix.honorarios), "", fm(split.laross.honorarios), ""],
      ].map((row) =>
        row.map((c) => ({ content: c, styles: { fontSize: 7.5, cellPadding: [2, 4, 2, 16] } })),
      ),
      margin: { left: margin, right: margin },
      tableLineWidth: 0,
      styles: { fontSize: 7.5, cellPadding: 3, lineColor: 230, lineWidth: 0.3 },
      headStyles: { lineWidth: 0 },
      columnStyles: {
        0: { cellWidth: col1 },
        1: { cellWidth: col2, halign: "right" },
        2: { cellWidth: col3 },
        3: { cellWidth: col4, halign: "right" },
        4: { cellWidth: col5 },
      },
    });
  }

  // --- UTILIDAD DE OPERACIÓN ---
  spacer();
  totalRow("Utilidad de Operación", er.utilidadOperacionPer, er.utilidadOperacionYTD, {
    big: true,
    topBorder: true,
    color: er.utilidadOperacionPer >= 0 ? [20, 20, 30] : [190, 80, 60],
  });

  // --- OTROS INGRESOS Y GASTOS ---
  sectionHead("OTROS INGRESOS Y GASTOS", [5, 150, 105]);
  for (const [key, def] of Object.entries(er.otrosDef)) {
    const items = er.otrosGrupos[key] || [];
    const hasMov = items.some((c: any) => Math.abs(c.perVal) > 0.01 || Math.abs(c.ytdVal) > 0.01);
    if (!hasMov) continue;
    subSection(def.label, items, false);
    const tot = er.otrosGrupoTotals[key];
    if (tot && (Math.abs(tot.perVal) > 0.01 || Math.abs(tot.ytdVal) > 0.01)) {
      totalRow(`Total ${def.label}`, tot.perVal, tot.ytdVal, { color: [5, 150, 105] });
    }
  }
  totalRow("Total Otros Ingresos", er.totalOtrosIngresosPer, er.totalOtrosIngresosYTD, {
    color: [5, 150, 105],
  });
  totalRow("Total Otros Gastos", -er.totalOtrosGastosPer, -er.totalOtrosGastosYTD, {
    color: [147, 51, 234],
  });

  // --- UTILIDAD NETA ---
  spacer();
  totalRow("Utilidad Neta", er.utilidadNetaPer, er.utilidadNetaYTD, {
    big: true,
    topBorder: true,
    color: er.utilidadNetaPer >= 0 ? [22, 163, 74] : [190, 80, 60],
  });

  // Footer page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7).setTextColor(130);
    doc.text(`Página ${i} de ${pages}`, margin, doc.internal.pageSize.getHeight() - 20);
    doc.text(org.razon_social, pageW - margin, doc.internal.pageSize.getHeight() - 20, {
      align: "right",
    });
  }

  doc.save(`Estado_Resultados_${ejercicio}_${periodoLabel.replace(/ /g, "_")}.pdf`);
}
