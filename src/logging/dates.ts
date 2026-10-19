// Work dates are plain calendar days (YYYY-MM-DD) in the phone's own time
// zone — "today" on site, not in UTC.

const pad = (n: number) => String(n).padStart(2, '0');

export function toDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(now = new Date()): string {
  return toDay(now);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return toDay(new Date(y, m - 1, d + n));
}

export function isValidDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "Today", "Yesterday", or "Mon 19 Oct" (with the year if it isn't this year).
export function dayLabel(day: string, now = new Date()): string {
  const t = today(now);
  if (day === t) return 'Today';
  if (day === addDays(t, -1)) return 'Yesterday';
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const base = `${DAYS[dt.getDay()]} ${d} ${MONTHS[m - 1]}`;
  return y === now.getFullYear() ? base : `${base} ${y}`;
}
