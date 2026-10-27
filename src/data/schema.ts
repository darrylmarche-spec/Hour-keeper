// Row shapes mirror supabase/migrations/0001_init.sql.

export type Role = 'admin' | 'pm' | 'supervisor' | 'tech';
export type JobType = 'construction' | 'service' | 'repair';
export type JobStatus = 'draft' | 'released' | 'complete';
export type TaskKind = 'planned' | 'extra_productive' | 'extra_non_productive';

export interface BaseRow {
  id: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface Profile extends BaseRow {
  full_name: string;
  email: string;
  role: Role;
  active: boolean;
  approved_at?: string | null; // set by the server the first time an admin approves
  created_at?: string;
}

export interface Template extends BaseRow {
  name: string;
  job_type: JobType;
  created_by?: string | null;
}

export interface TemplatePhase extends BaseRow {
  template_id: string;
  name: string;
  sort_order: number;
}

export interface TemplateTask extends BaseRow {
  template_id: string;
  phase_id: string;
  line_no: string;
  name: string;
  sold_hours: number;
  kind: TaskKind;
  sort_order: number;
}

export interface Job extends BaseRow {
  job_number: string;
  name: string;
  customer: string;
  site_address: string;
  job_type: JobType;
  status: JobStatus;
  quotation_number?: string;
  stops?: number | null;
  travel_height_m?: number | null;
  deadline: string | null;
  template_id?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface JobMember extends BaseRow {
  job_id: string;
  user_id: string;
}

export interface Phase extends BaseRow {
  job_id: string;
  name: string;
  sort_order: number;
}

export interface Task extends BaseRow {
  job_id: string;
  phase_id: string;
  line_no: string;
  name: string;
  kind: TaskKind;
  sort_order: number;
}

// Sold hours live in their own office-only tables (see migration 0013), so a
// tech's phone never receives them. The row's id is the task's or job's own id.
export interface TaskBudget extends BaseRow {
  sold_hours: number;
}

export interface JobBudget extends BaseRow {
  quoted_total_hours: number | null;
}

export interface TimeEntry extends BaseRow {
  job_id: string;
  task_id: string;
  user_id: string;
  work_date: string;
  hours: number;
  note: string;
  edited: boolean;
  created_at?: string;
}

export interface TimeEntryEdit extends BaseRow {
  time_entry_id: string;
  job_id: string;
  edited_by: string | null;
  edited_at: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export interface Comment extends BaseRow {
  job_id: string;
  task_id: string | null;
  user_id: string;
  body: string;
  created_at?: string;
}

export interface Attachment extends BaseRow {
  job_id: string;
  task_id: string | null;
  time_entry_id: string | null;
  user_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at?: string;
}

export interface Feedback extends BaseRow {
  user_id: string;
  kind: 'problem' | 'idea' | 'other';
  body: string;
  screen: string;
  app_version: string;
  device: string;
  status: 'new' | 'seen' | 'done';
  created_at?: string;
}

export interface AppError extends BaseRow {
  user_id: string;
  message: string;
  stack: string;
  screen: string;
  app_version: string;
  device: string;
  count: number;
  created_at?: string;
}

export interface Tables {
  profiles: Profile;
  templates: Template;
  template_phases: TemplatePhase;
  template_tasks: TemplateTask;
  jobs: Job;
  job_members: JobMember;
  phases: Phase;
  tasks: Task;
  task_budgets: TaskBudget;
  job_budgets: JobBudget;
  time_entries: TimeEntry;
  time_entry_edits: TimeEntryEdit;
  comments: Comment;
  attachments: Attachment;
  feedback: Feedback;
  app_errors: AppError;
}

export type TableName = keyof Tables;

// Pull order matters: parents before children.
export const TABLES: TableName[] = [
  'profiles',
  'templates',
  'template_phases',
  'template_tasks',
  'jobs',
  'job_budgets',
  'job_members',
  'phases',
  'tasks',
  'task_budgets',
  'time_entries',
  'time_entry_edits',
  'comments',
  'attachments',
  'feedback',
  'app_errors',
];

// Tables whose rows belong to a job. When a job first becomes visible on this
// device (e.g. a tech is assigned to it), these are fetched in full for that job,
// because their updated_at may be older than the device's sync cursor.
export const JOB_CHILD_TABLES: TableName[] = [
  'job_members',
  'phases',
  'tasks',
  'time_entries',
  'time_entry_edits',
  'comments',
  'attachments',
];

// Postgres numeric columns arrive as strings over REST.
export const NUMERIC_COLUMNS: Partial<Record<TableName, string[]>> = {
  template_tasks: ['sold_hours'],
  jobs: ['travel_height_m'],
  task_budgets: ['sold_hours'],
  job_budgets: ['quoted_total_hours'],
  time_entries: ['hours'],
  attachments: ['size_bytes'],
};

// Columns that used to be on these tables and now live in the office-only
// budget tables. Until the old columns are dropped from the database, the
// server still sends them; the app discards them rather than keep them.
export const RETIRED_COLUMNS: Partial<Record<TableName, string[]>> = {
  tasks: ['sold_hours'],
  jobs: ['quoted_total_hours'],
};
