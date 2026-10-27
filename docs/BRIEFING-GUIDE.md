# Briefing guide

Instructions for whatever writes the fortnightly Hour Keeper tech stack
briefing. Read this whole file first, every time.

Also read:

- `docs/IDEAS.md`: what's already decided, parked or open. Don't
  re-pitch a settled or parked idea unless something new changes it.
- `docs/PRE-BETA-CHECKS.md`: checks already handed to the build chat.

## Current state (as of 27 Oct 2026)

Checked against the repo, Supabase and Vercel on this date. Check it
before recommending anything. Whoever changes any of these updates this
section and its date in the same pull request: a version, a library
(added or removed), how or where data is stored, native or app-store
builds, a Supabase table or service, how the app is hosted or
distributed.

- **What it is:** a phone app for Schindler Australia lift and escalator
  crews to log actual hours per task, so PMs can compare sold vs actual
  after the job. An internal Schindler tool, not a product for sale.
- **Stage:** built and live as a web app. Small beta on one real job
  about to start. Next: fix beta issues, company-ready, App Store and
  Google Play versions, service and repair jobs, payroll connections.
- **App:** Expo SDK 58 (`expo 58.0.14`), React Native 0.88.0, React
  19.3.0, Expo Router 58.0.23 (typed routes on), TypeScript 6.0.3,
  `react-native-web` 0.21.4, Supabase JS client 2.118.0. `app.json`
  version is `0.1.0` (shown in the app with the build id).
- **Checks:** Jest 29 with ts-jest (13 suites, 128 tests; 21 of them run every migration on a real Postgres in memory with PGlite, so `npm test` passes a Node flag and plain `npx jest` fails those), TypeScript and
  `expo lint`. A GitHub Actions workflow (`.github/workflows/checks.yml`,
  Node 22) runs all three on every pull request and every push to
  `main`; the build chat also runs them first. Unconfirmed: whether
  GitHub is set to block merging when they fail (branch protection).
  Vercel builds separately. Browser end-to-end tests (Playwright against
  a fake backend) live outside the repo (`.e2e/`, gitignored).
- **Web:** `web.output: "single"` (static single-page app, built with
  `expo export -p web`). Own service worker: `scripts/build-sw.js` writes
  `dist/sw.js` at build, `src/beta/updates.ts` registers it (production
  builds only). It saves the whole build on the device (including the
  PDF libraries and `pdf.worker.min.mjs`) so the app opens offline. Page
  loads try the network for 3 seconds, then open the saved app. Supabase
  requests are never cached by it. A "new version ready, Reload" banner
  shows when a new build installs; updates are checked every 30 minutes
  and on return to the app. Beta techs add it to the Home Screen. The
  app does not call `navigator.storage.persist()`, and nothing warns when
  it is open in a browser tab instead of the Home Screen app (pre-beta
  check 5).
- **Hosting:** Vercel project `hourkeeper`: static site, no framework, no
  serverless functions, builds on Node 24.x. `vercel.json` sets caching
  headers, the single-page fallback and the PDF worker content type.
  Deploys automatically when a pull request is merged to `main`; every
  pull request gets a preview, and previews need a Vercel login (SSO
  protection on for all deployments except custom domains). Domain is
  `hourkeeper.vercel.app`; no custom domain yet. Vercel plan: unknown.
- **Native:** none yet. No `ios/`, `android/` or `eas.json`, and no EAS
  project. Not on the App Store or Google Play. `app.json` already holds
  placeholder IDs (`com.hourkeeper.app` for iOS and Android) and the
  camera and photo permission text, unused until a native build exists.
  The phone code paths (files in the app folder, `expo-print`, the share
  sheet) have never run on a real phone; only the web version has been
  tested end to end.
- **Offline storage:** AsyncStorage for hours, notes and job data: one
  JSON value per table, plus the outbox of unsent changes, sync cursors
  and the sign-in session. On web, AsyncStorage is the browser's
  localStorage; browsers cap it (commonly around 5 MB; not measured for
  this app). Photos and files: IndexedDB on web (database
  `hour-keeper-files`, `src/files/fileCache.web.ts`); in the app's own
  documents folder on a phone (`expo-file-system`,
  `src/files/fileCache.ts`). No SQLite, PowerSync or ElectricSQL.
- **Sync:** the app's own engine (`src/data/sync.ts`, `localStore.ts`).
  Every change is saved on the device first and queued, then sent oldest
  first. A change the server refuses is marked "not saved" and the rest
  carry on. Pulls use an `updated_at` cursor (re-reading the last 2
  minutes). Runs after a change, on reconnect, on return to the app,
  every 60 seconds (15 while offline). A new attachment's file uploads
  before its row. No Supabase Realtime. Rows are soft-deleted
  (`deleted_at`). **Clashes:** an edit is sent as only the fields the
  person changed, with what they were when the edit began, and the
  server applies it only if nobody else changed those fields. Different
  fields both survive. The same field is held on the phone as "not
  saved" and the person chooses "Keep what's there now" or "Use my
  version instead" (both versions stay in the entry's history). Refused
  changes are explained in plain words and kept until discarded. Only
  time entries keep a before-and-after history (a database trigger
  writes `time_entry_edits`). A pulled change never overwrites a row
  that is still waiting to send. Tested in the sync tests, on PGlite and
  in a two-browser run; not on real phones.
- **Backend:** Supabase project `hour-keeper`, region `ap-southeast-2`
  (Sydney, Australia), Postgres 17.11 (Supabase version
  17.11.0.003), Free plan. 16 tables in `public`: profiles, jobs,
  job_members, phases, tasks, task_budgets, job_budgets, templates,
  template_phases, template_tasks, time_entries, time_entry_edits,
  comments, attachments, feedback, app_errors. Row-level security on every table, with helper
  functions in a `private` schema. Triggers handle edit history,
  blocking deletion of a task that has hours, guarding role changes and
  feedback status. Migrations `0001` to `0014` in `supabase/migrations`. `0013` (the office-only sold-figure tables) and `0014` (drops the old columns) are applied to the live database only after the pull request is approved: check `docs/PRE-BETA-RESULTS.md` for whether they have been.
  No Edge Functions. Only the default extensions are installed. No
  backup arrangement set up by us.
- **Sign-in:** Supabase Auth, email and password only. The app asks for
  10 or more characters with letters and numbers. Sign-out is local to
  the device: no remote sign-out of a lost phone yet. No SSO, no MFA.
  The Supabase Auth dashboard settings (email confirmation, minimum
  password length, leaked-password check) can't be read from the repo or
  the API here, so they are unconfirmed. `PLAN.md` records email
  confirmation as turned off for the beta. The leaked-password check
  needs the Pro plan.
- **Roles:** admin, PM, supervisor, tech. A new account becomes admin
  only when no active admin exists; every other sign-up waits for an
  admin to approve it and set a role. Admin,
  PM and supervisor can create, edit, assign and release jobs. PM and
  admin also see percentages and Compare jobs. Admin sees the feedback
  inbox. A tech sees only jobs they are assigned to, once released.
- **What a tech's phone receives:** row-level security works per row, not
  per column, so the sold figures are kept in their own tables
  (`task_budgets`, `job_budgets`) that only admin, PM and supervisor can
  read; the standard hours templates are office-only too. A tech's phone
  asks for them and gets nothing, so Sold, Remaining, Over and percentages
  can't be worked out there; the screens, report and PDF show a tech hours
  only. A tech's phone does receive every assigned tech's hours on their
  job (task screen entries); their report shows only their own line, and
  the office's list is in name order, not ranked by hours. Until migration
  `0014` is applied to the live database, the old columns still exist on
  `tasks` and `jobs` and the server still sends them: the new app discards
  them on arrival, but they only stop being sent once `0014` is applied.
  Not yet tested on a real phone (pre-beta check 1).
- **Photos and files:** every image, whether from the camera, the library
  or the file picker, is cleaned of hidden data before it is saved or
  uploaded (`src/files/imageClean.ts`). Photos are shrunk on the device
  (phone or browser) to at most 1600 px wide and re-saved as JPEG at
  quality 0.7 (`expo-image-manipulator`). Cleaning keeps only the picture,
  its colour profile and which way up it is, and removes EXIF (GPS,
  camera, time), XMP, IPTC, comments and anything after the end of the
  image. An image that can't be cleaned is refused, not uploaded. Other
  files (PDFs, spreadsheets) are uploaded unchanged and aren't cleaned.
  25 MB limit per file. Stored in a private Supabase Storage bucket
  `attachments`, at `{job}/{attachment}/{name}`; viewed through 5-minute
  signed links and kept on the device after first viewing. Tested with
  GPS-tagged test photos in the web app; not yet on a real phone camera
  (`docs/PRE-BETA-RESULTS.md`). The capture time is not kept, because it
  was in the removed data. The photo's time is the phone's clock when it
  was added. The person who added a photo can remove it (the record is
  marked deleted; the file stays in storage), and can overwrite their own
  uploaded file (idea 9 would close this).
- **Documents:** PDF reports. On web: jsPDF 4.2 with jspdf-autotable 5,
  loaded only when needed and built before the Share or Save button is
  pressed, so Share works straight from the tap; Save is an in-page
  download. On phones: `expo-print` (HTML to PDF) and `expo-sharing`.
  Imports in PM job setup: `expo-document-picker`, `read-excel-file` 9
  (.xlsx only), `papaparse` 5 (CSV), `pdfjs-dist` 6 (PDF text; scanned
  PDFs with no text aren't read; the worker file is copied into `public/`
  at build by `scripts/copy-pdf-worker.js`).
- **Monitoring and feedback:** the app's own tables, no third-party
  service and no analytics. `app_errors` holds the error message, stack,
  page path (which contains job IDs), app version and build id, device
  type and a repeat count. `feedback` holds what testers send, with
  version and device type. Admins read both in the app.
- **AI in the app:** none (no AI library or call in `package.json`,
  `src/` or `supabase/`). AI is only used to build the app.
- **Settled but not built yet:** from `docs/IDEAS.md`: remote sign-out
  (4), opt-in push notifications (6) and photos that can't be quietly
  removed (9). Built: idea 1 (sold figures in office-only tables; live
  only once migrations `0013` and `0014` are applied), idea 2 (crash
  reports only), idea 10 (clashes and refused changes are
  held and explained, nobody's version is silently overwritten),
  idea 3 (the checks workflow, first run pending), idea 8 (photo cleaning,
  web-tested) and the no-ranking part of idea 11. Results of the pre-beta
  checks are in `docs/PRE-BETA-RESULTS.md`.
- **Not confirmed:** Vercel plan; Supabase Auth dashboard settings; GitHub
  branch protection; how the app behaves on a real iPhone or Android
  phone (only web has been tested, including photo cleaning, which has
  only seen test photos, and clashes and refused changes, which have been
  tested in the browser and on PGlite but not on phones).

## Design rules (never change)

- Fewest taps: tap the task, tap the hours, save.
- Fully offline.
- No GPS, clock-in/out, live monitoring, alerts, rankings or automated
  scores or decisions about people.
- Techs see only their own job and straight hours. Percentages and
  comparison are for PMs, after the fact.
- Corrections are visible to everyone.
- It gives the tech something back (photos and notes that protect them).
- Never trap the user on a screen.

## Rules

1. **Check the current state first.** Don't recommend upgrading to a
   version the app already runs, or replacing something it doesn't use.
2. **Check the code before warning about a risk in it.** Say what the
   code actually does. Don't write "if it does X"; look.
3. **Only items that affect Hour Keeper in the next 3 months.** One line
   each: what changed, why it matters to Hour Keeper, what to do.
4. **Every date, price and version needs a source link.** No source:
   mark it "unverified". Don't invent figures.
5. **Leave out** AI-agent tooling, contract or legal AI, billing, and
   selling to other companies. Mention build tools (e.g. Claude Code) in
   one line at most, and only if they affect how the app is built.
6. **Check every idea against the design rules.** Drop anything that
   adds tracking, alerts, live monitoring, scoring or extra taps.
7. **App Store and Google Play rules** only matter once native builds
   exist. Until then, list them as "app-store stage".
8. **Privacy law:** state the rule and its date, then "check with
   Schindler legal". Never label anything compliant, verified or
   approved. Only Schindler legal can decide that.
9. **No decoration that sounds like a verdict** (e.g. "AUTH: VERIFIED",
   "EVALUATION: OPTIMAL").
10. **If nothing matters this fortnight, say so in one line.**

## Format (one page)

- **Act now:** up to 3 items.
- **Plan for later:** up to 3 items.
- **Checked, no action:** one line per item.

Each item: title, date, one or two lines on what it means for Hour
Keeper, the action, and the source link (or "unverified").
