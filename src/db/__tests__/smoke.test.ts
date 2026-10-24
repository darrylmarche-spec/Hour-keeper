import { Rules, startRules } from './pgHarness';

jest.setTimeout(120_000);

describe('the real migrations load into a real Postgres', () => {
  let r: Rules;
  beforeAll(async () => {
    r = await startRules();
  });
  afterAll(async () => r.close());

  it('creates the tables and the sign-up trigger', async () => {
    const tables = await r.admin<{ tablename: string }>(`select tablename from pg_tables where schemaname='public' order by 1`);
    expect(tables.map((t) => t.tablename)).toEqual(
      expect.arrayContaining(['profiles', 'jobs', 'tasks', 'time_entries', 'time_entry_edits', 'comments', 'attachments', 'feedback', 'app_errors']),
    );
    const admin = await r.signUp('first@example.com', 'First');
    const tech = await r.signUp('second@example.com', 'Second');
    const p = await r.admin<{ id: string; role: string; active: boolean }>(`select id, role, active from public.profiles order by created_at`);
    expect(p.find((x) => x.id === admin)).toMatchObject({ role: 'admin', active: true });
    expect(p.find((x) => x.id === tech)).toMatchObject({ role: 'tech', active: false });
  });

  it('applies row-level security to a signed-in user', async () => {
    const [first] = await r.admin<{ id: string }>(`select id from public.profiles where role='admin'`);
    const seen = await r.as(first.id, `select count(*)::int as n from public.profiles`);
    expect((seen[0] as { n: number }).n).toBe(2);
    // Someone not signed in gets nothing at all.
    const nobody = await r.as<{ n: number }>(null, `select count(*)::int as n from public.profiles`);
    expect(nobody[0].n).toBe(0);
  });
});
