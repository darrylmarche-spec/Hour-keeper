-- Photos and files for Phase 3.
--
-- Stored in a private bucket at  {job_id}/{attachment_id}/{file name}
-- so access follows the job: anyone who can see the job can view its files,
-- and people on the job can add to it. Files are never deleted from the app
-- (an attachment is removed by soft-deleting its row).

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400)  -- 25 MB
on conflict (id) do nothing;

create policy attachments_files_select on storage.objects for select to authenticated
  using (bucket_id = 'attachments'
         and private.can_see_job(((storage.foldername(name))[1])::uuid));

create policy attachments_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments'
              and private.my_role() is not null
              and private.can_see_job(((storage.foldername(name))[1])::uuid));

-- Lets a retried upload overwrite its own half-finished file.
create policy attachments_files_update on storage.objects for update to authenticated
  using (bucket_id = 'attachments' and owner_id = (select auth.uid())::text)
  with check (bucket_id = 'attachments' and owner_id = (select auth.uid())::text);
