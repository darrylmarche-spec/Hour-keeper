-- Second step of moving the sold figures (see 0013). Apply this only after the
-- app that reads the figures from task_budgets and job_budgets is live and no
-- phone is still running the older one: the old columns are what a tech's phone
-- could download, and this removes them.

drop trigger tasks_mirror_budget on public.tasks;
drop trigger jobs_mirror_budget on public.jobs;
drop function public.mirror_task_budget();
drop function public.mirror_job_budget();

alter table public.tasks drop column sold_hours;
alter table public.jobs  drop column quoted_total_hours;
