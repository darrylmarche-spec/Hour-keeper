import Papa from 'papaparse';
import readXlsxFile from 'read-excel-file/universal';
import { extractPdfLines } from './pdfText';
import { Cell, ParsedSheet, parseRows, parseTextLines } from './taskSheet';

export interface PickedFile {
  name: string;
  mimeType?: string | null;
  bytes: ArrayBuffer;
}

export type FileKind = 'xlsx' | 'csv' | 'pdf';

export class ImportError extends Error {}

export function fileKind(name: string, mimeType?: string | null): FileKind | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'xlsx' || mimeType?.includes('spreadsheetml')) return 'xlsx';
  if (ext === 'csv' || mimeType === 'text/csv') return 'csv';
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf';
  return null;
}

export async function readTaskFile(file: PickedFile): Promise<ParsedSheet> {
  const kind = fileKind(file.name, file.mimeType);
  const ext = file.name.toLowerCase().split('.').pop();
  if (!kind) {
    if (ext === 'xls') throw new ImportError('Old .xls files can’t be read. In Excel, use Save As → Excel Workbook (.xlsx).');
    throw new ImportError('Choose an Excel (.xlsx), CSV or PDF file.');
  }

  if (kind === 'csv') {
    const text = new TextDecoder('utf-8').decode(file.bytes).replace(/^﻿/, '');
    const { data } = Papa.parse<string[]>(text, { skipEmptyLines: false });
    return parseRows(data as Cell[][]);
  }

  if (kind === 'xlsx') {
    let sheets;
    try {
      sheets = await readXlsxFile(file.bytes);
    } catch {
      throw new ImportError('This Excel file couldn’t be opened. Check it isn’t password-protected, then try again.');
    }
    // Use the sheet with the most task lines.
    let best: ParsedSheet | null = null;
    for (const s of sheets) {
      const parsed = parseRows(s.data as Cell[][]);
      if (!best || parsed.lines.length > best.lines.length) best = parsed;
    }
    return best ?? parseRows([]);
  }

  let lines: string[];
  try {
    lines = await extractPdfLines(file.bytes);
  } catch {
    throw new ImportError('This PDF couldn’t be read. Try exporting the sheet from Excel as .xlsx or CSV instead.');
  }
  const parsed = parseTextLines(lines);
  if (!lines.join('').trim()) {
    parsed.warnings.push(
      'This PDF has no readable text — it looks like a scan or photo. Export the sheet from Excel as .xlsx or CSV instead.',
    );
  }
  return parsed;
}
