import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import fs from "fs";

const doc = new jsPDF({ unit: "pt", format: "a4" });
const W = doc.internal.pageSize.getWidth();
const M = 40;
let y = 40;

// ---------- Helpers ----------
function title(text, size = 16, color = [20, 20, 20]) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size);
  doc.setTextColor(...color);
  doc.text(text, M, y);
  y += size + 10;
}
function subtitle(text, size = 12, color = [60, 60, 60]) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size);
  doc.setTextColor(...color);
  doc.text(text, M, y);
  y += size + 6;
}
function para(text, size = 10, color = [40, 40, 40]) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  doc.setTextColor(...color);
  const lines = doc.splitTextToSize(text, W - 2 * M);
  for (const ln of lines) {
    if (y > 780) { doc.addPage(); y = 40; }
    doc.text(ln, M, y);
    y += size + 4;
  }
  y += 4;
}
function question(n, text) {
  if (y > 740) { doc.addPage(); y = 40; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 30, 90);
  const lines = doc.splitTextToSize(`P${n}. ${text}`, W - 2 * M);
  for (const ln of lines) {
    if (y > 780) { doc.addPage(); y = 40; }
    doc.text(ln, M, y);
    y += 13;
  }
  y += 4;
}
function spacer(h = 8) { y += h; }

function fmt(n) {
  return "$" + Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------- Portada ----------
title("REPORTE DE AUDITORÍA", 20, [20, 20, 20]);
subtitle("Conciliación de importación contable Aspel COI → CPfiscalPro", 13);
spacer(6);
para(`Fecha de generación: ${new Date().toLocaleString("es-MX")}`);
para(`Organización: 7145db9f-18fd-4729-9050-3f5c8f2e533e`);
para(`Periodo auditado: Diciembre 2022 — Mayo 2026 (5 ejercicios)`);
para(`Fuente original: COI10EMPRE13 1.FDB (Aspel COI)`);
para(`Destino: Supabase (CPfiscalPro)`);
spacer(10);

// ---------- Resumen ejecutivo ----------
subtitle("1. Resumen ejecutivo", 14);
para(
  "Se realizó la reimportación completa del catálogo de pólizas y auxiliares desde el FDB original de Aspel COI hacia el sistema CPfiscalPro. El análisis de conciliación entre los saldos mensuales (account_balances) y los movimientos registrados en pólizas (journal_lines) arrojó los siguientes resultados:"
);
spacer(4);

autoTable(doc, {
  startY: y,
  head: [["Métrica", "Valor"]],
  body: [
    ["Total comparaciones (cuenta × mes)", "22,214"],
    ["Comparaciones que cuadran", "21,927 (98.71%)"],
    ["Diferencias detectadas", "287 (1.29%)"],
    ["  • Cierre de ejercicio (Dic/Ene)", "280"],
    ["  • Ajustes manuales sin póliza", "7"],
    ["Pólizas importadas", "6,296"],
    ["Líneas de auxiliar importadas", "40,070"],
  ],
  theme: "grid",
  headStyles: { fillColor: [30, 60, 120], textColor: 255, fontStyle: "bold" },
  bodyStyles: { fontSize: 10 },
  columnStyles: { 0: { cellWidth: 320 }, 1: { cellWidth: 200, halign: "right" } },
  margin: { left: M, right: M },
});
y = doc.lastAutoTable.finalY + 16;

// ---------- 2. Hallazgos ----------
subtitle("2. Hallazgos significativos", 14);

subtitle("2.1 Pólizas de cierre de ejercicio (periodo 13 de Aspel)", 11, [120, 40, 40]);
para(
  "Aspel COI permite registrar pólizas en un periodo 13 (cierre de ejercicio) con fecha 31 de diciembre, destinadas al asiento de cierre, registro de ISR/PTU y actualización de CUCA/CUFIN. CPfiscalPro no contempla periodo 13, por lo que estas pólizas se contabilizan en diciembre (mes 12) según su fecha calendario. Esto genera diferencias compensadas entre diciembre y enero que no afectan el Estado de Resultados (que se calcula con base en account_balances)."
);
spacer(4);
autoTable(doc, {
  startY: y,
  head: [["Ejercicio", "Pólizas periodo 13", "Concepto"]],
  body: [
    ["2022", "1", "Registro de CUCA y CUFIN"],
    ["2023", "2", "Póliza de cierre + CUCA/CUFIN"],
    ["2024", "3", "ISR/PTU + Cierre + CUCA/CUFIN"],
    ["2025", "3", "ISR/PTU + CUCA/CUFIN + Cierre"],
  ],
  theme: "grid",
  headStyles: { fillColor: [120, 40, 40], textColor: 255 },
  bodyStyles: { fontSize: 9 },
  margin: { left: M, right: M },
});
y = doc.lastAutoTable.finalY + 12;

subtitle("2.2 Ajustes manuales sin póliza (7 diferencias aisladas)", 11, [120, 40, 40]);
para(
  "Se detectaron 7 casos en los que los saldos mensuales registrados en Aspel COI no coincen con la suma de movimientos en pólizas. Estos ajustes fueron realizados directamente sobre los saldos en Aspel sin generar la póliza contable correspondiente. Se requiere confirmación de los contadores para determinar si procede la elaboración de pólizas de ajuste en CPfiscalPro."
);
spacer(4);
autoTable(doc, {
  startY: y,
  head: [["Año-Mes", "Cuenta", "Nombre", "Diferencia"]],
  body: [
    ["2022-12", "310000100000000000002", "CAPITAL SOCIAL FIJO", "$100,000.00"],
    ["2022-12", "117000200000000000002", "SOCIOS Y ACCIONISTAS", "$100,000.00"],
    ["2023-01", "910000700000000000002", "CUCA DE EJ. ANTERIORES", "$100,000.00"],
    ["2023-01", "920000700000000000002", "CONTRA CUCA", "$100,000.00"],
    ["2023-08", "112000100100000000003", "BANORTE CTA.1226811847", "$28,698.00"],
    ["2023-10", "112000100100000000003", "BANORTE CTA.1226811847", "$108,812.66"],
    ["2023-10", "136000200000000000002", "DEPRECIACIÓN EQ. TRANSPORTE", "-$7,672.08"],
    ["2023-11", "112000100100000000003", "BANORTE CTA.1226811847", "$119,066.68"],
    ["2023-11", "136000200000000000002", "DEPRECIACIÓN EQ. TRANSPORTE", "-$7,672.08"],
    ["2024-02", "112000100100000000003", "BANORTE CTA.1226811847", "$27,134.07"],
    ["2024-03", "112000100100000000003", "BANORTE CTA.1226811847", "$44,740.48"],
  ],
  theme: "grid",
  headStyles: { fillColor: [120, 40, 40], textColor: 255 },
  bodyStyles: { fontSize: 8 },
  columnStyles: { 3: { halign: "right" } },
  margin: { left: M, right: M },
});
y = doc.lastAutoTable.finalY + 12;

subtitle("2.3 Error de captura en catálogo de cuentas", 11, [120, 40, 40]);
para(
  "La cuenta 212000100100000000003 registra en el catálogo de cuentas del FDB original el nombre “JOSE JUAN LABRA ROSAANO” (con doble A). Sin embargo, en los conceptos de las pólizas el contador escribió correctamente “JOSE JUAN LABRA ROSSANO” (con doble S). El error proviene del alta de la cuenta en Aspel COI, no de la importación. Se verificaron los bytes en FDB, JSON intermedio y Supabase, los tres son idénticos."
);

doc.addPage();
y = 40;

// ---------- 3. Sueldos Abril/Mayo ----------
subtitle("3. Análisis de sueldos y nómina — Abril y Mayo 2026", 14);
para(
  "Se detallan los montos de las cuentas relacionadas con nómina para los meses de abril y mayo 2026. Todos los movimientos se registran en pólizas de tipo diario (pago de nómina semanal y honorarios asimilados)."
);
spacer(4);

autoTable(doc, {
  startY: y,
  head: [["Cuenta / Concepto", "Abril 2026", "Mayo 2026"]],
  body: [
    ["610000100000000000002 — SUELDOS Y SALARIOS", fmt(172011.77), fmt(233392.07)],
    ["610000200000000000002 — ASIMILADOS A SALARIOS", fmt(11395.14), fmt(12768.96)],
    ["610002000000000000002 — IMPUESTO SOBRE NÓMINA (3%)", fmt(5803.00), fmt(7560.00)],
    ["TOTAL NÓMINA DEL MES", fmt(189209.91), fmt(253721.03)],
    ["", "", ""],
    ["Saldo acumulado YTD Sueldos", fmt(735618.22), fmt(969010.29)],
    ["Saldo acumulado YTD Asimilados", fmt(44879.98), fmt(57648.94)],
    ["Saldo acumulado YTD ISN", fmt(23778.00), fmt(31338.00)],
  ],
  theme: "grid",
  headStyles: { fillColor: [30, 100, 60], textColor: 255 },
  bodyStyles: { fontSize: 9 },
  columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
  margin: { left: M, right: M },
});
y = doc.lastAutoTable.finalY + 10;

para("Detalle de las 5 pólizas de nómina de Mayo 2026 (cuenta 610000100000000000002):", 10, [60, 60, 60]);
autoTable(doc, {
  startY: y,
  head: [["Póliza", "Fecha", "Periodo de nómina", "Importe"]],
  body: [
    ["Diario #100002", "2026-05-02", "27-04-2026 al 03-05-2026", fmt(46678.41)],
    ["Diario #100018", "2026-05-09", "04-05-2026 al 10-05-2026", fmt(47413.51)],
    ["Diario #100040", "2026-05-16", "11-05-2026 al 17-05-2026", fmt(47045.97)],
    ["Diario #100062", "2026-05-23", "18-05-2026 al 24-05-2026", fmt(46310.86)],
    ["Diario #100063", "2026-05-30", "25-05-2026 al 31-05-2026", fmt(45943.32)],
    ["TOTAL", "", "", fmt(233392.07)],
  ],
  theme: "grid",
  headStyles: { fillColor: [60, 60, 60], textColor: 255 },
  bodyStyles: { fontSize: 9 },
  columnStyles: { 3: { halign: "right" } },
  margin: { left: M, right: M },
});
y = doc.lastAutoTable.finalY + 16;

// ---------- 4. Preguntas para los contadores ----------
doc.addPage();
y = 40;
subtitle("4. Preguntas para los contadores", 14);
para(
  "Las siguientes preguntas deben ser formuladas a los contadores que entregaron la base de datos original de Aspel COI, con el fin de cerrar las brechas detectadas y validar la integridad de la información migrada a CPfiscalPro."
);
spacer(8);

question(1, "¿Las pólizas de cierre de ejercicio (periodo 13 de Aspel COI) que se registran con fecha 31 de diciembre deben conservarse en CPfiscalPro como pólizas del mes de diciembre, o prefieren que se asignen a un mes de cierre separado para no mezclarlas con la operación normal del mes?");
question(2, "¿Las diferencias en las cuentas de BANORTE CTA.1226811847 (acumuladas de agosto 2023 a marzo 2024 por aproximadamente $228,238) corresponden a ajustes de conciliación bancaria que se cargaron directamente a saldos sin póliza? ¿Procederá elaborar las pólizas de ajuste correspondientes en CPfiscalPro?");
question(3, "El asiento de capital social de $100,000 registrado en diciembre 2022 con su contra-asiento en CUCA de enero 2023 no tiene póliza contable que lo respalde. ¿Se elaboró ese asiento directamente sobre saldos en Aspel? ¿Se requiere la póliza de capitalización en CPfiscalPro?");
question(4, "Las diferencias de depreciación de equipo de transporte (cuenta 136000200000000000002, $7,672 mensuales en oct-nov 2023) que figuran en saldos pero no en pólizas, ¿corresponden a una depreciación calculada automáticamente por Aspel que no generó póliza? ¿Desean que se replique el cálculo en CPfiscalPro o se generará manualmente?");
question(5, "La cuenta 212000100100000000003 aparece en el catálogo como “JOSE JUAN LABRA ROSAANO” (con doble A) pero en los conceptos de pólizas se escribe correctamente “ROSSANO” (con doble S). ¿Se corrige el nombre en el catálogo de cuentas o se conserva por motivos fiscales (RFC, facturas)?");
question(6, "En mayo 2026 el total de sueldos cargados asciende a $233,392.07 distribuidos en 5 pólizas semanales. ¿Estos importes coinciden con los pagos reportados en NOI (Aspel NOI)? ¿La base del 3% de Impuesto sobre Nómina ($7,560) se calculó sobre la base gravada correcta?");
question(7, "Las notas de crédito (NC 70-74) al proveedor JOSE JUAN LABRA ROSSANO por $45,295.71 registradas en la póliza Dr #33 del 25 de mayo 2026, ¿están debidamente amparadas con los CFDI de nota de crédito correspondientes? ¿La reducción del pasivo y del costo de venta se aplicó correctamente?");
question(8, "¿Las pólizas de tipo “Cheques” (Ch) y “Transferencia” (Tr) del FDB original se pueden consolidar en CPfiscalPro bajo los tipos estándar “Egreso” y “Diario” respectivamente, o requieren conservar el tipo original mediante un campo adicional en el sistema?");
question(9, "El periodo 13 de Aspel COI de 2024 ($9,187,004 de movimientos en 31-dic) y 2025 ($10,798,887) contienen los asientos de cierre que afectan las cuentas de ingresos, costos y gastos. ¿Se desea que estas pólizas se excluyan de los reportes mensuales de diciembre y se presenten aparte como “cierre de ejercicio”?");
question(10, "¿Se requiere que el sistema CPfiscalPro emita un reporte de conciliación mensual automático que compare los saldos de account_balances contra la suma de movimientos en journal_lines, para detectar oportunamente ajustes sin póliza?");

spacer(10);
y = Math.max(y, 700);
doc.setFont("helvetica", "italic");
doc.setFontSize(9);
doc.setTextColor(100, 100, 100);
para("Documento generado por CPfiscalPro — Herramienta de auditoría de importación contable. Los montos y comparaciones aquí presentados derivan de la conciliación entre el FDB original de Aspel COI y la base de datos de Supabase.", 9, [120, 120, 120]);

// ---------- Guardar ----------
const outPath = "D:\\Aplicaciones Web\\CPfiscalPro\\auditoria-importacion.pdf";
const buf = doc.output("arraybuffer");
fs.writeFileSync(outPath, Buffer.from(buf));
console.log(`PDF generado: ${outPath}`);
console.log(`Tamaño: ${(Buffer.from(buf).length / 1024).toFixed(1)} KB`);
