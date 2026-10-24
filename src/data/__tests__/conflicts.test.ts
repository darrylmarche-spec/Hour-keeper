import { changedFields, clashingFields, describeConflict, describeRow, sameValue } from '../conflicts';

describe('comparing values', () => {
  it('treats numbers and numeric strings by value, and missing as blank', () => {
    expect(sameValue(4, '4.00')).toBe(true);
    expect(sameValue(4, 5)).toBe(false);
    expect(sameValue(undefined, null)).toBe(true);
    expect(sameValue('', null)).toBe(false); // blank text is not the same as nothing
    expect(sameValue('a', 'a')).toBe(true);
    expect(sameValue({ a: 1 }, { a: 1 })).toBe(true);
    expect(sameValue(0, null)).toBe(false);
    expect(sameValue('', 0)).toBe(false);
  });
});

describe('what changed in an edit', () => {
  const base = { id: 'e1', updated_at: 't1', hours: 4, note: '', work_date: '2026-10-20', task_id: 'a' };
  it('lists only the fields that differ, and never the server-owned ones', () => {
    const mine = { ...base, hours: 5, updated_at: 'ignored-change' };
    expect(changedFields(mine, base)).toEqual({ hours: 5 });
    expect(changedFields(base, base)).toEqual({});
  });
  it('spots a clash only on fields I changed', () => {
    const mine = { ...base, hours: 5 };
    const theirsSameField = { ...base, hours: 6 };
    const theirsOtherField = { ...base, note: 'corrected' };
    const changes = changedFields(mine, base);
    expect(clashingFields(changes, base, theirsSameField)).toEqual(['hours']);
    expect(clashingFields(changes, base, theirsOtherField)).toEqual([]);
  });
});

describe('saying it in plain words', () => {
  it('shows what the tech changed it to and what it is now', () => {
    const base = { id: 'e1', hours: 4, note: '', task_id: 't1', deleted_at: null };
    const lines = describeConflict('time_entries', { ...base, hours: 5 }, base, { ...base, hours: 6 });
    expect(lines).toEqual([{ field: 'hours', label: 'Hours', mine: '5 hrs', theirs: '6 hrs' }]);
  });
  it('names tasks and removal in words', () => {
    const base = { id: 'e1', hours: 4, task_id: 't1', deleted_at: null };
    const names = (id: string) => ({ t1: 'Induction', t2: 'Hoisting' })[id];
    const moved = describeConflict('time_entries', { ...base, task_id: 't2' }, base, { ...base, task_id: 't3' }, { taskName: names });
    expect(moved[0]).toMatchObject({ label: 'Task', mine: 'Hoisting', theirs: 'another task' });
    const removed = describeConflict('time_entries', { ...base, hours: 9 }, base, { ...base, hours: 8, deleted_at: 'x' });
    expect(removed.map((l) => l.field)).toEqual(['hours']); // only fields I changed are reported
    const mineRemoved = describeConflict('time_entries', { ...base, deleted_at: 'now' }, base, { ...base, deleted_at: 'earlier' });
    expect(mineRemoved[0]).toMatchObject({ label: 'Removed', mine: 'yes', theirs: 'yes' });
  });
  it('falls back to the field name for fields without a label', () => {
    const base = { id: 'x', some_new_field: 1 };
    expect(describeConflict('jobs', { ...base, some_new_field: 2 }, base, { ...base, some_new_field: 3 })[0].label).toBe('some new field');
  });
});

describe('saying which change it is', () => {
  const names = (id: string) => ({ t1: 'Induction' })[id];
  it('describes an hours entry, a comment and a photo', () => {
    expect(describeRow('time_entries', { hours: 5, work_date: '2026-10-20', task_id: 't1' }, { taskName: names })).toMatch(/^5 hrs on .+ · Induction$/);
    expect(describeRow('time_entries', { hours: 2.5, work_date: '2026-10-20', task_id: 'gone' })).toMatch(/^2.5 hrs on /);
    expect(describeRow('comments', { body: 'Pit ladder missing' })).toBe('“Pit ladder missing”');
    expect(describeRow('attachments', { file_name: 'pit.jpg' })).toBe('pit.jpg');
    expect(describeRow('profiles', {})).toBe('');
  });
});

describe('server-owned fields', () => {
  it('does not treat the Edited tag as something the person changed', () => {
    expect(changedFields({ hours: 4, edited: true }, { hours: 4, edited: false })).toEqual({});
  });
});
