-- Sold hours and the job's quoted total are for the office, not the field.
--
-- Row-level security works per row, not per column, so the only way to keep a
-- figure off a tech's phone is to keep it out of any table a tech can read.
-- The figures move into two small tables that only admins, PMs and supervisors
-- can read or write. A tech's phone asks for them like any other table and
-- the database simply returns nothing.
--
-- This is the first of two steps so the app that is live today keeps working:
--   0013 (this file): create the tables, copy the figures across, and keep
--                     them in step when the old app changes the old columns.
--   0014:             once the new app is live, drop the old columns.
-- The standard hours templates are office-only too, because their rows carry
-- the same figures.

create table public.task_budgets (
  id          uuid primary key references public.tasks(id) on delete cascade,  -- the task's own id
  sold_hours  numeric(7,2) not null default 0 check (sold_hours >= 0),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create table public.job_budgets (
  id                  uuid primary key references public.jobs(id) on delete cascade,  -- the job's own id
  quoted_total_hours  numeric(8,2),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index on public.task_budgets (updated_at);
create index on public.job_budgets (updated_at);

create trigger task_budgets_touch before insert or update on public.task_budgets
  for each row execute function public.touch_updated_at();
create trigger job_budgets_touch before insert or update on public.job_budgets
  for each row execute function public.touch_updated_at();

alter table public.task_budgets enable row level security;
alter table public.job_budgets  enable row level security;

create policy task_budgets_select on public.task_budgets for select to authenticated
  using (private.has_role('admin','pm','supervisor'));
create policy task_budgets_insert on public.task_budgets for insert to authenticated
  with check (private.has_role('admin','pm','supervisor'));
create policy task_budgets_update on public.task_budgets for update to authenticated
  using (private.has_role('admin','pm','supervisor')) with check (private.has_role('admin','pm','supervisor'));
create policy job_budgets_select on public.job_budgets for select to authenticated
  using (private.has_role('admin','pm','supervisor'));
create policy job_budgets_insert on public.job_budgets for insert to authenticated
  with check (private.has_role('admin','pm','supervisor'));
create policy job_budgets_update on public.job_budgets for update to authenticated
  using (private.has_role('admin','pm','supervisor')) with check (private.has_role('admin','pm','supervisor'));

revoke all on public.task_budgets, public.job_budgets from anon;

-- Copy today's figures across.
insert into public.task_budgets (id, sold_hours, deleted_at)
  select id, sold_hours, deleted_at from public.tasks;
insert into public.job_budgets (id, quoted_total_hours, deleted_at)
  select id, quoted_total_hours, deleted_at from public.jobs where quoted_total_hours is not null;

-- Until 0014: a change to the old columns (from the app that is live today)
-- is mirrored into the new tables. A zero or empty figure on a new row is
-- skipped, because the new app writes its figures to the new tables itself.
create or replace function public.mirror_task_budget() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.sold_hours <> 0 then
      insert into public.task_budgets (id, sold_hours) values (new.id, new.sold_hours)
        on conflict (id) do nothing;
    end if;
  elsif new.sold_hours is distinct from old.sold_hours then
    insert into public.task_budgets (id, sold_hours) values (new.id, new.sold_hours)
      on conflict (id) do update set sold_hours = excluded.sold_hours;
  end if;
  return null;
end $$;

create or replace function public.mirror_job_budget() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.quoted_total_hours is not null then
      insert into public.job_budgets (id, quoted_total_hours) values (new.id, new.quoted_total_hours)
        on conflict (id) do nothing;
    end if;
  elsif new.quoted_total_hours is distinct from old.quoted_total_hours then
    insert into public.job_budgets (id, quoted_total_hours) values (new.id, new.quoted_total_hours)
      on conflict (id) do update set quoted_total_hours = excluded.quoted_total_hours;
  end if;
  return null;
end $$;

revoke execute on function public.mirror_task_budget(), public.mirror_job_budget() from public, anon, authenticated;

create trigger tasks_mirror_budget after insert or update on public.tasks
  for each row execute function public.mirror_task_budget();
create trigger jobs_mirror_budget after insert or update on public.jobs
  for each row execute function public.mirror_job_budget();

-- Templates are office-only.
alter policy templates_select on public.templates
  using (private.has_role('admin','pm','supervisor'));
alter policy template_phases_select on public.template_phases
  using (private.has_role('admin','pm','supervisor'));
alter policy template_tasks_select on public.template_tasks
  using (private.has_role('admin','pm','supervisor'));
