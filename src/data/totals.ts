import { Phase, Task, TimeEntry } from './schema';

export interface HourTotals {
  sold: number;
  actual: number;
}

export interface JobTotals extends HourTotals {
  byTask: Map<string, HourTotals>;
  byPhase: Map<string, HourTotals>;
}

// Hours are summed in hundredths so 0.1 + 0.2 style errors never show up.
const toCents = (n: number) => Math.round((Number(n) || 0) * 100);
const fromCents = (c: number) => c / 100;

// `soldByTask` is only on the office's phones; without it every sold figure is 0.
export function jobTotals(
  phases: readonly Phase[],
  tasks: readonly Task[],
  entries: readonly TimeEntry[],
  soldByTask: ReadonlyMap<string, number> = new Map(),
): JobTotals {
  const taskCents = new Map<string, { sold: number; actual: number }>();
  for (const t of tasks) taskCents.set(t.id, { sold: toCents(soldByTask.get(t.id) ?? 0), actual: 0 });
  for (const e of entries) {
    const t = taskCents.get(e.task_id);
    if (t) t.actual += toCents(e.hours);
  }

  const phaseCents = new Map<string, { sold: number; actual: number }>();
  for (const p of phases) phaseCents.set(p.id, { sold: 0, actual: 0 });
  let sold = 0;
  let actual = 0;
  for (const t of tasks) {
    const c = taskCents.get(t.id)!;
    const p = phaseCents.get(t.phase_id);
    if (p) {
      p.sold += c.sold;
      p.actual += c.actual;
    }
    sold += c.sold;
    actual += c.actual;
  }

  const conv = (m: Map<string, { sold: number; actual: number }>) =>
    new Map(Array.from(m, ([k, v]) => [k, { sold: fromCents(v.sold), actual: fromCents(v.actual) }]));

  return { sold: fromCents(sold), actual: fromCents(actual), byTask: conv(taskCents), byPhase: conv(phaseCents) };
}

// Hours over (+) or under (−) what was sold.
export function variance(t: HourTotals): number {
  return fromCents(toCents(t.actual) - toCents(t.sold));
}

// Percentage of sold hours used. Null when nothing was sold (can't divide by zero).
export function percentUsed(t: HourTotals): number | null {
  if (toCents(t.sold) === 0) return null;
  return Math.round((toCents(t.actual) / toCents(t.sold)) * 100);
}

// True when the PM-entered "Total Allowed Hours" differs from the sum of the
// task lines (e.g. the sample sheet: header 193, lines add to 216).
export function quotedMismatch(quoted: number | null | undefined, linesTotal: number): boolean {
  if (quoted === null || quoted === undefined) return false;
  return toCents(quoted) !== toCents(linesTotal);
}

export function formatHours(n: number): string {
  const v = Math.round(n * 100) / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, '');
}
