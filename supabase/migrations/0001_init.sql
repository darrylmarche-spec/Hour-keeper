-- Hour Keeper — initial schema
--
-- Every synced table has:
--   id uuid (generated on the device, so rows can be created offline)
--   updated_at  set by the server on every write — the sync "pull" cursor
--   deleted_at  soft delete, so deletions sync to other devices

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Profiles & roles
-- ─────────────────────────────────────────────────────────────

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  email       text not null default '',
  role        text not null default 'tech' check (role in ('admin','pm','supervisor','tech')),
  active      boolean not null default false,   -- an admin approves new accounts
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active and deleted_at is null
$$;

create or replace function public.has_role(variadic roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = any(roles), false)
$$;

-- New sign-ups get a profile. The very first account becomes an active admin;
-- everyone after that waits for an admin to approve them.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  perform pg_advisory_xact_lock(hashtext('hk_first_user'));
  select not exists (select 1 from public.profiles) into first_user;
  insert into public.profiles (id, full_name, email, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.email, ''),
    case when first_user then 'admin' else 'tech' end,
    first_user
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only admins may change role/active; people may edit their own name.
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('admin') then
    if new.role is distinct from old.role
       or new.active is distinct from old.active
       or new.email is distinct from old.email
       or new.deleted_at is distinct from old.deleted_at then
      raise exception 'Only an admin can change roles or approve accounts';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();
create trigger profiles_touch before insert or update on public.profiles
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Templates (reusable task lists a PM starts a job from)
-- ─────────────────────────────────────────────────────────────

create table public.templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  job_type    text not null default 'construction' check (job_type in ('construction','service','repair')),
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.template_phases (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.template_tasks (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete cascade,
  phase_id    uuid not null references public.template_phases(id) on delete cascade,
  line_no     text not null default '',
  name        text not null,
  sold_hours  numeric(7,2) not null default 0 check (sold_hours >= 0),
  kind        text not null default 'planned' check (kind in ('planned','extra_productive','extra_non_productive')),
  sort_order  int not null default 0,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- ─────────────────────────────────────────────────────────────
-- Jobs
-- ─────────────────────────────────────────────────────────────

create table public.jobs (
  id                 uuid primary key default gen_random_uuid(),
  job_number         text not null default '',
  name               text not null,
  customer           text not null default '',
  site_address       text not null default '',
  job_type           text not null default 'construction' check (job_type in ('construction','service','repair')),
  status             text not null default 'draft' check (status in ('draft','released','complete')),
  quoted_total_hours numeric(8,2),          -- the "Total Allowed Hours" figure on the sheet, if given
  deadline           date,
  template_id        uuid references public.templates(id),
  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

create table public.job_members (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (job_id, user_id)
);

create table public.phases (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  phase_id    uuid not null references public.phases(id) on delete cascade,
  line_no     text not null default '',
  name        text not null,
  sold_hours  numeric(7,2) not null default 0 check (sold_hours >= 0),
  kind        text not null default 'planned' check (kind in ('planned','extra_productive','extra_non_productive')),
  sort_order  int not null default 0,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.time_entries (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  task_id     uuid not null references public.tasks(id) on delete cascade,
  user_id     uuid not null references public.profiles(id),
  work_date   date not null,
  hours       numeric(5,2) not null check (hours > 0 and hours <= 24),
  note        text not null default '',
  edited      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- Written only by the trigger below — the record of every change to an entry.
create table public.time_entry_edits (
  id            uuid primary key default gen_random_uuid(),
  time_entry_id uuid not null references public.time_entries(id) on delete cascade,
  job_id        uuid not null references public.jobs(id) on delete cascade,
  edited_by     uuid references public.profiles(id),
  edited_at     timestamptz not null default now(),
  before        jsonb not null,
  after         jsonb not null,
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  task_id     uuid references public.tasks(id) on delete cascade,
  user_id     uuid not null references public.profiles(id),
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references public.jobs(id) on delete cascade,
  task_id       uuid references public.tasks(id) on delete cascade,
  time_entry_id uuid references public.time_entries(id) on delete cascade,
  user_id       uuid not null references public.profiles(id),
  storage_path  text not null,
  file_name     text not null default '',
  mime_type     text not null default '',
  size_bytes    bigint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- Indexes for the sync pull (updated_at cursor) and common lookups
create index on public.profiles (updated_at);
create index on public.templates (updated_at);
create index on public.template_phases (template_id);
create index on public.template_phases (updated_at);
create index on public.template_tasks (template_id);
create index on public.template_tasks (phase_id);
create index on public.template_tasks (updated_at);
create index on public.jobs (updated_at);
create index on public.job_members (user_id);
create index on public.job_members (updated_at);
create index on public.phases (job_id);
create index on public.phases (updated_at);
create index on public.tasks (job_id);
create index on public.tasks (phase_id);
create index on public.tasks (updated_at);
create index on public.time_entries (job_id);
create index on public.time_entries (task_id);
create index on public.time_entries (user_id);
create index on public.time_entries (updated_at);
create index on public.time_entry_edits (time_entry_id);
create index on public.time_entry_edits (job_id);
create index on public.time_entry_edits (updated_at);
create index on public.comments (job_id);
create index on public.comments (task_id);
create index on public.comments (user_id);
create index on public.comments (updated_at);
create index on public.attachments (job_id);
create index on public.attachments (task_id);
create index on public.attachments (time_entry_id);
create index on public.attachments (user_id);
create index on public.attachments (updated_at);
create index on public.jobs (created_by);
create index on public.jobs (template_id);
create index on public.templates (created_by);
create index on public.time_entry_edits (edited_by);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['templates','template_phases','template_tasks','jobs','job_members',
                           'phases','tasks','time_entries','time_entry_edits','comments','attachments']
  loop
    execute format('create trigger %I_touch before insert or update on public.%I
                    for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Time entry edit history
-- ─────────────────────────────────────────────────────────────

create or replace function public.track_time_entry_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.edited := false;
    return new;
  end if;

  -- Owner and job can never be moved
  new.user_id := old.user_id;
  new.job_id  := old.job_id;
  new.created_at := old.created_at;

  if (new.hours, new.work_date, new.note, new.task_id, new.deleted_at)
     is distinct from (old.hours, old.work_date, old.note, old.task_id, old.deleted_at) then
    new.edited := true;
    insert into public.time_entry_edits (time_entry_id, job_id, edited_by, before, after)
    values (
      old.id, old.job_id, auth.uid(),
      jsonb_build_object('hours', old.hours, 'work_date', old.work_date, 'note', old.note,
                         'task_id', old.task_id, 'deleted', old.deleted_at is not null),
      jsonb_build_object('hours', new.hours, 'work_date', new.work_date, 'note', new.note,
                         'task_id', new.task_id, 'deleted', new.deleted_at is not null)
    );
  else
    new.edited := old.edited;   -- the "Edited" tag can't be cleared
  end if;
  return new;
end $$;

create trigger time_entries_track before insert or update on public.time_entries
  for each row execute function public.track_time_entry_edit();

-- ─────────────────────────────────────────────────────────────
-- Access rules (Row Level Security)
-- ─────────────────────────────────────────────────────────────

-- Office roles see every job. Techs see released/complete jobs they're assigned to.
create or replace function public.can_see_job(j uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role('admin','pm','supervisor')
      or exists (
        select 1 from public.jobs jb
        join public.job_members m on m.job_id = jb.id
        where jb.id = j and m.user_id = auth.uid() and m.deleted_at is null
          and jb.status <> 'draft' and jb.deleted_at is null
          and public.my_role() is not null
      )
$$;

create or replace function public.can_log_on_job(j uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() is not null and exists (
    select 1 from public.jobs jb
    join public.job_members m on m.job_id = jb.id
    where jb.id = j and m.user_id = auth.uid() and m.deleted_at is null
      and jb.status = 'released' and jb.deleted_at is null
  )
$$;

alter table public.profiles         enable row level security;
alter table public.templates        enable row level security;
alter table public.template_phases  enable row level security;
alter table public.template_tasks   enable row level security;
alter table public.jobs             enable row level security;
alter table public.job_members      enable row level security;
alter table public.phases           enable row level security;
alter table public.tasks            enable row level security;
alter table public.time_entries     enable row level security;
alter table public.time_entry_edits enable row level security;
alter table public.comments         enable row level security;
alter table public.attachments      enable row level security;

-- profiles: you always see yourself; active users see everyone (names on entries)
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.my_role() is not null);
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.has_role('admin'))
  with check (id = (select auth.uid()) or public.has_role('admin'));

-- templates: everyone active reads, PMs/admins write
create policy templates_select on public.templates for select to authenticated using (public.my_role() is not null);
create policy templates_insert on public.templates for insert to authenticated with check (public.has_role('admin','pm'));
create policy templates_update on public.templates for update to authenticated using (public.has_role('admin','pm')) with check (public.has_role('admin','pm'));
create policy template_phases_select on public.template_phases for select to authenticated using (public.my_role() is not null);
create policy template_phases_insert on public.template_phases for insert to authenticated with check (public.has_role('admin','pm'));
create policy template_phases_update on public.template_phases for update to authenticated using (public.has_role('admin','pm')) with check (public.has_role('admin','pm'));
create policy template_tasks_select on public.template_tasks for select to authenticated using (public.my_role() is not null);
create policy template_tasks_insert on public.template_tasks for insert to authenticated with check (public.has_role('admin','pm'));
create policy template_tasks_update on public.template_tasks for update to authenticated using (public.has_role('admin','pm')) with check (public.has_role('admin','pm'));

-- jobs, members, phases, tasks: visible per can_see_job, written by PMs/admins
create policy jobs_select on public.jobs for select to authenticated using (public.can_see_job(id));
create policy jobs_insert on public.jobs for insert to authenticated with check (public.has_role('admin','pm'));
create policy jobs_update on public.jobs for update to authenticated using (public.has_role('admin','pm')) with check (public.has_role('admin','pm'));

create policy job_members_select on public.job_members for select to authenticated using (public.can_see_job(job_id));
create policy job_members_insert on public.job_members for insert to authenticated with check (public.has_role('admin','pm'));
create policy job_members_update on public.job_members for update to authenticated using (public.has_role('admin','pm')) with check (public.has_role('admin','pm'));

create policy phases_select on public.phases for select to authenticated using (public.can_see_job(job_id));
create policy phases_insert on public.phases for insert to authenticated with check (public.has_role('admin','pm'));
create policy phases_update on public.phases for update to authenticated using (public.has_role('admin','pm')) with check (public.has_role('admin','pm'));

create policy tasks_select on public.tasks for select to authenticated using (public.can_see_job(job_id));
create policy tasks_insert on public.tasks for insert to authenticated with check (public.has_role('admin','pm'));
create policy tasks_update on public.tasks for update to authenticated using (public.has_role('admin','pm')) with check (public.has_role('admin','pm'));

-- time entries: techs log & edit their own while the job is released;
-- PMs/supervisors/admins can correct anyone's
create policy time_entries_select on public.time_entries for select to authenticated using (public.can_see_job(job_id));
create policy time_entries_insert on public.time_entries for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_log_on_job(job_id));
create policy time_entries_update on public.time_entries for update to authenticated
  using ((user_id = (select auth.uid()) and public.can_log_on_job(job_id)) or public.has_role('admin','pm','supervisor'))
  with check ((user_id = (select auth.uid()) and public.can_log_on_job(job_id)) or public.has_role('admin','pm','supervisor'));

create policy time_entry_edits_select on public.time_entry_edits for select to authenticated using (public.can_see_job(job_id));

create policy comments_select on public.comments for select to authenticated using (public.can_see_job(job_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_see_job(job_id) and public.my_role() is not null);
create policy comments_update on public.comments for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy attachments_select on public.attachments for select to authenticated using (public.can_see_job(job_id));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_see_job(job_id) and public.my_role() is not null);
create policy attachments_update on public.attachments for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Lock helper functions down to signed-in users
revoke execute on function public.my_role() from public, anon;
revoke execute on function public.has_role(text[]) from public, anon;
revoke execute on function public.can_see_job(uuid) from public, anon;
revoke execute on function public.can_log_on_job(uuid) from public, anon;
grant execute on function public.my_role() to authenticated;
grant execute on function public.has_role(text[]) to authenticated;
grant execute on function public.can_see_job(uuid) to authenticated;
grant execute on function public.can_log_on_job(uuid) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.track_time_entry_edit() from public, anon, authenticated;
revoke execute on function public.guard_profile_update() from public, anon, authenticated;
