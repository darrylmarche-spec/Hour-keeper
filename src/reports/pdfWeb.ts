// The report document drawn as a real PDF in the browser (jsPDF), so the web
// app can share or save it without opening a print window.

import type { jsPDF as JsPDF } from 'jspdf';
import { ReportDoc } from './document';

const RED: [number, number, number] = [204, 0, 0];
const CHARCOAL: [number, number, number] = [43, 43, 43];

// jsPDF's built-in fonts cover Latin-1 / Windows-1252 only.
export function pdfSafe(s: string): string {
  return s
    .replace(/−/g, '-')
    .replace(/→/g, '->')
    .replace(/[^\x00-\xFF–—‘’“”•…€]/g, '?');
}

export async function renderPdf(d: ReportDoc): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc: JsPDF = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 36;
  const t = pdfSafe;

  doc.setFillColor(...RED);
  doc.rect(0, 0, W, 64, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(t(d.title), M, 30, { maxWidth: W - 2 * M });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(t(d.subtitle), M, 48);

  let y = 84;
  doc.setTextColor(17, 17, 17);
  doc.setFontSize(9.5);
  for (const [k, v] of d.details) {
    doc.setTextColor(85, 85, 85);
    doc.text(t(k), M, y);
    doc.setTextColor(17, 17, 17);
    const lines = doc.splitTextToSize(t(v), W - 2 * M - 100);
    doc.text(lines, M + 100, y);
    y += 13 * lines.length;
  }

  y += 6;
  const boxW = (W - 2 * M - 8 * (d.summary.length - 1)) / d.summary.length;
  d.summary.forEach(([k, v], i) => {
    const x = M + i * (boxW + 8);
    doc.setFillColor(238, 238, 238);
    doc.rect(x, y, boxW, 40, 'F');
    doc.setFontSize(8);
    doc.setTextColor(68, 68, 68);
    doc.text(t(k.toUpperCase()), x + boxW / 2, y + 13, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(17, 17, 17);
    doc.text(t(v), x + boxW / 2, y + 32, { align: 'center' });
    doc.setFont('helvetica', 'normal');
  });
  y += 56;

  for (const table of d.tables) {
    if (y > doc.internal.pageSize.getHeight() - 90) {
      doc.addPage();
      y = M;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(17, 17, 17);
    doc.text(t(table.heading), M, y);
    doc.setDrawColor(...RED);
    doc.setLineWidth(1.5);
    doc.line(M, y + 4, W - M, y + 4);
    doc.setFont('helvetica', 'normal');
    y += 12;
    if (table.note) {
      doc.setFontSize(8.5);
      doc.setTextColor(85, 85, 85);
      const lines = doc.splitTextToSize(t(table.note), W - 2 * M);
      doc.text(lines, M, y + 6);
      y += 11 * lines.length + 2;
    }
    const strong = new Set(table.strong ?? []);
    const over = new Set((table.over ?? []).map(([r, c]) => `${r}:${c}`));
    const columnStyles: Record<number, { halign: 'right' }> = {};
    for (const i of table.numeric) columnStyles[i] = { halign: 'right' };
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [table.columns.map(t)],
      body: table.rows.map((r) => r.map(t)),
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 3, textColor: [17, 17, 17], lineColor: [221, 221, 221], lineWidth: { bottom: 0.5 } },
      headStyles: { fillColor: CHARCOAL, textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles,
      didParseCell: (data) => {
        if (table.numeric.includes(data.column.index)) data.cell.styles.halign = 'right';
        if (data.section !== 'body') return;
        if (strong.has(data.row.index)) {
          data.cell.styles.fillColor = [228, 228, 228];
          data.cell.styles.fontStyle = 'bold';
        }
        if (over.has(`${data.row.index}:${data.column.index}`)) {
          data.cell.styles.textColor = [204, 34, 34];
          data.cell.styles.fontStyle = 'bold';
        }
      },
    } as Parameters<typeof autoTable>[1]);
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 22;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(102, 102, 102);
    const H = doc.internal.pageSize.getHeight();
    doc.text(t(d.footer), M, H - 18);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 18, { align: 'right' });
  }
  return doc.output('blob');
}
