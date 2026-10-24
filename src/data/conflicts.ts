// Working out what changed in an edit, whether it clashes with someone else's
// change, and how to say so in plain words.
//
// An edit is sent as only the fields that were actually changed, along with
// what those fields were when the edit began (the "base"). The server applies
// it only if nobody else has changed those same fields since. That way:
//   - two people editing different things on the same row (the tech's note,
//     the PM's hours) both keep their changes, and
//   - two people changing the same thing never overwrite each other silently.

import { dayLabel } from '../logging/dates';
import { TableName } from './schema';

type Row = Record<string, unknown>;

// Columns the server sets or that never count as an edit. ("edited" is set
// by the database whenever an entry is changed, so two people editing
// different things must not clash over it.)
const SERVER_OWNED = new Set(['id', 'updated_at', 'edited']);

// Values come from the server as numbers, strings or null; local edits may
// leave a field undefined where the server has null. Numbers and numeric
// strings compare by value ("4.00" equals 4).
export function sameValue(a: unknown, b: unknown): boolean {
  const na = a === undefined ? null : a;
  const nb = b === undefined ? null : b;
  if (na === nb) return true;
  if (na === null || nb === null) return false;
  if (typeof na === 'object' || typeof nb === 'object') return JSON.stringify(na) === JSON.stringify(nb);
  if ((typeof na === 'number' || typeof nb === 'number') && String(na).trim() !== '' && String(nb).trim() !== '') {
    const x = Number(na);
    const y = Number(nb);
    if (!Number.isNaN(x) && !Number.isNaN(y)) return x === y;
  }
  return false;
}

// The fields of `row` that differ from `base`.
export function changedFields(row: Row, base: Row): Row {
  const out: Row = {};
  for (const k of Object.keys(row)) {
    if (SERVER_OWNED.has(k)) continue;
    if (!sameValue(row[k], base[k])) out[k] = row[k];
  }
  return out;
}

// Which of my changed fields has someone else changed too (the server's
// current value no longer matches what I started from)?
export function clashingFields(changes: Row, base: Row, theirs: Row): string[] {
  return Object.keys(changes).filter((k) => !sameValue(theirs[k], base[k]));
}

// ── Plain words ─────────────────────────────────────────────────────────────

const LABELS: Partial<Record<TableName, Record<string, string>>> = {
  time_entries: { hours: 'Hours', work_date: 'Date', note: 'Note', task_id: 'Task', deleted_at: 'Removed' },
  tasks: { name: 'Name', sold_hours: 'Sold hours', line_no: 'Line number', phase_id: 'Phase', sort_order: 'Order', kind: 'Type', deleted_at: 'Removed' },
  phases: { name: 'Name', sort_order: 'Order', deleted_at: 'Removed' },
  jobs: {
    name: 'Name',
    job_number: 'Project No.',
    quotation_number: 'Quotation No.',
    customer: 'Customer',
    site_address: 'Site address',
    status: 'Status',
    deadline: 'Deadline',
    stops: 'Stops',
    travel_height_m: 'Travel',
    deleted_at: 'Removed',
  },
  comments: { body: 'Comment', deleted_at: 'Removed' },
  attachments: { deleted_at: 'Removed' },
};

export interface Lookups {
  taskName?: (id: string) => string | undefined;
}

function show(table: TableName, field: string, value: unknown, look?: Lookups): string {
  if (value === null || value === undefined || value === '') return field === 'deleted_at' ? 'no' : 'blank';
  if (field === 'deleted_at') return 'yes';
  if (table === 'time_entries' && field === 'hours') return `${Number(value)} hrs`;
  if (field === 'task_id') return look?.taskName?.(String(value)) ?? 'another task';
  return String(value);
}

export interface ConflictLine {
  field: string;
  label: string;
  mine: string;
  theirs: string;
}

// One line per field that clashes: what I changed it to, and what it is now.
export function describeConflict(table: TableName, mine: Row, base: Row, theirs: Row, look?: Lookups): ConflictLine[] {
  const labels = LABELS[table] ?? {};
  const changes = changedFields(mine, base);
  return clashingFields(changes, base, theirs).map((field) => ({
    field,
    label: labels[field] ?? field.replace(/_/g, ' '),
    mine: show(table, field, mine[field], look),
    theirs: show(table, field, theirs[field], look),
  }));
}

export const CONFLICT_MESSAGE = 'Someone else changed this while you were offline.';

// What the person is told when a change was refused outright (not a clash).
export const NOT_ALLOWED_MESSAGE =
  'This wasn’t saved. The job may have been completed, or you may have been taken off it. Your change is kept here so nothing is lost — tell your PM.';

// A short line saying which change this is, e.g. "5 hrs on Tue 20 Oct · Induction".
export function describeRow(table: TableName, row: Row, look?: Lookups): string {
  switch (table) {
    case 'time_entries': {
      const task = row.task_id ? look?.taskName?.(String(row.task_id)) : undefined;
      const day = typeof row.work_date === 'string' ? dayLabel(row.work_date) : '';
      return [`${Number(row.hours)} hrs`, day && `on ${day}`, task && `· ${task}`].filter(Boolean).join(' ');
    }
    case 'comments':
      return `“${String(row.body ?? '').slice(0, 80)}”`;
    case 'attachments':
      return String(row.file_name ?? 'a photo or file');
    case 'tasks':
    case 'phases':
    case 'jobs':
      return String(row.name ?? '');
    default:
      return '';
  }
}
