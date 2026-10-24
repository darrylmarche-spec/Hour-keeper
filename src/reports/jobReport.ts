// Everything a job report shows, worked out once from the device's data.
// The screen and both PDF renderers read from this, so they always agree.

import { Attachment, Comment, Job, Phase, Profile, Task, TaskKind, TimeEntry } from '@/data/schema';

export interface Line {
  sold: number;
  actual: number;
  variance: number; // actual − sold: positive = over
  pct: number | null; // actual as % of sold; null when nothing was sold
}

export interface TaskLine extends Line {
  id: string;
  line_no: string;
  name: string;
  kind: TaskKind;
}

export interface PhaseLine extends Line {
  id: string;
  name: string;
  tasks: TaskLine[];
}

export interface PersonLine {
  userId: string;
  name: string;
  hours: number;
  days: number;
}

export interface DayLine {
  day: string;
  hours: number;
  people: number;
}

export interface CommentLine {
  who: string;
  when: string;
  task: string;
  body: string;
}

export type PeopleScope = 'all' | 'self';

export interface JobReport {
  job: Job;
  generatedAt: string;
  totals: Line;
  planned: Line;
  extraProductive: Line;
  extraNonProductive: Line;
  phases: PhaseLine[];
  // Who worked the hours. Alphabetical, never ranked by hours (that would be a
  // league table of people). 'self' = a tech's own line only.
  people: PersonLine[];
  peopleScope: PeopleScope;
  days: DayLine[];
  comments: CommentLine[];
  photos: number;
  files: number;
  firstDay: string | null;
  lastDay: string | null;
  editedEntries: number;
}

// Sums are kept in hundredths so 0.1 + 0.2 style errors never show.
const c = (n: number | string) => Math.round((Number(n) || 0) * 100);
export function line(soldCents: number, actualCents: number): Line {
  return {
    sold: soldCents / 100,
    actual: actualCents / 100,
    variance: (actualCents - soldCents) / 100,
    pct: soldCents === 0 ? null : Math.round((actualCents / soldCents) * 100),
  };
}

export interface ReportInput {
  job: Job;
  phases: readonly Phase[];
  tasks: readonly Task[];
  entries: readonly TimeEntry[];
  profiles: readonly Profile[];
  comments: readonly Comment[];
  attachments: readonly Attachment[];
  // Whose report this is. With peopleScope 'self', the people table shows only
  // this person (techs see their own hours, not their colleagues').
  viewerId?: string;
  peopleScope?: PeopleScope;
  now?: Date;
}

export function buildJobReport(input: ReportInput): JobReport {
  const { job } = input;
  const phases = input.phases.filter((p) => p.job_id === job.id).sort((a, b) => a.sort_order - b.sort_order);
  const tasks = input.tasks.filter((t) => t.job_id === job.id).sort((a, b) => a.sort_order - b.sort_order);
  const entries = input.entries.filter((e) => e.job_id === job.id);
  const nameOf = (id: string) => {
    const p = input.profiles.find((x) => x.id === id);
    return p?.full_name || p?.email || 'Unknown';
  };

  const actualByTask = new Map<string, number>();
  for (const e of entries) actualByTask.set(e.task_id, (actualByTask.get(e.task_id) ?? 0) + c(e.hours));

  const kindSums: Record<TaskKind, [number, number]> = {
    planned: [0, 0],
    extra_productive: [0, 0],
    extra_non_productive: [0, 0],
  };
  const phaseLines: PhaseLine[] = phases.map((p) => {
    let ps = 0;
    let pa = 0;
    const lines: TaskLine[] = tasks
      .filter((t) => t.phase_id === p.id)
      .map((t) => {
        const s = c(t.sold_hours);
        const a = actualByTask.get(t.id) ?? 0;
        ps += s;
        pa += a;
        kindSums[t.kind][0] += s;
        kindSums[t.kind][1] += a;
        return { id: t.id, line_no: t.line_no, name: t.name, kind: t.kind, ...line(s, a) };
      });
    return { id: p.id, name: p.name, tasks: lines, ...line(ps, pa) };
  });
  const sold = tasks.reduce((s, t) => s + c(t.sold_hours), 0);
  // Hours on tasks that have since been removed still count toward the job.
  const actual = entries.reduce((s, e) => s + c(e.hours), 0);

  const byPerson = new Map<string, { cents: number; days: Set<string> }>();
  const byDay = new Map<string, { cents: number; people: Set<string> }>();
  for (const e of entries) {
    const p = byPerson.get(e.user_id) ?? { cents: 0, days: new Set<string>() };
    p.cents += c(e.hours);
    p.days.add(e.work_date);
    byPerson.set(e.user_id, p);
    const d = byDay.get(e.work_date) ?? { cents: 0, people: new Set<string>() };
    d.cents += c(e.hours);
    d.people.add(e.user_id);
    byDay.set(e.work_date, d);
  }
  const peopleScope = input.peopleScope ?? 'all';
  const people = Array.from(byPerson, ([userId, v]) => ({ userId, name: nameOf(userId), hours: v.cents / 100, days: v.days.size }))
    .filter((p) => peopleScope === 'all' || p.userId === input.viewerId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.userId.localeCompare(b.userId));
  const days = Array.from(byDay, ([day, v]) => ({ day, hours: v.cents / 100, people: v.people.size })).sort((a, b) =>
    a.day.localeCompare(b.day),
  );

  const taskName = (id: string | null) => {
    if (!id) return 'Whole job';
    const t = tasks.find((x) => x.id === id);
    return t ? `${t.line_no}. ${t.name}` : 'Removed task';
  };
  const comments = input.comments
    .filter((x) => x.job_id === job.id)
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    .map((x) => ({ who: nameOf(x.user_id), when: x.created_at ?? '', task: taskName(x.task_id), body: x.body }));
  const atts = input.attachments.filter((a) => a.job_id === job.id);

  return {
    job,
    generatedAt: (input.now ?? new Date()).toISOString(),
    totals: line(sold, actual),
    planned: line(...kindSums.planned),
    extraProductive: line(...kindSums.extra_productive),
    extraNonProductive: line(...kindSums.extra_non_productive),
    phases: phaseLines,
    people,
    peopleScope,
    days,
    comments,
    photos: atts.filter((a) => a.mime_type.startsWith('image/')).length,
    files: atts.filter((a) => !a.mime_type.startsWith('image/')).length,
    firstDay: days[0]?.day ?? null,
    lastDay: days[days.length - 1]?.day ?? null,
    editedEntries: entries.filter((e) => e.edited).length,
  };
}
