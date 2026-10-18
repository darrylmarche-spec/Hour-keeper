-- Darryl confirmed the task lines (216 hrs) are correct; the "193" header on
-- the Hightett sheet was wrong.
update public.jobs
set quoted_total_hours = 216
where name = 'Hightett Common Building F - Duplex' and quoted_total_hours = 193;
