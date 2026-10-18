-- 1. A new account becomes an active admin when there is no active admin
--    (not only for the very first account). Switching off a test/setup admin
--    therefore hands the role to the next person who signs up.
-- 2. Profile changes made server-side (SQL editor / migrations, where there is
--    no signed-in user) are not blocked by the admin-only guard.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare make_admin boolean;
begin
  perform pg_advisory_xact_lock(hashtext('hk_first_user'));
  select not exists (
    select 1 from public.profiles where role = 'admin' and active and deleted_at is null
  ) into make_admin;
  insert into public.profiles (id, full_name, email, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.email, ''),
    case when make_admin then 'admin' else 'tech' end,
    make_admin
  );
  return new;
end $$;

create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not private.has_role('admin') then
    if new.role is distinct from old.role
       or new.active is distinct from old.active
       or new.email is distinct from old.email
       or new.deleted_at is distinct from old.deleted_at then
      raise exception 'Only an admin can change roles or approve accounts';
    end if;
  end if;
  return new;
end $$;
