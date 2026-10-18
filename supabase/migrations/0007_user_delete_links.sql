-- Deleting an account in Supabase Auth failed with "Database error deleting
-- user" because audit links pointed at the profile with no ON DELETE rule.
--
-- "Who created / who edited" links are now cleared when an account is deleted.
-- Hours, comments and attachments still block deletion on purpose: real field
-- history must never disappear by deleting a person. Use Switch off in the
-- app's Admin tab for people who leave.

alter table public.time_entry_edits drop constraint time_entry_edits_edited_by_fkey;
alter table public.time_entry_edits add constraint time_entry_edits_edited_by_fkey
  foreign key (edited_by) references public.profiles(id) on delete set null;

alter table public.jobs drop constraint jobs_created_by_fkey;
alter table public.jobs add constraint jobs_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.templates drop constraint templates_created_by_fkey;
alter table public.templates add constraint templates_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;
