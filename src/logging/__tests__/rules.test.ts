import { Job, JobMember, Profile, TimeEntry, TimeEntryEdit } from '@/data/schema';
import { addDays, dayLabel, isValidDay, today } from '../dates';
import { canEditEntry, canLog, checkEntry, dayTotal, describeEdit } from '../rules';

const NOW = new Date(2026, 9, 19, 9, 0); // Mon 19 Oct 2026, local time
const job = (status: Job['status']): Job =>
  ({ id: 'j1', status, name: 'Highett', job_number: '', customer: '', site_address: '', job_type: 'construction', quoted_total_hours: null, deadline: null }) as Job;
const person = (id: string, role: Profile['role']): Profile => ({ id, role, full_name: id, email: `${id}@x`, active: true });
const team: JobMember[] = [{ id: 'm1', job_id: 'j1', user_id: 'tech1' }];
const entry = (over: Partial<TimeEntry> = {}): TimeEntry => ({
  id: 'e1', job_id: 'j1', task_id: 't1', user_id: 'tech1', work_date: '2026-10-19', hours: 4, note: '', edited: false, ...over,
});

describe('who can log hours', () => {
  it('lets a tech on the team log once the job is released', () => {
    expect(canLog(job('released'), person('tech1', 'tech'), team).ok).toBe(true);
  });
  it('explains why not, in plain words', () => {
    const r1 = canLog(job('draft'), person('tech1', 'tech'), team);
    const r2 = canLog(job('complete'), person('tech1', 'tech'), team);
    const r3 = canLog(job('released'), person('tech2', 'tech'), team);
    const r4 = canLog(job('released'), person('sup', 'supervisor'), team);
    expect(!r1.ok && r1.reason).toMatch(/released/);
    expect(!r2.ok && r2.reason).toMatch(/complete/);
    expect(!r3.ok && r3.reason).toMatch(/not on this job/);
    expect(!r4.ok && r4.reason).toMatch(/Add yourself under Team/);
  });
  it('a removed team member can’t log', () => {
    expect(canLog(job('released'), person('tech1', 'tech'), [{ ...team[0], deleted_at: '2026-10-01' }]).ok).toBe(false);
  });
});

describe('who can change an entry', () => {
  it('techs change only their own, while the job is in the field', () => {
    expect(canEditEntry(entry(), job('released'), person('tech1', 'tech'), team)).toBe(true);
    expect(canEditEntry(entry({ user_id: 'tech2' }), job('released'), person('tech1', 'tech'), team)).toBe(false);
    expect(canEditEntry(entry(), job('complete'), person('tech1', 'tech'), team)).toBe(false);
  });
  it('PMs and supervisors can correct anyone’s', () => {
    expect(canEditEntry(entry({ user_id: 'tech2' }), job('complete'), person('pm1', 'pm'), team)).toBe(true);
  });
});

describe('checking an entry', () => {
  it('accepts normal hours', () => {
    expect(checkEntry({ hours: '4', work_date: '2026-10-19' }, NOW).value).toEqual({ hours: 4, work_date: '2026-10-19' });
    expect(checkEntry({ hours: '2,5', work_date: '2026-10-18' }, NOW).value?.hours).toBe(2.5);
  });
  it('refuses empty, zero, too many and non-numbers', () => {
    expect(checkEntry({ hours: '', work_date: '2026-10-19' }, NOW).hours).toMatch(/Enter the hours/);
    expect(checkEntry({ hours: '0', work_date: '2026-10-19' }, NOW).hours).toMatch(/more than 0/);
    expect(checkEntry({ hours: '25', work_date: '2026-10-19' }, NOW).hours).toMatch(/24/);
    expect(checkEntry({ hours: 'four', work_date: '2026-10-19' }, NOW).hours).toMatch(/number/);
  });
  it('refuses bad or future dates (tomorrow is allowed for night shifts across midnight)', () => {
    expect(checkEntry({ hours: '4', work_date: '2026-02-30' }, NOW).work_date).toBeDefined();
    expect(checkEntry({ hours: '4', work_date: '2026-10-20' }, NOW).value).toBeDefined();
    expect(checkEntry({ hours: '4', work_date: '2026-10-22' }, NOW).work_date).toMatch(/future/);
  });
});

describe('days', () => {
  it('uses the phone’s own calendar day', () => {
    expect(today(NOW)).toBe('2026-10-19');
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(isValidDay('2028-02-29')).toBe(true);
    expect(isValidDay('2026-02-29')).toBe(false);
  });
  it('labels days plainly', () => {
    expect(dayLabel('2026-10-19', NOW)).toBe('Today');
    expect(dayLabel('2026-10-18', NOW)).toBe('Yesterday');
    expect(dayLabel('2026-10-14', NOW)).toBe('Wed 14 Oct');
    expect(dayLabel('2025-10-14', NOW)).toBe('Tue 14 Oct 2025');
  });
  it('totals a person’s day', () => {
    const es = [entry(), entry({ id: 'e2', hours: 3.5 }), entry({ id: 'e3', user_id: 'x' }), entry({ id: 'e4', work_date: '2026-10-18' })];
    expect(dayTotal(es, 'tech1', '2026-10-19')).toBe(7.5);
    expect(dayTotal(es, 'tech1', '2026-10-19', 'e2')).toBe(4);
  });
});

describe('edit history', () => {
  const edit = (before: object, after: object): TimeEntryEdit =>
    ({ id: 'x', time_entry_id: 'e1', job_id: 'j1', edited_by: 'tech1', edited_at: '2026-10-19T01:00:00Z', before, after }) as TimeEntryEdit;
  const base = { hours: 4, work_date: '2026-10-19', note: '', task_id: 't1', deleted: false };
  const name = (id: string) => (id === 't1' ? 'Rails' : 'Doors');
  it('says what changed', () => {
    expect(describeEdit(edit(base, { ...base, hours: '5.5' }), name, NOW)).toEqual(['Hours 4 → 5.5']);
    expect(describeEdit(edit(base, { ...base, task_id: 't2', note: 'wrong line' }), name, NOW)).toEqual([
      'Task Rails → Doors',
      'Note changed to “wrong line”',
    ]);
    expect(describeEdit(edit(base, { ...base, deleted: true }), name, NOW)).toEqual(['Removed the entry']);
  });
});
