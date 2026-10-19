// Who can log and change hours, and checking an entry before it's saved.
// Mirrors the server's rules (supabase/migrations/0001_init.sql) so people get
// a clear answer on the spot instead of a refusal at the next sync.

import { Job, JobMember, Profile, TimeEntry, TimeEntryEdit } from '@/data/schema';
import { formatHours } from '@/data/totals';
import { managesJobs } from '@/lib/roles';
import { addDays, dayLabel, isValidDay, today } from './dates';

export type LogAccess = { ok: true } | { ok: false; reason: string };

export function canLog(job: Job, me: Profile, members: readonly JobMember[]): LogAccess {
  const onTeam = members.some((m) => m.job_id === job.id && m.user_id === me.id && !m.deleted_at);
  if (job.status === 'draft') return { ok: false, reason: 'Hours can be logged once this job is released to the field.' };
  if (job.status === 'complete') return { ok: false, reason: 'This job is complete, so no more hours can be logged.' };
  if (!onTeam) {
    return {
      ok: false,
      reason: managesJobs(me.role)
        ? 'You’re not on this job’s team. Add yourself under Team to log your own hours.'
        : 'You’re not on this job’s team.',
    };
  }
  return { ok: true };
}

// Techs change their own entries while the job is in the field; PMs,
// supervisors and admins can correct anyone's. Every change is recorded.
export function canEditEntry(entry: TimeEntry, job: Job, me: Profile, members: readonly JobMember[]): boolean {
  if (managesJobs(me.role)) return true;
  return entry.user_id === me.id && canLog(job, me, members).ok;
}

export interface EntryInput {
  hours: string;
  work_date: string;
}

export interface EntryCheck {
  hours?: string;
  work_date?: string;
  value?: { hours: number; work_date: string };
}

export function checkEntry(input: EntryInput, now = new Date()): EntryCheck {
  const out: EntryCheck = {};
  const t = input.hours.trim().replace(',', '.');
  const hours = /^\d+(\.\d+)?$/.test(t) ? Math.round(Number(t) * 100) / 100 : NaN;
  if (!t) out.hours = 'Enter the hours worked.';
  else if (Number.isNaN(hours)) out.hours = 'Enter a number, e.g. 4 or 2.5.';
  else if (hours <= 0) out.hours = 'Hours must be more than 0.';
  else if (hours > 24) out.hours = 'That’s more than 24 hours in one day.';

  if (!isValidDay(input.work_date)) out.work_date = 'Pick a date.';
  else if (input.work_date > addDays(today(now), 1)) out.work_date = 'That date is in the future.';

  if (!out.hours && !out.work_date) out.value = { hours, work_date: input.work_date };
  return out;
}

// A person's total on a day across every job on this device — used to warn
// (not block) when it goes past a normal shift.
export function dayTotal(entries: readonly TimeEntry[], userId: string, day: string, exceptId?: string): number {
  let cents = 0;
  for (const e of entries) {
    if (e.user_id === userId && e.work_date === day && e.id !== exceptId) cents += Math.round(Number(e.hours) * 100);
  }
  return cents / 100;
}

// One line per thing that changed, for the edit history.
export function describeEdit(edit: TimeEntryEdit, taskName: (id: string) => string, now = new Date()): string[] {
  const b = edit.before as Record<string, unknown>;
  const a = edit.after as Record<string, unknown>;
  if (!b.deleted && a.deleted) return ['Removed the entry'];
  if (b.deleted && !a.deleted) return ['Put the entry back'];
  const lines: string[] = [];
  if (Number(b.hours) !== Number(a.hours)) lines.push(`Hours ${formatHours(Number(b.hours))} → ${formatHours(Number(a.hours))}`);
  if (b.work_date !== a.work_date) lines.push(`Date ${dayLabel(String(b.work_date), now)} → ${dayLabel(String(a.work_date), now)}`);
  if (b.task_id !== a.task_id) lines.push(`Task ${taskName(String(b.task_id))} → ${taskName(String(a.task_id))}`);
  if ((b.note ?? '') !== (a.note ?? '')) lines.push(a.note ? `Note changed to “${a.note}”` : 'Note removed');
  return lines.length ? lines : ['No visible change'];
}
