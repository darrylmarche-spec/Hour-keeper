# Briefing guide

Instructions for whatever writes the fortnightly Hour Keeper tech stack
briefing. Read this whole file first, every time.

Also read:

- `docs/IDEAS.md`: what's already decided, parked or open. Don't
  re-pitch a settled or parked idea unless something new changes it.
- `docs/PRE-BETA-CHECKS.md`: checks already handed to the build chat.

## Current state (as of 24 Oct 2026)

Update this section when the stack changes. Check it before recommending
anything.

- **What it is:** a phone app for Schindler Australia lift and escalator
  crews to log actual hours per task, so PMs can compare sold vs actual
  after the job. An internal Schindler tool, not a product for sale.
- **Stage:** built and live as a web app. Small beta on one real job
  about to start. Next: fix beta issues, company-ready, App Store and
  Google Play versions, service and repair jobs, payroll connections.
- **App:** Expo SDK 58 (`expo ~58.0.14`), React Native 0.88, React 19.3,
  Expo Router, TypeScript 6.
- **Web:** `web.output: "single"` (static), own service worker
  (`scripts/build-sw.js`), hosted on Vercel. Serves both techs and the
  office. Beta techs add it to the Home Screen.
- **Native:** none yet. No `ios/`, `android/` or `eas.json`. Not on the
  App Store or Google Play.
- **Offline storage:** AsyncStorage (localStorage on web) for hours,
  notes and job data, with the app's own outbox and sync code. Photos and
  files on web are in IndexedDB (`src/files/fileCache.web.ts`). No
  SQLite, PowerSync or ElectricSQL.
- **Backend:** Supabase. Postgres, logins, row-level security, Storage
  for photos and files. Migrations in `supabase/migrations`. Postgres
  version: unknown.
- **Roles:** admin, PM, supervisor, tech.
- **Photos:** shrunk to about 1600 px on the phone, uploaded when there's
  signal.
- **Documents:** PDF reports built on the phone (jsPDF, expo-print).
  PM job setup imports Excel, CSV and PDF (read-excel-file, papaparse,
  pdfjs).
- **AI in the app:** none. AI is only used to build the app.

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
