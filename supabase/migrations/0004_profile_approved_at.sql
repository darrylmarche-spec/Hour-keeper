-- Tell "waiting for approval" apart from "switched off by an admin".

alter table public.profiles add column approved_at timestamptz;
update public.profiles set approved_at = coalesce(approved_at, now()) where active;

create or replace function public.stamp_profile_approval() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.approved_at := old.approved_at;  -- never set directly by a client
  else
    new.approved_at := null;
  end if;
  if new.active and new.approved_at is null then
    new.approved_at := now();
  end if;
  return new;
end $$;

revoke execute on function public.stamp_profile_approval() from public, anon, authenticated;

create trigger profiles_stamp_approval before insert or update on public.profiles
  for each row execute function public.stamp_profile_approval();
