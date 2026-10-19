import { readFileSync } from 'fs';
import { join } from 'path';
import { readTaskFile } from '@/import/readTaskFile';
import { Phase, Task, Template, TemplatePhase, TemplateTask } from '@/data/schema';
import {
  blankDraft,
  checkDraft,
  draftFromJob,
  draftFromParsed,
  draftFromTemplate,
  draftToRows,
  draftTotal,
  parseHours,
  templateRowsFromDraft,
  TemplateSource,
} from '../draft';

// The seeded lift-installation template, rebuilt from the migration.
function liftTemplate(): TemplateSource {
  const sql = readFileSync(join(__dirname, '../../../supabase/migrations/0002_seed_lift_install_template.sql'), 'utf8');
  const lines = [...sql.matchAll(/\(\s*(\d+),'([^']*)','((?:[^']|'')*)',([\d.]+),'([^']*)','([^']*)',(true|false)\)/g)];
  const order = [...sql.matchAll(/\('([^']+)',(\d+)\)/g)].map((m) => m[1]);
  const template: Template = { id: 'tpl', name: 'Lift Installation — Construction', job_type: 'construction' };
  const phases: TemplatePhase[] = order.map((name, i) => ({ id: `tp${i}`, template_id: 'tpl', name, sort_order: i }));
  const tasks: TemplateTask[] = lines.map((m, i) => ({
    id: `tt${i}`,
    template_id: 'tpl',
    phase_id: phases.find((p) => p.name === m[5])!.id,
    line_no: m[2],
    name: m[3].replace(/''/g, "'"),
    sold_hours: Number(m[4]),
    kind: m[6] as TemplateTask['kind'],
    sort_order: Number(m[1]),
  }));
  return { template, phases, tasks };
}

let seq = 0;
const newId = () => `id${++seq}`;

describe('drafts from the template and from an import', () => {
  it('starts from the template with its 9 phases and 216 hours', () => {
    const d = draftFromTemplate(liftTemplate());
    expect(d.phases).toHaveLength(9);
    expect(d.phases[0].name).toBe('Site setup');
    expect(d.phases.flatMap((p) => p.tasks)).toHaveLength(59);
    expect(draftTotal(d)).toBe(216);
  });

  it('puts an imported Highett sheet into the template phases', async () => {
    const buf = readFileSync(join(__dirname, '../../import/__tests__/fixtures/highett.xlsx'));
    const parsed = await readTaskFile({ name: 'h.xlsx', bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
    const d = draftFromParsed(parsed, liftTemplate());
    expect(d.details.name).toBe('Hightett Common Building F - Duplex');
    expect(d.details.quoted_total).toBe('193');
    expect(d.phases.map((p) => p.name)).toEqual([
      'Site setup',
      'Rails & car structure',
      'Machine & motor spin',
      'Belt lift',
      'Door frames',
      'Car & interior',
      'Wiring',
      'Commissioning & testing',
      'Other hours',
    ]);
    const other = d.phases[8].tasks;
    expect(other.map((t) => t.kind)).toEqual(['extra_productive', 'extra_non_productive', 'planned']);
    expect(draftTotal(d)).toBe(216);
    // The typo'd line numbers still carry their flags into the draft
    expect(d.phases[1].tasks.filter((t) => t.issues.length).length).toBeGreaterThan(0);
  });

  it('puts unknown lines under "Tasks" and adds the extra-hours buckets', () => {
    const d = draftFromParsed({
      title: 'Service call',
      quotedTotal: null,
      warnings: [],
      lines: [{ lineNo: '1', name: 'Replace door operator', hours: 6, issues: [] }],
    });
    expect(d.phases.map((p) => p.name)).toEqual(['Tasks', 'Other hours']);
    expect(d.phases[1].tasks.map((t) => t.kind)).toEqual(['extra_productive', 'extra_non_productive']);
  });

  it('a blank job still has the extra-hours buckets', () => {
    const d = blankDraft();
    expect(d.phases.flatMap((p) => p.tasks).filter((t) => t.kind !== 'planned')).toHaveLength(2);
  });
});

describe('checking', () => {
  it('reports what needs fixing', () => {
    const d = blankDraft();
    d.phases[0].tasks[0].hours = 'four';
    const p = checkDraft(d);
    expect(p.details.name).toBeTruthy();
    expect(p.tasks.get(d.phases[0].tasks[0].key)).toBe('Enter a task name');
    d.details.name = 'Job';
    d.phases[0].tasks[0].name = 'Induction';
    expect(checkDraft(d).tasks.get(d.phases[0].tasks[0].key)).toMatch(/number/);
    d.phases[0].tasks[0].hours = '4.5';
    expect(checkDraft(d).count).toBe(0);
  });

  it('reads hours', () => {
    expect(parseHours('4')).toBe(4);
    expect(parseHours('2,5')).toBe(2.5);
    expect(parseHours('')).toBe(0);
    expect(parseHours('-1')).toBeNull();
    expect(parseHours('abc')).toBeNull();
  });
});

describe('saving', () => {
  it('creates rows for a new job', () => {
    const d = draftFromTemplate(liftTemplate());
    d.details.name = 'Highett Common Building I - Lift 1';
    d.details.job_number = '0813190833';
    d.details.stops = '8';
    d.details.travel = '22.92';
    const rows = draftToRows(d, { jobId: 'job1', existingPhases: [], existingTasks: [], userId: 'u1', newId });
    expect(rows.job).toMatchObject({
      id: 'job1',
      status: 'draft',
      name: 'Highett Common Building I - Lift 1',
      job_number: '0813190833',
      stops: 8,
      travel_height_m: 22.92,
      created_by: 'u1',
    });
    expect(rows.phases).toHaveLength(9);
    expect(rows.tasks).toHaveLength(59);
    expect(rows.tasks.every((t) => t.job_id === 'job1')).toBe(true);
    expect(rows.tasks.reduce((s, t) => s + t.sold_hours, 0)).toBe(216);
  });

  it('only sends what changed when editing, and soft-deletes removed rows', () => {
    const job = { id: 'j', name: 'J', job_number: '', customer: '', site_address: '', job_type: 'construction', status: 'draft', quoted_total_hours: null, deadline: null } as const;
    const phases: Phase[] = [
      { id: 'p1', job_id: 'j', name: 'A', sort_order: 0 },
      { id: 'p2', job_id: 'j', name: 'B', sort_order: 1 },
    ];
    const tasks: Task[] = [
      { id: 't1', job_id: 'j', phase_id: 'p1', line_no: '1', name: 'One', sold_hours: 4, kind: 'planned', sort_order: 0 },
      { id: 't2', job_id: 'j', phase_id: 'p1', line_no: '2', name: 'Two', sold_hours: 2, kind: 'planned', sort_order: 1 },
      { id: 't3', job_id: 'j', phase_id: 'p2', line_no: '3', name: 'Three', sold_hours: 1, kind: 'planned', sort_order: 0 },
    ];
    const d = draftFromJob(job, phases, tasks, [
      { id: 'e', job_id: 'j', task_id: 't1', user_id: 'u', work_date: '2026-10-19', hours: 3, note: '', edited: false },
    ]);
    expect(d.phases[0].tasks[0].loggedHours).toBe(3);

    d.phases[0].tasks[1].hours = '5'; // change t2
    d.phases.splice(1, 1); // remove phase B and its task
    const rows = draftToRows(d, { jobId: 'j', existingJob: job, existingPhases: phases, existingTasks: tasks, userId: 'u', newId, now: 'NOW' });
    expect(rows.tasks.map((t) => [t.id, t.sold_hours, t.deleted_at ?? null])).toEqual([
      ['t2', 5, null],
      ['t3', 1, 'NOW'],
    ]);
    expect(rows.phases.map((p) => [p.id, p.deleted_at ?? null])).toEqual([['p2', 'NOW']]);
    expect(rows.job.status).toBe('draft');
  });

  it('saves a job as a template', () => {
    const d = draftFromTemplate(liftTemplate());
    const t = templateRowsFromDraft('Lift install — 8 stops', d, { newId, userId: 'u' });
    expect(t.template.name).toBe('Lift install — 8 stops');
    expect(t.phases).toHaveLength(9);
    expect(t.tasks).toHaveLength(59);
    expect(new Set(t.tasks.map((x) => x.template_id))).toEqual(new Set([t.template.id]));
  });
});
