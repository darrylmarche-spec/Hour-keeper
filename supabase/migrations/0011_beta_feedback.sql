-- Beta: feedback people send from the app, and problems the app reports
-- about itself (crashes, failed screens), so issues can be fixed without
-- anyone having to describe them.

create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id),
  kind        text not null default 'idea' check (kind in ('problem','idea','other')),
  body        text not null check (length(body) between 1 and 4000),
  screen      text not null default '',
  app_version text not null default '',
  device      text not null default '',
  status      text not null default 'new' check (status in ('new','seen','done')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.app_errors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id),
  message     text not null check (length(message) <= 2000),
  stack       text not null default '' check (length(stack) <= 8000),
  screen      text not null default '',
  app_version text not null default '',
  device      text not null default '',
  count       int not null default 1 check (count between 1 and 100000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index on public.feedback (updated_at);
create index on public.feedback (user_id);
create index on public.app_errors (updated_at);
create index on public.app_errors (user_id);

create trigger feedback_touch before insert or update on public.feedback
  for each row execute function public.touch_updated_at();
create trigger app_errors_touch before insert or update on public.app_errors
  for each row execute function public.touch_updated_at();

-- Only an admin can change a feedback item's status; the sender can only
-- write their own words.
create or replace function public.guard_feedback_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not private.has_role('admin') then
    if new.status is distinct from old.status then
      raise exception 'Only an admin can change feedback status';
    end if;
  end if;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  return new;
end $$;
revoke execute on function public.guard_feedback_update() from public, anon, authenticated;
create trigger feedback_guard before update on public.feedback
  for each row execute function public.guard_feedback_update();

alter table public.feedback   enable row level security;
alter table public.app_errors enable row level security;

-- Anyone signed in (including people waiting for approval) can send feedback;
-- they see their own, admins see everyone's.
create policy feedback_select on public.feedback for select to authenticated
  using (user_id = (select auth.uid()) or private.has_role('admin'));
create policy feedback_insert on public.feedback for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'new');
create policy feedback_update on public.feedback for update to authenticated
  using (user_id = (select auth.uid()) or private.has_role('admin'))
  with check (user_id = (select auth.uid()) or private.has_role('admin'));

create policy app_errors_select on public.app_errors for select to authenticated
  using (user_id = (select auth.uid()) or private.has_role('admin'));
create policy app_errors_insert on public.app_errors for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy app_errors_update on public.app_errors for update to authenticated
  using (user_id = (select auth.uid()) or private.has_role('admin'))
  with check (user_id = (select auth.uid()) or private.has_role('admin'));
