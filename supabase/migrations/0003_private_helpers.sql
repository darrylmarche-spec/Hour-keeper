-- Move the access-check helpers out of the public API schema so they can't be
-- called directly over REST (security advisor 0029). Policies reference
-- functions by OID, so they follow the move automatically.

create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.my_role()               set schema private;
alter function public.has_role(text[])        set schema private;
alter function public.can_see_job(uuid)       set schema private;
alter function public.can_log_on_job(uuid)    set schema private;

-- Re-point function bodies that referred to public.*
create or replace function private.has_role(variadic roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(private.my_role() = any(roles), false)
$$;

create or replace function private.can_see_job(j uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select private.has_role('admin','pm','supervisor')
      or exists (
        select 1 from public.jobs jb
        join public.job_members m on m.job_id = jb.id
        where jb.id = j and m.user_id = auth.uid() and m.deleted_at is null
          and jb.status <> 'draft' and jb.deleted_at is null
          and private.my_role() is not null
      )
$$;

create or replace function private.can_log_on_job(j uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select private.my_role() is not null and exists (
    select 1 from public.jobs jb
    join public.job_members m on m.job_id = jb.id
    where jb.id = j and m.user_id = auth.uid() and m.deleted_at is null
      and jb.status = 'released' and jb.deleted_at is null
  )
$$;

create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not private.has_role('admin') then
    if new.role is distinct from old.role
       or new.active is distinct from old.active
       or new.email is distinct from old.email
       or new.deleted_at is distinct from old.deleted_at then
      raise exception 'Only an admin can change roles or approve accounts';
    end if;
  end if;
  return new;
end $$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
