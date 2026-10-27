// Comparing jobs side by side (PMs): which jobs ran over, and which tasks
// run over again and again.

import { Job, Task, TimeEntry } from '@/data/schema';
import { Line, line } from './jobReport';

export interface JobRow extends Line {
  job: Job;
}

export interface RepeatTask extends Line {
  key: string;
  line_no: string;
  name: string;
  jobs: number; // jobs that have this task with hours logged
  overOn: number; // of those, how many went over
}

const c = (n: number | string) => Math.round((Number(n) || 0) * 100);
// Same line on different jobs: matched by line number and name, ignoring case
// and spacing ("Shaft survey" on one job = "shaft  survey" on another).
const keyOf = (t: Task) => `${t.line_no.trim()}|${t.name.trim().toLowerCase().replace(/\s+/g, ' ')}`;

export function compareJobs(
  jobs: readonly Job[],
  tasks: readonly Task[],
  entries: readonly TimeEntry[],
  soldByTask: ReadonlyMap<string, number>,
) {
  const ids = new Set(jobs.map((j) => j.id));
  const actualByTask = new Map<string, number>();
  const actualByJob = new Map<string, number>();
  for (const e of entries) {
    if (!ids.has(e.job_id)) continue;
    actualByTask.set(e.task_id, (actualByTask.get(e.task_id) ?? 0) + c(e.hours));
    actualByJob.set(e.job_id, (actualByJob.get(e.job_id) ?? 0) + c(e.hours));
  }
  const soldByJob = new Map<string, number>();
  const groups = new Map<string, { line_no: string; name: string; sold: number; actual: number; jobs: number; over: number }>();
  for (const t of tasks) {
    if (!ids.has(t.job_id)) continue;
    const sold = c(soldByTask.get(t.id) ?? 0);
    soldByJob.set(t.job_id, (soldByJob.get(t.job_id) ?? 0) + sold);
    const a = actualByTask.get(t.id) ?? 0;
    if (!a) continue; // not started on that job — says nothing about the task yet
    const g = groups.get(keyOf(t)) ?? { line_no: t.line_no, name: t.name, sold: 0, actual: 0, jobs: 0, over: 0 };
    g.sold += sold;
    g.actual += a;
    g.jobs += 1;
    if (a > sold) g.over += 1;
    groups.set(keyOf(t), g);
  }

  const jobRows: JobRow[] = jobs
    .map((job) => ({ job, ...line(soldByJob.get(job.id) ?? 0, actualByJob.get(job.id) ?? 0) }))
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || a.job.name.localeCompare(b.job.name));

  const repeat: RepeatTask[] = Array.from(groups, ([key, g]) => ({
    key,
    line_no: g.line_no,
    name: g.name,
    jobs: g.jobs,
    overOn: g.over,
    ...line(g.sold, g.actual),
  })).sort((a, b) => b.variance - a.variance || a.name.localeCompare(b.name));

  const all = jobRows.reduce((s, r) => [s[0] + c(r.sold), s[1] + c(r.actual)], [0, 0]);
  return { jobs: jobRows, tasks: repeat, totals: line(all[0], all[1]) };
}
