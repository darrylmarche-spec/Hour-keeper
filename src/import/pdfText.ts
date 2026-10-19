// Turns the text of a PDF into lines, keeping column gaps as double spaces so
// the row parser can tell "1. Induction …" apart from the hours column.
// Works for PDFs that contain real text (exported from Excel/Word or an
// estimating program). A photo or scan of a printed sheet has no text to read.

export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function linesFromTextItems(items: TextItem[]): string[] {
  const rows: TextItem[][] = [];
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  for (const item of sorted) {
    const tolerance = Math.max(2, item.height * 0.4);
    const row = rows.find((r) => Math.abs(r[0].y - item.y) <= tolerance);
    if (row) row.push(item);
    else rows.push([item]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    let line = '';
    let end = -Infinity;
    for (const item of row) {
      const gap = item.x - end;
      if (line) line += gap > Math.max(item.height, 6) * 1.5 ? '   ' : gap > 0.5 ? ' ' : '';
      line += item.str;
      end = item.x + item.width;
    }
    return line.trim();
  });
}

interface PdfJs {
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean }): { promise: Promise<PdfDoc> };
  GlobalWorkerOptions: { workerSrc: string };
}
interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<{
    getTextContent(): Promise<{ items: { str?: string; transform?: number[]; width?: number; height?: number }[] }>;
  }>;
}

export async function extractPdfLines(bytes: ArrayBuffer, pdfjs?: PdfJs): Promise<string[]> {
  const lib: PdfJs = pdfjs ?? ((await import('pdfjs-dist')) as unknown as PdfJs);
  if (!pdfjs && typeof window !== 'undefined') lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const doc = await lib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    const items: TextItem[] = content.items
      .filter((i) => typeof i.str === 'string' && i.transform)
      .map((i) => ({
        str: i.str!,
        x: i.transform![4],
        y: i.transform![5],
        width: i.width ?? 0,
        height: i.height || Math.abs(i.transform![3]) || 10,
      }));
    lines.push(...linesFromTextItems(items));
  }
  return lines;
}
