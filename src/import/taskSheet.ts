// Reads a job's task sheet (rows from Excel/CSV, or text lines from a PDF)
// into numbered task lines with sold hours.
//
// Built around the Highett sheet layout:
//   <job name>                         Total Allowed Hours 193 =
//                                       Allowance | Actual
//   0.Dismantling                        0
//   1. Induction, ACW, shaft site walk   8
// but tolerant of a separate line-number column, extra columns, and blank rows.
// Nothing here is final: every result goes to the check-before-save screen.

export type Cell = string | number | boolean | Date | null | undefined;

export interface ParsedLine {
  lineNo: string;
  name: string;
  hours: number | null;
  issues: string[];
}

export interface ParsedSheet {
  title: string | null;
  quotedTotal: number | null;
  lines: ParsedLine[];
  warnings: string[];
}

const HOURS_HEADER = /\b(allowance|allowed|sold|budget(ed)?|hours|hrs|qty hours|est(imate)?)\b/i;
const ACTUAL_HEADER = /\b(actual|used|spent)\b/i;
const TOTAL_LABEL = /total\s+(allowed|sold|budget(ed)?)?\s*(hours|hrs)/i;
// "12. Name", "12.Name", "12) Name", "12 - Name", "12 Name"
const NUMBERED_NAME = /^\s*(\d{1,3}[a-z]?)\s*(?:[.)\-:]\s*|\s+)(\S.*)$/i;
const NUMBER = /^-?\d+(?:[.,]\d+)?$/;

function text(c: Cell): string {
  if (c === null || c === undefined) return '';
  if (c instanceof Date) return '';
  return String(c).replace(/\s+/g, ' ').trim();
}

function toNumber(c: Cell): number | null {
  if (typeof c === 'number') return Number.isFinite(c) ? c : null;
  const t = text(c).replace(/hrs?$/i, '').trim();
  if (!NUMBER.test(t)) return null;
  return Number(t.replace(',', '.'));
}

function hasLetters(s: string): boolean {
  return /[a-z]/i.test(s);
}

// Pull "193" out of "Total Allowed Hours 193 =" (or from the next cell).
function findQuotedTotal(row: Cell[]): number | null {
  for (let i = 0; i < row.length; i++) {
    const t = text(row[i]);
    if (!TOTAL_LABEL.test(t)) continue;
    const inline = t.replace(TOTAL_LABEL, '').match(/(\d+(?:[.,]\d+)?)/);
    if (inline) return Number(inline[1].replace(',', '.'));
    for (let j = i + 1; j < row.length; j++) {
      const n = toNumber(row[j]);
      if (n !== null) return n;
    }
  }
  return null;
}

export function parseRows(rows: Cell[][]): ParsedSheet {
  const warnings: string[] = [];
  let title: string | null = null;
  let quotedTotal: number | null = null;
  let hoursCol: number | null = null;
  let actualCol: number | null = null;
  const lines: ParsedLine[] = [];

  for (const row of rows) {
    const cells = row.map(text);
    if (cells.every((c) => !c)) continue;

    const total = findQuotedTotal(row);
    if (total !== null && quotedTotal === null) quotedTotal = total;

    // Header row: names the hours column ("Allowance") and maybe "Actual".
    const hdr = cells.findIndex((c) => HOURS_HEADER.test(c) && !TOTAL_LABEL.test(c) && c.length < 30);
    if (hdr >= 0 && lines.length === 0 && !cells.some((c) => NUMBERED_NAME.test(c) && hasLetters(c))) {
      // Column positions are only trustworthy when the header has a cell (even
      // an empty one) in front of the hours column, i.e. it lines up with the
      // task column. PDF text and hand-made sheets often don't; then the first
      // number after the task name is used, which is the allowance on these
      // sheets (it comes before "Actual").
      if (hdr > 0) {
        hoursCol = hdr;
        const act = cells.findIndex((c) => ACTUAL_HEADER.test(c));
        actualCol = act > hdr ? act : null;
      }
      continue;
    }

    // Find the task name: first cell with letters that isn't the total label.
    const nameIdx = cells.findIndex((c) => hasLetters(c) && !TOTAL_LABEL.test(c));
    if (nameIdx < 0) continue;
    let name = cells[nameIdx];
    let lineNo = '';

    const numbered = name.match(NUMBERED_NAME);
    if (numbered) {
      lineNo = numbered[1];
      name = numbered[2].trim();
    } else if (nameIdx > 0 && /^\d{1,3}[a-z]?\.?$/i.test(cells[nameIdx - 1])) {
      lineNo = cells[nameIdx - 1].replace(/\.$/, '');
    }

    if (!lineNo) {
      // The first un-numbered line before any tasks is the job title.
      if (lines.length === 0 && title === null) title = name;
      continue;
    }

    // Hours: the "Allowance" column if we found one, otherwise the first number
    // after the name (skipping an "Actual" column if known).
    let hours: number | null = null;
    const issues: string[] = [];
    if (hoursCol !== null && hoursCol > nameIdx) {
      const raw = row[hoursCol];
      hours = toNumber(raw);
      if (hours === null && text(raw)) issues.push(`Couldn't read hours "${text(raw)}"`);
    } else {
      for (let i = nameIdx + 1; i < row.length; i++) {
        if (i === actualCol) continue;
        const n = toNumber(row[i]);
        if (n !== null) {
          hours = n;
          break;
        }
      }
    }
    if (hours === null && issues.length === 0) issues.push('No hours found');
    if (hours !== null && hours < 0) {
      issues.push('Negative hours');
      hours = null;
    }
    lines.push({ lineNo, name, hours, issues });
  }

  // Line numbers that repeat or go backwards usually mean a typo on the sheet
  // (the Highett sheet has "16." where 13 and 15 belong).
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(l.lineNo, (counts.get(l.lineNo) ?? 0) + 1);
  lines.forEach((l, i) => {
    if (counts.get(l.lineNo)! > 1) {
      l.issues.push(`Line number ${l.lineNo} is used more than once`);
      return;
    }
    const prev = lines[i - 1];
    if (prev && parseInt(l.lineNo, 10) < parseInt(prev.lineNo, 10)) {
      l.issues.push(`Line number ${l.lineNo} comes after ${prev.lineNo}`);
    }
  });

  if (!lines.length) warnings.push('No numbered task lines were found in this file.');
  else if (lines.filter((l) => l.issues.length).length > lines.length / 2) {
    warnings.push('Most lines in this file couldn’t be read cleanly — check it’s the job’s hours sheet.');
  }

  return { title, quotedTotal, lines, warnings };
}

// PDF text arrives as lines of words. Split each line into "cells" on runs of
// 2+ spaces (column gaps) so it can go through the same row parser.
export function parseTextLines(textLines: string[]): ParsedSheet {
  const rows: Cell[][] = textLines.map((line) => {
    const parts = line.split(/\s{2,}|\t/).map((s) => s.trim()).filter(Boolean);
    // "Hoistway wiring (1hr per floor) 9" with only single spaces: peel a
    // trailing number off as its own cell.
    if (parts.length === 1) {
      const m = parts[0].match(/^(.*\D)\s+(\d+(?:[.,]\d+)?)$/);
      if (m && NUMBERED_NAME.test(m[1])) return [m[1].trim(), m[2]];
    }
    return parts;
  });
  return parseRows(rows);
}

export function sumHours(lines: { hours: number | null }[]): number {
  return Math.round(lines.reduce((s, l) => s + (l.hours ?? 0) * 100, 0)) / 100;
}
