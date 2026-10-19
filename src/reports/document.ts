// The report as a plain document: title, details and tables. Written once
// here; the HTML (phones) and jsPDF (web) renderers just draw it.

import { formatHours } from '@/data/totals';
import { STATUS_LABELS } from '@/lib/roles';
import { JobReport, Line } from './jobReport';

export interface DocTable {
  heading: string;
  note?: string;
  columns: string[];
  // Right-aligned number columns, by index.
  numeric: number[];
  rows: string[][];
  // Rows drawn as a sub-heading (phase rows) or a total, by index.
  strong?: number[];
  // Cells to draw in red (over sold), as [row, column].
  over?: [number, number][];
}

export interface ReportDoc {
  title: string;
  subtitle: string;
  details: [string, string][];
  summary: [string, string][];
  tables: DocTable[];
  footer: string;
}

const h = (n: number) => formatHours(n);
const signed = (n: number) => (n > 0 ? `+${h(n)}` : n < 0 ? `−${h(-n)}` : '0');
const pct = (l: Line) => (l.pct === null ? '—' : `${l.pct}%`);

export function dayText(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function reportDoc(r: JobReport, opts: { showPercent: boolean }): ReportDoc {
  const { job } = r;
  const pctCols = opts.showPercent ? ['Used'] : [];
  const lineCells = (l: Line) => [h(l.sold), h(l.actual), signed(l.variance), ...(opts.showPercent ? [pct(l)] : [])];
  const numeric = opts.showPercent ? [2, 3, 4, 5] : [2, 3, 4];

  // Tasks, grouped under their phase rows.
  const rows: string[][] = [];
  const strong: number[] = [];
  const over: [number, number][] = [];
  for (const p of r.phases) {
    strong.push(rows.length);
    if (p.variance > 0) over.push([rows.length, 4]);
    rows.push(['', p.name.toUpperCase(), ...lineCells(p)]);
    for (const t of p.tasks) {
      if (t.variance > 0) over.push([rows.length, 4]);
      const tag = t.kind === 'extra_productive' ? ' (extra · productive)' : t.kind === 'extra_non_productive' ? ' (extra · non-productive)' : '';
      rows.push([t.line_no, t.name + tag, ...lineCells(t)]);
    }
  }
  strong.push(rows.length);
  if (r.totals.variance > 0) over.push([rows.length, 4]);
  rows.push(['', 'JOB TOTAL', ...lineCells(r.totals)]);

  const tables: DocTable[] = [
    {
      heading: 'Sold vs actual by task',
      columns: ['Line', 'Task', 'Sold', 'Actual', 'Over / under', ...pctCols],
      numeric,
      rows,
      strong,
      over,
    },
    {
      heading: 'Planned work and extras',
      note: 'Extras are hours booked to the "Other" lines: variations (productive) and site readiness (non-productive).',
      columns: ['Type', 'Sold', 'Actual', 'Over / under', ...pctCols],
      numeric: numeric.map((i) => i - 1),
      rows: [
        ['Planned work', ...lineCells(r.planned)],
        ['Extra · productive (VO)', ...lineCells(r.extraProductive)],
        ['Extra · non-productive', ...lineCells(r.extraNonProductive)],
      ],
    },
  ];
  if (r.people.length) {
    tables.push({
      heading: 'Hours by person',
      columns: ['Person', 'Days on site', 'Hours'],
      numeric: [1, 2],
      rows: r.people.map((p) => [p.name, String(p.days), h(p.hours)]),
    });
    tables.push({
      heading: 'Hours by day',
      columns: ['Day', 'People', 'Hours'],
      numeric: [1, 2],
      rows: r.days.map((d) => [dayText(d.day), String(d.people), h(d.hours)]),
    });
  }
  if (r.comments.length) {
    tables.push({
      heading: 'Comments',
      columns: ['When', 'Who', 'Task', 'Comment'],
      numeric: [],
      rows: r.comments.map((c) => [c.when ? dayText(c.when.slice(0, 10)) : '', c.who, c.task, c.body]),
    });
  }

  const summary: [string, string][] = [
    ['Sold', `${h(r.totals.sold)} hrs`],
    ['Actual', `${h(r.totals.actual)} hrs`],
    [r.totals.variance > 0 ? 'Over' : 'Under', `${h(Math.abs(r.totals.variance))} hrs`],
  ];
  if (opts.showPercent) summary.push(['Used', pct(r.totals)]);

  const details: [string, string][] = (
    [
      ['Project No.', job.job_number],
      ['Quotation No.', job.quotation_number ?? ''],
      ['Customer', job.customer],
      ['Site', job.site_address],
      ['Lift', [job.stops ? `${job.stops} stops` : '', job.travel_height_m ? `${h(Number(job.travel_height_m))} m travel` : ''].filter(Boolean).join(' · ')],
      ['Status', STATUS_LABELS[job.status]],
      ['Work dates', r.firstDay ? (r.firstDay === r.lastDay ? dayText(r.firstDay) : `${dayText(r.firstDay)} – ${dayText(r.lastDay!)}`) : 'No hours logged yet'],
      ['Photos & files', r.photos || r.files ? `${r.photos} photo${r.photos === 1 ? '' : 's'}, ${r.files} file${r.files === 1 ? '' : 's'} (in the app)` : ''],
      ['Edited entries', r.editedEntries ? `${r.editedEntries} (history kept in the app)` : ''],
    ] as [string, string][]
  ).filter(([, v]) => v);

  return {
    title: job.name,
    subtitle: 'Sold vs actual hours',
    details,
    summary,
    tables,
    footer: `Hour Keeper · produced ${new Date(r.generatedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}`,
  };
}

export function pdfName(jobName: string, jobNumber: string): string {
  const base = [jobNumber, jobName].filter(Boolean).join(' ').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, ' ');
  return `${base || 'Job'} - hours report.pdf`;
}
