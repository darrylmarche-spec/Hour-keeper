import { Rules, startRules } from './pgHarness';

jest.setTimeout(120_000);

// Pre-beta check 3: nobody's work is silently lost or overwritten. These are
// the database's side of it, run against the project's real migrations.

interface World {
  admin: string;
  pm: string;
  tech: string;
  other: string;
  job: string;
  phase: string;
  task: string;
  removedTask: string;
  entry: string;
}

async function build(r: Rules): Promise<World> {
  const admin = await r.signUp('admin@example.com', 'Alex Admin');
  const pm = await r.signUp('pm@example.com', 'Pat PM');
  const tech = await r.signUp('tech@example.com', 'Terry Tech');
  const other = await r.signUp('other@example.com', 'Olly Other');
  await r.admin(`update public.profiles set active = true where id in ($1, $2, $3)`, [pm, tech, other]);
  await r.admin(`update public.profiles set role = 'pm' where id = $1`, [pm]);

  const [job] = await r.admin<{ id: string }>(`insert into public.jobs (name, status) values ('Highett', 'released') returning id`);
  const [phase] = await r.admin<{ id: string }>(`insert into public.phases (job_id, name) values ($1, 'Site setup') returning id`, [job.id]);
  const [task] = await r.admin<{ id: string }>(
    `insert into public.tasks (job_id, phase_id, line_no, name, sold_hours) values ($1, $2, '1', 'Induction', 8) returning id`,
    [job.id, phase.id],
  );
  const [removedTask] = await r.admin<{ id: string }>(
    `insert into public.tasks (job_id, phase_id, line_no, name, sold_hours, deleted_at) values ($1, $2, '2', 'Hoisting', 4, now()) returning id`,
    [job.id, phase.id],
  );
  await r.admin(`insert into public.job_members (job_id, user_id) values ($1, $2)`, [job.id, tech]);

  const [entry] = await r.as<{ id: string }>(
    tech,
    `insert into public.time_entries (job_id, task_id, user_id, work_date, hours, note) values ($1, $2, $3, '2026-10-20', 4, 'induction') returning id`,
    [job.id, task.id, tech],
  );
  return { admin, pm, tech, other, job: job.id, phase: phase.id, task: task.id, removedTask: removedTask.id, entry: entry.id };
}

describe('database rules behind "nobody\'s work is silently lost"', () => {
  let r: Rules;
  let w: World;
  beforeAll(async () => {
    r = await startRules();
    w = await build(r);
  });
  afterAll(async () => r.close());

  describe('a. a clash on the same entry', () => {
    it('keeps both versions in the history when a PM corrects an entry and the tech then changes it', async () => {
      // PM corrects 4 -> 6 while the tech is offline.
      const pmEdit = await r.as(w.pm, `update public.time_entries set hours = 6, note = 'PM corrected' where id = $1 returning id`, [w.entry]);
      expect(pmEdit).toHaveLength(1);
      // The tech's offline change (made on the old 4) reaches the server later.
      const techEdit = await r.as(w.tech, `update public.time_entries set hours = 5 where id = $1 returning id`, [w.entry]);
      expect(techEdit).toHaveLength(1);

      const history = await r.admin<{ before: { hours: number }; after: { hours: number }; edited_by: string }>(
        `select before, after, edited_by from public.time_entry_edits where time_entry_id = $1 order by edited_at, id`,
        [w.entry],
      );
      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({ edited_by: w.pm, before: { hours: 4 }, after: { hours: 6 } });
      expect(history[1]).toMatchObject({ edited_by: w.tech, before: { hours: 6 }, after: { hours: 5 } });
      const [row] = await r.admin<{ edited: boolean }>(`select edited from public.time_entries where id = $1`, [w.entry]);
      expect(row.edited).toBe(true); // shown as "Edited" to everyone
    });

    it("does not let one tech change another tech's entry", async () => {
      await r.admin(`insert into public.job_members (job_id, user_id) values ($1, $2)`, [w.job, w.other]);
      const rows = await r.as(w.other, `update public.time_entries set hours = 1 where id = $1 returning id`, [w.entry]);
      expect(rows).toHaveLength(0); // refused: nothing updated
    });
  });

  describe('b. a refused change', () => {
    it('refuses a new entry on a job that has been completed, with a permission error the app turns into plain words', async () => {
      await r.admin(`update public.jobs set status = 'complete' where id = $1`, [w.job]);
      await expect(
        r.as(w.tech, `insert into public.time_entries (job_id, task_id, user_id, work_date, hours) values ($1, $2, $3, '2026-10-21', 2)`, [w.job, w.task, w.tech]),
      ).rejects.toThrow(/row-level security/i);
      // Changing an existing entry updates nothing (the app reports "no permission").
      const rows = await r.as(w.tech, `update public.time_entries set hours = 7 where id = $1 returning id`, [w.entry]);
      expect(rows).toHaveLength(0);
      await r.admin(`update public.jobs set status = 'released' where id = $1`, [w.job]);
    });

    it('refuses an entry for a tech who was taken off the job', async () => {
      await r.admin(`update public.job_members set deleted_at = now() where job_id = $1 and user_id = $2`, [w.job, w.other]);
      await expect(
        r.as(w.other, `insert into public.time_entries (job_id, task_id, user_id, work_date, hours) values ($1, $2, $3, '2026-10-21', 2)`, [w.job, w.task, w.other]),
      ).rejects.toThrow();
    });
  });

  describe('c. hours logged on a task that was removed while the tech was offline', () => {
    it('refuses the entry, in plain words, instead of saving hours nobody can see', async () => {
      await expect(
        r.as(w.tech, `insert into public.time_entries (job_id, task_id, user_id, work_date, hours) values ($1, $2, $3, '2026-10-21', 3)`, [w.job, w.removedTask, w.tech]),
      ).rejects.toThrow(/task was removed from the job/i);
    });

    it('also refuses moving an existing entry onto a removed task', async () => {
      await expect(
        r.as(w.tech, `update public.time_entries set task_id = $2 where id = $1`, [w.entry, w.removedTask]),
      ).rejects.toThrow(/task was removed from the job/i);
    });

    it("refuses an entry whose task belongs to a different job", async () => {
      const [job2] = await r.admin<{ id: string }>(`insert into public.jobs (name, status) values ('Other job', 'released') returning id`);
      await r.admin(`insert into public.job_members (job_id, user_id) values ($1, $2)`, [job2.id, w.tech]);
      await expect(
        r.as(w.tech, `insert into public.time_entries (job_id, task_id, user_id, work_date, hours) values ($1, $2, $3, '2026-10-21', 1)`, [job2.id, w.task, w.tech]),
      ).rejects.toThrow(/task was removed from the job|doesn.t belong/i);
    });

    it('still allows normal logging, editing and removing on a live task', async () => {
      const ok = await r.as<{ id: string }>(
        w.tech,
        `insert into public.time_entries (job_id, task_id, user_id, work_date, hours) values ($1, $2, $3, '2026-10-22', 2) returning id`,
        [w.job, w.task, w.tech],
      );
      expect(ok).toHaveLength(1);
      expect(await r.as(w.tech, `update public.time_entries set hours = 2.5 where id = $1 returning id`, [ok[0].id])).toHaveLength(1);
      expect(await r.as(w.tech, `update public.time_entries set deleted_at = now() where id = $1 returning id`, [ok[0].id])).toHaveLength(1);
    });

    it('lets an entry that is already on a task be removed even if the task is later removed', async () => {
      const [t] = await r.admin<{ id: string }>(`insert into public.tasks (job_id, phase_id, line_no, name, sold_hours) values ($1, $2, '9', 'Temp', 1) returning id`, [w.job, w.phase]);
      const [e] = await r.as<{ id: string }>(
        w.tech,
        `insert into public.time_entries (job_id, task_id, user_id, work_date, hours) values ($1, $2, $3, '2026-10-22', 1) returning id`,
        [w.job, t.id, w.tech],
      );
      await r.admin(`update public.time_entries set deleted_at = now() where id = $1`, [e.id]); // entry removed first,
      await r.admin(`update public.tasks set deleted_at = now() where id = $1`, [t.id]); // then the task
      // A later (stale) change to the same, already-removed entry is not blocked by the task rule.
      expect(await r.admin(`update public.time_entries set note = 'x' where id = $1 returning id`, [e.id])).toHaveLength(1);
    });
  });
});
