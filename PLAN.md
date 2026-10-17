# Hour Keeper — Plan

An hour-keeping app for the elevator/escalator field team. Project managers set up a
job's tasks with the hours it was **sold** at; field techs log the hours each task
**actually** took. After the job, reports compare sold vs actual.

Starts with **construction**. Built so **service & repair** can be added later
(every job has a `job_type`).

---

## Goals

1. **Works offline.** The #1 complaint about the last app. Everything a tech does
   works with no signal and syncs itself when signal returns.
2. **Very user friendly.** A tech logs hours in ~3 taps.
3. **Never get stuck.** Every screen — including reports — has a way back. Nothing
   opens a separate browser window.
4. **Same look as the SCS Checklist app**, so it feels familiar.

## Look (carried over from SCS Checklist)

- Grey ground `#D8D8D8`, white fields, red command bar `#CC0000`
- Charcoal tab bar `#2B2B2B` with a red top marker on the active tab
- Inter font, flat (no blur/glass), high contrast for outdoor use
- Status: green `#1E8E3E` done / under, orange `#F47B20` open, red `#CC2222` over / not started

## Tech stack

| Piece | Choice | Why |
|---|---|---|
| App | Expo (React Native) + expo-router | Same as the old app; one codebase → iPhone, Android, web. Ready for the app stores later |
| Database, logins, file storage | Supabase (new project) | Postgres + secure auth + photo/file storage in one place |
| Web hosting | Vercel (new project) | Web version for PMs/supervisors and beta testers |
| Offline storage | SQLite on the device (expo-sqlite) | The phone holds its own copy of assigned jobs |
| Sync | Outbox queue → Supabase | Changes saved locally first, pushed when online |

## Roles

| Role | Can do |
|---|---|
| **PM** | Create jobs, import/enter phases & tasks with sold hours, optional deadline, assign techs, release job, see **percentages** and **cross-job comparison** |
| **Supervisor** | View jobs and **straight hour** comparison, create reports |
| **Tech** | See assigned jobs, log **their own** hours, add photos/files/comments, create reports |
| **Admin** | Manage users and roles |

## Job lifecycle

```
Draft  ──►  Released  ──►  Complete  ──►  Report
(PM builds)  (techs log)   (logging locked)
```

## Data model

- **Job** — job number, customer, site, job_type (construction | service | repair),
  status, optional deadline, assigned techs
- **Phase** — belongs to a job, ordered
- **Task** — belongs to a phase, **sold hours**, ordered
- **Unplanned / Extra** — every job automatically gets this bucket for work that
  wasn't sold (extra scope, rework, waiting on site)
- **Time entry** — task, tech, date, hours, note. Reg/OT not tracked
- **Attachment** — photo or file on a task or time entry
- **Comment** — on a task, with author and time
- **Edit history** — techs can edit their own entries; every edit is kept and the
  entry shows an **"Edited"** tag with who/when/what changed

## Importing tasks (PM)

PMs can import a job's phases/tasks/sold hours from:

- **Excel** (.xlsx) and **CSV** — read directly, column-matched to the template
- **PDF** — text pulled from the PDF and matched to the template's layout

Every import lands on a **review screen** first: the PM sees the parsed phases,
tasks and hours, fixes anything, then saves. Nothing goes live without that check.

The import format will be built around the **template supplied by Darryl**.

## Reports (after the job)

- **Techs & supervisors:** sold vs actual hours per task and phase — plain hours, no percentages
- **PMs:** the above plus % over/under, and a **cross-job comparison** screen
- Reports open **inside the app** as a normal screen with a back button and the
  tab bar. **Export PDF** and **Share** buttons generate the file without leaving the app.
  (The old app used `window.open` + `document.write`, which trapped users in a
  new window with no way back.)

## Navigation rules

- Every screen has a visible back button or tab bar — no dead ends
- No `window.open`, no new tabs, no full-page redirects to files
- Every screen has its own URL on web, so the browser back button and
  refresh always work
- Works as a home-screen web app on iPhone (no browser chrome) without getting stuck

## Build phases

1. **Foundation** — project setup, look & feel, login & roles, offline storage + sync engine, sync status indicator
2. **PM job setup** — create job, phases/tasks, Excel/CSV/PDF import with review screen, assign & release
3. **Tech logging** — hours, photos, files, comments, edit history; all offline
4. **Reports** — in-app reports, PDF export/share, PM percentages & cross-job comparison
5. **Beta** — small crew, gather feedback
6. **Later** — service & repair job types, app store builds, integrations (payroll/accounting)

## Open items

- [ ] Task template from Darryl (drives the import format)
- [ ] Supabase project setup (region, org)
- [ ] Vercel project setup
