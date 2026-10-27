import { JobStatus, Role } from '@/data/schema';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  pm: 'Project Manager',
  supervisor: 'Supervisor',
  tech: 'Field Tech',
};

export const STATUS_LABELS: Record<JobStatus, string> = {
  draft: 'Draft',
  released: 'In the field',
  complete: 'Complete',
};

// Office roles see every job; techs see the jobs they're assigned to.
export const seesAllJobs = (r?: Role) => r === 'admin' || r === 'pm' || r === 'supervisor';

// Percentages and cross-job comparison are for PMs (and admins).
export const seesPercentages = (r?: Role) => r === 'admin' || r === 'pm';

// Setting up jobs (create, edit, assign, release) — PMs, supervisors, admins.
export const managesJobs = (r?: Role) => r === 'admin' || r === 'pm' || r === 'supervisor';

// Sold hours, what's left, and the job's quoted total are for the office. The
// database doesn't send them to a tech's phone; the screens use this to match.
export const seesSoldHours = (r?: Role) => r === 'admin' || r === 'pm' || r === 'supervisor';
