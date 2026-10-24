-- Hours can only be saved against a task that is still part of the job.
--
-- Before: a tech working offline could log hours on a task the PM removed in
-- the meantime. The entry saved fine, then sat on a removed task where nobody
-- could see it. Now the database refuses it, and the app shows the tech a
-- plain-words reason (the message below) and keeps their entry on the Sync
-- screen, so nothing is lost or hidden.
--
-- Checked when an entry is added, moved to another task, or brought back.
-- Removing an entry, or editing one that is already on a live task, is never
-- blocked by this.

create or replace function public.guard_time_entry_task() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t_job uuid;
  t_deleted timestamptz;
begin
  if new.deleted_at is null
     and (tg_op = 'INSERT'
          or new.task_id is distinct from old.task_id
          or old.deleted_at is not null) then
    select job_id, deleted_at into t_job, t_deleted from public.tasks where id = new.task_id;
    if not found or t_deleted is not null then
      raise exception 'This task was removed from the job, so these hours can''t be saved on it. Ask your PM which task they belong on.'
        using errcode = 'P0001';
    end if;
    if t_job is distinct from new.job_id then
      raise exception 'That task doesn''t belong to this job, so these hours can''t be saved on it.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

revoke execute on function public.guard_time_entry_task() from public, anon, authenticated;

-- Named so it runs before the other time_entries triggers (they run in name order).
create trigger time_entries_task_guard before insert or update on public.time_entries
  for each row execute function public.guard_time_entry_task();
