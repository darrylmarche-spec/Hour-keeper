import { Phase, Task, TimeEntry } from '../schema';
import { formatHours, jobTotals, percentUsed, quotedMismatch, variance } from '../totals';

const phase = (id: string): Phase => ({ id, job_id: 'j', name: id, sort_order: 0 });
const task = (id: string, phase_id: string, sold_hours: number): Task => ({
  id,
  job_id: 'j',
  phase_id,
  line_no: id,
  name: id,
  sold_hours,
  kind: 'planned',
  sort_order: 0,
});
const entry = (id: string, task_id: string, hours: number): TimeEntry => ({
  id,
  job_id: 'j',
  task_id,
  user_id: 'u',
  work_date: '2026-10-16',
  hours,
  note: '',
  edited: false,
});

describe('jobTotals', () => {
  it('adds up sold and actual hours by task, phase and job', () => {
    const t = jobTotals(
      [phase('p1'), phase('p2')],
      [task('a', 'p1', 4), task('b', 'p1', 3), task('c', 'p2', 8)],
      [entry('1', 'a', 2.5), entry('2', 'a', 2.5), entry('3', 'c', 6)],
    );
    expect(t.sold).toBe(15);
    expect(t.actual).toBe(11);
    expect(t.byTask.get('a')).toEqual({ sold: 4, actual: 5 });
    expect(t.byTask.get('b')).toEqual({ sold: 3, actual: 0 });
    expect(t.byPhase.get('p1')).toEqual({ sold: 7, actual: 5 });
    expect(t.byPhase.get('p2')).toEqual({ sold: 8, actual: 6 });
  });

  it('has no floating point drift', () => {
    const t = jobTotals([phase('p')], [task('a', 'p', 0.3)], [entry('1', 'a', 0.1), entry('2', 'a', 0.2)]);
    expect(t.byTask.get('a')).toEqual({ sold: 0.3, actual: 0.3 });
    expect(variance(t.byTask.get('a')!)).toBe(0);
  });

  it('ignores entries for tasks not on the job', () => {
    const t = jobTotals([phase('p')], [task('a', 'p', 1)], [entry('1', 'zzz', 5)]);
    expect(t.actual).toBe(0);
  });
});

describe('variance and percent', () => {
  it('reports over and under', () => {
    expect(variance({ sold: 4, actual: 5.5 })).toBe(1.5);
    expect(variance({ sold: 4, actual: 3 })).toBe(-1);
    expect(percentUsed({ sold: 8, actual: 10 })).toBe(125);
    expect(percentUsed({ sold: 0, actual: 3 })).toBeNull();
  });
});

describe('quotedMismatch', () => {
  it('flags the sample sheet (193 quoted vs 216 in lines)', () => {
    expect(quotedMismatch(193, 216)).toBe(true);
    expect(quotedMismatch(216, 216)).toBe(false);
    expect(quotedMismatch(null, 216)).toBe(false);
  });
});

describe('formatHours', () => {
  it('shows whole hours without decimals', () => {
    expect(formatHours(8)).toBe('8');
    expect(formatHours(2.5)).toBe('2.5');
    expect(formatHours(2.25)).toBe('2.25');
  });
});
