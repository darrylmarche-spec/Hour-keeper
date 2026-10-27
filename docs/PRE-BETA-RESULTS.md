# Pre-beta check results

Results for the six checks in `docs/PRE-BETA-CHECKS.md`. Updated in each
pull request that works on one. Last updated 27 Oct 2026.

| # | Check | Status |
|---|-------|--------|
| 1 | Quoted figures never reach a tech's phone | **Built and passing in tests.** Not protecting the live data until migrations 0013 and 0014 are applied (see below). |
| 2 | Photos carry no location data | **Fixed and passing** (tested in the web app; not yet on a real phone camera) |
| 3 | Nobody's work is silently lost or overwritten | **Fixed and passing** (a: clash, b: refused change, c: deleted while offline). Tested on a real Postgres, in the sync tests and in a two-browser run. Not yet on real phones. |
| 4 | Problem reports don't record activity | **Pass** |
| 5 | iPhone can't wipe unsynced hours (web app) | Not started |
| 6 | Live data is protected during AI-assisted building | **Open: needs a decision from Darryl** (see below) |

Also done in the same pull request: the report no longer ranks people by
hours (see "Related change").

## 1. Quoted figures never reach a tech's phone

**Before the fix: fail.** Row-level security works per row, not per column,
so a tech's phone downloaded every task's sold hours and the job's quoted
total, and the app only hid them on screen. The standard hours templates,
which carry the same figures, were readable by techs too.

**What it does now (idea 1).**
- Sold hours (one per task) and the quoted total (one per job) live in two
  new tables, `task_budgets` and `job_budgets`. Only admins, PMs and
  supervisors can read or write them. For a tech the database answers with
  nothing. The standard hours templates are office-only too.
- Migration `0013_budget_figures.sql` creates the tables, copies today's
  figures across, and keeps them in step with the old columns, so the app
  that is live today keeps working while the new one rolls out.
- Migration `0014_drop_old_budget_columns.sql` then drops the old columns
  (`tasks.sold_hours`, `jobs.quoted_total_hours`), so a tech's phone has no
  way to receive them. Apply it only once the new app is live.
- The new app also discards those two columns if the server still sends them,
  and removes any left on a phone by an older version (saved rows and
  changes waiting to send).
- A tech sees hours only: the Jobs list ("hrs logged"), the job screen
  ("Hours logged"), the task screen, the Reports list and their own report
  and PDF carry no sold, remaining, over, under or percentage figures. There
  is nothing on the phone to compute them from. Admins, PMs and supervisors
  see what they saw before.

**How it was tested.**
- 10 tests on a real Postgres (PGlite, every migration run in order): a tech
  sees their job and tasks but zero budget rows, can't write them, can't
  read the templates; signed-out users get nothing; the three office roles
  can read and change them; no table a tech can read has a sold or quoted
  column (that last one runs with 0014 applied); the old app's writes still
  work between 0013 and 0014; and figures that existed before 0013 were
  copied across.
- Report tests: a tech's report and PDF contain none of Sold, Over, Under,
  Remaining or Used, and the sold totals appear nowhere in the document.
- Browser run (tech and supervisor on the same fake server): the tech's
  screens show hours only; the tech's saved data on the phone contains no
  `sold_hours` or `quoted_total_hours` and no budget rows; the server's
  answers to the tech's budget and template requests are empty; a
  supervisor still sees Sold, Remaining and the sheet-total warning, and a
  change to a sold figure is saved to the office-only table and not to the
  task row.

**Not covered.** Real phones. Sold figures also still appear in anything an
office user shares: a PM's PDF is the PM's to send.

## 2. Photos carry no location data

**Before the fix: fail.** Test photos carrying GPS were put through the
real web app by all three routes and the uploaded files were inspected
byte by byte.

| Route | Result before | Result now |
|---|---|---|
| Camera | Clean (the browser re-saves the photo) | Clean |
| Photo library | Clean (same reason) | Clean |
| **File button** (a photo added as a file) | **GPS kept, in all 5 test files** | Clean |
| A photo the app can't shrink | Original uploaded as it was | Cleaned, or refused |
| A fake "photo" (not an image) | Uploaded without complaint | Refused with a plain message |

The test files:

- JPEG with EXIF GPS, camera details, time, comment, colour profile and a
  "rotated" flag.
- PNG with EXIF GPS.
- Progressive JPEG with GPS in an XMP packet.
- JPEG with a second photo (with its own GPS) appended after the end.
- 2400 px JPEG with GPS (camera and library routes).

**What was changed.** Every image, however it's added, now goes through
`src/files/imageClean.ts` before it can be saved or uploaded:

- Kept: the picture itself, the colour profile, and which way up it is.
- Removed: EXIF (GPS, camera, time, thumbnail), XMP, IPTC, comments, and
  anything stuck on after the end of the image.
- The picture data isn't touched. Checked with a second image library
  (Pillow): pixels identical before and after, all four test files.
- A photo that can't be cleaned is refused, never uploaded as it was.

**Evidence now.** 8 automated tests on the cleaner. Browser run: 7 files
reached storage; every image is a single JPEG that opens; none has a GPS
location, or any GPS, camera, XMP or EXIF text anywhere in its bytes; big
photos are 1600 px wide; the PNG came out as a JPEG without its data; the
plain text file was unchanged; the fake photo was refused.

**Not covered.**

- Real phone cameras. Only the web version has run, with GPS-tagged test
  photos, not a photo from a phone with location turned on. The cleaner
  works on the file's bytes, so it doesn't depend on the phone, but the
  phone camera route in the app hasn't run on a phone.
- Capture time. It was in the removed hidden data. Idea 9 (photos as
  trustworthy records) needs it kept some other way: record it as its own
  field before removing the rest. Not built yet.
- Files that aren't images (PDFs, spreadsheets) are uploaded unchanged and
  can carry their own hidden details.

## 3. Nobody's work is silently lost or overwritten

**Before the fix: fail on (a) and (c).** The app sent the whole row, so the
last change to reach the server won: a tech's offline edit of the hours
could silently overwrite a PM's correction (or the other way round), and
a tech could log hours against a task a PM had removed.

**What it does now (idea 10).** An edit is sent as only the fields the
person changed, along with what those fields were when they started. The
server applies it only if nobody else has changed those same fields.

| Case | What ends up saved | History | What the tech sees |
|---|---|---|---|
| **a. Clash, different fields** (tech adds a note, PM corrects hours) | Both changes | Edit recorded | Nothing to do; they see the PM's hours and their own note |
| **a. Clash, same field** (tech 6→5, PM 6→7) | The PM's 7 stays. The tech's 5 is held on the phone, not applied | Nothing overwritten | "Not saved" on the entry, a red banner on the Jobs list, and on the Sync screen: "Hours: you changed it to 5 hrs, it is now 7 hrs" with two buttons |
| **a. …tech picks "Use my version instead"** | The tech's hours win; the PM's note (which they never touched) is kept | Both versions: 7→8 (PM) then 8→5 (tech) | The entry's "See what changed" shows it |
| **a. …tech picks "Keep what's there now"** | The server is untouched | Unchanged | The held change is removed on purpose, by the tech's choice |
| **b. Refused change** (job completed, or taken off the job) | Nothing saved | None | The change stays on the phone with: "This wasn't saved. The job may have been completed, or you may have been taken off it… tell your PM", and Discard |
| **c. Task removed while offline** | Nothing saved on the removed task | None | "This task was removed from the job, so these hours can't be saved on it. Ask your PM which task they belong on." |

**Fix for (c).** Migration `0012_time_entry_task_guard.sql` makes the
database refuse hours on a removed task or a task from another job. The
test for it failed before the migration and passes after. Not applied to
the live database until Darryl approves the pull request (check 6).

**How it was tested.**
- 11 tests on a real Postgres (PGlite, in memory) running every migration:
  both versions kept in `time_entry_edits`, completed jobs refuse changes,
  a tech can't change someone else's entry, and (c).
- Sync tests (fake server behaving like the real one) for field-level
  sends, different-field edits both surviving, a clash held and not
  overwritten, both choices, edits made while the first is in flight, an
  app close with a held clash, and older queued changes with no record of
  the starting values.
- A two-browser run (tech offline, PM online) for each case, with
  screenshots of the entry, the Jobs banner and the Sync screen.

**Not covered.** Real phones; two people on the same field while both are
online at the same moment (the database decides, and the later one is
shown the clash on its next sync).

## 4. Problem reports don't record activity

**Pass.**

- `app_errors` holds: id, who, the error message, the stack, the page path,
  app version and build, device type, a repeat count, and timestamps.
  `feedback` holds: who, kind, the text, version, device type, status and
  timestamps (confirmed against the live database's columns).
- The app keeps one value for "current screen", overwritten as the person
  moves, not a list. It is only attached to an error.
- No analytics, tracking or monitoring library is installed (`package.json`),
  and a search of `src/` and `supabase/` found no tracking code and no
  "last seen" field.
- Nothing is written when there's no error, apart from feedback the person
  chooses to send.
- Two small notes, neither is activity logging: the page path can contain a
  job ID, and a repeated error updates one row's timestamp (the last time
  that error happened).

## 6. Live data is protected during AI-assisted building

**Open. This needs a decision from Darryl.** From what is available to the
build chat today:

- The AI tool can run changes on the live Supabase database (new tables,
  access rules, data updates) directly, in the same step as building.
  Migrations 0008 to 0011 were applied that way, and the repository's
  migration files were written to match.
- That is fine while the database holds only demo data. Once the beta
  starts it holds real hours from real techs, and the check says changes
  should need Darryl's approval first.

Options, simplest first: (a) a rule that the AI tool writes a migration file
and Darryl approves it before anything touches the database; (b) a
separate test database for building, with the live one changed only after
approval; (c) a limited access token that can't change live data. Which one
is a decision for Darryl.

## Related change: the report no longer ranks people (idea 11)

The "Hours by person" list on the report was sorted with the most hours
first, and every tech could see it. That was effectively a league table.

- The office sees the list in name order.
- A tech sees only their own hours ("Your hours"), not colleagues'.
- Job totals and the day-by-day table are unchanged.

Colleagues' names can still appear as the author of a comment, which is a
shared team thread.
