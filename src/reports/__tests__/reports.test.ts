import { Comment, Job, Phase, Profile, Task, TimeEntry } from '@/data/schema';
import { compareJobs } from '../compare';
import { pdfName, reportDoc } from '../document';
import { escapeHtml, reportHtml } from '../html';
import { pdfSafe } from '../pdfWeb';
import { buildJobReport } from '../jobReport';

const job = (id: string, name = id): Job =>
  ({ id, name, job_number: '', customer: '', site_address: '', job_type: 'construction', status: 'released', quoted_total_hours: null, deadline: null }) as Job;
const phase = (id: string, jobId: string, order: number): Phase => ({ id, job_id: jobId, name: `Phase ${id}`, sort_order: order });
const task = (id: string, jobId: string, phaseId: string, line: string, name: string, sold: number, kind: Task['kind'] = 'planned'): Task =>
  ({ id, job_id: jobId, phase_id: phaseId, line_no: line, name, sold_hours: sold, kind, sort_order: Number(line) });
let n = 0;
const entry = (jobId: string, taskId: string, user: string, day: string, hours: number | string, edited = false): TimeEntry =>
  ({ id: `e${++n}`, job_id: jobId, task_id: taskId, user_id: user, work_date: day, hours: hours as number, note: '', edited });
const people: Profile[] = [
  { id: 'u1', full_name: 'Terry Tech', email: 't@x', role: 'tech', active: true },
  { id: 'u2', full_name: '', email: 'sam@x', role: 'tech', active: true },
];

describe('job report', () => {
  const j = job('j1', 'Highett');
  const phases = [phase('p2', 'j1', 1), phase('p1', 'j1', 0)];
  const tasks = [
    task('t1', 'j1', 'p1', '1', 'Induction', 8),
    task('t2', 'j1', 'p1', '2', 'Hoisting', 4),
    task('t3', 'j1', 'p2', '60', 'Other productive (VO)', 0, 'extra_productive'),
    task('t4', 'j1', 'p2', '61', 'Other non-productive', 0, 'extra_non_productive'),
    task('x', 'other', 'px', '1', 'Elsewhere', 99),
  ];
  const entries = [
    entry('j1', 't1', 'u1', '2026-10-14', 4),
    entry('j1', 't1', 'u2', '2026-10-14', '5.5', true),
    entry('j1', 't2', 'u1', '2026-10-15', 0.1),
    entry('j1', 't2', 'u1', '2026-10-15', 0.2),
    entry('j1', 't3', 'u1', '2026-10-16', 2),
    entry('j1', 't4', 'u2', '2026-10-16', 1.5),
    entry('other', 'x', 'u1', '2026-10-16', 50),
  ];
  const comments: Comment[] = [
    { id: 'c2', job_id: 'j1', task_id: null, user_id: 'u2', body: 'Builder late', created_at: '2026-10-16T02:00:00Z' },
    { id: 'c1', job_id: 'j1', task_id: 't1', user_id: 'u1', body: 'Pit ladder missing', created_at: '2026-10-14T02:00:00Z' },
  ];
  const r = buildJobReport({ job: j, phases, tasks, entries, profiles: people, comments, attachments: [], now: new Date('2026-10-19T00:00:00Z') });

  it('totals the job from its own lines only', () => {
    expect(r.totals).toEqual({ sold: 12, actual: 13.3, variance: 1.3, pct: 111 });
  });
  it('orders phases and adds them up without rounding drift', () => {
    expect(r.phases.map((p) => p.name)).toEqual(['Phase p1', 'Phase p2']);
    expect(r.phases[0].actual).toBe(9.8);
    expect(r.phases[0].tasks[1]).toMatchObject({ name: 'Hoisting', actual: 0.3, variance: -3.7, pct: 8 });
  });
  it('shows extras apart from the planned work', () => {
    expect(r.planned).toMatchObject({ sold: 12, actual: 9.8 });
    expect(r.extraProductive).toMatchObject({ sold: 0, actual: 2, pct: null });
    expect(r.extraNonProductive.actual).toBe(1.5);
  });
  it('breaks hours down by person and by day', () => {
    expect(r.people).toEqual([
      { userId: 'u1', name: 'Terry Tech', hours: 6.3, days: 3 },
      { userId: 'u2', name: 'sam@x', hours: 7, days: 2 },
    ].sort((a, b) => b.hours - a.hours));
    expect(r.days).toEqual([
      { day: '2026-10-14', hours: 9.5, people: 2 },
      { day: '2026-10-15', hours: 0.3, people: 1 },
      { day: '2026-10-16', hours: 3.5, people: 2 },
    ]);
    expect([r.firstDay, r.lastDay]).toEqual(['2026-10-14', '2026-10-16']);
    expect(r.editedEntries).toBe(1);
  });
  it('lists comments oldest first with their task', () => {
    expect(r.comments.map((c) => `${c.who}: ${c.task}: ${c.body}`)).toEqual([
      'Terry Tech: 1. Induction: Pit ladder missing',
      'sam@x: Whole job: Builder late',
    ]);
  });
});

describe('comparing jobs', () => {
  const jobs = [job('a', 'Alpha'), job('b', 'Bravo'), job('c', 'Charlie')];
  const tasks = [
    task('a1', 'a', 'p', '5', 'Rails  first set', 4),
    task('b1', 'b', 'p', '5', 'rails first set', 4),
    task('c1', 'c', 'p', '5', 'Rails first set', 4),
    task('a2', 'a', 'p', '9', 'Doors', 10),
    task('b2', 'b', 'p', '9', 'Doors', 10),
  ];
  const entries = [
    entry('a', 'a1', 'u1', '2026-10-01', 6),
    entry('b', 'b1', 'u1', '2026-10-01', 5),
    entry('a', 'a2', 'u1', '2026-10-01', 8),
    entry('b', 'b2', 'u1', '2026-10-01', 9),
  ];
  const r = compareJobs(jobs, tasks, entries);

  it('ranks jobs by how much of the sold hours they used', () => {
    expect(r.jobs.map((x) => [x.job.name, x.pct])).toEqual([
      ['Alpha', 100],
      ['Bravo', 100],
      ['Charlie', 0],
    ]);
    expect(r.totals).toMatchObject({ sold: 32, actual: 28 });
  });
  it('matches the same task across jobs and shows repeat over-runs first', () => {
    expect(r.tasks[0]).toMatchObject({ line_no: '5', jobs: 2, overOn: 2, sold: 8, actual: 11, variance: 3 });
    expect(r.tasks[1]).toMatchObject({ name: 'Doors', jobs: 2, overOn: 0, variance: -3 });
  });
});

describe('report document', () => {
  const j = { ...job('j1', 'Highett <Duplex>'), job_number: '0813190833', stops: 8, travel_height_m: 22.92 } as Job;
  const r = buildJobReport({
    job: j,
    phases: [phase('p1', 'j1', 0)],
    tasks: [task('t1', 'j1', 'p1', '1', 'Induction', 8), task('t2', 'j1', 'p1', '2', 'Hoisting', 4)],
    entries: [entry('j1', 't1', 'u1', '2026-10-14', 9)],
    profiles: people,
    comments: [],
    attachments: [],
  });

  it('shows percentages only when asked (PMs)', () => {
    const tech = reportDoc(r, { showPercent: false });
    const pm = reportDoc(r, { showPercent: true });
    expect(tech.tables[0].columns).not.toContain('Used');
    expect(tech.summary.map(([k]) => k)).toEqual(['Sold', 'Actual', 'Under']);
    expect(pm.tables[0].columns).toContain('Used');
    expect(pm.summary.find(([k]) => k === 'Used')?.[1]).toBe('75%');
  });

  it('marks over-sold lines and keeps lift details', () => {
    const d = reportDoc(r, { showPercent: false });
    const rows = d.tables[0].rows;
    const induction = rows.findIndex((x) => x[1] === 'Induction');
    expect(rows[induction].slice(2)).toEqual(['8', '9', '+1']);
    expect(d.tables[0].over).toContainEqual([induction, 4]);
    expect(rows[rows.length - 1]).toEqual(['', 'JOB TOTAL', '12', '9', '−3']);
    expect(d.details).toContainEqual(['Lift', '8 stops · 22.92 m travel']);
    expect(d.details.find(([k]) => k === 'Project No.')?.[1]).toBe('0813190833');
  });

  it('escapes text in the HTML', () => {
    expect(escapeHtml(`<b>"x" & 'y'</b>`)).toBe('&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;');
    const html = reportHtml(reportDoc(r, { showPercent: false }));
    expect(html).toContain('Highett &lt;Duplex&gt;');
    expect(html).not.toContain('<Duplex>');
  });

  it('keeps PDF text within the built-in font', () => {
    expect(pdfSafe('Hours 4 → 5 · −3 “ok” – fine ✓')).toBe('Hours 4 -> 5 · -3 “ok” – fine ?');
  });
});

describe('PDF file name', () => {
  it('is readable and safe', () => {
    expect(pdfName('Highett Common Building F - Duplex', '0813190833')).toBe('0813190833 Highett Common Building F - Duplex - hours report.pdf');
    expect(pdfName('A/B: "test"', '')).toBe('AB test - hours report.pdf');
    expect(pdfName('', '')).toBe('Job - hours report.pdf');
  });
});
