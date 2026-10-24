# Hour Keeper: what it collects, and what it never does

Draft for Schindler IT and legal (Australia and Switzerland).
Items marked *being checked* are design rules confirmed in
`docs/PRE-BETA-CHECKS.md` before the beta.

## Purpose

Compare the hours sold for each task with the hours a job really took,
after the job, to improve quoting. It is not for assessing individuals.

## What it stores

- **Account:** name, work email, role (admin, PM, supervisor, tech),
  approval status.
- **Hours:** job, task, the date worked, number of hours, optional note.
  The date only, not start or finish times.
- **Corrections:** who changed an entry, when, and the before and after.
  Visible, not hidden.
- **What the person chooses to add:** photos, files, comments.
- **Beta tools:** feedback the person sends, and error reports (the
  error, the screen it happened on, app version, device type).
- **System timestamps:** when each record was saved, needed for sync.
  Not used to report on people.

## What it never collects

- Location or GPS, including inside photos (*being checked*).
- Clock-in / clock-out or start and finish times.
- Live activity, screens visited, taps or time spent in the app.
- Anything while the app is closed.
- Scores, rankings, ratings or automated decisions about people.

## Who sees what

- **Techs:** their own jobs and straight hours. Never sold hours,
  percentages or comparisons, blocked by the database, not just hidden
  on screen (*being checked*).
- **PMs and supervisors:** hours per job and task after the phone
  syncs. No live view. Percentages and cross-job comparison are for PMs.
- **Admins:** accounts and access.
- **Everyone:** corrections show who changed what.

## Where data lives

- On the phone: a copy of the person's assigned jobs, so it works
  offline. An admin can sign out a lost phone; it takes effect when the
  phone next connects.
- In the cloud: Supabase (database, logins, files) and Vercel (hosting
  the web app). Database region: *to confirm*.

## Automated decisions

None. Hour Keeper makes no automated decisions about people. Australian
rules on disclosing automated decisions apply from 10 Dec 2026
(*confirm with Schindler legal*).

## To confirm with IT and legal

- Database region, and whether viewing Australian data from Switzerland
  (or the reverse) needs disclosure under Swiss privacy law (FADP).
- How long hour records are kept, and whether they count as employment
  records.
- Work phones or personal phones, and whether Schindler manages them.
- Company login with existing Schindler accounts.
