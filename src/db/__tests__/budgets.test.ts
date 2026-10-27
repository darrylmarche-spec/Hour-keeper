import { Rules, startRules } from './pgHarness';

jest.setTimeout(120_000);

// Idea 1 / pre-beta check 1: sold hours and the quoted total never reach a
// tech. Run against the project's real migrations.

interface World {
  admin: string;
  pm: string;
  sup: string;
  tech: string;
  job: string;
  task: string;
}

async function build(r: Rules, upTo?: string): Promise<World> {
  const admin = await r.signUp('admin@example.com', 'Alex Admin');
  const pm = await r.signUp('pm@example.com', 'Pat PM');
  const sup = await r.signUp('sup@example.com', 'Sam Super');
  const tech = await r.signUp('tech@example.com', 'Terry Tech');
  await r.admin(`update public.profiles set active = true where id in ($1, $2, $3)`, [pm, sup, tech]);
  await r.admin(`update public.profiles set role = 'pm' where id = $1`, [pm]);
  await r.admin(`update public.profiles set role = 'supervisor' where id = $1`, [sup]);
  const [job] = await r.admin<{ id: string }>(`insert into public.jobs (name, status) values ('Highett', 'released') returning id`);
  const [phase] = await r.admin<{ id: string }>(`insert into public.phases (job_id, name) values ($1, 'Site setup') returning id`, [job.id]);
  const [task] = await r.admin<{ id: string }>(
    `insert into public.tasks (job_id, phase_id, line_no, name) values ($1, $2, '1', 'Induction') returning id`,
    [job.id, phase.id],
  );
  await r.admin(`insert into public.job_members (job_id, user_id) values ($1, $2)`, [job.id, tech]);
  await r.admin(`insert into public.task_budgets (id, sold_hours) values ($1, 8)`, [task.id]);
  await r.admin(`insert into public.job_budgets (id, quoted_total_hours) values ($1, 216)`, [job.id]);
  return { admin, pm, sup, tech, job: job.id, task: task.id };
}

describe('sold figures are office-only', () => {
  let r: Rules;
  let w: World;
  beforeAll(async () => {
    r = await startRules();
    w = await build(r);
  });
  afterAll(() => r.close());

  it('a tech sees their job and its tasks, but no budget rows', async () => {
    expect(await r.as(w.tech, `select id from public.jobs`)).toHaveLength(1);
    expect(await r.as(w.tech, `select id from public.tasks`)).toHaveLength(1);
    expect(await r.as(w.tech, `select * from public.task_budgets`)).toHaveLength(0);
    expect(await r.as(w.tech, `select * from public.job_budgets`)).toHaveLength(0);
  });

  it('the figures are not columns on any table a tech can read', async () => {
    const cols = await r.as<{ table_name: string; column_name: string }>(
      w.tech,
      `select table_name, column_name from information_schema.columns
        where table_schema = 'public' and column_name in ('sold_hours', 'quoted_total_hours')
          and table_name not in ('task_budgets', 'job_budgets', 'template_tasks')`,
    );
    expect(cols).toEqual([]);
  });

  it('the standard hours templates are office-only too', async () => {
    expect((await r.as<{ n: number }>(w.tech, `select count(*)::int as n from public.template_tasks`))[0].n).toBe(0);
    expect((await r.as<{ n: number }>(w.tech, `select count(*)::int as n from public.templates`))[0].n).toBe(0);
    expect((await r.as<{ n: number }>(w.pm, `select count(*)::int as n from public.template_tasks`))[0].n).toBeGreaterThan(0);
  });

  it('a tech cannot write the figures, and cannot read them back by trying', async () => {
    await expect(r.as(w.tech, `insert into public.task_budgets (id, sold_hours) values (gen_random_uuid(), 1)`)).rejects.toThrow(/row-level security|foreign key/);
    const upd = await r.as(w.tech, `update public.task_budgets set sold_hours = 1 where id = $1 returning id`, [w.task]);
    expect(upd).toHaveLength(0);
    expect((await r.admin<{ sold_hours: string }>(`select sold_hours from public.task_budgets where id = $1`, [w.task]))[0].sold_hours).toBe('8.00');
  });

  it('nobody signed out sees anything', async () => {
    // Refused outright (no access at all) or an empty answer: either way, nothing.
    for (const t of ['task_budgets', 'job_budgets']) {
      const rows = await r.as(null, `select * from public.${t}`).catch(() => []);
      expect(rows).toHaveLength(0);
    }
  });

  it('admins, PMs and supervisors can read and change them', async () => {
    for (const who of [w.admin, w.pm, w.sup]) {
      expect(await r.as(who, `select * from public.task_budgets where id = $1`, [w.task])).toHaveLength(1);
      expect(await r.as(who, `select * from public.job_budgets where id = $1`, [w.job])).toHaveLength(1);
    }
    const upd = await r.as(w.sup, `update public.task_budgets set sold_hours = 9 where id = $1 returning sold_hours`, [w.task]);
    expect(upd).toHaveLength(1);
    await r.as(w.sup, `update public.task_budgets set sold_hours = 8 where id = $1`, [w.task]);
  });

  it('a tech still logs and sees their own hours as before', async () => {
    const rows = await r.as(
      w.tech,
      `insert into public.time_entries (job_id, task_id, user_id, work_date, hours) values ($1, $2, $3, '2026-10-20', 4) returning id`,
      [w.job, w.task, w.tech],
    );
    expect(rows).toHaveLength(1);
    expect(await r.as(w.tech, `select id from public.time_entries`)).toHaveLength(1);
  });
});

describe('the first step keeps the app that is live today working (0013 only)', () => {
  let r: Rules;
  beforeAll(async () => {
    r = await startRules('0013_budget_figures.sql');
  });
  afterAll(() => r.close());

  it('the old app can still write the old columns, and the new tables follow', async () => {
    const [j] = await r.admin<{ id: string }>(`insert into public.jobs (name, status, quoted_total_hours) values ('Old way', 'draft', 100) returning id`);
    const [p] = await r.admin<{ id: string }>(`insert into public.phases (job_id, name) values ($1, 'P') returning id`, [j.id]);
    const [t] = await r.admin<{ id: string }>(`insert into public.tasks (job_id, phase_id, line_no, name, sold_hours) values ($1, $2, '1', 'T', 6) returning id`, [j.id, p.id]);
    expect((await r.admin<{ sold_hours: string }>(`select sold_hours from public.task_budgets where id = $1`, [t.id]))[0].sold_hours).toBe('6.00');
    expect((await r.admin<{ q: string }>(`select quoted_total_hours as q from public.job_budgets where id = $1`, [j.id]))[0].q).toBe('100.00');
    await r.admin(`update public.tasks set sold_hours = 7 where id = $1`, [t.id]);
    expect((await r.admin<{ sold_hours: string }>(`select sold_hours from public.task_budgets where id = $1`, [t.id]))[0].sold_hours).toBe('7.00');
  });

  it('the new app can add its own budget row after the task (no clash with the mirror)', async () => {
    const [j] = await r.admin<{ id: string }>(`insert into public.jobs (name, status) values ('New way', 'draft') returning id`);
    const [p] = await r.admin<{ id: string }>(`insert into public.phases (job_id, name) values ($1, 'P') returning id`, [j.id]);
    const [t] = await r.admin<{ id: string }>(`insert into public.tasks (job_id, phase_id, line_no, name) values ($1, $2, '1', 'T') returning id`, [j.id, p.id]);
    await r.admin(`insert into public.task_budgets (id, sold_hours) values ($1, 5)`, [t.id]);
    await r.admin(`insert into public.job_budgets (id, quoted_total_hours) values ($1, 50)`, [j.id]);
    expect((await r.admin<{ sold_hours: string }>(`select sold_hours from public.task_budgets where id = $1`, [t.id]))[0].sold_hours).toBe('5.00');
  });

  it('figures that existed before the migration were copied across', async () => {
    const r2 = await startRules('0012_time_entry_task_guard.sql');
    const [job] = await r2.admin<{ id: string }>(`select id from public.jobs where quoted_total_hours is not null limit 1`);
    const before = await r2.admin<{ n: number }>(`select count(*)::int as n from public.tasks where sold_hours > 0`);
    await r2.db.exec(readMigration());
    const after = await r2.admin<{ n: number }>(`select count(*)::int as n from public.task_budgets where sold_hours > 0`);
    expect(after[0].n).toBe(before[0].n);
    expect(before[0].n).toBeGreaterThan(0);
    expect(job.id).toBeTruthy();
    await r2.close();
  });
});

function readMigration(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('path');
  return readFileSync(join(__dirname, '../../../supabase/migrations/0013_budget_figures.sql'), 'utf8');
}
