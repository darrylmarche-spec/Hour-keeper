# Hour Keeper: technical overview

For someone comfortable with technology who hasn't seen the code: an IT reviewer, a technical manager, or a developer picking it up. It explains what the app is built from, how it works, and where its limits are. Figures are as of 27 Oct 2026.

## 1. What it is

An offline-first app for Schindler Australia lift and escalator crews. Field staff log **actual hours against each task of a job**. Project managers compare those with the **sold hours** after the job, to improve quoting.

It is deliberately not a monitoring tool. There is no GPS, no clock-in or start and finish times, no live activity, no rankings, and no automated decisions about people. Techs see only their own job and straight hours.

Status: built and live as a **web app** (installed to the phone's home screen). A small beta on one real job is about to start. There is no App Store or Google Play build yet.

## 2. The pieces

| Piece | What it is | Where it lives |
|---|---|---|
| The app | One codebase: Expo SDK 58, React Native 0.88, React 19, TypeScript 6, Expo Router (file-based screens). Runs in the browser through `react-native-web`. | GitHub: `darrylmarche-spec/Hour-keeper` |
| Hosting | A static site (no servers of our own). Deploys by itself when a pull request is merged to `main`. | Vercel, project `hourkeeper`, `hourkeeper.vercel.app` |
| Database and sign-in | Postgres 17 with row-level security, plus Supabase Auth (email and password) and private file storage. | Supabase project `hour-keeper`, Sydney (`ap-southeast-2`), Free plan |
| Checks | Typecheck, lint and tests run on every pull request. | GitHub Actions (`.github/workflows/checks.yml`) |

There is no custom backend code. The phone talks straight to Supabase, and **the database's own rules** decide who can see or change what. That is the key security idea: the app screens are a convenience, the database is the gatekeeper.

## 3. What a user sees

Tabs: **Jobs**, **Reports**, **Admin** (admins only), **More**.

- **Job screen:** phases and tasks with hours, sold figures for the office only.
- **Task screen:** log hours (day, hours, note), see everyone's entries on that task, add photos, files and comments.
- **Reports:** a per-job sold-versus-actual report with a PDF; a cross-job **Compare** view for PMs and admins.
- **Job setup:** import an hours sheet (Excel, CSV or PDF), start from a template, or type tasks in. Check screen, then save as a draft, add the crew, release.
- **Sync screen:** what is waiting, what was refused and why.
- **Feedback and error reports** for the beta, read in an admin inbox.

### Roles

| Role | Sees | Can change |
|---|---|---|
| Field tech | Jobs they are on (once released); hours only | Their own entries, photos and comments, while the job is in the field |
| Supervisor | All jobs; sold, actual, over and under | Set up, edit, assign, release and complete jobs; correct anyone's hours; templates |
| Project manager | The above plus **% used** and **Compare jobs** | The same as a supervisor |
| Admin | Everything, plus people and feedback | Approve sign-ups, set roles, switch people off |

A new account waits for an admin's approval. The first account on a fresh system becomes admin, so the owner can bootstrap it.

## 4. The data

Sixteen tables in the `public` schema, all with row-level security:

- **People:** `profiles` (name, email, role, active, approval).
- **Setup:** `jobs`, `phases`, `tasks`, `job_members` (who is on which job), and the templates (`templates`, `template_phases`, `template_tasks`).
- **Sold figures:** `task_budgets` and `job_budgets`, readable only by admin, PM and supervisor (see section 6).
- **Hours:** `time_entries` (job, task, person, date, hours, note, an "edited" flag) and `time_entry_edits` (the before and after of every change).
- **Extras:** `comments`, `attachments` (the files are in private storage, not in the table).
- **Beta tools:** `feedback` and `app_errors`.

Rows are never hard-deleted. They are marked deleted (`deleted_at`), so the history and sync stay consistent.

Hours store a **date only**, never start or finish times.

### Rules the database enforces

- A tech sees only a **released** job they are a member of, and logs only on a **released** job (not draft, not complete).
- A tech can change only their own entries. Office roles can correct anyone's.
- Every change to an entry is recorded by a trigger (who, when, before, after). The "Edited" tag can't be removed.
- A task with hours logged on it can't be removed.
- Hours can't be saved against a removed task, or a task from a different job.
- Only an admin can change roles or approve accounts.

## 5. Offline and sync

The phone keeps its own copy of the data and works from it, so everything works with no signal.

1. **Every change is saved on the phone first** and put in a queue (the "outbox").
2. The queue is sent **oldest first** when there is signal: after a change, on reconnect, on returning to the app, and every minute (every 15 seconds while offline).
3. The phone then **pulls** anything that changed on the server, using a "changed since" marker with a two-minute overlap so nothing is missed.
4. A change the server refuses is marked **not saved** and the rest carry on.
5. A new photo's **file uploads before** its record, so a record never points at a missing file.

Storage on the phone: the browser's local storage for data, and IndexedDB for photos and files. The browser limits this (commonly about 5 MB for local storage; not measured for this app).

The app's own service worker saves the whole app on the device, so it opens offline, and shows a "new version ready, Reload" banner after an update. Reloading never loses unsent work.

### When two people change the same thing

An edit is sent as **only the fields the person changed**, together with what those fields were when they started. The server applies it only if nobody else has changed those same fields since.

- Different fields (the tech adds a note, the PM fixes the hours): **both** survive.
- The same field: nothing is overwritten. The other person's version stays, the tech's is **held on the phone**, and the tech sees both and chooses **Keep what's there now** or **Use my version instead**. Using theirs keeps both versions in the entry's history.
- Refused changes (job completed, taken off the job, task removed) are explained in plain words and kept until the person discards them.

## 6. Who can see sold hours

Row-level security works **per row, not per column**. So hiding a "sold hours" column on screen would not stop it being downloaded to a tech's phone.

Instead, the sold figures live in their own tables (`task_budgets`, `job_budgets`) that only admin, PM and supervisor can read. A tech's phone asks for them like any other table and the database returns nothing. The standard hours templates are office-only too. A tech's screens and report show hours only, and there is nothing on the phone to work out percentages from.

This was done in two database steps so the live app never broke: first create the new tables and keep them in step with the old columns, then, once the new app was live, drop the old columns. As of this writing the first step is applied to the live database and the second (dropping the old columns) is waiting to be run. Until it is, the server still sends the old columns, and the new app discards them on arrival.

## 7. Photos and files

- Every image, from the camera, the library or the file picker, has hidden data **removed before it is saved or uploaded**: GPS, camera model, capture time, and anything appended after the end of the picture. Only the picture, its colour profile and which way up it is are kept.
- Photos are shrunk on the device to at most 1600 px wide.
- An image that can't be cleaned is refused rather than uploaded.
- Other files (PDF, Excel) are uploaded as they are and are **not** cleaned. 25 MB limit per file.
- Files sit in a private storage bucket and are opened through short-lived (5-minute) signed links. They are kept on the device after the first view.

Known gaps: the capture time is not kept, and a person can currently overwrite their own uploaded file.

## 8. Reports and PDFs

A report is worked out once on the device from the data it holds, and drawn three ways: on screen, as a PDF on the web (jsPDF), and as a PDF on phones through the system print and share sheet (written, but untested on real phones). The report lists sold against actual by task and phase, extras (variations and non-productive time), hours by person (alphabetical, never ranked) and by day, and comments.

A tech's copy has hours only, and only their own line in "hours by person".

## 9. Importing an hours sheet

The importer reads Excel, CSV or PDF into numbered lines with sold hours, the job title and the sheet total. Anything unclear (repeated or out-of-order line numbers) is flagged for review on a check screen before saving. If the sheet total doesn't match the lines added up (for example 193 against 216), the app says so, and reports use the lines.

## 10. Quality and testing

- Typecheck, lint and **128 automated tests** run on every pull request.
- 21 of those tests run all the database migrations on a **real Postgres** (an in-memory copy) and check the access rules: who can read and write what, the triggers, and the sold-figure protection.
- Browser tests run the real app against a stand-in server, with two people at once (a tech offline and a PM online). They live outside the repository.
- Not done: testing on real iPhones and Android phones. Only the web version has been tested end to end.

## 11. Privacy in short

Collected: account details, hours (date, hours, note), corrections with before and after, what people add (photos, files, comments), feedback and error reports (the error, the screen, app version and device type).

Never collected: location, start or finish times, screens visited or taps, anything while the app is closed, scores or rankings. See `docs/PRIVACY-SUMMARY.md`.

## 12. Limits and open items

- **Web only.** App Store and Google Play versions, and service and repair job types, are future work.
- **iPhone storage:** the app doesn't yet ask the browser to protect its saved data, and doesn't warn if it is open in a browser tab instead of the home screen app. Unsent hours could be lost if the phone clears the browser's data.
- **Sign-out:** local to the device. There is no remote sign-out of a lost phone yet. No single sign-on or multi-factor sign-in.
- **Hosting:** the app and database run on the owner's own Vercel, Supabase and GitHub accounts, not Schindler's. Fine for a pilot with demo data. Real customer data needs Schindler IT's approval and likely their own hosting.
- **Changing the live database:** the AI tool used to build the app can apply database changes directly. It does so only after being told to, but a formal approval step is an open decision.
- **Not connected** to payroll, accounting or the job system.
- **Scale:** designed to extend to branches and regions, but untested beyond a small crew.

## 13. Where to look

| Question | File |
|---|---|
| Plain-language run sheet for the beta | `BETA.md` |
| Owner's own how-to | `MY-INSTRUCTIONS.md` |
| Pitch to head office | `docs/PITCH.md` |
| What is collected and never collected | `docs/PRIVACY-SUMMARY.md` |
| Exact current state for each part | `docs/BRIEFING-GUIDE.md` |
| Results of the six pre-beta checks | `docs/PRE-BETA-RESULTS.md` |
| Ideas under consideration | `docs/IDEAS.md` |
| The database, step by step | `supabase/migrations/` |
