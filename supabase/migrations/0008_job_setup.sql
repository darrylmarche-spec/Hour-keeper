-- Phase 2: job setup
--  * Supervisors can set up jobs as well as PMs and admins.
--  * Jobs record the lift details from the layout drawings.
--  * A task with hours logged against it can't be removed.
--  * Sample job: "Hightett" → "Highett" (the suburb's spelling).

-- 1. Who can set up jobs and templates
do $$
declare t text;
begin
  foreach t in array array['jobs','job_members','phases','tasks','templates','template_phases','template_tasks']
  loop
    execute format($p$alter policy %I on public.%I
                     with check (private.has_role('admin','pm','supervisor'))$p$, t || '_insert', t);
    execute format($p$alter policy %I on public.%I
                     using (private.has_role('admin','pm','supervisor'))
                     with check (private.has_role('admin','pm','supervisor'))$p$, t || '_update', t);
  end loop;
end $$;

-- 2. Lift details (from the Schindler layout drawing)
alter table public.jobs
  add column quotation_number text not null default '',
  add column stops            int check (stops is null or stops between 1 and 200),
  add column travel_height_m  numeric(6,2) check (travel_height_m is null or travel_height_m >= 0);

-- 3. Hours protect their task
create or replace function public.guard_task_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null and exists (
    select 1 from public.time_entries e where e.task_id = old.id and e.deleted_at is null
  ) then
    raise exception 'This task has hours logged against it, so it can''t be removed. Move or delete those hours first.';
  end if;
  return new;
end $$;

revoke execute on function public.guard_task_delete() from public, anon, authenticated;

create trigger tasks_guard_delete before update on public.tasks
  for each row execute function public.guard_task_delete();

-- 4. Spelling
update public.jobs set name = 'Highett Common Building F - Duplex'
where name = 'Hightett Common Building F - Duplex';
