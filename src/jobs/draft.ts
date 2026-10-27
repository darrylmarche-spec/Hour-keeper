// The editable copy of a job's details, phases and tasks used by the
// check-before-save screen and the task editor. Nothing here touches storage:
// draftToRows() turns a draft into the rows to save.

import { ParsedSheet } from '@/import/taskSheet';
import { Job, JobBudget, JobStatus, Phase, Task, TaskBudget, TaskKind, Template, TemplatePhase, TemplateTask, TimeEntry } from '@/data/schema';

export interface DraftTask {
  key: string;
  id?: string; // set when the task already exists
  lineNo: string;
  name: string;
  hours: string; // as typed
  kind: TaskKind;
  issues: string[]; // from the importer, shown until the PM edits the line
  loggedHours: number; // hours techs have logged (existing jobs)
}

export interface DraftPhase {
  key: string;
  id?: string;
  name: string;
  tasks: DraftTask[];
}

export interface JobDetails {
  name: string;
  job_number: string;
  quotation_number: string;
  customer: string;
  site_address: string;
  deadline: string; // YYYY-MM-DD or ''
  quoted_total: string;
  stops: string;
  travel: string;
}

export interface JobDraft {
  details: JobDetails;
  phases: DraftPhase[];
}

let keySeq = 0;
export const draftKey = () => `k${++keySeq}`;

export const emptyDetails = (): JobDetails => ({
  name: '',
  job_number: '',
  quotation_number: '',
  customer: '',
  site_address: '',
  deadline: '',
  quoted_total: '',
  stops: '',
  travel: '',
});

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(Number(n)));

export function newTask(partial: Partial<DraftTask> = {}): DraftTask {
  return { key: draftKey(), lineNo: '', name: '', hours: '', kind: 'planned', issues: [], loggedHours: 0, ...partial };
}

// ── Hours ──────────────────────────────────────────────────────

export function parseHours(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return 0;
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n > 9999 ? null : Math.round(n * 100) / 100;
}

export function draftTotal(d: JobDraft): number {
  let cents = 0;
  for (const p of d.phases) for (const t of p.tasks) cents += Math.round((parseHours(t.hours) ?? 0) * 100);
  return cents / 100;
}

// ── Building drafts ────────────────────────────────────────────

const EXTRA_PRODUCTIVE = /other productive|\bvo\b|variation/i;
const EXTRA_NON_PRODUCTIVE = /non[- ]?productive|site readiness|waiting/i;

function inferKind(name: string): TaskKind {
  if (EXTRA_NON_PRODUCTIVE.test(name)) return 'extra_non_productive';
  if (EXTRA_PRODUCTIVE.test(name)) return 'extra_productive';
  return 'planned';
}

// Every job keeps somewhere to log work that wasn't sold.
export function ensureExtraBuckets(d: JobDraft): JobDraft {
  const all = d.phases.flatMap((p) => p.tasks);
  const missing: DraftTask[] = [];
  if (!all.some((t) => t.kind === 'extra_productive')) {
    missing.push(newTask({ lineNo: '60', name: 'Other Productive hours (VO, etc)', hours: '0', kind: 'extra_productive' }));
  }
  if (!all.some((t) => t.kind === 'extra_non_productive')) {
    missing.push(
      newTask({ lineNo: '61', name: 'Other Non-Productive hours (site readiness, etc)', hours: '0', kind: 'extra_non_productive' }),
    );
  }
  if (!missing.length) return d;
  const phases = [...d.phases];
  const idx = phases.findIndex((p) => /other hours/i.test(p.name));
  if (idx >= 0) phases[idx] = { ...phases[idx], tasks: [...phases[idx].tasks, ...missing] };
  else phases.push({ key: draftKey(), name: 'Other hours', tasks: missing });
  return { ...d, phases };
}

export interface TemplateSource {
  template: Template;
  phases: readonly TemplatePhase[];
  tasks: readonly TemplateTask[];
}

export function draftFromTemplate(src: TemplateSource, details: JobDetails = emptyDetails()): JobDraft {
  const phases = src.phases
    .filter((p) => p.template_id === src.template.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map<DraftPhase>((p) => ({
      key: draftKey(),
      name: p.name,
      tasks: src.tasks
        .filter((t) => t.phase_id === p.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((t) => newTask({ lineNo: t.line_no, name: t.name, hours: fmt(t.sold_hours), kind: t.kind })),
    }));
  return ensureExtraBuckets({ details, phases });
}

export function blankDraft(details: JobDetails = emptyDetails()): JobDraft {
  return ensureExtraBuckets({ details, phases: [{ key: draftKey(), name: 'Tasks', tasks: [newTask()] }] });
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Imported lines go into the template's phases when they match its tasks
// (by name first, then line number); anything else goes under "Tasks".
export function draftFromParsed(parsed: ParsedSheet, src?: TemplateSource, details: JobDetails = emptyDetails()): JobDraft {
  const byName = new Map<string, { phase: string; kind: TaskKind }>();
  const byLine = new Map<string, { phase: string; kind: TaskKind }>();
  const phaseOrder: string[] = [];
  if (src) {
    const phases = src.phases.filter((p) => p.template_id === src.template.id).sort((a, b) => a.sort_order - b.sort_order);
    for (const p of phases) phaseOrder.push(p.name);
    for (const t of src.tasks) {
      const p = phases.find((ph) => ph.id === t.phase_id);
      if (!p) continue;
      byName.set(norm(t.name), { phase: p.name, kind: t.kind });
      byLine.set(t.line_no, { phase: p.name, kind: t.kind });
    }
  }

  const groups = new Map<string, DraftTask[]>();
  for (const line of parsed.lines) {
    const match = byName.get(norm(line.name)) ?? byLine.get(line.lineNo);
    const phase = match?.phase ?? 'Tasks';
    const kind = match ? match.kind : inferKind(line.name);
    const task = newTask({
      lineNo: line.lineNo,
      name: line.name,
      hours: line.hours === null ? '' : fmt(line.hours),
      kind,
      issues: line.issues,
    });
    groups.set(phase, [...(groups.get(phase) ?? []), task]);
  }

  const order = [...phaseOrder.filter((p) => groups.has(p)), ...[...groups.keys()].filter((p) => !phaseOrder.includes(p))];
  const phases = order.map<DraftPhase>((name) => ({ key: draftKey(), name, tasks: groups.get(name)! }));

  const d: JobDetails = { ...details };
  if (!d.name && parsed.title) d.name = parsed.title;
  if (!d.quoted_total && parsed.quotedTotal !== null) d.quoted_total = fmt(parsed.quotedTotal);
  return ensureExtraBuckets({ details: d, phases });
}

export function detailsFromJob(job: Job, quotedTotal?: number | null): JobDetails {
  return {
    name: job.name,
    job_number: job.job_number,
    quotation_number: job.quotation_number ?? '',
    customer: job.customer,
    site_address: job.site_address,
    deadline: job.deadline ?? '',
    quoted_total: fmt(quotedTotal),
    stops: fmt(job.stops),
    travel: fmt(job.travel_height_m),
  };
}

// The sold figures come from the office-only budget tables (see migration 0013).
export interface Budgets {
  soldByTask: ReadonlyMap<string, number>;
  quotedTotal?: number | null;
}

export function draftFromJob(
  job: Job,
  phases: readonly Phase[],
  tasks: readonly Task[],
  entries: readonly TimeEntry[],
  budgets: Budgets = { soldByTask: new Map() },
): JobDraft {
  const logged = new Map<string, number>();
  for (const e of entries) if (e.job_id === job.id) logged.set(e.task_id, (logged.get(e.task_id) ?? 0) + Number(e.hours));
  return {
    details: detailsFromJob(job, budgets.quotedTotal),
    phases: phases
      .filter((p) => p.job_id === job.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => ({
        key: draftKey(),
        id: p.id,
        name: p.name,
        tasks: tasks
          .filter((t) => t.phase_id === p.id)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((t) =>
            newTask({
              id: t.id,
              lineNo: t.line_no,
              name: t.name,
              hours: fmt(budgets.soldByTask.get(t.id)),
              kind: t.kind,
              loggedHours: logged.get(t.id) ?? 0,
            }),
          ),
      })),
  };
}

// ── Checking ───────────────────────────────────────────────────

export interface DraftProblems {
  details: Partial<Record<keyof JobDetails, string>>;
  tasks: Map<string, string>; // task key → problem
  phases: Map<string, string>;
  count: number;
}

export function checkDraft(d: JobDraft): DraftProblems {
  const details: DraftProblems['details'] = {};
  const tasks = new Map<string, string>();
  const phases = new Map<string, string>();
  if (!d.details.name.trim()) details.name = 'Give the job a name';
  if (d.details.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(d.details.deadline)) details.deadline = 'Use the format YYYY-MM-DD';
  if (d.details.quoted_total && parseHours(d.details.quoted_total) === null) details.quoted_total = 'Enter a number of hours';
  if (d.details.stops && !/^\d{1,3}$/.test(d.details.stops.trim())) details.stops = 'Enter a whole number';
  if (d.details.travel && parseHours(d.details.travel) === null) details.travel = 'Enter metres, e.g. 22.92';

  let taskCount = 0;
  for (const p of d.phases) {
    if (!p.name.trim()) phases.set(p.key, 'Give the phase a name');
    for (const t of p.tasks) {
      taskCount++;
      if (!t.name.trim()) tasks.set(t.key, 'Enter a task name');
      else if (parseHours(t.hours) === null) tasks.set(t.key, 'Hours must be a number, e.g. 4 or 2.5');
    }
  }
  if (!taskCount) phases.set('_', 'Add at least one task');
  return { details, tasks, phases, count: Object.keys(details).length + tasks.size + phases.size };
}

// ── Saving ─────────────────────────────────────────────────────

export interface SaveContext {
  jobId: string;
  existingJob?: Job;
  existingPhases: readonly Phase[];
  existingTasks: readonly Task[];
  // Today's sold figures, so only changed ones are saved.
  existingBudgets?: Budgets;
  userId: string;
  newId: () => string;
  now?: string;
  status?: JobStatus;
  templateId?: string | null;
}

export interface SaveRows {
  job: Job;
  phases: Phase[]; // new/changed, including soft-deleted
  tasks: Task[];
  // The sold figures: only the ones that are new or changed. Saved after the
  // job and its tasks, because each belongs to one of them.
  taskBudgets: TaskBudget[];
  jobBudget: JobBudget | null;
}

const num = (s: string) => (s.trim() === '' ? null : Number(s.trim().replace(',', '.')));

export function draftToRows(d: JobDraft, ctx: SaveContext): SaveRows {
  const now = ctx.now ?? new Date().toISOString();
  const base = ctx.existingJob;
  const job: Job = {
    ...(base ?? {
      id: ctx.jobId,
      job_type: 'construction',
      status: ctx.status ?? 'draft',
      template_id: ctx.templateId ?? null,
      created_by: ctx.userId,
    }),
    name: d.details.name.trim(),
    job_number: d.details.job_number.trim(),
    quotation_number: d.details.quotation_number.trim(),
    customer: d.details.customer.trim(),
    site_address: d.details.site_address.trim(),
    deadline: d.details.deadline || null,
    stops: num(d.details.stops),
    travel_height_m: num(d.details.travel),
  } as Job;

  const oldPhases = new Map(ctx.existingPhases.filter((p) => p.job_id === ctx.jobId).map((p) => [p.id, p]));
  const oldTasks = new Map(ctx.existingTasks.filter((t) => t.job_id === ctx.jobId).map((t) => [t.id, t]));
  const phases: Phase[] = [];
  const tasks: Task[] = [];
  const taskBudgets: TaskBudget[] = [];
  const oldSold = ctx.existingBudgets?.soldByTask ?? new Map<string, number>();
  const keptPhases = new Set<string>();
  const keptTasks = new Set<string>();

  d.phases.forEach((p, pi) => {
    const id = p.id ?? ctx.newId();
    keptPhases.add(id);
    const prev = oldPhases.get(id);
    const row: Phase = { ...(prev ?? { id, job_id: ctx.jobId }), name: p.name.trim(), sort_order: pi } as Phase;
    if (!prev || prev.name !== row.name || prev.sort_order !== row.sort_order) phases.push(row);

    p.tasks.forEach((t, ti) => {
      const tid = t.id ?? ctx.newId();
      keptTasks.add(tid);
      const prevT = oldTasks.get(tid);
      const rowT: Task = {
        ...(prevT ?? { id: tid, job_id: ctx.jobId }),
        phase_id: id,
        line_no: t.lineNo.trim(),
        name: t.name.trim(),
        kind: t.kind,
        sort_order: ti,
      } as Task;
      const changed =
        !prevT ||
        (['phase_id', 'line_no', 'name', 'kind', 'sort_order'] as const).some((k) => String(prevT[k]) !== String(rowT[k]));
      if (changed) tasks.push(rowT);
      const sold = parseHours(t.hours) ?? 0;
      const before = oldSold.get(tid);
      if (before === undefined ? !prevT || sold !== 0 : Math.round(before * 100) !== Math.round(sold * 100)) {
        taskBudgets.push({ id: tid, sold_hours: sold });
      }
    });
  });

  for (const [id, t] of oldTasks) if (!keptTasks.has(id) && !t.deleted_at) tasks.push({ ...t, deleted_at: now });
  for (const [id, p] of oldPhases) if (!keptPhases.has(id) && !p.deleted_at) phases.push({ ...p, deleted_at: now });

  const quoted = num(d.details.quoted_total);
  const quotedBefore = ctx.existingBudgets?.quotedTotal ?? null;
  const jobBudget: JobBudget | null =
    (quoted === null ? null : Math.round(quoted * 100)) === (quotedBefore === null ? null : Math.round(quotedBefore * 100))
      ? null
      : { id: ctx.jobId, quoted_total_hours: quoted };

  return { job, phases, tasks, taskBudgets, jobBudget };
}

export function templateRowsFromDraft(
  name: string,
  d: JobDraft,
  ctx: { newId: () => string; userId: string },
): { template: Template; phases: TemplatePhase[]; tasks: TemplateTask[] } {
  const template: Template = { id: ctx.newId(), name: name.trim(), job_type: 'construction', created_by: ctx.userId };
  const phases: TemplatePhase[] = [];
  const tasks: TemplateTask[] = [];
  d.phases.forEach((p, pi) => {
    const pid = ctx.newId();
    phases.push({ id: pid, template_id: template.id, name: p.name.trim(), sort_order: pi });
    p.tasks.forEach((t, ti) =>
      tasks.push({
        id: ctx.newId(),
        template_id: template.id,
        phase_id: pid,
        line_no: t.lineNo.trim(),
        name: t.name.trim(),
        sold_hours: parseHours(t.hours) ?? 0,
        kind: t.kind,
        sort_order: ti,
      }),
    );
  });
  return { template, phases, tasks };
}
